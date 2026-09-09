import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Globe } from "lucide-react";
import { LANGS, useI18n, type Lang } from "../i18n";

const LANG_META: Record<Lang, { code: string; name: string }> = {
  ru: { code: "РУС", name: "Русский" },
  en: { code: "ENG", name: "English" },
};

/**
 * Переключатель языка (п. 6.9): универсальная иконка глобуса, языки подписаны
 * кодами и собственными названиями — переключиться можно без знания текущего языка.
 * Текстовые коды (РУС/ENG) вместо эмодзи-флагов: на Windows/некоторых устройствах
 * флаги не отображаются и выглядят как буквы «RU»/«GB», а ENG виден везде одинаково.
 */
export default function LangButton() {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="grid size-10 place-items-center rounded-lg border border-white/10 bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white sm:size-9"
        title={t.header.langTitle}
        aria-label={t.header.langTitle}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Globe className="size-4" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            role="listbox"
            aria-label={t.header.langTitle}
            className="absolute left-0 top-[calc(100%+8px)] z-50 w-44 overflow-hidden rounded-xl border border-white/10 bg-[#0d131c]/95 shadow-[0_20px_50px_-12px_rgba(0,0,0,.9)] backdrop-blur-xl"
          >
            {LANGS.map((l) => (
              <button
                key={l}
                role="option"
                aria-selected={lang === l}
                onClick={() => {
                  setLang(l);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 px-3.5 py-3 text-left text-[13px] font-bold transition ${
                  lang === l ? "bg-bmw/15 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-md border border-white/10 bg-white/5 text-[10px] font-black tracking-widest text-white/70">
                  {LANG_META[l].code}
                </span>
                <span className="flex-1">{LANG_META[l].name}</span>
                {lang === l && <Check className="size-4 text-bmw-soft" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
