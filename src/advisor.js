// Talks to the Claude API. Both the website and the Telegram bot go through here,
// so the instructions and knowledge base live in one place.
import Anthropic from "@anthropic-ai/sdk";
import { RULES } from "./knowledge.js";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const EFFORT = process.env.ANTHROPIC_EFFORT || "medium";
const MAX_TURNS = 12;

// The system prompt is identical on every request, so it is cached:
// after the first call the ~55 KB knowledge base costs about a tenth of the normal price.
const SYSTEM = [{ type: "text", text: RULES, cache_control: { type: "ephemeral" } }];

/** Keep only well-formed recent turns that start with the teacher. */
export function cleanHistory(messages) {
  const out = (Array.isArray(messages) ? messages : [])
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.slice(0, 8000) }))
    .slice(-MAX_TURNS);
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

/**
 * Streams the advisor's answer.
 * @param {Anthropic.MessageParam[]} messages conversation, ending on the teacher's message
 * @param {(delta: string) => void} onText called with each new piece of text
 * @param {AbortSignal} [signal]
 * @returns {Promise<string>} the whole answer
 */
export async function advise(messages, onText = () => {}, signal) {
  const stream = client.beta.messages.stream(
    {
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { effort: EFFORT },
      // If a safety classifier declines, the API retries on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages,
    },
    { signal },
  );
  stream.on("text", delta => onText(delta));
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") {
    const err = new Error("refused");
    err.code = "refused";
    throw err;
  }
  return final.content.filter(b => b.type === "text").map(b => b.text).join("");
}

/** Maps SDK errors to the short codes the website and bot show messages for. */
export function errorCode(e) {
  if (e?.code === "refused") return "refused";
  if (e instanceof Anthropic.RateLimitError) return "rate_limited";
  if (e instanceof Anthropic.AuthenticationError) return "server_misconfigured";
  if (e instanceof Anthropic.BadRequestError) return "bad_request";
  if (e instanceof Anthropic.APIUserAbortError) return "cancelled";
  return "upstream_error";
}
