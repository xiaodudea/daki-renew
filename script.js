const { chromium } = require('playwright');
const fs = require('fs');

const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const HAS_PROXY = process.env.PROXY_URL;

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
    await fetch(url, { method: 'POST', body: formData });
  } catch (error) {
    console.error("TG请求异常:", error);
  }
}

(async () => {
  let launchOptions = { headless: true };
  
  // 核心修改：如果配置了代理，直接连接本地的 GOST 隧道
  if (HAS_PROXY) {
    launchOptions.proxy = { server: 'http://127.0.0.1:8080' };
    console.log(`[网络] 已连接至本地代理隧道 (127.0.0.1:8080)，绕过浏览器 SOCKS5 认证限制。`);
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
    
    await page.evaluate((token) => {
      function login(token) {
        setInterval(() => {
          document.body.appendChild(document.createElement('iframe')).contentWindow.localStorage.token = `"${token}"`
        }, 50);
        setTimeout(() => { location.reload(); }, 2500);
      }
      login(token);
    }, DISCORD_TOKEN);

    await page.waitForTimeout(5000);
    
console.log("正在访问 Daki Dashboard...");
    await page.goto('https://dash.daki.cc/dashboard', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000); // 等待可能的页面跳转

    // 【新增逻辑】处理 Discord 授权页面 (OAuth)
    if (page.url().includes('oauth2/authorize')) {
      console.log("检测到 Discord 授权拦截，正在自动处理...");
      try {
        // 1. 处理截图中的 "Keep Scrolling..." 按钮（适配中英文）
        const keepScrollingBtn = page.locator('button:has-text("Keep Scrolling"), button:has-text("继续滚动"), button:has-text("向下滚动")').first();
        // 如果按钮存在且可见，点击它来展开完整权限列表
        if (await keepScrollingBtn.isVisible({ timeout: 5000 })) {
          console.log("点击继续滚动...");
          await keepScrollingBtn.click();
          await page.waitForTimeout(1000); // 等待按钮文字变成 Authorize
        }

        // 2. 点击 "Authorize" (授权) 按钮
        const authorizeBtn = page.locator('button:has-text("Authorize"), button:has-text("授权")').first();
        await authorizeBtn.waitFor({ state: 'visible', timeout: 5000 });
        console.log("点击授权按钮...");
        await authorizeBtn.click();

        // 3. 等待成功跳回 Daki Dashboard
        console.log("等待重定向回 Daki...");
        await page.waitForURL('**/dashboard', { timeout: 30000 });
        await page.waitForTimeout(3000); // 等待 Dashboard 彻底渲染
      } catch (authError) {
        console.log("自动授权步骤遇到小问题，将强行继续尝试寻找 Servers 菜单: ", authError.message);
      }
    }

    console.log("当前页面URL:", page.url());
    console.log("准备进入 Servers 界面...");
    
    // 【优化】使用更稳定的查找方式
    const serversLocator = page.locator('text=/servers/i').first();
    await serversLocator.waitFor({ state: 'visible', timeout: 15000 });
    await serversLocator.click();
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
    } catch (e) {
      await sendTelegramNotification(`❌ Daki 严重失败！无法截图。\n错误: ${error.message}`, null);
    }
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
