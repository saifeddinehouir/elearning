import { h, openOverlay, toast } from "../dom.js";
import { getPlan } from "../store.js";
import { hasFeature } from "../plan.js";
import { accountsConfigured, currentUser, signIn, deckFromVideo } from "../account.js";
import { openPaywall } from "./paywall.js";
import { openImport } from "./import.js";

// YouTube link (+ optional pasted transcript) → a deck from the server, then
// the normal Import screen to review and import it.
export function openVideoImport() {
  if (!accountsConfigured()) return toast("Video import isn't set up on this server yet", 3000);
  if (!hasFeature(getPlan(), "ai-decks")) return openPaywall("Making decks from videos");

  openOverlay((close) => {
    const overlay = h("div", { class: "overlay" });
    const head = h("div", { class: "o-head" });
    const body = h("div", { class: "o-body" });
    overlay.append(head, body);
    head.append(h("button", { class: "btn", onclick: close }, "Cancel"), h("strong", {}, "From a YouTube video"), h("div", { class: "spacer" }));

    const url = h("input", { type: "url", placeholder: "https://www.youtube.com/watch?v=…", autocomplete: "off" });
    const name = h("input", { type: "text", placeholder: "Optional: picked from the video if empty" });
    const transcript = h("textarea", { placeholder: "Paste the transcript here", style: "min-height:160px" });
    const transcriptBox = h(
      "details",
      { class: "q-context" },
      h("summary", {}, "Transcript"),
      h(
        "p",
        { class: "small muted", style: "margin:8px 0" },
        "On YouTube, open the video's description and tap Show transcript, then select all of it and copy. Pasting it gives the best deck and works for any video with captions."
      ),
      transcript
    );

    const status = h("p", { class: "small", style: "margin:10px 0 0;min-height:1.2em" });
    const go = h("button", { class: "btn primary block mt", onclick: () => run() });
    const paintButton = () => (go.textContent = currentUser() ? "Build the deck" : "Sign in to continue");
    paintButton();

    body.append(
      h("label", { class: "field" }, h("span", {}, "Video link"), url),
      h("label", { class: "field" }, h("span", {}, "Deck name"), name),
      transcriptBox,
      go,
      status,
      h("p", { class: "list-footnote" }, "The deck is built by Claude from what the video teaches. You'll review it before anything is imported.")
    );

    const say = (text, bad = false) => {
      status.textContent = text;
      status.style.color = bad ? "var(--bad)" : "";
    };

    async function run() {
      if (!currentUser()) {
        try {
          await signIn();
        } catch (err) {
          console.error(err);
          say("Couldn't sign in. Try again.", true);
        }
        paintButton();
        return;
      }
      if (!url.value.trim()) return say("Paste the video's link first.", true);
      go.disabled = true;
      say("Building the deck. This can take a minute or two…");
      try {
        const res = await deckFromVideo({ url: url.value.trim(), transcript: transcript.value, deckName: name.value });
        const n = res.deck.items.reduce((s, it) => s + it.questions.length, 0);
        close();
        openImport(JSON.stringify(res.deck), { label: `From YouTube · ${n} questions` });
        toast(`${res.videosThisMonth} of ${res.videoLimit} video decks used this month`, 3000);
      } catch (err) {
        go.disabled = false;
        if (err.code === "pro_required") {
          close();
          return openPaywall("Making decks from videos");
        }
        if (err.code === "no_transcript" || err.code === "transcript_too_short") {
          transcriptBox.open = true;
          transcript.focus();
        }
        say(err.message || "Something went wrong. Try again.", true);
      }
    }

    setTimeout(() => url.focus(), 50);
    return overlay;
  });
}
