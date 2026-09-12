import { h, clear, openOverlay, toast } from "../dom.js";
import { parseDeck, validateDeck } from "../schema.js";
import { importDeck, findDeckByName } from "../store.js";

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
    let resolution = "replace";

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
        pick.appendChild(h("div", { class: "small muted" }, `A deck named "${v.dto.deck_name}" already exists:`));
        for (const [val, label] of [
          ["replace", "Replace existing deck"],
          ["copy", "Import as a copy"],
        ]) {
          const id = `res-${val}`;
          pick.appendChild(
            h(
              "label",
              { class: "row", style: "gap:8px;margin-top:6px" },
              h("input", {
                type: "radio",
                name: "resolution",
                id,
                checked: resolution === val,
                onchange: () => (resolution = val),
                style: "width:auto",
              }),
              h("span", {}, label)
            )
          );
        }
        result.appendChild(pick);
      }
    }

    body.append(
      h("label", { class: "field" }, h("span", {}, "Paste JSON"), ta),
      fileInput,
      result
    );

    if (prefill.trim()) runValidate();
    else paint();

    return overlay;
  });
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
