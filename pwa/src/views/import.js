import { h, clear, openOverlay, toast } from "../dom.js";
import { parseDeck, validateDeck } from "../schema.js";
import { importDeck, findDeckByName } from "../store.js";
import { PROMPT_TEMPLATE, copyText } from "../prompt-template.js";

export function openImport(prefill = "") {
  openOverlay((close) => {
    const overlay = h("div", { class: "overlay" });
    const head = h("div", { class: "o-head" });
    const body = h("div", { class: "o-body" });
    overlay.append(head, body);

    head.append(
      h("button", { class: "btn", onclick: close }, "Close"),
      h("strong", {}, "Import deck"),
      h("div", { class: "spacer" })
    );

    let text = prefill;
    let validation = null;
    // Default to the non-destructive choice: a name clash should never silently
    // delete an existing deck's history unless the user deliberately picks that.
    let resolution = "copy";

    const ta = h("textarea", {
      placeholder: '{ "deck_name": "...", "source_type": "course", "items": [ ... ] }',
      value: prefill,
      oninput: (e) => {
        text = e.target.value;
        validation = null;
        paint();
      },
    });

    const fileInput = h("input", {
      type: "file",
      accept: ".json,application/json",
      style: "display:none",
      onchange: async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        text = await file.text();
        ta.value = text;
        validation = null;
        runValidate();
      },
    });

    const result = h("div", {});

    function runValidate() {
      const parsed = parseDeck(text);
      if (!parsed.ok) {
        validation = { parseError: parsed.error };
      } else {
        validation = { ...validateDeck(parsed.dto), dto: parsed.dto };
      }
      paint();
    }

    async function runImport() {
      if (!validation || !validation.importable) return;
      if (resolution === "replace") {
        const ok = confirm(
          `Replace "${validation.dto.deck_name}"? This permanently deletes its current items, questions, review schedule and answer history. This can't be undone.`
        );
        if (!ok) return;
      }
      const r = await importDeck(validation.dto, resolution);
      toast(`Imported ${r.deck.name} — ${r.itemCount} items, ${r.questionCount} questions`);
      close();
    }

    async function paint() {
      clear(result);

      const actions = h("div", { class: "row", style: "gap:10px;margin:12px 0" });
      actions.appendChild(h("button", { class: "btn", onclick: () => fileInput.click() }, "Choose .json file"));
      if (!validation) {
        actions.appendChild(
          h("button", { class: "btn primary", disabled: !text.trim(), onclick: runValidate }, "Validate")
        );
      } else if (validation.importable) {
        actions.appendChild(h("button", { class: "btn primary", onclick: runImport }, "Import"));
      }
      result.appendChild(actions);

      if (validation?.parseError) {
        result.appendChild(h("div", { class: "issue error" }, validation.parseError));
        return;
      }
      if (!validation) return;

      const v = validation;
      result.appendChild(
        h(
          "div",
          { class: "card tight" },
          row("Name", v.dto.deck_name),
          row("Source", v.dto.source_type),
          row("Items", String(v.itemCount)),
          row("Questions", String(v.questionCount)),
          row("Topics", v.topics.join(", "))
        )
      );

      if (v.errors.length) {
        result.appendChild(section("Errors — fix before importing", v.errors, "error"));
      }
      if (v.warnings.length) {
        result.appendChild(section("Warnings", v.warnings, "warning"));
      }
      if (v.importable && !v.warnings.length) {
        result.appendChild(h("div", { class: "issue", style: "color:var(--green)" }, "Schema looks good."));
      }

      const clash = await findDeckByName(v.dto.deck_name);
      if (clash && v.importable) {
        const pick = h("div", { class: "card tight" });
        pick.appendChild(
          h(
            "div",
            { class: "small", style: "color:var(--orange)" },
            `⚠️ A deck named "${v.dto.deck_name}" already exists.`
          )
        );
        for (const [val, label, hint] of [
          ["copy", "Import as a copy (recommended)", "Keeps both — the new one is renamed automatically."],
          ["replace", "Replace existing deck", "Deletes its items, questions, review schedule and history."],
        ]) {
          const id = `res-${val}`;
          pick.appendChild(
            h(
              "label",
              { class: "row", style: "gap:8px;margin-top:8px;align-items:flex-start" },
              h("input", {
                type: "radio",
                name: "resolution",
                id,
                checked: resolution === val,
                onchange: () => {
                  resolution = val;
                  paint();
                },
                style: "width:auto;margin-top:3px",
              }),
              h(
                "span",
                {},
                h("div", {}, label),
                h("div", { class: "small muted" }, hint)
              )
            )
          );
        }
        result.appendChild(pick);
      }
    }

    body.append(
      promptTemplateSection(),
      h("label", { class: "field" }, h("span", {}, "Paste JSON"), ta),
      fileInput,
      result
    );

    if (prefill.trim()) runValidate();
    else paint();

    return overlay;
  });
}

function promptTemplateSection() {
  const det = h("details", { class: "q-context" });
  const copyBtn = h(
    "button",
    {
      class: "btn primary",
      onclick: async () => {
        const ok = await copyText(PROMPT_TEMPLATE);
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
  const promptText = h("textarea", {
    readOnly: true,
    value: PROMPT_TEMPLATE,
    style: "min-height:220px;margin-top:10px",
    onclick: (e) => e.target.select(),
  });

  det.append(
    h(
      "summary",
      {},
      h("span", {}, "🤖 No content yet? Copy the generator prompt for ChatGPT / Claude"),
    ),
    h("div", { class: "body" }, [
      h(
        "p",
        { class: "small muted", style: "margin-bottom:10px" },
        "Copy this, paste it into ChatGPT or Claude, add your course excerpt or LeetCode problem below it, and paste the JSON it returns back here."
      ),
      copyBtn,
      promptText,
    ])
  );
  return det;
}

function row(k, v) {
  return h("div", { class: "row between small", style: "padding:3px 0" }, h("span", { class: "muted" }, k), h("span", {}, v || "—"));
}
function section(title, issues, cls) {
  const box = h("div", { class: "card tight" }, h("div", { class: "section-title" }, title));
  for (const it of issues) {
    box.appendChild(
      h("div", { class: `issue ${cls}` }, h("div", {}, h("div", {}, it.message), h("div", { class: "path" }, it.path)))
    );
  }
  return box;
}
