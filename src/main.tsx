import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { cloudLoad, initYandex, setCloudSnapshot } from "./game/yandex";

/**
 * Порядок запуска:
 * 1. Инициализируем SDK Яндекс Игр (там же подменяется localStorage на safeStorage).
 * 2. Подтягиваем облачное сохранение.
 * 3. Рендерим игру и вызываем LoadingAPI.ready() внутри App.
 */
async function boot() {
  try {
    const ok = await initYandex();
    if (ok) {
      const cloud = await cloudLoad();
      if (cloud) setCloudSnapshot(cloud);
    }
  } catch {
    /* играем офлайн, прогресс останется локальным */
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );

  // Убираем стартовую заглушку
  const boot = document.getElementById("boot");
  if (boot) {
    boot.style.opacity = "0";
    setTimeout(() => boot.remove(), 420);
  }
}

void boot();
