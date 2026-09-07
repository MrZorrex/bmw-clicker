import { createContext, useContext } from "react";
import { isLang, RU_LANG_CODES, type Lang } from "./types";
import { ru, type Dict } from "./ru";
import { en } from "./en";
import { setNumberLang } from "../game/format";

export type { Lang, Dict };
export { LANGS, RU_LANG_CODES, isLang } from "./types";

/**
 * Выбор языка игры по коду интерфейса (п. 2.10, 2.14 + резервный набор языков):
 * русский — для ru/be/kk/uk/uz, английский — для всех остальных.
 */
export function mapToLang(code: string | null | undefined): Lang {
  const c = (code ?? "").toLowerCase().split("-")[0];
  if (c === "en") return "en";
  if (RU_LANG_CODES.includes(c)) return "ru";
  if (!c && typeof navigator !== "undefined") {
    const nav = navigator.language.toLowerCase().split("-")[0];
    if (nav === "en") return "en";
    if (RU_LANG_CODES.includes(nav)) return "ru";
  }
  // Неизвестный код интерфейса — резервный английский (кроме пустого кода:
  // там уже проверен язык браузера, по умолчанию оставляем русский).
  return c ? "en" : "ru";
}

/**
 * Стартовый язык: сохранённый игроком > автоопределение SDK > язык браузера.
 * Автоопределение читается при запуске (п. 2.14), выбор игрока — приоритетнее.
 */
export function resolveLang(saved: unknown, sdkLang: string | null | undefined): Lang {
  if (isLang(saved)) return saved;
  if (sdkLang) return mapToLang(sdkLang);
  return mapToLang(null);
}

/** Подстановка {placeholders} в строки словаря. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}

// ─── Контекст ────────────────────────────────────────────────

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Dict;
}

const I18nCtx = createContext<I18nValue>({ lang: "ru", setLang: () => {}, t: ru });

export const I18nProvider = I18nCtx.Provider;

export function useI18n(): I18nValue {
  return useContext(I18nCtx);
}

export function dictOf(lang: Lang): Dict {
  return lang === "en" ? en : ru;
}

/** Применяет язык к документу: <html lang>, title, meta description, формат чисел. */
export function applyLangToDocument(lang: Lang): void {
  try {
    document.documentElement.lang = lang;
    document.title = dictOf(lang).meta.gameName;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", dictOf(lang).meta.description);
  } catch {
    /* noop */
  }
  setNumberLang(lang);
}
