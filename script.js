const { chromium } = require('playwright');
const fs = require('fs');

// 环境变量配置
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const PROXY_URL_STRING = process.env.PROXY_URL;

// 发送 Telegram 消息和截图
async function sendTelegramNotification(message, screenshotPath) {
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) {
    console.log("未配置 TG 通知，跳过发送。");
    return;
  }
  
  const url = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendPhoto`;
  const formData = new FormData();
  formData.append('chat_id', TG_CHAT_ID);
  formData.append('caption', message);
  
  if (screenshotPath && fs.existsSync(screenshotPath)) {
    const fileBuffer = fs.readFileSync(screenshotPath);
    const blob = new Blob([fileBuffer]);
    formData.append('photo', blob, 'screenshot.png');
  }

  try {
    const response = await fetch(url, { method: 'POST', body: formData });
    if (!response.ok) {
      console.error("Telegram 通知发送失败:", await response.text());
    } else {
      console.log("Telegram 通知发送成功！");
    }
  } catch (error) {
    console.error("发送 TG 消息异常:", error);
  }
}

(async () => {
  let launchOptions = { headless: true };
  
  // 代理配置解析
  if (PROXY_URL_STRING) {
    try {
      const proxyUrl = new URL(PROXY_URL_STRING);
      launchOptions.proxy = { server: `${proxyUrl.protocol}//${proxyUrl.host}` };
      
      if (proxyUrl.username || proxyUrl.password) {
        launchOptions.proxy.username = decodeURIComponent(proxyUrl.username);
        launchOptions.proxy.password = decodeURIComponent(proxyUrl.password);
      }
      console.log(`[网络] 已启用代理: ${launchOptions.proxy.server} (含身份验证: ${!!proxyUrl.username})`);
    } catch (e) {
      console.error("[网络] PROXY_URL 格式有误，请确保带有协议头，如 socks5://", e.message);
      process.exit(1);
    }
  } else {
    console.log(`[网络] 未配置代理，使用直连模式。`);
  }

  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext();
  const page = await context.newPage();
  
  let successCount = 0;
  const screenshotPath = 'result.png';

  try {
    if (!DISCORD_TOKEN) throw new Error("未配置 DISCORD_TOKEN");

    console.log("正在访问 Discord 准备注入 Token...");
    await page.goto('https://discord.com/login', { waitUntil: 'networkidle' });
    
    // 注入 Discord Token
    await page.evaluate((token) => {
      function login(token) {
        setInterval(() => {
          document.body.appendChild(document.createElement('iframe')).contentWindow.localStorage.token = `"${token}"`
        }, 50);
        setTimeout(() => { location.reload(); }, 2500);
      }
      login(token);
    }, DISCORD_TOKEN);

    await page.waitForTimeout(5000); // 等待页面刷新完成
    
    console.log("正在访问 Daki Dashboard...");
    await page.goto('https://dash.daki.cc/dashboard', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    console.log("进入 Servers 界面...");
    await page.click('text="Servers"');
    await page.waitForTimeout(2000);

    // 续期函数
    const processRenewal = async (stepCount) => {
        console.log(`开始第 ${stepCount} 次续期流程...`);
        await page.click('button:has-text("Renew")');
        
        // 勾选同意并继续
        await page.check('input[type="checkbox"]'); 
        await page.click('button:has-text("Continue")');
        
        console.log("等待倒计时结束...");
        const claimButton = page.locator('button:has-text("Claim")');
        // 等待 Claim 按钮出现并变为可用状态 (最长等待2分钟)
        await claimButton.waitFor({ state: 'visible', timeout: 120000 });
        await claimButton.click();
        
        console.log(`第 ${stepCount} 次领取成功！`);
        successCount++;
        await page.waitForTimeout(3000); // 等待状态刷新
    };

    // 依次执行两次续期
    await processRenewal(1);
    await processRenewal(2);

    // 任务成功截图及通知
    await page.screenshot({ path: screenshotPath });
    await sendTelegramNotification(`✅ Daki 服务器每日 ${successCount} 次续期已成功完成！`, screenshotPath);

  } catch (error) {
    console.error("自动化流程出错:", error);
    // 任务失败截图及通知
    try {
      await page.screenshot({ path: screenshotPath });
      await sendTelegramNotification(`❌ Daki 服务器续期失败！\n错误信息: ${error.message}`, screenshotPath);
    } catch (screenshotError) {
      console.error("截图失败:", screenshotError);
      await sendTelegramNotification(`❌ Daki 服务器续期严重失败！\n无法截取画面。\n错误信息: ${error.message}`, null);
    }
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
