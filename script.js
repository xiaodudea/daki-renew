const { chromium } = require('playwright');
const fs = require('fs');

// 环境变量配置
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const HAS_PROXY = process.env.PROXY_URL; // 用于判断是否启用了代理

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
  let launchOptions = { 
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled', // 隐藏自动化特征防拦截
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  };
  
  // 代理配置：如果配置了代理，连接本地的 GOST 隧道 (绕过浏览器的 SOCKS5 密码认证限制)
  if (HAS_PROXY) {
    launchOptions.proxy = { server: 'http://127.0.0.1:8080' };
    console.log(`[网络] 已连接至本地代理隧道 (127.0.0.1:8080)`);
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
    await page.waitForTimeout(3000); // 等待可能的重定向

    // ==========================================
    // 【核心修复】处理 Discord 授权页面 (OAuth)
    // ==========================================
    if (page.url().includes('oauth2/authorize')) {
      console.log("检测到 Discord 授权页面，正在自动模拟滚动解锁...");
      try {
        // 1. 强制页面内所有的滚动条直接滑动到底部
        await page.evaluate(() => {
          const scrollableElements = document.querySelectorAll('div[class*="scroller"]');
          scrollableElements.forEach(el => el.scrollTop = el.scrollHeight);
        });

        // 2. 停顿 1.5 秒，让 Discord 前端反应并解锁按钮
        await page.waitForTimeout(1500); 

        // 3. 定位“授权”按钮（兼容中英文）
        const authorizeBtn = page.locator('button:has-text("Authorize"), button:has-text("授权")').first();
        
        console.log("等待授权按钮解锁...");
        await authorizeBtn.waitFor({ state: 'visible', timeout: 10000 });
        
        console.log("点击授权按钮...");
        await authorizeBtn.click({ force: true });

        // 4. 等待成功跳回 Daki Dashboard
        console.log("点击成功，等待重定向回 Daki...");
        await page.waitForURL('**/dashboard', { timeout: 30000 });
        await page.waitForTimeout(3000); // 等待 Dashboard 彻底渲染
      } catch (authError) {
        console.log("自动授权步骤遇到异常，将尝试强行继续: ", authError.message);
      }
    }

    console.log("当前页面URL:", page.url());
    console.log("准备进入 Servers 界面...");
    
    // 定位 Servers 菜单 (使用正则忽略大小写，提高兼容性)
    const serversLocator = page.locator('text=/servers/i').first();
    await serversLocator.waitFor({ state: 'visible', timeout: 15000 });
    await serversLocator.click();
    await page.waitForTimeout(2000);

    // ==========================================
    // 服务器续期循环流程 (带跳转验证与重置版本)
    // ==========================================
    const processRenewal = async (stepCount) => {
        console.log(`\n=== 开始第 ${stepCount} 次续期流程 ===`);
        
        try {
            // 1. 寻找并点击 Renew 按钮
            const renewBtn = page.locator('button:has-text("Renew"), button:has-text("RENEW"), button:has-text("renew")').first();
            // 如果 15 秒内找不到 Renew，可能机器已经全续期完毕了
            await renewBtn.waitFor({ state: 'visible', timeout: 15000 });
            await renewBtn.click();
            
            // 2. 勾选同意并继续
            console.log("正在勾选同意并点击继续...");
            await page.waitForTimeout(1000); 
            
            const checkbox = page.locator('input[type="checkbox"]').first();
            await checkbox.check({ force: true }); 
            
            const continueBtn = page.locator('button:has-text("Continue"), button:has-text("CONTINUE"), button:has-text("continue")').first();
            await continueBtn.click();
            
            // 3. 【核心验证】等待并检查是否跳转到了专属续期页面
            console.log("验证页面是否跳转至专属续期界面...");
            try {
                // 最多等待 10 秒看 URL 是否会变成包含 renew-page 的地址
                await page.waitForURL('**/renew-page*', { timeout: 10000 });
                console.log("✅ 成功跳转至 renew-page！准备监控倒计时...");
            } catch (navError) {
                console.log(`⚠️ 未跳转至 renew-page 续期界面 (当前停留在: ${page.url()})。`);
                console.log(`该服务器暂无需续期或遇到限制，停止本轮等待。`);
                return; // 直接终止当前这一轮的函数操作，不再执行后面的找 Claim 按钮
            }
            
            // 4. 等待倒计时和 Claim 按钮
            console.log("等待倒计时结束 (最多等待 3 分钟)...");
            const claimButton = page.locator('button', { hasText: /claim/i }).first();
            
            await claimButton.waitFor({ state: 'visible', timeout: 180000 });
            console.log("发现领取按钮，正在点击...");
            await claimButton.click({ force: true });
            
            console.log(`🎉 第 ${stepCount} 次领取成功！`);
            successCount++;
            await page.waitForTimeout(4000); // 领完后多等一会儿让服务器处理

        } catch (error) {
            console.log(`第 ${stepCount} 次寻找或操作续期时结束: ${error.message}`);
        } finally {
            // 5. 【极其重要】为了不影响下一次循环，强制退回到服务器列表
            console.log("正在重置页面，准备返回 Servers 界面为下个任务做准备...");
            await page.goto('https://dash.daki.cc/dashboard', { waitUntil: 'networkidle' });
            const serversLocator = page.locator('text=/servers/i').first();
            // 容错处理：如果能找到 Servers 菜单就点击它
            if (await serversLocator.isVisible({ timeout: 5000 }).catch(() => false)) {
                await serversLocator.click();
                await page.waitForTimeout(3000);
            }
        }
    };
    // 依次执行两次续期
    await processRenewal(1);
    await processRenewal(2);

    // 任务成功截图及通知
    await page.screenshot({ path: screenshotPath });
    await sendTelegramNotification(`✅ Daki Free Tier 服务器每日 ${successCount} 次续期已成功完成！`, screenshotPath);

  } catch (error) {
    console.error("自动化流程出错:", error);
    // 任务失败截图及通知
    try {
      await page.screenshot({ path: screenshotPath });
      await sendTelegramNotification(`❌ Daki Free Tier 服务器续期失败！\n错误信息: ${error.message}`, screenshotPath);
    } catch (screenshotError) {
      console.error("截图失败:", screenshotError);
      await sendTelegramNotification(`❌ Daki Free Tier 服务器续期严重失败！\n无法截取画面。\n错误信息: ${error.message}`, null);
    }
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
