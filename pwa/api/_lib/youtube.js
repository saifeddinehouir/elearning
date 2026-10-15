// YouTube video → study deck. Pure: builds the Claude request and reads the
// reply; the handler in ../youtube-deck.js does the I/O. Files under api/_lib
// are not deployed as endpoints (Vercel skips names starting with "_").
//
// Two ways to get the video's words in:
//   - pasted: the user copies YouTube's "Show transcript" text into the app.
//   - mcp: Claude fetches the transcript itself through a remote MCP server
//     (TRANSCRIPT_MCP_URL) via the Messages API MCP connector.

import { QUESTION_KINDS, DIFFICULTIES, SOURCE_TYPES, validateDeck } from "../../src/schema.js";

export const MODEL = "claude-opus-5-5";
// Pasted transcripts longer than this are refused rather than cut: a deck
// built from half a lecture would look complete and silently miss the rest.
// ~200k characters is roughly a 3–4 hour talk.
export const MAX_TRANSCRIPT_CHARS = 200_000;
export const MIN_TRANSCRIPT_CHARS = 200;

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

// The 11-character video id from any common YouTube URL shape, or null.
export function parseVideoId(input) {
  const raw = String(input || "").trim();
  if (ID_RE.test(raw)) return raw;
  let url;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "");
  let id = null;
  if (host === "youtu.be") id = url.pathname.split("/")[1];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const m = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
      id = m ? m[1] : null;
    }
  }
  return id && ID_RE.test(id) ? id : null;
}

export const watchUrl = (videoId) => `https://www.youtube.com/watch?v=${videoId}`;

// The reply format, enforced by structured outputs. `status` lets Claude say
// it couldn't get a transcript instead of inventing a deck.
export const DECK_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "deck_name", "source_type", "items"],
  properties: {
    status: { type: "string", enum: ["ok", "no_transcript", "not_educational"] },
    deck_name: { type: "string" },
    source_type: { type: "string", enum: SOURCE_TYPES },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "topic", "difficulty", "context", "questions"],
        properties: {
          title: { type: "string" },
          topic: { type: "string" },
          difficulty: { type: "string", enum: DIFFICULTIES },
          context: { type: "string" },
          questions: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["type", "prompt", "choices", "correct_index", "explanation"],
              properties: {
                type: { type: "string", enum: QUESTION_KINDS },
                prompt: { type: "string" },
                choices: { type: "array", items: { type: "string" } },
                correct_index: { type: "integer" },
                explanation: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
};

export const SYSTEM_PROMPT = `You turn educational videos into study decks for a spaced-repetition quiz app. The person studying will answer these questions over weeks, mostly to prepare for exams and job interviews, so each question should test something worth remembering from the video, not trivia about the video itself (who is speaking, jokes, sponsor segments, "what did the presenter say first").

Build the deck from what the transcript actually teaches. Don't add facts the video doesn't support; if the speaker makes a mistake, keep the question to what is correct and say so in the explanation.

Structure:
- One item per concept or section the video covers, in the order it covers them. A short video may give 3 items, a long lecture 15 or more; cover the whole video.
- context: 2–4 sentences restating what the video says about that concept, so the item stands on its own when reviewed later.
- topic: a short reusable label ("Binary Search", "TCP handshake", "Normalization") so weak areas group across items.
- difficulty reflects the item, not the question.
- 2–4 questions per item, each with exactly 4 plausible choices and one correct answer; correct_index is 0-based. Vary which position is correct.
- type: mcq for recall, approach for which technique fits a situation, complexity for time/space cost, trace for predicting output or state after steps, fill_blank for completing a definition or line.
- explanation: 1–3 sentences that teach why the answer is right, not a restatement of it.
- Wrong choices should be mistakes a learner would plausibly make, not obviously silly.
- Write in the language the video is in.
- source_type is "leetcode" when the video works through coding-interview or algorithm problems, otherwise "course".

Set status to "no_transcript" (with an empty items list) if you have no transcript to work from, and "not_educational" (with an empty items list) if the video teaches nothing that could be studied, such as music or a vlog. Otherwise status is "ok".`;

function userText({ videoId, deckName, transcript, viaMcp }) {
  const lines = [`Video: ${watchUrl(videoId)}`];
  if (deckName) lines.push(`Deck name: ${deckName}`);
  else lines.push("Deck name: choose a short, specific name from the video's subject.");
  if (viaMcp) {
    lines.push("", "Fetch this video's transcript with the transcript tool, then build the deck from it.");
  } else {
    lines.push("", "Transcript:", "<transcript>", transcript, "</transcript>");
  }
  return lines.join("\n");
}

// The Messages API request. `mcp` is { url, token } to let Claude fetch the
// transcript itself; omit it when a transcript was pasted.
export function buildRequest({ videoId, deckName = "", transcript = "", mcp = null, effort = "high" }) {
  const viaMcp = !transcript && !!mcp;
  const betas = ["server-side-fallback-2026-07-01"];
  const req = {
    model: MODEL,
    max_tokens: 64000,
    betas,
    // On a policy decline, the API re-runs the request on Anthropic's
    // recommended fallback model instead of returning the refusal.
    fallbacks: "default",
    output_config: { effort, format: { type: "json_schema", schema: DECK_OUTPUT_SCHEMA } },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userText({ videoId, deckName: deckName.trim(), transcript, viaMcp }) }],
  };
  if (viaMcp) {
    betas.push("mcp-client-2025-11-20");
    req.mcp_servers = [{ type: "url", url: mcp.url, name: "transcripts", ...(mcp.token ? { authorization_token: mcp.token } : {}) }];
    req.tools = [{ type: "mcp_toolset", mcp_server_name: "transcripts" }];
  }
  return req;
}

// Checks a pasted transcript before spending a request on it. Returns an
// error code or null.
export function transcriptProblem(transcript) {
  const t = String(transcript || "").trim();
  if (t.length < MIN_TRANSCRIPT_CHARS) return "transcript_too_short";
  if (t.length > MAX_TRANSCRIPT_CHARS) return "transcript_too_long";
  return null;
}

// Reads Claude's reply into { ok: true, deck, warnings } or { ok: false, code }.
// The deck goes through the app's own validator, so whatever reaches the
// Import screen is something the app accepts.
export function readDeckReply(message) {
  if (message.stop_reason === "refusal") return { ok: false, code: "refused" };
  if (message.stop_reason === "max_tokens") return { ok: false, code: "too_long" };
  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  let out;
  try {
    out = JSON.parse(text);
  } catch {
    return { ok: false, code: "bad_output" };
  }
  if (out.status === "no_transcript") return { ok: false, code: "no_transcript" };
  if (out.status === "not_educational") return { ok: false, code: "not_educational" };
  const { status, ...deck } = out;
  void status;
  const v = validateDeck(deck);
  if (v.errors.length > 0 || v.questionCount === 0) return { ok: false, code: "bad_output" };
  return { ok: true, deck, warnings: v.warnings.length };
}
