import type { Lang } from "../i18n/types";

const SUF_RU = ["", " тыс.", " млн", " млрд", " трлн", " квадрлн", " квинтлн", " секстлн", " септлн"];
const SUF_EN = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc"];

let numLang: Lang = "ru";

/** Устанавливается из applyLangToDocument при смене языка игры. */
export function setNumberLang(lang: Lang): void {
  numLang = lang;
}

export function fmt(n: number): string {
  if (!isFinite(n)) return "∞";
  if (n < 0) return "-" + fmt(-n);
  if (n === 0) return "0";
  const en = numLang === "en";
  const SUF = en ? SUF_EN : SUF_RU;
  const decSep = en ? "." : ",";
  if (n < 1000) {
    // мелкие значения не округляем в ноль — иначе прокачка выглядит бесполезной
    const decimals = n < 1 ? 2 : n < 10 ? 2 : n < 100 ? 1 : 0;
    return n
      .toFixed(decimals)
      .replace(".", decSep)
      .replace(/,(\\d*?)0+$/, (_m, d: string) => (d ? `,${d}` : ""))
      .replace(/,$/, "")
      .replace(/\.(\d*?)0+$/, (_m, d: string) => (d ? `.${d}` : ""))
      .replace(/\.$/, "");
  }
  let tier = Math.floor(Math.log10(n) / 3);
  if (tier >= SUF.length) tier = SUF.length - 1;
  const scaled = n / Math.pow(10, tier * 3);
  let decimals = 0;
  if (scaled < 10) decimals = 2;
  else if (scaled < 100) decimals = 1;
  const str = scaled
    .toFixed(decimals)
    .replace(".", decSep)
    .replace(/,?0+$/, (m) => (m.startsWith(",") ? "" : m))
    .replace(/\.?0+$/, (m) => (m.startsWith(".") ? "" : m));
  return (tier === 0 ? scaled.toFixed(0) : str) + SUF[tier];
}

export function fmtMoney(n: number): string {
  return fmt(n) + " ₽";
}

export function fmtRate(v: number): string {
  return v.toLocaleString(numLang === "en" ? "en-US" : "ru-RU", { maximumFractionDigits: 2 });
}

export function fmtTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
