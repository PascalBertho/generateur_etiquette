(() => {
  let deferredPrompt = null;
  let lastDiagnostic = null;

  function emit(name, detail = {}) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  async function fetchCheck(url) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      return {
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get("content-type") || ""
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        contentType: "",
        error: error?.message || String(error)
      };
    }
  }

  async function buildDiagnostic() {
    let registration = null;
    let swReady = false;
    let swScope = "";

    if ("serviceWorker" in navigator) {
      try {
        registration = await navigator.serviceWorker.getRegistration("/");
        if (!registration) {
          registration = await navigator.serviceWorker.getRegistration();
        }
        swReady = Boolean(registration?.active);
        swScope = registration?.scope || "";
      } catch {}
    }

    const manifestCheck = await fetchCheck("/manifest.webmanifest");
    const swFileCheck = await fetchCheck("/service-worker.js");
    const icon192 = await fetchCheck("/label-ds-192.png");
    const icon512 = await fetchCheck("/label-ds-512.png");

    const standalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator.standalone === true;

    lastDiagnostic = {
      secureContext: window.isSecureContext,
      standalone: Boolean(standalone),
      beforeInstallPromptAvailable: Boolean(deferredPrompt),
      serviceWorkerSupported: "serviceWorker" in navigator,
      serviceWorkerActive: swReady,
      serviceWorkerScope: swScope,
      manifest: manifestCheck,
      serviceWorkerFile: swFileCheck,
      icon192,
      icon512,
      userAgent: navigator.userAgent
    };

    emit("labelds:pwa-diagnostic", lastDiagnostic);
    return lastDiagnostic;
  }

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      emit("labelds:pwa-status", {
        level: "error",
        message: "Service Worker non pris en charge par ce navigateur."
      });
      return;
    }

    try {
      const registration = await navigator.serviceWorker.register(
        "/service-worker.js",
        { scope: "/" }
      );

      await navigator.serviceWorker.ready;

      emit("labelds:pwa-status", {
        level: "ok",
        message: "Service Worker LABEL DS actif.",
        scope: registration.scope
      });
    } catch (error) {
      emit("labelds:pwa-status", {
        level: "error",
        message: "Échec d'enregistrement du Service Worker.",
        error: error?.message || String(error)
      });
    } finally {
      buildDiagnostic();
    }
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;

    emit("labelds:pwa-availability", {
      available: true
    });

    buildDiagnostic();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;

    try {
      localStorage.setItem("labelds_pwa_installed", "1");
      localStorage.removeItem("labelds_pwa_install_later");
    } catch {}

    emit("labelds:pwa-availability", { available: false });
    emit("labelds:pwa-installed");
    buildDiagnostic();
  });

  window.installLabelDsPwa = async function installLabelDsPwa() {
    if (!deferredPrompt) {
      const diagnostic = await buildDiagnostic();

      emit("labelds:pwa-manual-install", { diagnostic });
      return {
        available: false,
        outcome: "manual"
      };
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
      emit("labelds:pwa-availability", { available: false });
      buildDiagnostic();

      return {
        available: true,
        outcome
      };
    } catch (error) {
      emit("labelds:pwa-status", {
        level: "error",
        message: "Erreur pendant la demande d'installation.",
        error: error?.message || String(error)
      });

      return {
        available: true,
        outcome: "error"
      };
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

  window.labelDsPwaDebug = buildDiagnostic;

  window.addEventListener("load", () => {
    registerServiceWorker();
    setTimeout(buildDiagnostic, 1200);
  });
})();