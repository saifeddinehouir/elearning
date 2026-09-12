// PWA update detection. The service worker precaches a new version in the
// background but stays in "waiting" (see sw.js) so an update never interrupts
// an in-progress session. This module notices the waiting worker, lets the
// caller show a banner, and reloads once the user accepts.

export function watchForUpdates(onUpdateReady) {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.getRegistration().then((reg) => {
    if (!reg) return;

    // A worker may already be sitting in "waiting" from before this page load.
    if (reg.waiting && navigator.serviceWorker.controller) {
      onUpdateReady(() => activate(reg));
    }

    reg.addEventListener("updatefound", () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          onUpdateReady(() => activate(reg));
        }
      });
    });

    // Ask the browser to re-check sw.js whenever the app returns to the
    // foreground, instead of waiting for its own (throttled) schedule.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") reg.update().catch(() => {});
    });
  });

  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

function activate(reg) {
  reg.waiting?.postMessage({ type: "SKIP_WAITING" });
}
