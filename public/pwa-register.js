(() => {
  let deferredPrompt = null;

  function dispatchAvailability(available) {
    window.dispatchEvent(
      new CustomEvent("labelds:pwa-availability", {
        detail: { available: Boolean(available) },
      })
    );
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    dispatchAvailability(true);
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    try {
      localStorage.setItem("labelds_pwa_installed", "1");
      localStorage.removeItem("labelds_pwa_install_later");
    } catch {}
    dispatchAvailability(false);
    window.dispatchEvent(new CustomEvent("labelds:pwa-installed"));
  });

  window.installLabelDsPwa = async function installLabelDsPwa() {
    if (!deferredPrompt) {
      return { available: false, outcome: "unavailable" };
    }

    try {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      const outcome = choice?.outcome || "dismissed";

      if (outcome === "accepted") {
        try {
          localStorage.setItem("labelds_pwa_installed", "1");
          localStorage.removeItem("labelds_pwa_install_later");
        } catch {}
      }

      deferredPrompt = null;
      dispatchAvailability(false);
      return { available: true, outcome };
    } catch (error) {
      console.error("Installation PWA LABEL DS impossible", error);
      return { available: true, outcome: "error" };
    }
  };

  window.isLabelDsPwaInstalled = function isLabelDsPwaInstalled() {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator.standalone === true;

    let stored = false;
    try {
      stored = localStorage.getItem("labelds_pwa_installed") === "1";
    } catch {}

    return Boolean(standalone || stored);
  };

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/service-worker.js")
        .catch((error) =>
          console.error("Service Worker LABEL DS non enregistré", error)
        );
    });
  }

  window.addEventListener("DOMContentLoaded", () => {
    dispatchAvailability(Boolean(deferredPrompt));
  });
})();