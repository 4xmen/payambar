import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import App from "@/App";
import "@/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <Toaster position="bottom-center" richColors dir="rtl" />
  </StrictMode>
);

if ("serviceWorker" in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
  const sendSkipWaiting = (registration: ServiceWorkerRegistration) => {
    if (registration.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
  };
  const watchInstalling = (worker: ServiceWorker | null, registration: ServiceWorkerRegistration) => {
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed" && registration.waiting) {
        sendSkipWaiting(registration);
      }
    });
  };
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((reg) => {
        sendSkipWaiting(reg);
        watchInstalling(reg.installing, reg);
        reg.addEventListener("updatefound", () => watchInstalling(reg.installing, reg));
      })
      .catch((err) => console.error("SW registration failed:", err));
  });
}
