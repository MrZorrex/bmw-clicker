import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { ChevronDown, Coins, Gem, Zap } from "lucide-react";
import { CARDS, RARITY_META, type CaseDef, type CardDef } from "../data/game";
import type { Reward } from "../game/useGame";
import { fmtMoney } from "../game/format";
import { CardFace } from "./Shop";
import { sfxSpin, sfxWin } from "../game/sound";

const CELL_W = 128;
const CELL_GAP = 12;
const STRIDE = CELL_W + CELL_GAP;
const WIN_INDEX = 40;
const TOTAL = 48;

interface Visual {
  kind: "cash" | "boost" | "card";
  card?: CardDef;
  amount?: number;
  mult?: number;
}

function randomVisual(): Visual {
  const r = Math.random();
  if (r < 0.35) return { kind: "cash" };
  if (r < 0.55) return { kind: "boost", mult: Math.random() < 0.8 ? 2 : 3 };
  return { kind: "card", card: CARDS[Math.floor(Math.random() * CARDS.length)] };
}

function Cell({ v }: { v: Visual }) {
  if (v.kind === "cash")
    return (
      <div className="flex size-full flex-col items-center justify-center gap-1.5 rounded-xl border border-mint/25 bg-mint/[0.07]">
        <Coins className="size-7 text-mint" />
        <span className="text-[9px] font-black uppercase tracking-widest text-mint/80">Кэш</span>
      </div>
    );
  if (v.kind === "boost")
    return (
      <div className="flex size-full flex-col items-center justify-center gap-1.5 rounded-xl border border-gold/25 bg-gold/[0.07]">
        <Zap className="size-7 text-gold" />
        <span className="tabular text-[9px] font-black uppercase tracking-widest text-gold/80">×{v.mult} буст</span>
      </div>
    );
  const meta = RARITY_META[v.card!.rarity];
  return (
    <div
      className="flex size-full flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border p-1.5"
      style={{ borderColor: `${meta.color}40`, background: `${meta.color}0d` }}
    >
      {v.card!.img ? (
        <img src={v.card!.img} alt="" className="h-16 w-full rounded-md object-cover" />
      ) : (
        <Gem className="size-8" style={{ color: meta.color }} />
      )}
      <span className="line-clamp-1 px-0.5 text-[8.5px] font-extrabold text-white/75">{v.card!.name}</span>
    </div>
  );
}

interface GachaModalProps {
  reward: Reward;
  caseDef: CaseDef;
  onClose: () => void;
}

