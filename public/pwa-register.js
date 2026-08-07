(() => {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(err => {
        console.warn("Service Worker LABEL DS :", err);
      });
    });
  }

  let deferredInstallPrompt = null;

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;

    const button = document.getElementById("installPwaBtn");
    if (button) button.style.display = "inline-flex";
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    const button = document.getElementById("installPwaBtn");
    if (button) button.style.display = "none";
  });

  window.installLabelDsPwa = async function () {
    if (!deferredInstallPrompt) {
      alert("Si le bouton d'installation du navigateur n'apparaît pas encore, ouvrez le menu du navigateur puis choisissez « Installer LABEL DS » ou « Installer cette application ».");
      return;
    }

    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;

    const button = document.getElementById("installPwaBtn");
    if (button) button.style.display = "none";
  };
})();
