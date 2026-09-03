export function externalProviderConfiguration(endpoint = "http://127.0.0.1:17841/v1"): string {
  const url = new URL(endpoint);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1") {
    throw new Error("Chat2Codex external provider endpoint must use loopback HTTP");
  }
  return [
    "# Chat2Codex Responses endpoint",
    `openai_base_url = ${JSON.stringify(url.toString().replace(/\/$/, ""))}`,
    "",
    "# Keep Codex's built-in OpenAI provider identity. Let CC Switch own config.toml.",
  ].join("\n");
}
