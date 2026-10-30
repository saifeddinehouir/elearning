import { h, openOverlay, toast, ICONS } from "../dom.js";
import { getPlan, installCompanyTrack, listRoadmaps, ProRequiredError } from "../store.js";
import { hasFeature } from "../plan.js";
import { COMPANIES, companyByKey, companyRoadmapKey, trackStages, trackSummary } from "../companies.js";
import { openPaywall, proBadge } from "./paywall.js";
import { openInterviewSheet } from "./interview.js";

const FEATURE = "company-prep";
const available = () => hasFeature(getPlan(), FEATURE);

// Roadmaps-tab card: one row per company, tapping one opens its profile.
// Companies whose track is already installed say so.
export function companyPromoCard(roadmaps) {
  const installed = new Set(roadmaps.map((r) => r.builtin));
  return h(
    "div",
    { class: "card promo" },
    h("div", { class: "kicker" }, "Company interview prep", available() ? null : proBadge()),
    h("div", { class: "promo-title" }, "Prep for a specific company"),
    h("p", { class: "small muted", style: "margin:4px 0 12px" }, "How each company interviews, round by round, and a track of the patterns and decks it asks about most."),
    h(
      "div",
      { class: "list" },
      ...COMPANIES.map((c) =>
        h(
          "button",
          { class: "list-row tappable", style: "width:100%;text-align:left", onclick: () => openCompanySheet(c.key) },
          h("span", { class: "label" }, c.name, h("span", { class: "sub" }, trackSummary(c))),
          installed.has(companyRoadmapKey(c)) ? h("span", { class: "value" }, "Added") : null,
          h("span", { class: "chevron", html: ICONS.chevron })
        )
      )
    )
  );
}

// One company's profile: its rounds, tips and track, with a button to start
// (or open) the track. On Free the profile is readable and the button upsells.
export function openCompanySheet(key, { onOpenRoadmap } = {}) {
  const company = companyByKey.get(key);
  if (!company) return;
  openOverlay((close) => {
    const overlay = h("div", { class: "overlay" });
    const head = h("div", { class: "o-head" });
    const body = h("div", { class: "o-body" });
    overlay.append(head, body);
    head.append(h("button", { class: "btn", onclick: close }, "Back"), h("strong", {}, `${company.name} interviews`), h("div", { class: "spacer" }));

    body.appendChild(
      h(
        "div",
        { class: "card" },
        h("div", { class: "kicker" }, "Company interview prep", available() ? null : proBadge()),
        h("div", { class: "promo-title" }, company.name),
        h("p", { class: "small muted", style: "margin:4px 0 0" }, company.blurb)
      )
    );

    body.appendChild(h("div", { class: "section-header" }, "The usual loop"));
    body.appendChild(
      h(
        "div",
        { class: "list" },
        ...company.rounds.map((r, i) =>
          h("div", { class: "list-row" }, h("span", { class: "cheat-num" }, String(i + 1).padStart(2, "0")), h("span", { class: "label" }, r.name, h("span", { class: "sub" }, r.what)))
        )
      )
    );
    body.appendChild(h("p", { class: "list-footnote" }, "Loops vary by team, level and year. Your recruiter can tell you exactly which rounds you'll have."));

    body.appendChild(h("div", { class: "section-header" }, "Tips"));
    body.appendChild(h("div", { class: "list" }, ...company.tips.map((t) => h("div", { class: "list-row" }, h("span", { class: "label" }, t)))));

    const stages = trackStages(company);
    body.appendChild(h("div", { class: "section-header" }, `The track · ${trackSummary(company)}`));
    body.appendChild(
      h(
        "div",
        { class: "list" },
        ...stages.map((s) =>
          h("div", { class: "list-row" }, h("span", { class: "label" }, s.title, h("span", { class: "sub" }, s.why)))
        )
      )
    );

    const actions = h("div", {});
    body.appendChild(actions);
    paintActions();

    async function paintActions() {
      const roadmap = (await listRoadmaps()).find((r) => r.builtin === companyRoadmapKey(company));
      actions.replaceChildren();
      if (!available() && !roadmap) {
        actions.appendChild(h("button", { class: "btn primary block mt", onclick: () => openPaywall(`${company.name} interview prep`) }, "Unlock with Pro"));
        return;
      }
      if (roadmap) {
        actions.appendChild(
          h("button", { class: "btn primary block mt", onclick: () => { close(); openRoadmap(roadmap.id); } }, h("span", { html: ICONS.map }), `Open the ${company.name} track`)
        );
      } else {
        const start = h("button", { class: "btn primary block mt" }, `Start the ${company.name} track`);
        start.onclick = async () => {
          start.disabled = true;
          start.textContent = "Adding decks…";
          try {
            const rm = await installCompanyTrack(company.key);
            toast(`${company.name} track ready: ${rm.nodes.length} decks in your daily mix`);
            await paintActions();
          } catch (err) {
            if (err instanceof ProRequiredError) return openPaywall(err.message);
            console.error(err);
            toast("Couldn't add the track. Check your connection and try again.");
            start.disabled = false;
            start.textContent = `Start the ${company.name} track`;
          }
        };
        actions.appendChild(start);
      }
      if (roadmap) {
        actions.appendChild(
          h(
            "button",
            {
              class: "btn block mt",
              onclick: () => {
                close();
                openInterviewSheet({ deckIds: roadmap.nodes.map((n) => n.deckId).filter(Boolean) });
              },
            },
            h("span", { html: ICONS.target }),
            "Set the interview date"
          )
        );
        actions.appendChild(h("p", { class: "list-footnote" }, "Interview date mode will pace this track's decks so everything is covered by the day."));
      }
    }

    // roadmaps.js imports this module, so it's reached lazily to avoid a cycle.
    async function openRoadmap(id) {
      if (onOpenRoadmap) return onOpenRoadmap(id);
      const { openRoadmapDetail } = await import("./roadmaps.js");
      openRoadmapDetail(id);
    }
    return overlay;
  });
}
