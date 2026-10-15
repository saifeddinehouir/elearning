// POST /api/youtube-deck  (Pro)
// Body: { url, transcript?, deckName? }  Header: Authorization: Bearer <Firebase ID token>
// → 200 { deck, warnings, videosThisMonth, videoLimit }
//
// With a pasted transcript, Claude builds the deck from it. Without one, the
// server asks Claude to fetch the transcript through the MCP server in
// TRANSCRIPT_MCP_URL; if none is configured the app is told to ask for a paste.

import { route, json, bearerToken, readJson, HttpError } from "./_lib/http.js";
import { realDeps } from "./_lib/services.js";
import { isProEntitled, videosUsed, monthKey, MONTHLY_VIDEO_LIMIT } from "./_lib/entitlement.js";
import { parseVideoId, buildRequest, transcriptProblem, readDeckReply } from "./_lib/youtube.js";

export const config = { maxDuration: 300 };

const FAILURES = {
  transcript_too_short: [422, "That transcript is too short to build a deck from."],
  transcript_too_long: [413, "That transcript is too long (over about 3 hours). Split it and make two decks."],
  no_transcript: [422, "Couldn't get this video's transcript. Paste it instead: on YouTube, open the description and tap Show transcript."],
  not_educational: [422, "This video doesn't seem to teach anything that could become a study deck."],
  refused: [422, "This video's content can't be turned into a deck."],
  too_long: [422, "This video produced more than fits in one deck. Paste part of the transcript instead."],
  bad_output: [502, "The generated deck didn't come out right. Try again."],
};
const fail = (code) => {
  const [status, message] = FAILURES[code];
  return new HttpError(status, code, message);
};

export function createHandler(deps) {
  return route(["POST"], async (request) => {
    const { uid } = await deps.verifyIdToken(bearerToken(request));
    const body = await readJson(request);

    const videoId = parseVideoId(body.url);
    if (!videoId) throw new HttpError(400, "bad_url", "That doesn't look like a YouTube video link.");

    const now = deps.now();
    const user = await deps.getUser(uid);
    if (!isProEntitled(user, now)) throw new HttpError(402, "pro_required", "Making decks from videos is part of Pro.");
    if (videosUsed(user, now) >= MONTHLY_VIDEO_LIMIT) {
      throw new HttpError(429, "monthly_limit", `You've made ${MONTHLY_VIDEO_LIMIT} decks from videos this month. The count resets on the 1st.`);
    }

    const transcript = String(body.transcript || "").trim();
    const mcpUrl = deps.env.TRANSCRIPT_MCP_URL;
    if (transcript) {
      const problem = transcriptProblem(transcript);
      if (problem) throw fail(problem);
    } else if (!mcpUrl) {
      throw fail("no_transcript");
    }

    const params = buildRequest({
      videoId,
      deckName: String(body.deckName || ""),
      transcript,
      mcp: transcript ? null : { url: mcpUrl, token: deps.env.TRANSCRIPT_MCP_TOKEN || null },
      effort: deps.env.DECK_EFFORT || "high",
    });
    const result = readDeckReply(await deps.createMessage(params));
    if (!result.ok) throw fail(result.code);

    // Only a deck that came out counts toward the monthly allowance.
    await deps.addVideoUse(uid, monthKey(now));
    return json(200, {
      deck: result.deck,
      warnings: result.warnings,
      videosThisMonth: videosUsed(user, now) + 1,
      videoLimit: MONTHLY_VIDEO_LIMIT,
    });
  });
}

let handler = null;
export default {
  fetch(request) {
    handler ??= createHandler(realDeps());
    return handler(request);
  },
};
