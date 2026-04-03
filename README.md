<div align="center">

# 🚀 Daki Auto-Renew Bot

**一个基于 Playwright 和 GitHub Actions 构建的全自动 Daki 免费服务器每日续期工作流。**

[![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-Automated-2088FF?logo=github-actions)](https://github.com/features/actions)
[![Playwright](https://img.shields.io/badge/Playwright-v1.40+-2EAD33?logo=playwright)](https://playwright.dev/)
[![Telegram](https://img.shields.io/badge/Telegram-Notifications-2CA5E0?logo=telegram)](https://core.telegram.org/bots)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

</div>

<br>

本项目通过无头浏览器模拟真实用户行为，每天定时自动登录 Daki 控制台、突破 Discord 授权拦截并完成服务器续期操作。任务结束后会自动截取实时网页画面，并发送至您的 Telegram。

---

## ✨ 核心特性

- **🛡️ 账号安全保护**
  采用 Discord Token 注入方式登录，无需输入账号密码，彻底告别复杂的验证码拦截。
- **🤖 自动突破授权**
  内置 JavaScript 注入脚本，自动模拟页面滚动行为，完美破解 Discord OAuth2 界面的“继续滚动”防机器人限制。
- **🌐 原生代理穿透**
  集成 `GOST` 代理隧道环境。完美解决无头浏览器引擎不支持 SOCKS5 密码认证的底层缺陷，支持任意 SOCKS5/HTTP 节点。
- **📱 实时图文通知**
  接入 Telegram Bot API，任务执行成功或失败都会发送详细的文字播报，并附带执行结束瞬间的网页截图，运行状态一目了然。

---

## 🛠️ 快速部署指南

无需拥有个人的服务器，只需利用 GitHub Actions 即可免费白嫖运行环境。

### 第 1 步：Fork 本项目
点击页面右上角的 `Fork` 按钮，将本仓库克隆到您的个人 GitHub 账号下。

### 第 2 步：获取关键配置信息
部署前，您需要提前准备好以下信息：

> **💡 获取 Discord Token 的方法：**
> 在电脑浏览器登录 Discord，按 `F12` 打开开发者工具，在 `Network` (网络) 或 `Application` (应用) 面板中提取您的用户 Token。

* **Telegram 机器人配置**：
    * 在 Telegram 中向 `@BotFather` 申请一个 Bot，获取 `BOT_TOKEN`。
    * 向您的机器人发条消息，然后获取您的 `CHAT_ID`。
* **代理节点**：为了防止 GitHub 数据中心的 IP 被封禁，强烈建议配置代理。

### 第 3 步：配置 GitHub Secrets

进入您刚刚 Fork 的仓库页面，依次点击 **Settings** -> **Secrets and variables** -> **Actions**，点击 **New repository secret**，添加以下 4 个环境变量：

| 变量名 (Name) | 是否必填 | 格式示例与说明 |
| :--- | :---: | :--- |
| `DISCORD_TOKEN` | <kbd>必填</kbd> | `MTI...` *(你的 Discord Token，绝对不要泄露)* |
| `PROXY_URL` | <kbd>推荐</kbd> | `socks5://user:pass@1.2.3.4:1080` 或 `http://ip:port` |
| `TG_BOT_TOKEN` | <kbd>选填</kbd> | `123456789:ABCDefgh...` *(TG 机器人 Token)* |
| `TG_CHAT_ID` | <kbd>选填</kbd> | `12345678` 或 `-100123...` *(接收通知的 ID)* |

> ⚠️ **注意**：如果您的代理密码中包含 `@` 或 `:` 等特殊符号，请务必先将密码进行 URL 编码（URLEncode）再填入。

---

## 🚀 运行与测试

### 🕒 自动定时运行
在 `.github/workflows/renew.yml` 文件中，默认配置了每天自动执行续期任务。
* **触发时间**：UTC 时间 `0:00` (北京时间早上 `8:00`)
* *无需任何人工干预。*

### 🖱️ 手动触发测试
配置完上述所有 Secrets 变量后，强烈建议您手动运行一次以测试配置是否正确：

1. 点击仓库顶部的 **Actions** 标签页。
2. 在左侧菜单中点击 **Daily Daki Server Renewal**。
3. 点击右侧出现的 **Run workflow** 按钮。
4. 等待 1~2 分钟，检查您的 Telegram 是否收到了包含“续期成功”截图的通知。

---

## ⚠️ 免责声明与注意事项

* **🔑 Token 安全**：`DISCORD_TOKEN` 拥有极高的账户控制权限。本脚本仅将其配置在受高强度加密保护的 GitHub Secrets 中。**请绝对不要将 Token 明文写在代码文件里，也不要发给任何人，谨防账号被盗！**
* **🚧 UI 变动风险**：自动化测试依赖于网页 DOM 元素的定位。如果目标网站前端界面发生大幅更改，脚本可能会因找不到按钮而报错，届时需要手动调整代码中的定位器 (Locator)。
* **🤝 仅供交流**：本项目仅供编程学习与自动化技术交流，请合理合法使用。
