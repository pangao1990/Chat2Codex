const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const launcherRoot = path.resolve(__dirname, "..");
const repositoryRoot = path.resolve(launcherRoot, "..");
const read = (...parts) => fs.readFileSync(path.join(repositoryRoot, ...parts), "utf8");

const appSource = read("launcher", "src", "App.tsx");
const i18nSource = read("launcher", "src", "i18n.ts");
const languageTypes = read("launcher", "src", "types.ts");
const electronMain = read("launcher", "electron", "main.cjs");
const stateSource = read("launcher", "electron", "state.cjs");
const englishReadme = read("README.en.md");
const chineseReadme = read("README.md");

function commandFences(source) {
  return [...source.matchAll(/```(bash|powershell)\n([\s\S]*?)```/g)]
    .map((match) => `${match[1]}\n${match[2].trim()}`);
}

function linkTargets(source) {
  const markdown = [...source.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((match) => match[1]);
  const html = [...source.matchAll(/(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
  return [...new Set([...markdown, ...html])].sort();
}

test("Chinese is the launcher default and English is the only alternative", () => {
  assert.match(languageTypes, /export type Language = "zh-CN" \| "en";/);
  assert.match(appSource, /snapshot\?\.state\.language \?\? "zh-CN"/);
  assert.match(appSource, /snapshot\.state\.language \?\? "zh-CN"/);
  assert.doesNotMatch(appSource, /selectedLanguage === "ja"/);
  assert.doesNotMatch(appSource, /value: "ja"/);
  assert.doesNotMatch(i18nSource, /language === "ja"/);
  assert.doesNotMatch(i18nSource, /const ja|日本語/);
  assert.match(electronMain, /NATIVE_COPY\[language\] \|\| NATIVE_COPY\["zh-CN"\]/);
  assert.match(electronMain, /stateStore\.read\(\)\.language \|\| "zh-CN"/);
  assert.match(appSource, /<LanguageMenu copy=\{copy\} language=\{language\}/);
  assert.match(appSource, /document\.documentElement\.lang = documentLanguage/);
  assert.doesNotMatch(appSource, /aria-label="Close language menu"/);
  assert.doesNotMatch(appSource, /aria-label="Language"/);
});

test("native launcher dialogs and tray actions follow the persisted language", () => {
  assert.match(electronMain, /"zh-CN": Object\.freeze\(\{[\s\S]*?openLauncher: "打开 Chat2Codex"/);
  assert.match(electronMain, /updateTrayMenu\(state\.language, state\)/);
  assert.match(electronMain, /updateTrayMenu\(next\.language, next\)/);
  assert.match(electronMain, /createTray\(logger, stateStore\.read\(\)\.language, stateStore\.read\(\)\)/);
  assert.match(electronMain, /title: copy\.exportDiagnostics/);
  assert.match(electronMain, /buttons: \[copy\.cancel, copy\.remove\]/);
});

test("catalog refresh guidance distinguishes a full Codex restart from account login", () => {
  assert.match(i18nSource, /Signing out and back in or only closing the window is not a restart/);
  assert.match(i18nSource, /仅退出并重新登录账号或只关闭窗口不算重启/);
});

test("Chinese navigation distinguishes connection setup from preferences", () => {
  assert.match(i18nSource, /setup: "连接设置"/);
  assert.match(i18nSource, /settings: "偏好设置"/);
  assert.match(i18nSource, /devSettingsTitle: "开发环境偏好"/);
  assert.doesNotMatch(i18nSource, /DEV 配置设置|设置项/);
  assert.match(appSource, /data-language=\{language\}/);
});

test("English and Chinese READMEs preserve commands, navigation, and localized subtitles", () => {
  assert.deepEqual(commandFences(chineseReadme), commandFences(englishReadme));
  const localizedTargets = source => linkTargets(source).map(target => target.replace(/^docs\/workbench\.en\.md$/, "docs/workbench.md")).sort();
  assert.deepEqual(localizedTargets(chineseReadme), localizedTargets(englishReadme));
  assert.match(englishReadme, /Use ChatGPT as the brain, Codex as the hands\./);
  assert.match(chineseReadme, /GPT中定良谋，Codex下展妙手。/);
  assert.match(i18nSource, /tagline: "Use ChatGPT as the brain, Codex as the hands\."/);
  assert.match(i18nSource, /tagline: "GPT中定良谋，Codex下展妙手。"/);
  assert.match(englishReadme, /README\.en\.md/);
  assert.match(chineseReadme, /README\.en\.md/);
  assert.match(englishReadme, /new workbench requires a usage-billed execution API key/);
  assert.match(chineseReadme, /新任务工作台需要执行 API Key，按 API 用量付费/);
  assert.match(englishReadme, /Do I need Chat2Codex\?/);
  assert.match(chineseReadme, /我是否需要 Chat2Codex？/);
  assert.match(englishReadme, /MCP core workflow/);
  assert.match(chineseReadme, /MCP 核心闭环/);
});
