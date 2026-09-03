# Chat2Codex

**Use ChatGPT as the brain, Codex as the hands.**

Chat2Codex 是面向官方 Codex Desktop / CLI 的本地 Responses 兼容桥接器。默认使用已登录的
ChatGPT Web 会话进行推理，同时保留 Codex 原生的文件、Shell、Git 和工具 Harness；当 ChatGPT
线路不可用时，后续的重试或续接可以切换到 Native Codex。

项目基于
[miuuyy/codex-chatgpt-web](https://github.com/miuuyy/codex-chatgpt-web) 4.0.8。准确的基线提交和
同步规则记录在 [UPSTREAM.md](UPSTREAM.md)，并完整保留上游 MIT 许可证与版权声明。

## 当前 Alpha 范围

- 独立的产品名、Application ID、命令、浏览器 partition 与数据目录。
- 正式数据位于 `~/.chat2codex/`，开发数据位于 `~/.chat2codex-dev/`。
- ChatGPT-first 路由策略和按模型隔离的 Circuit Breaker。
- Quality Lock：除非用户主动允许，否则不会静默降低推理档位。
- 只有额度、限流、模型不可用、浏览器异常或登录失效等错误允许 Native Codex fallback。
- 安全拒绝、用户取消、workspace 权限、非法请求和 sandbox 拒绝绝不会触发 fallback。
- 只在 turn 边界切换 provider，不会把一个 SSE 响应拼接成两种模型的输出。
- Tool ledger 防止续接时重复执行已经完成的本地副作用。
- Standalone 模式只拥有已登记的 Codex 路由字段，并生成私有备份。
- External Manager 模式对 `~/.codex/config.toml` 只读，遵守 CC Switch 单写者原则。

Telemetry、Savings 和完整 Launcher Dashboard 属于后续里程碑，详见
[实现状态](docs/chat2codex-status.md)。

## 环境与启动

源码开发要求 Bun 1.4.0。若系统没有全局 Bun，可使用下面锁定版本的 npm 分发程序。

```bash
npx -y bun@1.4.0 install --frozen-lockfile
cd launcher && npx -y bun@1.4.0 install --frozen-lockfile && cd ..
```

执行验证：

```bash
npx -y bun@1.4.0 run typecheck
npx -y bun@1.4.0 test tests/*.test.ts
npm test --prefix launcher
```

启动 Launcher：

```bash
npx -y bun@1.4.0 run app
```

查看集成所有权，或导出供 CC Switch 使用的 loopback 配置：

```bash
npx -y bun@1.4.0 run src/cli.ts integration status
npx -y bun@1.4.0 run src/cli.ts integration export
```

Setup 时可通过 `--integration-mode standalone` 或 `--integration-mode external-manager` 明确
指定模式。External Manager 模式永远不会写入 Codex 配置。

## 安全边界

Responses 只监听 `127.0.0.1`。浏览器 session 是敏感的本地账户材料，禁止复制或写入日志。
Chat2Codex 属于非官方浏览器自动化，不得用于绕过额度、安全策略、权限或访问控制。

## 许可证

[MIT](LICENSE)，保留上游版权和第三方声明。
