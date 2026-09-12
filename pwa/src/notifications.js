// Reminder notifications. A purely static PWA can't run a real scheduled job, so
// this does two things:
//   1. registers the service worker
//   2. "nudges" — when the app becomes visible after the reminder time on a day
//      with no study yet, it shows a notification (and the caller shows an
//      in-app banner). True background delivery needs a push server; see README.

import { getSettings, studiedToday } from "./store.js";

let swReg = null;

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    swReg = await navigator.serviceWorker.register("sw.js");
    return swReg;
  } catch (e) {
    console.warn("SW registration failed", e);
    return null;
  }
}

export function notificationsSupported() {
  return "Notification" in window && "serviceWorker" in navigator;
}

export function permission() {
  return notificationsSupported() ? Notification.permission : "unsupported";
}

export async function requestPermission() {
  if (!notificationsSupported()) return "unsupported";
  const result = await Notification.requestPermission();
  return result;
}

function pastReminderTime(now = new Date()) {
  const { reminderHour, reminderMinute } = getSettings();
  return now.getHours() > reminderHour ||
    (now.getHours() === reminderHour && now.getMinutes() >= reminderMinute);
}

// Returns true if a nudge is warranted right now (caller can show an in-app banner).
export async function shouldNudge() {
  const { reminderEnabled } = getSettings();
  if (!reminderEnabled) return false;
  if (!pastReminderTime()) return false;
  return !(await studiedToday());
}

export async function maybeShowNotification() {
  if (permission() !== "granted") return;
  if (!(await shouldNudge())) return;

  const reg = swReg || (await navigator.serviceWorker.getRegistration());
  const body = "You haven't studied yet today — keep your streak going.";
  if (reg && reg.showNotification) {
    reg.showNotification("Daily review", {
      body,
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      tag: "dailyqcm-reminder",
    });
  } else if (Notification.permission === "granted") {
    new Notification("Daily review", { body, icon: "icons/icon-192.png" });
  }
}

// Wire up: nudge on load and whenever the app returns to the foreground.
export function startNudgeWatcher(onNudge) {
  const run = async () => {
    if (document.visibilityState !== "visible") return;
    if (await shouldNudge()) {
      onNudge?.();
      maybeShowNotification();
    }
  };
  document.addEventListener("visibilitychange", run);
  run();
}
