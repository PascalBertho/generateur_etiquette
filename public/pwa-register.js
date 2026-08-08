(() => {
  let deferredPrompt = null;

  function emitAvailability() {
    window.dispatchEvent(
      new CustomEvent("labelds:pwa-availability", {
        detail: { available: Boolean(deferredPrompt) }
      })
    );
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
      try {
        await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
        console.log("LABEL DS: service worker enregistré");
      } catch (error) {
        console.error("LABEL DS: échec service worker", error);
      }
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    emitAvailability();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    try {
      localStorage.setItem("labelds_pwa_installed", "1");
      localStorage.removeItem("labelds_pwa_install_later");
    } catch {}
    emitAvailability();
    window.dispatchEvent(new CustomEvent("labelds:pwa-installed"));
  });

  window.installLabelDsPwa = async function () {
    if (!deferredPrompt) {
      return { available: false, outcome: "unavailable" };
    }

    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    const outcome = choice?.outcome || "dismissed";
    deferredPrompt = null;
    emitAvailability();

    if (outcome === "accepted") {
      try {
        localStorage.setItem("labelds_pwa_installed", "1");
        localStorage.removeItem("labelds_pwa_install_later");
      } catch {}
    }
    return { available: true, outcome };
  };

  window.isLabelDsPwaInstalled = function () {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator.standalone === true;

    let stored = false;
    try {
      stored = localStorage.getItem("labelds_pwa_installed") === "1";
    } catch {}

    return Boolean(standalone || stored);
  };

  // Utile pour diagnostic dans la console.
  window.labelDsPwaDebug = async function () {
    const registrations = "serviceWorker" in navigator
      ? await navigator.serviceWorker.getRegistrations()
      : [];

    return {
      secureContext: window.isSecureContext,
      displayModeStandalone:
        window.matchMedia?.("(display-mode: standalone)")?.matches || false,
      beforeInstallPromptAvailable: Boolean(deferredPrompt),
      serviceWorkerRegistrations: registrations.map((r) => ({
        scope: r.scope,
        active: Boolean(r.active)
      }))
    };
  };
})();