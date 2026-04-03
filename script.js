const { chromium } = require('playwright');
const fs = require('fs');

// Telegram 配置
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;

// 发送 Telegram 消息和截图 (与之前相同)
async function sendTelegramNotification(message, screenshotPath) {
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) return;
  const url = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendPhoto`;
  const formData = new FormData();
  formData.append('chat_id', TG_CHAT_ID);
  formData.append('caption', message);
  if (screenshotPath && fs.existsSync(screenshotPath)) {
    formData.append('photo', new Blob([fs.readFileSync(screenshotPath)]), 'screenshot.png');
  }
  try {
    const response = await fetch(url, { method: 'POST', body: formData });
    if (!response.ok) console.error("TG通知失败:", await response.text());
  } catch (error) {
    console.error("TG请求异常:", error);
  }
}

(async () => {
  let launchOptions = { headless: true };
  
  // 核心优化：单变量解析代理 URL
  const proxyUrlString = process.env.PROXY_URL;
  if (proxyUrlString) {
    try {
      const proxyUrl = new URL(proxyUrlString);
      // 重组纯地址部分 (protocol + host)
      launchOptions.proxy = { server: `${proxyUrl.protocol}//${proxyUrl.host}` };
      
      // 如果 URL 中包含账号密码，自动提取并解码
      if (proxyUrl.username || proxyUrl.password) {
        launchOptions.proxy.username = decodeURIComponent(proxyUrl.username);
        launchOptions.proxy.password = decodeURIComponent(proxyUrl.password);
      }
      console.log(`[网络] 已启用代理: ${launchOptions.proxy.server} (含身份验证: ${!!proxyUrl.username})`);
    } catch (e) {
      console.error("[网络] PROXY_URL 格式有误，请参考: socks5://user:pass@ip:port", e.message);
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
    console.log("正在访问 Discord 准备注入 Token...");
    await page.goto('https://discord.com/login', { waitUntil: 'networkidle' });
    
    const discordToken = process.env.DISCORD_TOKEN;
    if (!discordToken) throw new Error("未配置 DISCORD_TOKEN");
    
    await page.evaluate((token) => {
      function login(token) {
        setInterval(() => {
          document.body.appendChild(document.createElement('iframe')).contentWindow.localStorage.token = `"${token}"`
        }, 50);
        setTimeout(() => { location.reload(); }, 2500);
      }
      login(token);
    }, discordToken);

    await page.waitForTimeout(5000);
    
    console.log("正在访问 Daki Dashboard...");
    await page.goto('https://dash.daki.cc/dashboard', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    console.log("进入 Servers 界面...");
    await page.click('text="Servers"');
    await page.waitForTimeout(2000);

    const processRenewal = async (stepCount) => {
        console.log(`开始第 ${stepCount} 次续期流程...`);
        await page.click('button:has-text("Renew")');
        await page.check('input[type="checkbox"]'); 
        await page.click('button:has-text("Continue")');
        
        console.log("等待倒计时结束...");
        const claimButton = page.locator('button:has-text("Claim")');
        await claimButton.waitFor({ state: 'visible', timeout: 120000 });
        await claimButton.click();
        
        console.log(`第 ${stepCount} 次领取成功！`);
        successCount++;
        await page.waitForTimeout(3000);
    };

    await processRenewal(1);
    await processRenewal(2);

    await page.screenshot({ path: screenshotPath });
    await sendTelegramNotification(`✅ Daki 每日 ${successCount} 次续期已成功完成！`, screenshotPath);

  } catch (error) {
    console.error("自动化流程出错:", error);
    try {
      await page.screenshot({ path: screenshotPath });
      await sendTelegramNotification(`❌ Daki 续期失败！\n错误: ${error.message}`, screenshotPath);
    } catch (e) {
      await sendTelegramNotification(`❌ Daki 严重失败！无法截图。\n错误: ${error.message}`, null);
    }
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
