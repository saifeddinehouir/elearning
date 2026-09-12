import { h, openOverlay, toast } from "../dom.js";
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

    // Daily goal
    const goalVal = h("strong", {}, String(s.dailyGoal));
    body.appendChild(
      card("Daily session", [
        h(
          "div",
          { class: "row between" },
          h("span", {}, "Daily goal"),
          h(
            "div",
            { class: "row", style: "gap:10px" },
            h("button", { class: "btn", onclick: () => bumpGoal(-5) }, "−"),
            goalVal,
            h("button", { class: "btn", onclick: () => bumpGoal(5) }, "+")
          )
        ),
        h("label", { class: "field mt" },
          h("span", {}, `Max new questions per session: ${Math.round(s.newLimitRatio * 100)}%`),
          h("input", {
            type: "range", min: "20", max: "100", step: "10",
            value: String(Math.round(s.newLimitRatio * 100)),
            oninput: (e) => {
              setSettings({ newLimitRatio: Number(e.target.value) / 100 });
              e.target.previousElementSibling.textContent = `Max new questions per session: ${e.target.value}%`;
            },
          })
        ),
      ])
    );

    function bumpGoal(delta) {
      const next = Math.max(5, Math.min(50, getSettings().dailyGoal + delta));
      setSettings({ dailyGoal: next });
      goalVal.textContent = String(next);
    }

    // Reminder
    const reminderCard = card("Reminder", []);
    const enabledCb = h("input", {
      type: "checkbox",
      checked: s.reminderEnabled,
      onchange: async (e) => {
        setSettings({ reminderEnabled: e.target.checked });
        if (e.target.checked && permission() === "default") await requestPermission();
        paintPermission();
      },
    });
    reminderCard.appendChild(h("label", { class: "switch" }, h("span", {}, "Evening reminder"), enabledCb));

    const timeInput = h("input", {
      type: "time",
      value: `${String(s.reminderHour).padStart(2, "0")}:${String(s.reminderMinute).padStart(2, "0")}`,
      onchange: (e) => {
        const [hh, mm] = e.target.value.split(":").map(Number);
        setSettings({ reminderHour: hh || 0, reminderMinute: mm || 0 });
      },
    });
    reminderCard.appendChild(h("label", { class: "field mt" }, h("span", {}, "Time"), timeInput));

    const permLine = h("p", { class: "small muted mt" }, "");
    reminderCard.appendChild(permLine);
    reminderCard.appendChild(
      h(
        "p",
        { class: "small muted mt" },
        "The reminder fires when you open the app after this time on a day you haven't studied. True background delivery needs a push server (see README)."
      )
    );
    body.appendChild(reminderCard);

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

    body.appendChild(
      h(
        "button",
        {
          class: "btn danger block",
          onclick: () => {
            if (confirm("Reset all settings to defaults?")) {
              localStorage.removeItem("dailyqcm.settings");
              toast("Settings reset");
              close();
            }
          },
        },
        "Reset settings"
      )
    );

    return overlay;
  });
}

function card(title, children) {
  return h("div", { class: "card" }, h("div", { class: "section-title" }, title), ...children);
}
