import { useEffect, useRef, useState } from "react";
import { animate, motion } from "framer-motion";
import { Bot, Flame, MousePointerClick, RotateCcw, Star, TrendingUp, Volume2, VolumeX, Zap } from "lucide-react";
import { fmtMoney, fmt, fmtTime, fmtRate } from "../game/format";
import Tooltip from "./Tooltip";

export function Ticker({ value, className }: { value: number; className?: string }) {
  const [disp, setDisp] = useState(value);
  const ref = useRef(value);
  useEffect(() => {
    const from = ref.current;
    ref.current = value;
    if (Math.abs(value - from) < 0.000001) return;
    const c = animate(from, value, {
      duration: 0.35,
      ease: "easeOut",
      onUpdate: (v) => setDisp(v),
    });
    return () => c.stop();
  }, [value]);
  return <span className={className}>{fmtMoney(disp)}</span>;
}

interface HeaderProps {
  money: number;
  clickPower: number;
  cps: number;
  botClicks: number;
  botIncome: number;
  critChance: number;
  critMult: number;
  prestige: number;
  modelName: string;
  modelBase: number;
  cardPct: number;
  botSpeedMult: number;
  clickLevels: number;
  autoLevels: number;
  boostActive: boolean;
  boostMult: number;
  boostUntil: number;
  sound: boolean;
  onToggleSound: () => void;
  onReset: () => void;
}

