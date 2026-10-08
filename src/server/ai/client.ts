import Anthropic from "@anthropic-ai/sdk";

/**
 * One shared Claude client for the whole server. The API key is read from the
 * environment on the server only — it is never sent to browsers.
 *
 * Returns null when no key is configured, so callers can fall back gracefully.
 */
let client: Anthropic | null | undefined;

export function getClaude(): Anthropic | null {
  if (client === undefined) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    client = apiKey
      ? new Anthropic({
          apiKey,
          // ANTHROPIC_BASE_URL lets tests point at a local mock server.
          baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
          timeout: 15_000,
          maxRetries: 1,
        })
      : null;
  }
  return client;
}

/** Small, fast model by default — parsing a sentence doesn't need a big one. */
export const PREFERENCE_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
