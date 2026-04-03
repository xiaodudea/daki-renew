const { chromium } = require('playwright');
const fs = require('fs');

// Telegram 配置
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;

// 代理配置
const PROXY_SERVER = process.env.PROXY_SERVER;     // 例如: socks5://1.2.3.4:1080 或 http://1.2.3.4:8080
const PROXY_USERNAME = process.env.PROXY_USERNAME; // 可选
const PROXY_PASSWORD = process.env.PROXY_PASSWORD; // 可选

async function sendTelegramNotification(message, screenshotPath) {
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) {
    console.log("未配置 TG 通知，跳过发送: ", message);
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
    if (!response.ok) console.error("Telegram 通知发送失败:", await response.text());
    else console.log("Telegram 通知发送成功！");
  } catch (error) {
    console.error("发送 TG 消息异常:", error);
  }
}

(async () => {
  // 配置浏览器启动选项
  let launchOptions = { headless: true };
  
  // 如果配置了代理，则注入代理设置
  if (PROXY_SERVER) {
    launchOptions.proxy = { server: PROXY_SERVER };
    if (PROXY_USERNAME && PROXY_PASSWORD) {
      launchOptions.proxy.username = PROXY_USERNAME;
      launchOptions.proxy.password = PROXY_PASSWORD;
    }
    console.log(`[网络] 已启用代理服务器: ${PROXY_SERVER}`);
  } else {
    console.log(`[网络] 未检测到代理配置，使用直连模式。`);
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
    await sendTelegramNotification(`✅ Daki 服务器每日 ${successCount} 次续期已成功完成！`, screenshotPath);

  } catch (error) {
    console.error("自动化流程出错:", error);
    try {
      await page.screenshot({ path: screenshotPath });
      await sendTelegramNotification(`❌ Daki 服务器续期失败！\n错误信息: ${error.message}`, screenshotPath);
    } catch (screenshotError) {
      await sendTelegramNotification(`❌ Daki 续期严重失败！\n无法截取画面。\n错误: ${error.message}`, null);
    }
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
