import { registerSW } from "virtual:pwa-register";

export const updateServiceWorker = registerSW({
  immediate: true,
  onOfflineReady() {
    console.info("Michi is ready to open offline.");
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) {
      return;
    }

    window.setInterval(
      () => {
        void registration.update();
      },
      60 * 60 * 1000
    );
  }
});
