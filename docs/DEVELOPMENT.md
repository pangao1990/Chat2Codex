# Chat2Codex 二次开发教程

这份教程面向第一次参与开源项目的开发者。目标是：不在电脑中全局安装 Bun、Node.js、npm、
Electron 或项目依赖，只使用当前仓库中的工具链。

启动器会按状态自动进入下一个未完成页面：核心配置未完成时进入“连接设置”，正式版模型已安装但
MCP 未完成时进入 MCP，引导闭环完成后进入浏览器工作区。修改状态字段或引导流程时，请同步更新
`launcher/tests/renderer-wiring.test.cjs` 中的路由断言。MCP 凭据在渲染层做基础格式检查，主进程
仍负责最终验证；连接器名称复制使用受限 IPC，不要让渲染层直接访问系统剪贴板。

## 1. 准备源码

任选一种方式：

1. 熟悉 Git：克隆仓库后进入 `Chat2Codex` 目录。
2. 不熟悉 Git：在 GitHub 项目页选择 **Code → Download ZIP**，解压后进入该目录。

脚本本身只依赖操作系统已有的基础能力：

- macOS 13 或更高版本：终端、`curl`、`unzip`、`tar` 和 `shasum`。
- Windows 10/11 x64：Windows PowerShell 5.1 或 PowerShell 7。
- Linux x64/arm64：POSIX shell、`curl`、`unzip`、`tar`，以及 `sha256sum` 或 `shasum`。
- 能访问 GitHub Releases 和 npm 官方 registry 的网络。

开发和测试界面可以在没有全局 Bun、Node.js、npm、pnpm 或 Yarn 的电脑上运行。若要验证真实的
Codex 集成，还需要另行安装官方 Codex Desktop 或 CLI；它是 Chat2Codex 的目标软件，不属于本仓库依赖。

## 2. 一键安装项目内环境

macOS 或 Linux，在项目根目录打开终端：

```bash
./scripts/setup-local.sh
```

如果 ZIP 解压后脚本失去可执行权限，只需运行一次：

```bash
sh ./scripts/setup-local.sh
```

Windows 可以直接双击 `scripts\setup-local.cmd`。也可以在项目根目录的 PowerShell 中运行：

```powershell
scripts\setup-local.cmd
```

脚本会自动完成以下工作：

1. 从 `package.json` 读取项目锁定的 Bun 和 Node.js 版本。
2. 从 Bun 与 Node.js 官方发布站下载对应系统和 CPU 的压缩包。
3. 使用各自官方 `SHASUMS256.txt` 校验下载内容。
4. 将 Bun 和 Node.js 安装到 `.tools/`。
5. 严格按照两份 `bun.lock` 安装根项目和 Launcher 依赖。

网络中断时可以直接再次运行同一命令；脚本是幂等的，不会重复破坏已有环境。

### 国内源与官方源

默认 `auto` 会在第一次安装时比较官方源和 npmmirror 国内源的响应速度，把选择保存在项目的
`.tools/download-source`。Bun、Node.js 二进制和 npm 依赖都会使用所选线路；二进制校验值仍从
官方发布站获取，镜像不能替换校验结果。

需要手动切换时，在安装命令前设置 `CHAT2CODEX_SOURCE`：

```bash
# macOS / Linux：强制国内源
CHAT2CODEX_SOURCE=china ./scripts/setup-local.sh

# 强制官方源（GitHub / nodejs.org / npmjs.org）
CHAT2CODEX_SOURCE=official ./scripts/setup-local.sh
```

Windows PowerShell：

```powershell
$env:CHAT2CODEX_SOURCE = "china"   # 或 official / auto
scripts\setup-local.cmd
```

选择值只有 `auto`、`china`、`official`。显式运行一次会更新项目内记录；不修改电脑的 npm 配置。

依赖下载继续使用你选择的线路。只有 `verify` 中的安全审计会自动访问 npm 官方源，因为
npmmirror 不提供 npm 安全公告接口；这项临时切换只对审计子进程生效，也不会修改电脑配置。
若官方审计服务 60 秒内没有响应，命令会明确失败并给出超时提示，不会无限等待；稍后重试即可。

## 3. 文件到底安装在哪里？

| 内容 | 项目内位置 | 是否提交到 Git |
| --- | --- | --- |
| Bun 可执行文件 | `.tools/bun/<版本>/bin/` | 否 |
| Bun 本地 home | `.tools/bun-home/` | 否 |
| Node.js（测试和打包使用） | `.tools/node/<版本>/bin/` | 否 |
| Bun 下载和安装缓存 | `.cache/bun/` | 否 |
| Node.js 下载缓存 | `.cache/node/` | 否 |
| 自动选择的下载线路 | `.tools/download-source` | 否 |
| npm 兼容缓存 | `.cache/npm/` | 否 |
| Electron 下载缓存 | `.cache/electron/` | 否 |
| electron-builder 缓存 | `.cache/electron-builder/` | 否 |
| 后端依赖 | `node_modules/` | 否 |
| Launcher 依赖 | `launcher/node_modules/` | 否 |

