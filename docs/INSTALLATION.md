# Chat2Codex 普通用户安装教程

新首页工作台请先阅读 [工作台指南](workbench.md)。它使用 Codex CLI 与执行 API Key，不需要下文旧桥接路径的 MCP 设置。

这份教程适合只想使用软件、不参与源码开发的用户。成品安装包已经内置 Chat2Codex 运行时和
固定版本 Bun；不需要安装 Bun、Node.js、npm、Python 或源码依赖。

## 1. 使用前准备

你需要：

- 官方 Codex Desktop 或 Codex CLI。
- 一个可以正常登录 ChatGPT 网页版的账户。
- 能访问 ChatGPT 和 GitHub Releases 的网络。

Chat2Codex 是非官方浏览器自动化工具，不会绕过账户额度、安全策略或访问权限。ChatGPT 网页改版
可能暂时影响兼容性。

## 2. 下载正确的安装包

打开 [GitHub Releases](https://github.com/pangao1990/Chat2Codex/releases)，进入最新版本，
根据电脑选择一个文件：

| 系统 | 应下载的文件 | 如何判断 |
| --- | --- | --- |
| Apple 芯片 Mac | `chat2codex-<版本>-mac-arm64.dmg` | “关于本机”显示 M1/M2/M3/M4/M5 等 |
| Intel Mac | `chat2codex-<版本>-mac-x64.dmg` | “关于本机”显示 Intel |
| Windows 10/11 64 位 | `chat2codex-<版本>-win-x64.exe` | 绝大多数现代 Windows 电脑 |
| Linux 64 位 Intel/AMD | `chat2codex-<版本>-linux-x64.AppImage` | `uname -m` 显示 `x86_64` |

Alpha 或 Beta 版本属于预发布版本，适合测试，不建议依赖它保存唯一的重要配置。

## 3. 安装

### macOS

1. 双击 DMG。
2. 将 Chat2Codex 拖入“应用程序”。
3. 从“应用程序”打开 Chat2Codex。

也可以下载同版本 Release 中的 `install-launcher.sh`，在其所在目录运行：

```bash
CHAT2CODEX_VERSION=1.0.0 sh ./install-launcher.sh
```

请将示例版本替换为实际 Release 版本。脚本会自动识别 Apple/Intel 芯片，校验安装包 SHA-256，
优先安装到 `/Applications`，没有权限时安装到当前用户的 `~/Applications`。

### Windows

1. 双击 `chat2codex-<版本>-win-x64.exe`。
2. 按安装向导完成当前用户安装；不需要管理员权限。
3. 从开始菜单启动 Chat2Codex。

也可以下载同版本 Release 中的 `install-launcher.ps1`，在 PowerShell 中运行：

```powershell
$env:CHAT2CODEX_VERSION = "1.0.0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-launcher.ps1
```

脚本会下载 EXE、验证 SHA-256、静默安装并启动程序。请将示例版本替换为实际版本。

### Linux

推荐下载 Release 中的 `install-launcher.sh` 并运行：

```bash
CHAT2CODEX_VERSION=1.0.0 sh ./install-launcher.sh
```

脚本会验证 SHA-256，并安装到当前用户目录：

- 程序：`~/.local/lib/chat2codex/`
- 启动命令：`~/.local/bin/chat2codex`
- 桌面菜单：`~/.local/share/applications/chat2codex.desktop`

不需要 `sudo`。请将示例版本替换为实际版本。目前 Linux 成品仅支持 x64。

## 4. 首次启动

1. 打开 Chat2Codex，界面默认为中文，可切换英文。
   启动器会自动打开下一个未完成步骤；全部完成后会直接进入浏览器工作区。
2. 按引导登录 ChatGPT；登录只发生在 Chat2Codex 的独立浏览器空间。
3. 完成登录检查、浏览器测试和“安装模型”三个步骤。
4. 完全退出并重新启动一次 Codex，让模型目录刷新。
5. 继续完成界面中的 **MCP 核心闭环**，让 ChatGPT Web 可以把本地操作交给 Codex Harness。
   向导会先检查 Tunnel ID 和 API key 的基本格式；创建 ChatGPT 连接器时可一键复制准确名称。
6. 在 Codex 模型选择器中选择明确标有 `ChatGPT Web` 的模型并开始任务。Chat2Codex 浏览器空闲页
   也会显示这一步提示；任务开始后，实时 Web 推理标签页会自动出现。

完整 MCP 模式会保留 Codex 的文件、Shell、Git 和工具能力。未配置 MCP 时属于 Browser-only：
ChatGPT Web 可以推理，但不能调用本地 Codex 工具。External Manager 模式不会写入
`~/.codex/config.toml`，适合已经使用 CC Switch 等单写者配置工具的用户。实际额度计量、模型
可用性和限流结果以 OpenAI 账户显示为准。

## 5. 安装包会在电脑中放什么？

成品程序的 Bun 和 JavaScript 依赖都封装在 Chat2Codex 应用目录中，不会添加全局 `bun`、`node`
或 `npm` 命令，也不会与其他项目共享 `node_modules`。

程序必须保存少量用户数据：

- 正式配置、私有运行时和登录空间：`~/.chat2codex/`。
- “用量与节省”只在 `~/.chat2codex/runtime/usage-summary.json` 中保存聚合 Token、回合和估算金额，
  不保存提示词、回答、任务名或文件内容；可在页面中导出或确认后清零。
- Standalone 集成会谨慎管理自己登记的 Codex 路由字段，并保留恢复信息。
- 日志导出默认只提供经过隐私处理的诊断；不要分享浏览器状态、Cookie、密钥或原始日志。

这些是 Chat2Codex 自己的数据，不是全局开发依赖。不同版本的安装包会通过受控升级流程维护它们。

## 6. 更新与卸载

更新前退出 Chat2Codex，然后安装新版；安装器会保留用户设置。也可使用程序内的更新提示。

卸载前，先在 Chat2Codex 中选择 **移除 Codex 集成**，确认旧模型路由已恢复，再重启 Codex。
随后：

- macOS：从“应用程序”删除 Chat2Codex。
- Windows：设置 → 应用 → 已安装的应用 → Chat2Codex → 卸载。
- Linux：删除 `~/.local/bin/chat2codex`、`~/.local/lib/chat2codex/` 和桌面菜单项。

如果不再需要账户和设置，可在程序完全退出后另外删除 `~/.chat2codex/`。该目录可能包含敏感登录材料，
不要把它复制给其他人。

## 7. 遇到问题

先阅读根目录的 `TROUBLESHOOTING.md`。仍无法解决时，到 GitHub Issues 提交：系统版本、
Chat2Codex/Codex 版本、最小复现步骤、完整最终错误和程序导出的隐私安全诊断。不要上传 Cookie、
浏览器存储、API key、Tunnel ID 或未经处理的提示词和日志。
