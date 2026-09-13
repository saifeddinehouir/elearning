import { h, openOverlay, toast, ICONS } from "../dom.js";
import { getSettings, setSettings } from "../store.js";
import { permission, requestPermission, notificationsSupported } from "../notifications.js";

export function openSettings() {
  openOverlay((close) => {
    const s = getSettings();
    const overlay = h("div", { class: "overlay" });
    const head = h("div", { class: "o-head" });
    const body = h("div", { class: "o-body" });
    overlay.append(head, body);
    head.append(h("button", { class: "btn", onclick: close }, "Done"), h("strong", {}, "Settings"), h("div", { class: "spacer" }));

    // ---------- Appearance ----------
    body.appendChild(h("div", { class: "section-header" }, "Appearance"));
    const appearanceList = h("div", { class: "list" });
    appearanceList.appendChild(row(ICONS.theme, "c-purple", "Theme", []));
    body.appendChild(appearanceList);

    const themeWrap = h("div", { class: "list", style: "padding:12px 16px" });
    const themeControl = h("div", { class: "segmented" });
    const themeButtons = [];
    for (const [val, label] of [
      ["system", "System"],
      ["light", "Light"],
      ["dark", "Dark"],
    ]) {
      const btn = h(
        "button",
        {
          class: (s.theme || "system") === val ? "active" : "",
          onclick: () => {
            setSettings({ theme: val });
            for (const b of themeButtons) b.classList.toggle("active", b.dataset.val === val);
          },
        },
        label
      );
      btn.dataset.val = val;
      themeButtons.push(btn);
      themeControl.appendChild(btn);
    }
    themeWrap.appendChild(themeControl);
    body.appendChild(themeWrap);
    body.appendChild(
      h("p", { class: "list-footnote" }, "System follows your phone's appearance setting.")
    );

    // ---------- Daily session ----------
    body.appendChild(h("div", { class: "section-header" }, "Daily session"));
    const sessionList = h("div", { class: "list" });

    const goalVal = h("strong", {}, String(s.dailyGoal));
    sessionList.appendChild(
      row(ICONS.target, "c-accent", "Daily goal", [
        h(
          "div",
          { class: "stepper" },
          h("button", { onclick: () => bumpGoal(-5) }, "−"),
          goalVal,
          h("button", { onclick: () => bumpGoal(5) }, "+")
        ),
      ])
    );

    let ratioValueEl;
    sessionList.appendChild(
      row(ICONS.sliders, "c-purple", "Max new per session", [
        (ratioValueEl = h("span", { class: "value" }, `${Math.round(s.newLimitRatio * 100)}%`)),
      ])
    );
    body.appendChild(sessionList);

    const ratioSliderWrap = h("div", { class: "list", style: "padding:14px 16px 16px" });
    ratioSliderWrap.appendChild(
      h("input", {
        type: "range",
        min: "20",
        max: "100",
        step: "10",
        value: String(Math.round(s.newLimitRatio * 100)),
        style: "accent-color:var(--accent)",
        oninput: (e) => {
          setSettings({ newLimitRatio: Number(e.target.value) / 100 });
          ratioValueEl.textContent = `${e.target.value}%`;
        },
      })
    );
    body.appendChild(ratioSliderWrap);
    body.appendChild(
      h("p", { class: "list-footnote" }, "Keeps reviews from being crowded out by new questions in a single session.")
    );

    function bumpGoal(delta) {
      const next = Math.max(5, Math.min(50, getSettings().dailyGoal + delta));
      setSettings({ dailyGoal: next });
      goalVal.textContent = String(next);
    }

    // ---------- Reminder ----------
    body.appendChild(h("div", { class: "section-header" }, "Reminder"));
    const reminderList = h("div", { class: "list" });

    const enabledCb = h("input", {
      type: "checkbox",
      checked: s.reminderEnabled,
      onchange: async (e) => {
        setSettings({ reminderEnabled: e.target.checked });
        if (e.target.checked && permission() === "default") await requestPermission();
        paintPermission();
      },
    });
    reminderList.appendChild(
      row(ICONS.bell, "c-orange", "Evening reminder", [
        h("label", { class: "switch", style: "padding:0" }, enabledCb),
      ])
    );

    const timeInput = h("input", {
      type: "time",
      value: `${String(s.reminderHour).padStart(2, "0")}:${String(s.reminderMinute).padStart(2, "0")}`,
      style: "width:auto;background:none;border:none;padding:0;text-align:right;color:var(--accent);font-weight:600",
      onchange: (e) => {
        const [hh, mm] = e.target.value.split(":").map(Number);
        setSettings({ reminderHour: hh || 0, reminderMinute: mm || 0 });
      },
    });
    reminderList.appendChild(row(ICONS.clock, "c-teal", "Time", [timeInput]));
    body.appendChild(reminderList);

    const permLine = h("p", { class: "list-footnote" }, "");
    body.appendChild(permLine);
    body.appendChild(
      h(
        "p",
        { class: "list-footnote" },
        "The reminder fires when you open the app after this time on a day you haven't studied. True background delivery needs a push server (see README)."
      )
    );

    function paintPermission() {
      if (!notificationsSupported()) {
        permLine.textContent = "Notifications are not supported in this browser.";
        return;
      }
      const p = permission();
      permLine.textContent =
        p === "granted"
          ? "Notifications allowed."
          : p === "denied"
          ? "Notifications blocked in browser settings — the in-app banner still works."
          : "Notification permission not requested yet.";
    }
    paintPermission();

    // ---------- Reset ----------
    body.appendChild(h("div", { class: "section-header" }, "Data"));
    const resetList = h("div", { class: "list" });
    resetList.appendChild(
      h(
        "button",
        {
          class: "list-row tappable",
          style: "width:100%;text-align:left;color:var(--red)",
          onclick: () => {
            if (confirm("Reset all settings to defaults?")) {
              localStorage.removeItem("dailyqcm.settings");
              toast("Settings reset");
              close();
            }
          },
        },
        h("span", { class: "icon-chip c-red", html: ICONS.trash }),
        h("span", { class: "label" }, "Reset settings")
      )
    );
    body.appendChild(resetList);

    return overlay;
  });
}

function row(iconSvg, chipClass, label, trailing) {
  return h(
    "div",
    { class: "list-row inset" },
    h("span", { class: `icon-chip ${chipClass}`, html: iconSvg }),
    h("span", { class: "label" }, label),
    ...trailing
  );
}
