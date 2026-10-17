import { h, openOverlay, toast, ICONS } from "../dom.js";
import { getSettings, setSettings, exportBackup, restoreBackup, checkBackup, backupSummary, lastBackupAt, getPlan, getPlanOverride, setPlanOverride, getEntitlement, previewAllowed } from "../store.js";
import { accountsConfigured, currentUser, signIn, signOut, onAccountChange } from "../account.js";
import { isPro } from "../plan.js";
import { openPaywall, proBadge } from "./paywall.js";
import { openInterviewSheet } from "./interview.js";
import { fmtDateFull } from "../format.js";
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

    const iv = s.interview;
    const interviewList = h("div", { class: "list" });
    interviewList.appendChild(
      h(
        "button",
        { class: "list-row tappable", style: "width:100%;text-align:left", onclick: () => openInterviewSheet() },
        h("span", { class: "icon-chip c-accent", html: ICONS.target }),
        h(
          "span",
          { class: "label" },
          "Interview date",
          isPro(getPlan()) ? null : proBadge(),
          h("span", { class: "sub" }, iv ? fmtDateFull(iv.date) : "Not set")
        ),
        h("span", { class: "chevron", html: ICONS.chevron })
      )
    );
    body.appendChild(interviewList);
    body.appendChild(
      h("p", { class: "list-footnote" }, "Paces new questions and reviews so everything in your daily mix is covered by the day. While it's set, it decides the session size.")
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

    // ---------- Account ----------
    if (accountsConfigured()) {
      body.appendChild(h("div", { class: "section-header" }, "Account"));
      const accountList = h("div", { class: "list" });
      const paintAccount = () => {
        accountList.replaceChildren();
        const u = currentUser();
        if (!u) {
          accountList.appendChild(
            h(
              "button",
              {
                class: "list-row tappable",
                style: "width:100%;text-align:left",
                onclick: () => signIn().catch((err) => toast(err.message || "Couldn't sign in", 3000)),
              },
              h("span", { class: "icon-chip c-accent", html: ICONS.unlock }),
              h("span", { class: "label" }, "Sign in with Google", h("span", { class: "sub" }, "Needed for Pro and video decks")),
              h("span", { class: "chevron", html: ICONS.chevron })
            )
          );
          return;
        }
        const ent = getEntitlement();
        const planLine = ent?.plan === "pro"
          ? ent.subscription
            ? "Pro subscription"
            : `Pro until ${fmtDateFull(ent.proUntil)}`
          : "Free plan";
        accountList.appendChild(
          h(
            "div",
            { class: "list-row inset" },
            h("span", { class: "icon-chip c-accent", html: ICONS.unlock }),
            h("span", { class: "label" }, u.email || u.name || "Signed in", h("span", { class: "sub" }, planLine)),
            h(
              "button",
              { class: "btn", onclick: () => signOut().then(() => toast("Signed out")) },
              "Sign out"
            )
          )
        );
      };
      paintAccount();
      // Stops listening the first time a change arrives after the sheet closed.
      const off = onAccountChange(() => (accountList.isConnected ? paintAccount() : off()));
      body.appendChild(accountList);
    }

    // ---------- Plan ----------
    body.appendChild(h("div", { class: "section-header" }, "Plan"));
    const planList = h("div", { class: "list" });
    const planName = h("span", {});
    const paintPlan = () => (planName.textContent = isPro(getPlan()) ? "Pro" : "Free");
    paintPlan();
    planList.appendChild(
      h(
        "button",
        { class: "list-row tappable", style: "width:100%;text-align:left", onclick: () => openPaywall() },
        h("span", { class: "icon-chip c-accent", html: ICONS.sparkle }),
        h("span", { class: "label" }, planName, h("span", { class: "sub" }, "See what Pro includes")),
        h("span", { class: "chevron", html: ICONS.chevron })
      )
    );
    body.appendChild(planList);

    // Testing aid, shown only when running on localhost; production ignores it.
    if (previewAllowed()) {
      const previewWrap = h("div", { class: "list", style: "padding:12px 16px" });
      const previewControl = h("div", { class: "segmented" });
      const previewButtons = [];
      const currentOverride = getPlanOverride() || "default";
      for (const [val, label] of [
        ["default", "Default"],
        ["free", "Free"],
        ["pro", "Pro"],
      ]) {
        const btn = h(
          "button",
          {
            class: currentOverride === val ? "active" : "",
            onclick: () => {
              setPlanOverride(val === "default" ? null : val);
              for (const b of previewButtons) b.classList.toggle("active", b.dataset.val === val);
              paintPlan();
            },
          },
          label
        );
        btn.dataset.val = val;
        previewButtons.push(btn);
        previewControl.appendChild(btn);
      }
      previewWrap.appendChild(previewControl);
      body.appendChild(previewWrap);
      body.appendChild(
        h("p", { class: "list-footnote" }, "Development only (localhost): preview the app as a free or Pro user. Default uses your real plan. Nothing you've already added is ever removed.")
      );
    }

    // ---------- Backup ----------
    body.appendChild(h("div", { class: "section-header" }, "Backup"));
    const backupList = h("div", { class: "list" });
    const last = lastBackupAt();
    backupList.appendChild(
      h(
        "button",
        { class: "list-row tappable", style: "width:100%;text-align:left", onclick: () => backUp() },
        h("span", { class: "icon-chip", html: ICONS.download }),
        h("span", { class: "label" }, "Back up everything", h("span", { class: "sub" }, last ? `Last backup ${fmtDateFull(last)}` : "Never backed up")),
        h("span", { class: "chevron", html: ICONS.chevron })
      )
    );
    const restoreInput = h("input", {
      type: "file",
      accept: ".json,application/json",
      style: "display:none",
      onchange: async (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        let obj;
        try {
          obj = JSON.parse(await file.text());
        } catch {
          toast("That file isn't valid JSON");
          return;
        }
        const problem = checkBackup(obj);
        if (problem) return toast(problem, 4000);
        const s = backupSummary(obj);
        const when = obj.exportedAt ? ` from ${fmtDateFull(obj.exportedAt)}` : "";
        if (!confirm(`Restore the backup${when}? It has ${s.decks} decks, ${s.questions} questions and ${s.answers} answers, and replaces everything on this device.`)) return;
        await restoreBackup(obj);
        toast(`Restored ${s.decks} decks`);
        close();
      },
    });
    backupList.appendChild(
      h(
        "button",
        { class: "list-row tappable", style: "width:100%;text-align:left", onclick: () => restoreInput.click() },
        h("span", { class: "icon-chip", html: ICONS.upload }),
        h("span", { class: "label" }, "Restore from a backup", h("span", { class: "sub" }, "Replaces the decks and progress on this device")),
        h("span", { class: "chevron", html: ICONS.chevron })
      ),
      restoreInput
    );
    body.appendChild(backupList);
    body.appendChild(
      h(
        "p",
        { class: "list-footnote" },
        "On iPhone, removing the app from the Home Screen deletes its data. Back up first, then restore the file after adding the app again or on a new phone."
      )
    );

    async function backUp() {
      const data = await exportBackup();
      const json = JSON.stringify(data);
      const name = `dailyqcm-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const file = new File([json], name, { type: "application/json" });
      // iOS: the share sheet offers "Save to Files". Elsewhere: a download.
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "DailyQCM backup" });
          toast("Backup ready");
          return;
        } catch (err) {
          if (err?.name === "AbortError") return;
        }
      }
      const url = URL.createObjectURL(file);
      const a = h("a", { href: url, download: name, style: "display:none" });
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 1000);
      toast("Backup downloaded");
    }

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
