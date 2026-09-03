import type { FailureReason } from "./config";

export interface FailureEvidence {
  status?: number;
  code?: string;
  message?: string;
}

function normalized(evidence: FailureEvidence | Error | unknown): FailureEvidence {
  if (evidence instanceof Error) return { message: evidence.message, code: evidence.name };
  if (!evidence || typeof evidence !== "object") return { message: String(evidence ?? "") };
  const value = evidence as Record<string, unknown>;
  return {
    ...(typeof value.status === "number" ? { status: value.status } : {}),
    ...(typeof value.code === "string" ? { code: value.code } : {}),
    ...(typeof value.message === "string" ? { message: value.message } : {}),
  };
}

export function classifyFailure(input: FailureEvidence | Error | unknown): FailureReason {
  const evidence = normalized(input);
  const text = `${evidence.code ?? ""} ${evidence.message ?? ""}`.toLowerCase();
  if (/safety|content[_ -]?policy|refusal|unsafe/.test(text)) return "safety_refusal";
  if (/cancel|abort|client[_ -]?closed/.test(text)) return "user_cancelled";
  if (/sandbox.*(deny|denied)|approval.*(deny|denied)/.test(text)) return "codex_sandbox_denied";
  if (/workspace.*(permission|deny|denied)|permission[_ -]?denied/.test(text)) return "workspace_permission_denied";
  if (evidence.status === 401 || evidence.status === 403 || /auth|sign[ -]?in|session.*expired/.test(text)) {
    return "auth_required";
  }
  if (/quota|allowance|usage limit|limit reached|exhausted/.test(text)) return "quota_exhausted";
  if (evidence.status === 429 || /rate[_ -]?limit|too many requests/.test(text)) return "rate_limit";
  if (/model.*(unavailable|not available|disabled)|unknown model/.test(text)) return "model_unavailable";
  if (/browser|webcontents|page crashed|target closed|cdp/.test(text)) return "browser_unavailable";
  if (evidence.status === 400 || /malformed|invalid[_ -]?request|bad request/.test(text)) return "invalid_request";
  return "unknown";
}

const AUTOMATIC_FALLBACK_REASONS = new Set<FailureReason>([
  "rate_limit",
  "quota_exhausted",
  "model_unavailable",
  "browser_unavailable",
  "auth_required",
  "unknown",
]);

export function allowsAutomaticFallback(reason: FailureReason): boolean {
  return AUTOMATIC_FALLBACK_REASONS.has(reason);
}
