import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";
import { defaultConfig, getConfigPath, loadConfigForSetup, providerConfig } from "./config";
import { ChatGptBrowserWorker } from "./adapters/chatgpt-web/browser-worker";
import { estimateTokens } from "./lib/token-estimate";

/** Private local CLI transport: stdin carries context, stdout carries one framed result. */
export async function runPlannerCli(): Promise<void> {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    input += chunk.toString();
    if (input.length > 100000) throw new Error("Planner context exceeds 100,000 characters");
  }
  const data: unknown = JSON.parse(input);
  if (!data || typeof data !== "object") throw new Error("Invalid planner input");
  const value = data as Record<string, unknown>;
  if (typeof value.prompt !== "string" || !value.prompt.trim() || typeof value.descriptor !== "string" || !isAbsolute(value.descriptor)
    || typeof value.traceId !== "string" || !/^plan_[a-f0-9]{24}$/.test(value.traceId)) throw new Error("Invalid planner input");
  const config = existsSync(getConfigPath()) ? loadConfigForSetup() : defaultConfig();
  config.browserHost = "launcher";
  config.browserHostDescriptorPath = value.descriptor;
  config.mode = "browser-only";
  const worker = ChatGptBrowserWorker.forProvider(providerConfig(config));
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
  try {
    const session = await worker.inspectSession(true);
    const sol = session.solAvailable ?? config.solAvailable;
    const model = sol ? "gpt-5.6-sol" : "gpt-5.6-luna";
    const effort = typeof value.effort === "string" ? value.effort : "high";
    const response = await worker.run({
      traceId: value.traceId, modelId: model, reasoning: sol ? effort : "medium",
      capabilities: { localToolsEnabled: false, solAvailable: sol, proAvailable: session.proAvailable ?? config.proAvailable },
      prepare: async () => ({ text: value.prompt as string, images: [], release() {} }),
      abortSignal: controller.signal, onTextDelta() {},
    });
    process.stdout.write("CHAT2CODEX_PLANNER_RESULT=" + JSON.stringify({ text: response, inputTokens: estimateTokens(value.prompt), outputTokens: estimateTokens(response) }) + "\n");
  } finally {
    process.removeListener("SIGTERM", stop); process.removeListener("SIGINT", stop);
    await worker.close();
  }
}