export default function Header(p: HeaderProps) {
  const prestigePct = Math.round(p.prestige * 40);
  const cardPctText = `+${Math.round(p.cardPct * 100)}%`;

  return (
    <header className="relative z-30 border-b border-line bg-panel/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6 sm:py-3">
        {/* Лого + кнопки */}
        <div className="flex flex-1 items-center gap-3">
          <div className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-full border border-white/15 bg-gradient-to-br from-bmw-deep to-night sm:size-11">
            <div className="m-stripes absolute inset-x-1.5 top-1.5 h-1 rounded-full" />
            <span className="font-display text-[9px] font-bold tracking-widest text-bmw-soft sm:text-[10px]">BMW</span>
          </div>
          <div className="leading-tight">
            <div className="font-display text-xs font-bold tracking-wide sm:text-sm">ПЕРЕКУП</div>
            <div className="hidden text-[10px] font-medium text-white/45 sm:block">симулятор перекупщика</div>
          </div>
          {/* Кнопки звука и сброса — всегда рядом с лого */}
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={p.onToggleSound}
              className="grid size-8 place-items-center rounded-lg border border-white/10 bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white sm:size-9"
              title={p.sound ? "Выключить звук" : "Включить звук"}
            >
              {p.sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </button>
            <button
              onClick={p.onReset}
              className="grid size-8 place-items-center rounded-lg border border-white/10 bg-white/5 text-white/60 transition hover:border-mred/40 hover:bg-mred/10 hover:text-mred sm:size-9"
              title="Сбросить прогресс"
            >
              <RotateCcw className="size-4" />
            </button>
          </div>
        </div>

        {/* Баланс */}
        <div className="order-3 mt-1 flex w-full items-end justify-between gap-2 px-1 sm:order-none sm:mt-0 sm:mx-0 sm:w-auto sm:flex-1 sm:justify-center">
          <Tooltip
            color="#ffffff"
            title="Твой баланс"
            lines={[
              { label: "Наличные на руках", value: fmtMoney(p.money) },
              { label: "Тачка в гараже", value: p.modelName, accent: "#5aa9ff" },
              { label: "База текущей модели", value: fmtMoney(p.modelBase), accent: "#43e0a0" },
            ]}
            hint="Рубли идут с кликов, пассивного дохода и автокликера. Трать их на прокачку, контейнеры удачи и выкуп следующей модели BMW."
          >
            <div className="min-w-0 cursor-help">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">Баланс</div>
              <Ticker
                value={p.money}
                className="tabular font-display block truncate text-2xl font-black text-white sm:text-3xl"
              />
            </div>
          </Tooltip>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
            {/* Клик */}
            <Tooltip
              color="#5aa9ff"
              title="Доход за один клик"
              lines={[
                { label: "Сейчас за клик", value: `+${fmt(p.clickPower)} ₽`, accent: "#5aa9ff" },
                { label: "База модели", value: fmtMoney(p.modelBase) },
                { label: "Апгрейдов «Сила клика»", value: `${p.clickLevels} ур.` },
                { label: "Бонус карт удачи", value: cardPctText, accent: "#f5c542" },
                ...(p.prestige > 0
                  ? [{ label: "Бонус кругов", value: `+${prestigePct}%`, accent: "#f5c542" }]
                  : []),
                ...(p.boostActive
                  ? [{ label: "Активный буст", value: `×${p.boostMult}`, accent: "#f5c542" }]
                  : []),
              ]}
              hint="Растёт от вкладки «Прокачка» → «Сила клика», от новой модели в гараже, карт удачи и бустов из контейнеров."
            >
              <div className="flex cursor-help items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-bmw-soft transition hover:border-bmw/40 hover:bg-bmw/10">
                <MousePointerClick className="size-3.5" />
                <span className="tabular">+{fmt(p.clickPower)} ₽</span>
              </div>
            </Tooltip>

            {/* Пассив */}
            <Tooltip
              color="#43e0a0"
              title="Пассивный доход"
              lines={[
                { label: "Капает без кликов", value: `${fmt(p.cps)} ₽/с`, accent: "#43e0a0" },
                { label: "Апгрейдов «Пассив»", value: `${p.autoLevels} ур.` },
                { label: "База модели", value: fmtMoney(p.modelBase) },
                { label: "Бонус карт удачи", value: cardPctText, accent: "#f5c542" },
                ...(p.prestige > 0
                  ? [{ label: "Бонус кругов", value: `+${prestigePct}%`, accent: "#f5c542" }]
                  : []),
              ]}
              hint="Нанимай людей во вкладке «Прокачка» → «Пассивный доход». Работает даже когда вкладка закрыта: вернёшься — получишь накопленное."
            >
              <PassiveChip cps={p.cps} />
            </Tooltip>

            {/* Автокликер */}
            {p.botClicks > 0 && (
              <Tooltip
                color="#5eead4"
                title="Автокликер"
                lines={[
                  { label: "Скорость", value: `${fmtRate(p.botClicks)} клик/с`, accent: "#5eead4" },
                  { label: "Приносит", value: `+${fmt(p.botIncome)} ₽/с`, accent: "#43e0a0" },
                  { label: "Ускорение от карт", value: `+${Math.round((p.botSpeedMult - 1) * 100)}%`, accent: "#f5c542" },
                ]}
                hint="Кликает за тебя: каждый автоклик приносит столько же, сколько твой обычный клик, и тоже может критовать. Качается во вкладке «Прокачка» → «Автокликер»."
              >
                <div className="flex cursor-help items-center gap-1.5 rounded-full border border-teal-400/25 bg-teal-400/10 px-3 py-1 text-xs font-bold text-teal-300 transition hover:border-teal-400/50">
                  <Bot className="size-3.5" />
                  <span className="tabular">{fmtRate(p.botClicks)} клик/с</span>
                </div>
              </Tooltip>
            )}

            {/* Крит */}
            <Tooltip
              color="#f5c542"
              title="Критический торг"
              lines={[
                { label: "Шанс крита", value: `${Math.round(p.critChance * 100)}%`, accent: "#f5c542" },
                { label: "Множитель дохода", value: `×${p.critMult}`, accent: "#f5c542" },
                { label: "Крит-клик даёт", value: `+${fmt(p.clickPower * p.critMult)} ₽`, accent: "#43e0a0" },
              ]}
              hint="Иногда клиент переплачивает — клик приносит в разы больше. Шанс и силу качай во вкладке «Прокачка» → «Критический торг», а также лови карты «Счастливая монета» и «Золотой язык»."
            >
              <div className="flex cursor-help items-center gap-1.5 rounded-full border border-gold/25 bg-gold/10 px-3 py-1 text-xs font-bold text-gold transition hover:border-gold/50">
                <Flame className="size-3.5" />
                <span className="tabular">
                  {Math.round(p.critChance * 100)}% · ×{p.critMult}
                </span>
              </div>
            </Tooltip>

            {/* Престиж */}
            {p.prestige > 0 && (
              <Tooltip
                color="#f5c542"
                title="Опытный коллекционер"
                lines={[
                  { label: "Пройдено кругов", value: String(p.prestige) },
                  { label: "Бонус ко всему доходу", value: `+${prestigePct}%`, accent: "#f5c542" },
                  { label: "Следующий круг даст", value: `+${prestigePct + 40}%`, accent: "#43e0a0" },
                ]}
                hint="Бонус получен за продажу полной коллекции. Умножает клик, пассивный доход и автокликер — навсегда."
              >
                <div className="flex cursor-help items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-black text-gold transition hover:border-gold/60">
                  <Star className="size-3.5" />
                  <span className="tabular">
                    Круг {p.prestige + 1} · +{prestigePct}%
                  </span>
                </div>
              </Tooltip>
            )}

            {/* Буст */}
            {p.boostActive && (
              <Tooltip
                color="#f5c542"
                title="Временный буст"
                lines={[
                  { label: "Множитель", value: `×${p.boostMult}`, accent: "#f5c542" },
                  { label: "Действует на", value: "клик, пассив, бота" },
                ]}
                hint="Выпал из контейнера удачи. Пока горит — кликай как можно активнее, доход умножается."
              >
                <BoostChip until={p.boostUntil} mult={p.boostMult} />
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function PassiveChip({ cps }: { cps: number }) {
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (cps <= 0) return;
    const iv = setInterval(() => setPulse((v) => v + 1), 1000);
    return () => clearInterval(iv);
  }, [cps]);

  return (
    <div className="relative flex cursor-help items-center gap-1.5 overflow-hidden rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-mint transition hover:border-mint/40 hover:bg-mint/10">
      {cps > 0 && (
        <motion.span
          key={pulse}
          initial={{ x: "-120%", opacity: 0.55 }}
          animate={{ x: "120%", opacity: 0 }}
          transition={{ duration: 1, ease: "linear" }}
          className="pointer-events-none absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-mint/25 to-transparent"
        />
      )}
      <motion.span
        key={`i${pulse}`}
        animate={cps > 0 ? { y: [0, -3, 0], scale: [1, 1.15, 1] } : {}}
        transition={{ duration: 0.5 }}
        className="relative"
      >
        <TrendingUp className="size-3.5" />
      </motion.span>
      <span className="tabular relative">{fmt(cps)} ₽/с</span>
    </div>
  );
}

function BoostChip({ until, mult }: { until: number; mult: number }) {
  const [, force] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => force((v) => v + 1), 500);
    return () => clearInterval(iv);
  }, []);
  const left = Math.max(0, (until - Date.now()) / 1000);
  return (
    <div className="flex animate-pulse cursor-help items-center gap-1.5 rounded-full border border-gold/40 bg-gold/15 px-3 py-1 text-xs font-black text-gold">
      <Zap className="size-3.5" />
      <span className="tabular">
        ×{mult} · {fmtTime(left)}
      </span>
    </div>
  );
}


