/**
 * Token Estimator — rough estimation using the len/4 heuristic.
 *
 * Ported from: agent/model_metadata.py (Hermes tests)
 * Source: tests/agent/test_model_metadata.py
 *
 * The rough estimator divides character count by 4 (ceiling).
 * This is a reasonable approximation for mixed English text.
 * For CJK characters, Python counts each as 1 char, so 4 CJK chars/token holds.
 */

/**
 * Rough token count for a single string.
 * Uses ceil(len(text) / 4).
 */
export function estimateTokensRough(text: string | null | undefined): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Rough token count for an array of messages.
 * Sums the string length of each message (serialized) / 4.
 */
export function estimateMessagesTokensRough(
  messages: Array<{ role: string; content: string | null; [key: string]: unknown }>
): number {
  if (!messages || messages.length === 0) return 0;
  let total = 0;
  for (const msg of messages) {
    // Serialise the whole message object to capture tool_calls overhead too
    total += JSON.stringify(msg).length;
  }
  return Math.ceil(total / 4);
}

/**
 * Estimate how much context headroom remains after a set of messages.
 * Returns the number of tokens available before hitting the context limit.
 */
export function contextHeadroom(
  messages: Array<{ role: string; content: string | null; [key: string]: unknown }>,
  contextWindow: number,
): number {
  const used = estimateMessagesTokensRough(messages);
  return Math.max(0, contextWindow - used);
}

/**
 * Estimate how many more messages can be added before hitting a context %.
 * E.g. warnAtPercent=0.8 means warn when 80% of context is used.
 */
export function contextWarnPercent(
  messages: Array<{ role: string; content: string | null; [key: string]: unknown }>,
  contextWindow: number,
  warnAtPercent = 0.8,
): boolean {
  const used = estimateMessagesTokensRough(messages);
  return used / contextWindow >= warnAtPercent;
}