export default function GachaModal({ reward, caseDef, onClose }: GachaModalProps) {
  const [phase, setPhase] = useState<"spin" | "reveal">("spin");
  const boxRef = useRef<HTMLDivElement>(null);
  const [targetX, setTargetX] = useState(0);

  const strip = useMemo<Visual[]>(() => {
    const arr: Visual[] = Array.from({ length: TOTAL }, randomVisual);
    const win: Visual =
      reward.kind === "card"
        ? { kind: "card", card: reward.card }
        : reward.kind === "boost"
          ? { kind: "boost", mult: reward.mult }
          : { kind: "cash", amount: reward.amount };
    arr[WIN_INDEX] = win;
    return arr;
  }, [reward]);

  useEffect(() => {
    const w = boxRef.current?.clientWidth ?? 640;
    setTargetX(-(WIN_INDEX * STRIDE + CELL_W / 2 - w / 2));
  }, []);

  useEffect(() => {
    if (phase !== "spin") return;
    const iv = setInterval(sfxSpin, 130);
    return () => clearInterval(iv);
  }, [phase]);

  useEffect(() => {
    if (phase !== "reveal") return;
    sfxWin();
    if (reward.kind === "card" && (reward.card.rarity === "epic" || reward.card.rarity === "legend")) {
      const colors = reward.card.rarity === "legend" ? ["#f5c542", "#fff3c4", "#1c69d4"] : ["#c58bff", "#5cb1eb", "#ffffff"];
      confetti({ particleCount: 130, spread: 75, origin: { y: 0.6 }, colors });
      setTimeout(() => confetti({ particleCount: 70, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors }), 250);
      setTimeout(() => confetti({ particleCount: 70, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors }), 400);
    }
  }, [phase, reward]);

  const resultTitle =
    reward.kind === "cash"
      ? "Денежный приз!"
      : reward.kind === "boost"
        ? "Супер-режим!"
        : reward.dup
          ? "Дубликат — в кэш"
          : "Новая карта коллекции!";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-night/85 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.92, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        className="glass-deep w-full max-w-[720px] overflow-hidden rounded-3xl"
      >
        <div className="border-b border-line px-5 py-4">
          <div className="text-[10px] font-black uppercase tracking-[0.25em] text-fuchsia-400">{caseDef.name}</div>
          <div className="font-display text-lg font-black text-white">
            {phase === "spin" ? "Открываем контейнер..." : resultTitle}
          </div>
        </div>

        {phase === "spin" ? (
          <div className="relative py-6">
            <div ref={boxRef} className="relative h-[168px] overflow-hidden">
              <motion.div
                className="absolute left-0 top-0 flex"
                style={{ gap: CELL_GAP, paddingLeft: 0 }}
                initial={{ x: 0 }}
                animate={{ x: targetX }}
                transition={{ duration: 4.6, ease: [0.12, 0.72, 0.06, 1] }}
                onAnimationComplete={() => setPhase("reveal")}
              >
                {strip.map((v, i) => (
                  <div key={i} style={{ width: CELL_W, height: 168 }} className="shrink-0">
                    <Cell v={v} />
                  </div>
                ))}
              </motion.div>
              {/* рамки затемнения */}
              <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-night to-transparent" />
              <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-night to-transparent" />
              {/* указатель */}
              <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-fuchsia-400 to-transparent" />
            </div>
            <div className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2">
              <ChevronDown className="size-6 animate-bounce text-fuchsia-400" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 px-6 py-8">
            {reward.kind === "card" ? (
              <motion.div
                initial={{ scale: 0.4, rotate: -8, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 220, damping: 15 }}
                className="w-52"
              >
                <CardFace card={reward.card} count={1} size="md" />
              </motion.div>
            ) : (
              <motion.div
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 220, damping: 15 }}
                className={`grid size-28 place-items-center rounded-3xl border ${
                  reward.kind === "cash" ? "border-mint/30 bg-mint/10" : "border-gold/30 bg-gold/10"
                }`}
              >
                {reward.kind === "cash" ? <Coins className="size-12 text-mint" /> : <Zap className="size-12 text-gold" />}
              </motion.div>
            )}

            <div className="text-center">
              {reward.kind === "card" ? (
                <>
                  <div
                    className="font-display text-xl font-black"
                    style={{ color: RARITY_META[reward.card.rarity].color }}
                  >
                    {reward.card.name}
                  </div>
                  <div className="mt-1 text-[13px] font-semibold text-white/55">
                    {reward.dup
                      ? `Уже есть в коллекции → +${fmtMoney(reward.dupCash)}`
                      : reward.card.botPct
                        ? `${reward.card.note} · автокликер быстрее на ${Math.round(reward.card.botPct * 100)}% навсегда`
                        : reward.card.critPct
                          ? `${reward.card.note} · шанс крита навсегда выше`
                          : `${reward.card.note} · +${Math.round(reward.card.pct * 100)}% ко всему доходу навсегда`}
                  </div>
                  <div
                    className="mt-2 inline-block rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest"
                    style={{
                      background: `${RARITY_META[reward.card.rarity].color}20`,
                      color: RARITY_META[reward.card.rarity].color,
                    }}
                  >
                    {RARITY_META[reward.card.rarity].label}
                  </div>
                </>
              ) : reward.kind === "cash" ? (
                <>
                  <div className="tabular font-display text-3xl font-black text-mint">+{fmtMoney(reward.amount)}</div>
                  <div className="mt-1 text-[13px] font-semibold text-white/55">Свежая наличка прямо в карман</div>
                </>
              ) : (
                <>
                  <div className="font-display text-3xl font-black text-gold">×{reward.mult} ко всему доходу</div>
                  <div className="mt-1 text-[13px] font-semibold text-white/55">Действует {reward.secs} секунд. Жми активнее!</div>
                </>
              )}
            </div>

            <button
              onClick={onClose}
              className="shine-btn mt-2 rounded-2xl bg-gradient-to-r from-bmw to-bmw-soft px-10 py-3.5 font-display text-sm font-black tracking-wide text-white shadow-[0_10px_35px_-8px_rgba(28,105,212,.8)] transition hover:brightness-110 active:scale-95"
            >
              ЗАБРАТЬ
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