包装脚本只在当前命令进程中修改 `PATH` 和相关缓存变量，不修改 shell profile、系统环境变量或
全局包目录。操作系统临时目录可能出现短期构建文件，命令完成后会清理；不会在那里安装持久依赖。

## 4. 启动与常用命令

以后不要直接输入全局 `bun`。macOS/Linux 使用：

```bash
# 确认版本
./scripts/bun-local.sh --version
./scripts/node-local.sh --version

# 启动开发版桌面程序
./scripts/bun-local.sh run app

# 完整检查：版本、审计、类型、测试、构建和运行时冒烟测试
./scripts/bun-local.sh run verify

# 只运行后端或 Launcher 测试
./scripts/bun-local.sh test tests/*.test.ts
./scripts/bun-local.sh run launcher:test
```

Windows 将命令开头替换为 `scripts\bun-local.cmd`：

```powershell
scripts\bun-local.cmd --version
scripts\bun-local.cmd run app
scripts\bun-local.cmd run verify
scripts\bun-local.cmd run launcher:test
```

代码主要分为：

- `src/`：CLI、Responses 服务、路由、ChatGPT Web adapter 和 Codex 集成。
- `launcher/src/`：React 桌面界面。
- `launcher/electron/`：Electron 主进程、浏览器和运行时管理。
- `tests/` 与 `launcher/tests/`：自动化测试。
- `scripts/`：安装、构建、检查和发布工具。
- `docs/`：架构、开发模式、验证和故障处理文档。

修改前请先阅读根目录的 `CONTRIBUTING.md`，尤其是路由所有权、显式模型选择、失败关闭和隐私边界。

## 5. 制作本机安装包

修改界面后，先运行 `./scripts/bun-local.sh run launcher:smoke:ui`（Windows 使用
`scripts\bun-local.cmd run launcher:smoke:ui`）。此检查需要 Google Chrome 或通过
`CHAT2CODEX_TEST_BROWSER` 指定的 Chromium，使用模拟 IPC，不会访问账户或修改 Codex。
覆盖范围和截图位置见[界面验证](ui-validation.md)。Linux CI 会单独运行这项检查。

先运行一键环境安装和完整验证，然后在项目根目录执行：

```bash
# macOS / Linux
./scripts/bun-local.sh run app:package

# Windows
scripts\bun-local.cmd run app:package
```

成品输出到 `launcher/artifacts/`。必须在目标系统本机打包，项目不支持从 macOS 交叉打 Windows/Linux 包：

- macOS：DMG 和 ZIP。
- Windows x64：NSIS EXE 安装程序。
- Linux x64：AppImage。

Linux 的发布级打包还需要发行版提供的桌面库和构建工具。可复现的 Ubuntu 安装步骤写在
`.github/workflows/release.yml`；这些系统库属于操作系统构建环境，不能安全地伪装成仓库内应用依赖。
不想调整本机系统时，可在自己的 GitHub fork 中使用 Release 工作流为三个系统分别构建。

## 6. 更新依赖

正常开发始终使用 `--frozen-lockfile`，这样不会偷偷改变版本。只有准备明确的依赖升级时才运行：

```bash
./scripts/bun-local.sh update
./scripts/bun-local.sh update --cwd launcher
```

Windows 使用相同参数配合 `scripts\bun-local.cmd`。更新后检查 `package.json`、`bun.lock`、
`launcher/package.json` 和 `launcher/bun.lock`，再运行完整验证。不要全局安装依赖来解决项目问题。

## 7. 清理或重新安装

关闭开发版 Chat2Codex 后，删除以下四处即可彻底移除项目内工具链：

- `.tools/`
- `.cache/`
- `node_modules/`
- `launcher/node_modules/`

源码不会被删除。再次运行一键安装脚本即可获得干净环境。开发版运行数据位于
`~/.chat2codex-dev/`，它与正式版 `~/.chat2codex/` 隔离，也不属于依赖目录。

## 8. 常见问题

- **下载失败**：确认能访问 GitHub 和 `https://registry.npmjs.org`，然后重新运行安装脚本。
- **校验失败**：不要跳过 SHA-256 校验；删除 `.cache/bun/downloads/` 后重试。
- **提示缺少 curl/unzip**：通过操作系统包管理器安装提示的基础命令。Bun 和应用依赖仍会留在项目中。
- **端口、登录或 Codex 模型异常**：阅读根目录 `TROUBLESHOOTING.md`。
- **脚本没有权限**：在 macOS/Linux 用 `sh ./scripts/setup-local.sh` 启动。
