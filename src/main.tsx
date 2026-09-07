import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { cloudLoad, getSdkLang, initYandex, setCloudSnapshot } from "./game/yandex";
import { SAVE_KEY } from "./game/useGame";
import { applyLangToDocument, dictOf, isLang, resolveLang } from "./i18n";

/**
 * Порядок запуска:
 * 1. Инициализируем SDK Яндекс Игр (там же читается язык интерфейса — п. 2.14,
 *    и подменяется localStorage на safeStorage).
 * 2. Применяем язык к документу и загрузочной заглушке до первого рендера.
 * 3. Подтягиваем облачное сохранение.
 * 4. Рендерим игру и вызываем LoadingAPI.ready() внутри App.
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

  // Язык до первого кадра: сохранённый игроком > SDK > браузер.
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const saved = raw ? (JSON.parse(raw) as { lang?: unknown }).lang : undefined;
    const lang = resolveLang(isLang(saved) ? saved : undefined, getSdkLang());
    applyLangToDocument(lang);
    const bootText = document.querySelector("#boot .t");
    if (bootText) bootText.textContent = dictOf(lang).meta.boot;
  } catch {
    /* останется русский текст заглушки по умолчанию */
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
