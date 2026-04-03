const { chromium } = require('playwright');

(async () => {
  // 启动浏览器（生产环境使用无头模式）
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log("正在访问 Dashboard...");
    await page.goto('https://dash.daki.cc/dashboard');

    // 1. 通过 Discord 登录
    console.log("正在通过 Discord 登录...");
    // 注意：如果是直接跳转到 Discord 授权页面
    await page.fill('input[name="email"]', process.env.DISCORD_EMAIL);
    await page.fill('input[name="password"]', process.env.DISCORD_PASSWORD);
    await page.click('button[type="submit"]');
    
    // 等待授权并跳转回 Dashboard
    await page.waitForURL('https://dash.daki.cc/dashboard**', { timeout: 60000 });

    // 2. 点击 Servers 进入服务器界面
    console.log("进入 Servers 界面...");
    await page.click('text="Servers"');

    // 提取为一个续期函数，以便重复执行
    const processRenewal = async (stepCount) => {
        console.log(`开始第 ${stepCount} 次续期流程...`);
        
        // 3. 点击 renew 按钮
        await page.click('button:has-text("Renew")');
        
        // 勾选同意框并 Continue
        await page.check('input[type="checkbox"]'); 
        await page.click('button:has-text("Continue")');
        
        // 4. 等待监控倒计时并领取
        console.log("等待倒计时结束...");
        // 假设倒计时结束后的领取按钮文本为 "Claim"
        const claimButton = page.locator('button:has-text("Claim")');
        
        // 使用轮询或等待元素变为可点击状态
        await expect(claimButton).toBeEnabled({ timeout: 120000 }); // 假设倒计时最长2分钟
        await claimButton.click();
        console.log(`第 ${stepCount} 次领取成功！`);
        
        // 等待页面稳定或弹窗消失
        await page.waitForTimeout(3000);
    };

    // 执行第一次续期
    await processRenewal(1);
    
    // 5. 再次重复第三步骤
    await processRenewal(2);

  } catch (error) {
    console.error("自动化流程出错:", error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
