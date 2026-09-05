// Real Chromium, isolated IPC fixtures: no account, bridge, or Codex configuration is used.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright-core");

async function main() {
  const { createServer } = await import("vite");
  const root = path.resolve(__dirname, "..");
  const output = path.resolve(root, "../output/playwright");
  fs.mkdirSync(output, { recursive: true });
  const fixture = fs.readFileSync(path.join(root, "tests/fixtures/renderer-api.js"), "utf8");
  const server = await createServer({ root, server: { host: "127.0.0.1", port: 0, strictPort: false } });
  await server.listen();
  let browser;
  try {
    browser = await chromium.launch(process.env.CHAT2CODEX_TEST_BROWSER
      ? { executablePath: process.env.CHAT2CODEX_TEST_BROWSER }
      : { channel: "chrome" });
    const failures = [];
    const open = async (configure = "", viewport = { width: 1280, height: 960 }) => {
      const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
      page.setDefaultTimeout(10_000);
      page.setDefaultNavigationTimeout(15_000);
      page.on("pageerror", error => failures.push(error.message));
      await page.addInitScript({ content: `${fixture}\n${configure}` });
      await page.goto(server.resolvedUrls.local[0]);
      return page;
    };
    const navigate = async (page, name) => {
      console.log(`  click ${name}`);
      await page.getByRole("button", { name, exact: true }).click();
    };
    const waitText = (page, selector, text) => page.waitForFunction(({ selector, text }) =>
      document.querySelector(selector)?.textContent?.includes(text), { selector, text });
    const screenshot = async (page, name) => {
      await page.waitForFunction(() => [...document.querySelectorAll(".surface-transition")].every(el => Number(getComputedStyle(el).opacity) >= 0.999));
      return page.screenshot({ path: path.join(output, name), animations: "disabled" });
    };

    let page = await open("Object.assign(window.__launcherTest.state, { onboardingComplete: false, language: null });");
    await page.getByRole("radio").first().focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-checked") === "true" && document.activeElement?.textContent?.includes("English"));
    await navigate(page, "Continue");
    await page.getByRole("heading", { name: "Choose the right workflow" }).waitFor();
    await page.locator(".welcome-footer .button-primary").click();
    await page.getByRole("heading", { name: "From an idea to a verified result" }).waitFor();
    assert.equal(await page.evaluate(() => window.__launcherTest.state.githubOpened), false);
    await page.close();
    console.log("PASS keyboard onboarding without requiring social actions");

    page = await open("window.__launcherTest.controls.failSnapshot = true;");
    await page.getByRole("button", { name: "重试 / Retry" }).waitFor();
    await page.evaluate(() => { window.__launcherTest.controls.failSnapshot = false; });
    await navigate(page, "重试 / Retry");
    await page.getByRole("heading", { name: "从想法，到验证完成" }).waitFor();
    await navigate(page, "连接设置");
    console.log("PASS startup error and retry");
    await screenshot(page, "setup-zh.png");

    await navigate(page, "打开登录");
    await navigate(page, "连接设置");
    await navigate(page, "运行冒烟测试");
    await navigate(page, "连接设置");
    await navigate(page, "安装模型");
    await waitText(page, ".setup-progress", "配置 MCP");
    await navigate(page, "MCP");
    await page.evaluate(() => { window.__launcherTest.controls.failStep = true; });
    await navigate(page, "下一步");
    await page.getByRole("alert").waitFor();
    assert.equal(await page.locator('.wizard-stepper [aria-current="step"]').innerText(), "1\n创建 Tunnel 和 API key");
    await page.evaluate(() => { window.__launcherTest.controls.failStep = false; });
    await navigate(page, "下一步");
    await page.getByLabel("Tunnel ID", { exact: true }).fill(` tunnel_${"a".repeat(32)} `);
    await page.getByLabel("API key（不是 Admin key）", { exact: true }).fill(` sk-${"x".repeat(24)} `);
    await navigate(page, "连接 Harness");
    await page.getByRole("button", { name: "验证运行时", exact: true }).waitFor();
    await navigate(page, "活动");
    await navigate(page, "MCP");
    await navigate(page, "返回");
    await page.getByText("Tunnel 凭据已保存", { exact: true }).waitFor();
    const input = await page.evaluate(() => window.__launcherTest.controls.calls[0].input);
    assert.equal(input.tunnelId, `tunnel_${"a".repeat(32)}`);
    assert.equal(input.runtimeKey, `sk-${"x".repeat(24)}`);
    await page.setViewportSize({ width: 720, height: 600 });
    await navigate(page, "重新连接 Harness");
    await navigate(page, "验证运行时");
    await navigate(page, "完成");
    await page.locator(".browser-surface").waitFor();
    await page.setViewportSize({ width: 1280, height: 960 });
    console.log("PASS setup flow, failed step persistence, trimmed credentials, page remount and compact MCP verification");

    await navigate(page, "活动");
    await page.getByLabel("事件级别").selectOption("error");
    assert.equal(await page.locator(".activity-entry").count(), 1);
    await page.getByLabel("搜索事件和详情…").fill("recovery");
    await page.locator(".activity-row").click();
    await page.getByText('"recovery": "Run diagnostics and retry"', { exact: false }).waitFor();
    await page.getByLabel("搜索事件和详情…").fill("no-such-event");
    await page.getByText("没有符合筛选条件的事件。", { exact: true }).waitFor();
    await navigate(page, "清除筛选");
    assert.equal(await page.locator(".activity-entry").count(), 3);
    await screenshot(page, "activity-zh.png");
    console.log("PASS activity filters, full details and empty-state recovery");

    await page.evaluate(() => { window.__launcherTest.controls.failUsage = true; });
    await navigate(page, "用量与等效价值");
    await page.getByText("暂时无法读取用量", { exact: true }).waitFor();
    assert.equal(await page.locator(".usage-hero-grid").count(), 0, "failed reads must not look like zero usage");
    await page.evaluate(() => { window.__launcherTest.controls.failUsage = false; });
    await navigate(page, "刷新");
    await page.locator(".usage-hero-grid").waitFor();
    await page.evaluate(async () => {
      const summary = await window.codexWebLauncher.usageSummary();
      const totals = { turns: 42, inputTokens: 180000, outputTokens: 24000, totalTokens: 204000, estimatedSavingsUsd: 1.2 };
      const days = Array.from({ length: 7 }, (_, i) => {
        const date = new Date(); date.setDate(date.getDate() - (6 - i));
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        return { ...totals, date: key, totalTokens: (i + 1) * 17000 };
      });
      window.__launcherTest.setUsage({ ...summary, today: totals, last7Days: totals, lifetime: totals, days });
    });
    await navigate(page, "刷新");
    await waitText(page, ".usage-hero-grid", "42");
    await screenshot(page, "usage-zh.png");
    await page.evaluate(() => { window.__launcherTest.controls.failUsage = true; });
    await navigate(page, "刷新");
    await page.getByText("刷新失败，当前显示上次成功读取的数据。", { exact: true }).waitFor();
    assert.match(await page.locator(".usage-hero-grid").innerText(), /42/);
    const completed = await page.evaluate(() => {
      const controls = window.__launcherTest.controls;
      controls.failUsage = false; controls.usageDelay = 900;
      document.dispatchEvent(new Event("visibilitychange"));
      return controls.completedUsage;
    });
    await navigate(page, "清零估算");
    await page.getByText("用量估算已清零", { exact: true }).waitFor();
    await page.waitForFunction(completed => window.__launcherTest.controls.completedUsage > completed, completed);
    assert.doesNotMatch(await page.locator(".usage-hero-grid").innerText(), /42|20\.4/);
    console.log("PASS usage loading, retry, stale data and reset/poll race");

    await navigate(page, "偏好设置");
    await page.getByRole("switch").first().waitFor();
    assert.equal(await page.getByRole("switch").count(), 5);
    for (const control of await page.getByRole("switch").all()) assert.ok(await control.getAttribute("aria-label"));
    await page.getByRole("button", { name: /^运行诊断/ }).click();
    await page.getByText("查看详情与恢复建议", { exact: true }).click();
    await page.getByText("Confirm the local service is running, then retry diagnostics.", { exact: true }).waitFor();
    await page.getByLabel("语言", { exact: true }).selectOption("en");
    await page.getByLabel("Theme", { exact: true }).selectOption("dark");
    await page.waitForFunction(() => document.documentElement.lang === "en" && document.querySelector('.app-root[data-theme="dark"]'));
    await page.waitForFunction(() => {
      const header = document.querySelector(".doctor-summary header");
      return header && getComputedStyle(header).color === "rgb(255, 255, 255)";
    });
    await page.locator(".content-scroll").evaluate(el => { el.scrollTop = 0; });
    await screenshot(page, "settings-en-dark.png");
    console.log("PASS localized preferences, switch labels, theme and recovery details");
    await page.close();


    page = await open();
    await page.getByRole("heading", {name:"从想法，到验证完成"}).waitFor();
    await page.getByRole("radio", {name:"Codex 独立", exact:true}).click();
    await page.getByRole("radio", {name:"Codex 独立", exact:true}).getAttribute("aria-checked").then(value=>assert.equal(value,"true"));
    await page.getByLabel("OpenAI 执行 API Key", {exact:true}).fill("sk-ui-fixture-only-not-a-real-key");
    await navigate(page,"保存密钥");
    await navigate(page,"选择目录");
    await page.getByLabel("本次需要完成什么？").fill("修复登录按钮并验证失败后可以重新提交");
    await navigate(page,"预览发送内容");
    await page.getByText("将发送的上下文", {exact:true}).waitFor();
    await screenshot(page,"workbench-home-zh.png");
    await navigate(page,"开始任务");
    await page.getByText("Codex 执行中", {exact:true}).first().waitFor();
    assert.equal(await page.evaluate(()=>window.__launcherTest.browser?.authenticated ?? window.__launcherTest.snapshot.browser.authenticated),false);
    await page.getByRole("radio", {name:"ChatGPT 规划", exact:true}).click();
    await page.getByText(/下一阶段生效/).waitFor();
    await navigate(page,"阶段结束后暂停");
    await page.getByLabel("补充要求 / 对遗留问题的决定").fill("继续完成并运行测试");
    await navigate(page,"继续任务");
    await navigate(page,"停止");
    await screenshot(page,"workbench-task-zh.png");
    await navigate(page,"偏好设置");
    await page.getByLabel("语言", {exact:true}).selectOption("en");
    await page.getByLabel("Theme", {exact:true}).selectOption("dark");
    await navigate(page,"Home & tasks");
    await page.getByText("Stopped", {exact:true}).first().waitFor();
    assert.equal(await page.getByLabel("Additional requirements / decisions", {exact:true}).inputValue(), "继续完成并运行测试");
    await page.setViewportSize({width:720,height:760});
    if (await page.getByRole("button", {name:"Hide sidebar", exact:true}).count()) await navigate(page,"Hide sidebar");
    await page.locator(".sidebar-backdrop").waitFor({state:"hidden"});
    await screenshot(page,"workbench-home-en-dark.png");
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"workbench must fit compact viewport");
    await page.close();
    console.log("PASS workbench modes, no-Web Codex start, context preview, phase switch, pause/resume/stop, English dark compact layout");

    page = await open("window.__launcherTest.state.sidebarOpen = false;");
    await page.getByRole("button", { name: "显示侧边栏", exact: true }).waitFor();
    assert.equal(await page.locator(".app-sidebar").getAttribute("inert"), "");
    await navigate(page, "显示侧边栏");
    await page.waitForFunction(() => window.__launcherTest.state.sidebarOpen === true);
    await page.setViewportSize({ width: 760, height: 720 });
    await page.getByRole("button", { name: "显示侧边栏", exact: true }).waitFor();
    assert.ok(await page.locator(".content-scroll").evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    await screenshot(page, "setup-narrow.png");
    await page.close();
    console.log("PASS sidebar persistence, hidden focus targets and narrow layout");

    page = await open("Object.assign(window.__launcherTest.state, { coreSetupComplete: true, biggerContextRecommendationDismissed: false });");
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("role")), "switch");
    await page.keyboard.press("Shift+Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "关闭");
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached" });
    await page.close();
    console.log("PASS recommendation dialog focus trap and Escape");
    assert.deepEqual(failures, [], "renderer must not throw uncaught errors");
    console.log(`LAUNCHER_UI_SMOKE_OK · screenshots: ${output}`);
  } finally {
    await browser?.close();
    await server.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
