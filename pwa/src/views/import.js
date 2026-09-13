import { h, clear, openOverlay, toast } from "../dom.js";
import { parseDeck, validateDeck, validateRoadmap, detectKind } from "../schema.js";
import { importDeck, importRoadmap, findDeckByName } from "../store.js";
import { PROMPT_TEMPLATE, ROADMAP_PROMPT_TEMPLATE, copyText } from "../prompt-template.js";

export function openImport(prefill = "") {
  openOverlay((close) => {
    const overlay = h("div", { class: "overlay" });
    const head = h("div", { class: "o-head" });
    const body = h("div", { class: "o-body" });
    overlay.append(head, body);

    const importBtn = h(
      "button",
      { class: "btn primary", disabled: true, onclick: () => runImportAll() },
      "Import"
    );

    head.append(
      h("button", { class: "btn", onclick: close }, "Close"),
      h("strong", {}, "Import"),
      h("div", { class: "spacer" }),
      importBtn
    );

    // Each candidate: { id, label, kind, parseError, validation, resolution, clashName }
    // "id" is "paste" for the textarea, or the filename for a picked file.
    // "kind" is "deck" or "roadmap", detected from the JSON shape.
    const candidates = new Map();
    let pasteText = prefill;

    const ta = h("textarea", {
      placeholder: 'A deck: { "deck_name": "...", "source_type": "course", "items": [ ... ] }\nOr a roadmap: { "roadmap_name": "...", "nodes": [ ... ] }',
      value: prefill,
      oninput: (e) => {
        pasteText = e.target.value;
        validatePasteBtn.disabled = !pasteText.trim();
      },
    });

    const validatePasteBtn = h(
      "button",
      {
        class: "btn primary",
        disabled: !pasteText.trim(),
        onclick: () => addCandidate("paste", "Pasted JSON", pasteText),
      },
      "Validate"
    );

    const fileInput = h("input", {
      type: "file",
      accept: ".json,application/json",
      multiple: true,
      style: "display:none",
      onchange: async (e) => {
        const files = Array.from(e.target.files || []);
        for (const file of files) {
          const text = await file.text();
          await addCandidate(file.name, file.name, text);
        }
        e.target.value = ""; // lets picking the exact same file(s) again work
      },
    });

    const summaryBar = h("div", { class: "row", style: "gap:10px;margin:12px 0;flex-wrap:wrap" });
    const resultsList = h("div", {});

    async function addCandidate(id, label, text) {
      const parsed = parseDeck(text);
      const existing = candidates.get(id);
      let validation = null;
      let clashName = null;
      let kind = "deck";
      if (parsed.ok) {
        kind = detectKind(parsed.dto);
        if (kind === "roadmap") {
          validation = { ...validateRoadmap(parsed.dto), dto: parsed.dto };
        } else {
          validation = { ...validateDeck(parsed.dto), dto: parsed.dto };
          const clash = await findDeckByName(parsed.dto.deck_name);
          clashName = clash ? clash.name : null;
        }
      }
      candidates.set(id, {
        id,
        label,
        kind,
        parseError: parsed.ok ? null : parsed.error,
        validation,
        resolution: existing?.resolution || "copy",
        clashName,
      });
      paint();
    }

    function removeCandidate(id) {
      candidates.delete(id);
      paint();
    }

    async function runImportAll() {
      const importable = [...candidates.values()].filter((c) => c.validation?.importable);
      if (importable.length === 0) return;

      const replacing = importable.filter((c) => c.resolution === "replace" && c.clashName);
      if (replacing.length > 0) {
        const names = replacing.map((c) => `"${c.clashName}"`).join(", ");
        const ok = confirm(
          `Replace ${names}? This permanently deletes ${replacing.length === 1 ? "its" : "their"} current items, questions, review schedule and answer history. This can't be undone.`
        );
        if (!ok) return;
      }

      let imported = 0;
      for (const c of importable) {
        try {
          if (c.kind === "roadmap") await importRoadmap(c.validation.dto);
          else await importDeck(c.validation.dto, c.resolution);
          imported += 1;
        } catch (err) {
          console.error("Import failed for", c.label, err);
        }
      }
      const skipped = candidates.size - imported;
      toast(
        `Imported ${imported} item${imported === 1 ? "" : "s"}` +
          (skipped > 0 ? ` — ${skipped} skipped (fix errors first)` : "")
      );
      close();
    }

    function paint() {
      clear(summaryBar);
      clear(resultsList);

      const list = [...candidates.values()];
      const validCount = list.filter((c) => c.validation?.importable).length;

      importBtn.disabled = validCount === 0;
      importBtn.textContent = validCount > 0 ? `Import (${validCount})` : "Import";

      summaryBar.appendChild(
        h(
          "button",
          { class: "btn block", onclick: () => fileInput.click() },
          list.length ? "Add more .json files" : "Choose .json file(s)"
        )
      );

      for (const c of list) resultsList.appendChild(candidateCard(c));
    }

    function candidateCard(c) {
      const card = h("div", { class: "card tight" });
      card.appendChild(
        h(
          "div",
          { class: "row between" },
          h("strong", { class: "small" }, c.label),
          h(
            "button",
            { class: "btn", style: "padding:2px 9px", onclick: () => removeCandidate(c.id) },
            "✕"
          )
        )
      );

      if (c.parseError) {
        card.appendChild(h("div", { class: "issue error", style: "margin-top:6px" }, c.parseError));
        return card;
      }

      const v = c.validation;
      card.appendChild(
        h(
          "div",
          { class: "row small muted", style: "margin-top:6px;flex-wrap:wrap;gap:10px" },
          h("span", { class: "badge accent" }, c.kind === "roadmap" ? "Roadmap" : "Deck"),
          c.kind === "roadmap"
            ? h("span", {}, v.dto.roadmap_name)
            : h("span", {}, v.dto.deck_name),
          c.kind === "roadmap"
            ? h("span", {}, `${v.nodeCount} stages`)
            : h("span", {}, `${v.itemCount} items`),
          c.kind !== "roadmap" ? h("span", {}, `${v.questionCount} questions`) : null
        )
      );

      if (v.errors.length > 0) {
        const box = h(
          "div",
          { class: "issue error", style: "margin-top:6px" },
          `${v.errors.length} error${v.errors.length === 1 ? "" : "s"} — this one won't be imported`
        );
        card.appendChild(box);
        for (const e of v.errors) {
          card.appendChild(
            h("div", { class: "small muted", style: "margin-top:2px" }, `${e.path}: ${e.message}`)
          );
        }
      } else if (v.warnings.length > 0) {
        card.appendChild(
          h(
            "div",
            { class: "issue warning", style: "margin-top:6px" },
            `${v.warnings.length} warning${v.warnings.length === 1 ? "" : "s"}`
          )
        );
      } else {
        card.appendChild(
          h("div", { class: "small", style: "color:var(--green);margin-top:6px" }, "Looks good")
        );
      }

      if (c.clashName && v.importable) {
        const pick = h("div", { style: "margin-top:10px" });
        pick.appendChild(
          h("div", { class: "small", style: "color:var(--orange)" }, `⚠️ "${c.clashName}" already exists`)
        );
        for (const [val, label] of [
          ["copy", "Import as a copy (recommended)"],
          ["replace", "Replace existing deck"],
        ]) {
          pick.appendChild(
            h(
              "label",
              { class: "row", style: "gap:6px;margin-top:6px" },
              h("input", {
                type: "radio",
                name: `res-${c.id}`,
                checked: c.resolution === val,
                onchange: () => {
                  c.resolution = val;
                  paint();
                },
                style: "width:auto",
              }),
              h("span", { class: "small" }, label)
            )
          );
        }
        card.appendChild(pick);
      }

      return card;
    }

    body.append(
      promptDetails("🤖 No content yet? Copy the deck generator prompt for ChatGPT / Claude", PROMPT_TEMPLATE),
      promptDetails("🗺️ Planning a curriculum? Copy the roadmap generator prompt instead", ROADMAP_PROMPT_TEMPLATE),
      h("label", { class: "field" }, h("span", {}, "Paste JSON (a deck or a roadmap)"), ta),
      h("div", { class: "row", style: "margin:8px 0" }, validatePasteBtn),
      fileInput,
      h("p", { class: "small muted" }, "Or pick several .json files at once below — each is validated independently, you can drop any before importing, and \"Import\" (top right) imports everything valid in one tap."),
      summaryBar,
      resultsList
    );

    if (prefill.trim()) addCandidate("paste", "Pasted JSON", prefill);
    else paint();

    return overlay;
  });
}

function promptDetails(summaryText, template) {
  const det = h("details", { class: "q-context" });
  const promptText = h("textarea", {
    readOnly: true,
    value: template,
    style: "min-height:220px;margin-top:10px",
    onclick: (e) => e.target.select(),
  });
  const copyBtn = h(
    "button",
    {
      class: "btn primary",
      onclick: async () => {
        const ok = await copyText(template);
        if (ok) {
          toast("Prompt copied — paste it into ChatGPT or Claude");
        } else {
          promptText.focus();
          promptText.select();
          toast("Couldn't auto-copy — text is selected, press Ctrl/Cmd+C");
        }
      },
    },
    "Copy prompt"
  );

  det.append(
    h("summary", {}, h("span", {}, summaryText)),
    h("div", { class: "body" }, [
      h(
        "p",
        { class: "small muted", style: "margin-bottom:10px" },
        "Copy this, paste it into ChatGPT or Claude, fill in the blanks, and paste the JSON it returns back here."
      ),
      copyBtn,
      promptText,
    ])
  );
  return det;
}
