import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AD_COOLDOWN_SECS,
  AUTO_UPGRADES,
  BOT_UPGRADES,
  CARDS,
  CLICK_UPGRADES,
  CRIT_BASE_CHANCE,
  CRIT_BASE_MULT,
  CRIT_UPGRADES,
  MODELS,
  PRESTIGE_BONUS,
  cardsByRarity,
  isUpgradeUnlocked,
  levelTotal,
  type BotUpgradeDef,
  type CardDef,
  type CaseDef,
  type CritUpgradeDef,
  type Rarity,
  type UpgradeDef,
} from "../data/game";
import { setSoundEnabled, sfxBuy, sfxWin } from "./sound";
import { cloudSave, getCloudSnapshot } from "./yandex";

// ─── Типы ────────────────────────────────────────────────────

export interface GameState {
  money: number;
  totalEarned: number;
  clicks: number;
  modelIndex: number;
  clickLv: Record<string, number>;
  autoLv: Record<string, number>;
  botLv: Record<string, number>;
  critLv: Record<string, number>;
  caseOpens: Record<string, number>;
  cards: Record<string, number>;
  boostUntil: number;
  boostMult: number;
  prestige: number;
  adReadyAt: number;
  sound: boolean;
  introSeen: boolean;
  lastSeen: number;
}

export type Reward =
  | { kind: "cash"; amount: number }
  | { kind: "boost"; mult: number; secs: number }
  | { kind: "card"; card: CardDef; dup: boolean; dupCash: number };

const SAVE_KEY = "bmw-perekup-save-v1";

const initialState = (): GameState => ({
  money: 0,
  totalEarned: 0,
  clicks: 0,
  modelIndex: 0,
  clickLv: {},
  autoLv: {},
  botLv: {},
  critLv: {},
  caseOpens: {},
  cards: {},
  boostUntil: 0,
  boostMult: 1,
  prestige: 0,
  adReadyAt: 0,
  sound: true,
  introSeen: false,
  lastSeen: Date.now(),
});

function readLocal(): Partial<GameState> | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as Partial<GameState>) : null;
  } catch {
    return null;
  }
}

/**
 * Прогресс берётся из облака Яндекс Игр (если игрок его имеет) или из локального
 * хранилища — выигрывает более «продвинутое» сохранение. Гостевой режим работает так же.
 */
function loadState(): { state: GameState; isFresh: boolean } {
  const base = initialState();
  const local = readLocal();
  const cloud = getCloudSnapshot() as Partial<GameState> | null;

  let best: Partial<GameState> | null = null;
  if (local && cloud) {
    best = (cloud.totalEarned ?? 0) >= (local.totalEarned ?? 0) ? cloud : local;
  } else {
    best = cloud ?? local;
  }

  if (!best) return { state: base, isFresh: true };

  return {
    state: {
      ...base,
      ...best,
      modelIndex: Math.min(Math.max(0, best.modelIndex ?? 0), MODELS.length - 1),
    },
    isFresh: false,
  };
}

export function upgradeCost(def: { cost: number; growth: number }, lv: number): number {
  return def.cost * Math.pow(def.growth, lv);
}

function sumPct(defs: UpgradeDef[], lv: Record<string, number>) {
  return defs.reduce((acc, d) => acc + levelTotal(d.pct, lv[d.id] ?? 0), 0);
}

function sumBot(defs: BotUpgradeDef[], lv: Record<string, number>) {
  return defs.reduce((acc, d) => acc + levelTotal(d.cps, lv[d.id] ?? 0), 0);
}

// ─── Хук ─────────────────────────────────────────────────────

export function useGame() {
  const loaded = useMemo(loadState, []);
  const [s, setS] = useState<GameState>(loaded.state);

  useEffect(() => {
    setSoundEnabled(s.sound);
  }, [s.sound]);

  const model = MODELS[s.modelIndex];
  const next = MODELS[s.modelIndex + 1] ?? null;

  const cardMult = useMemo(
    () => 1 + CARDS.reduce((acc, c) => acc + c.pct * (s.cards[c.id] ?? 0), 0),
    [s.cards]
  );

  const botSpeedMult = useMemo(
    () => 1 + CARDS.reduce((acc, c) => acc + (c.botPct ?? 0) * (s.cards[c.id] ?? 0), 0),
    [s.cards]
  );

  const prestigeMult = 1 + PRESTIGE_BONUS * s.prestige;
  const boostActive = s.boostUntil > Date.now();
  const boostF = boostActive ? s.boostMult : 1;

  // крит: базовый шанс + прокачка + карты удачи
  const critCardPct = useMemo(
    () => CARDS.reduce((acc, c) => acc + (c.critPct ?? 0) * (s.cards[c.id] ?? 0), 0),
    [s.cards]
  );
  const critChanceDef = CRIT_UPGRADES[0];
  const critPowerDef = CRIT_UPGRADES[1];
  const critChance = Math.min(
    0.75,
    CRIT_BASE_CHANCE + critChanceDef.step * (s.critLv[critChanceDef.id] ?? 0) + critCardPct
  );
  const critMult = CRIT_BASE_MULT + critPowerDef.step * (s.critLv[critPowerDef.id] ?? 0);

  const clickPower = useMemo(
    () => model.base * (1 + sumPct(CLICK_UPGRADES, s.clickLv)) * cardMult * boostF * prestigeMult,
    [model, s.clickLv, cardMult, boostF, prestigeMult]
  );

  const cps = useMemo(
    () => model.base * sumPct(AUTO_UPGRADES, s.autoLv) * cardMult * boostF * prestigeMult,
    [model, s.autoLv, cardMult, boostF, prestigeMult]
  );

  // автокликер
  const botClicksRaw = useMemo(() => sumBot(BOT_UPGRADES, s.botLv), [s.botLv]);
  const botClicks = botClicksRaw * botSpeedMult; // автокликов в секунду
  // автоклики тоже критуют — считаем средний множитель
  const avgCritMult = 1 + critChance * (critMult - 1);
  const botIncome = botClicks * clickPower * avgCritMult; // ₽/с от автокликера

  // оффлайн-доход (однократно при загрузке)
  const offlineGain = useMemo(() => {
    if (loaded.isFresh) return 0;
    const st = loaded.state;
    const m = MODELS[st.modelIndex];
    const cm = 1 + CARDS.reduce((acc, c) => acc + c.pct * (st.cards[c.id] ?? 0), 0);
    const bm = 1 + CARDS.reduce((acc, c) => acc + (c.botPct ?? 0) * (st.cards[c.id] ?? 0), 0);
    const pm = 1 + PRESTIGE_BONUS * (st.prestige ?? 0);
    const clickPow = m.base * (1 + sumPct(CLICK_UPGRADES, st.clickLv)) * cm * pm;
    const autoCps = m.base * sumPct(AUTO_UPGRADES, st.autoLv) * cm * pm;
    const botC = sumBot(BOT_UPGRADES, st.botLv ?? {}) * bm;
    const rate = autoCps + botC * clickPow;
    if (rate <= 0) return 0;
    const secs = Math.min(Math.max(0, (Date.now() - st.lastSeen) / 1000), 8 * 3600);
    return rate * secs * 0.6;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const appliedOffline = useRef(false);
  useEffect(() => {
    if (!appliedOffline.current && offlineGain > 0) {
      appliedOffline.current = true;
      setS((p) => ({ ...p, money: p.money + offlineGain, totalEarned: p.totalEarned + offlineGain }));
    }
  }, [offlineGain]);

  // тик пассивного дохода + автокликер + истечение буста
  const incomeRef = useRef(0);
  incomeRef.current = cps + botIncome;
  useEffect(() => {
    const iv = setInterval(() => {
      setS((p) => {
        const expired = p.boostUntil !== 0 && p.boostUntil <= Date.now();
        const gain = incomeRef.current / 10;
        if (!expired && gain <= 0) return p;
        return {
          ...p,
          money: p.money + gain,
          totalEarned: p.totalEarned + gain,
          boostUntil: expired ? 0 : p.boostUntil,
          boostMult: expired ? 1 : p.boostMult,
        };
      });
    }, 100);
    return () => clearInterval(iv);
  }, []);

  // автосохранение
  const stateRef = useRef(s);
  stateRef.current = s;
  useEffect(() => {
    // локальная копия — часто; облако Яндекс Игр — раз в 20 сек (лимит 100 запросов / 5 мин)
    const save = (toCloud = false, flush = false) => {
      const snapshot = { ...stateRef.current, lastSeen: Date.now() };
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
      } catch { /* noop */ }
      if (toCloud) void cloudSave(snapshot, flush);
    };

    const ivLocal = setInterval(() => save(false), 2500);
    const ivCloud = setInterval(() => save(true), 20_000);

    const onHide = () => {
      if (document.visibilityState === "hidden") save(true, true);
    };
    const onUnload = () => save(true, true);

    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onUnload);
    window.addEventListener("beforeunload", onUnload);

    return () => {
      clearInterval(ivLocal);
      clearInterval(ivCloud);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onUnload);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, []);

  /** Немедленное сохранение после значимых действий (п. 1.9). */
  const saveNow = useCallback(() => {
    const snapshot = { ...stateRef.current, lastSeen: Date.now() };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
    } catch { /* noop */ }
    void cloudSave(snapshot, true);
  }, []);

  const click = useCallback((): { gain: number; crit: boolean } => {
    const crit = Math.random() < critChance;
    const gain = clickPower * (crit ? critMult : 1);
    setS((p) => ({
      ...p,
      money: p.money + gain,
      totalEarned: p.totalEarned + gain,
      clicks: p.clicks + 1,
    }));
    return { gain, crit };
  }, [clickPower, critChance, critMult]);

  const buyNext = useCallback((): boolean => {
    if (!next || s.money < next.price) return false;
    setS((p) => ({
      ...p,
      money: p.money - next.price,
      modelIndex: p.modelIndex + 1,
    }));
    sfxWin();
    return true;
  }, [next, s.money]);

  const buyUpgrade = useCallback(
    (def: UpgradeDef, kind: "click" | "auto"): boolean => {
      const map = kind === "click" ? "clickLv" : "autoLv";
      const chain = kind === "click" ? CLICK_UPGRADES : AUTO_UPGRADES;
      const lvMap = kind === "click" ? s.clickLv : s.autoLv;
      if (!isUpgradeUnlocked(chain, def.id, lvMap)) return false;
      const lv = lvMap[def.id] ?? 0;
      const cost = upgradeCost(def, lv);
      if (s.money < cost) return false;
      setS((p) => ({
        ...p,
        money: p.money - cost,
        [map]: { ...(p as any)[map], [def.id]: lv + 1 },
      }));
      sfxBuy();
      return true;
    },
    [s.money, s.clickLv, s.autoLv]
  );

  const buyBot = useCallback(
    (def: BotUpgradeDef): boolean => {
      if (!isUpgradeUnlocked(BOT_UPGRADES, def.id, s.botLv)) return false;
      const lv = s.botLv[def.id] ?? 0;
      const cost = upgradeCost(def, lv);
      if (s.money < cost) return false;
      setS((p) => ({
        ...p,
        money: p.money - cost,
        botLv: { ...p.botLv, [def.id]: lv + 1 },
      }));
      sfxBuy();
      return true;
    },
    [s.money, s.botLv]
  );

  const buyCrit = useCallback(
    (def: CritUpgradeDef): boolean => {
      if (!isUpgradeUnlocked(CRIT_UPGRADES, def.id, s.critLv)) return false;
      const lv = s.critLv[def.id] ?? 0;
      if (lv >= def.maxLv) return false;
      const cost = upgradeCost(def, lv);
      if (s.money < cost) return false;
      setS((p) => ({
        ...p,
        money: p.money - cost,
        critLv: { ...p.critLv, [def.id]: lv + 1 },
      }));
      sfxBuy();
      return true;
    },
    [s.money, s.critLv]
  );

  /** Каждое открытие делает контейнер дороже — рандом не должен быть бесконечно выгодным. */
  const casePrice = useCallback(
    (c: CaseDef) => {
      const opens = s.caseOpens[c.id] ?? 0;
      return Math.max(c.minPrice, c.mult * model.base) * Math.pow(c.priceGrowth, opens);
    },
    [model, s.caseOpens]
  );

  const rollCase = useCallback(
    (c: CaseDef, free = false): Reward | null => {
      const price = casePrice(c);
      if (!free && s.money < price) return null;

      const w = c.weights;
      const total = w.cash + w.boost + w.common + w.rare + w.epic + w.legend;
      let r = Math.random() * total;
      const pick = (key: keyof typeof w) => {
        if (r < w[key]) return true;
        r -= w[key];
        return false;
      };

      let reward: Reward;
      if (pick("cash")) {
        const amount = model.base * (c.cashMin + Math.random() * (c.cashMax - c.cashMin));
        reward = { kind: "cash", amount };
      } else if (pick("boost")) {
        reward = { kind: "boost", mult: c.boostMult, secs: c.boostSecs };
      } else {
        let rarity: Rarity = "common";
        if (pick("common")) rarity = "common";
        else if (pick("rare")) rarity = "rare";
        else if (pick("epic")) rarity = "epic";
        else rarity = "legend";
        const pool = cardsByRarity(rarity);
        const card = pool[Math.floor(Math.random() * pool.length)];
        const dup = (s.cards[card.id] ?? 0) > 0;
        reward = { kind: "card", card, dup, dupCash: dup ? price * (0.8 + Math.random()) : 0 };
      }

      // применяем награду сразу, модалка — только шоу
      setS((p) => {
        const st = {
          ...p,
          money: free ? p.money : p.money - price,
          // бесплатные контейнеры за рекламу не удорожают платные
          caseOpens: free ? p.caseOpens : { ...p.caseOpens, [c.id]: (p.caseOpens[c.id] ?? 0) + 1 },
        };
        if (reward.kind === "cash") {
          st.money += reward.amount;
          st.totalEarned += reward.amount;
        } else if (reward.kind === "boost") {
          st.boostMult = reward.mult;
          st.boostUntil = Date.now() + reward.secs * 1000;
        } else {
          if (reward.dup) {
            st.money += reward.dupCash;
            st.totalEarned += reward.dupCash;
          } else {
            st.cards = { ...p.cards, [reward.card.id]: (p.cards[reward.card.id] ?? 0) + 1 };
          }
        }
        return st;
      });

      if (!free) sfxBuy();
      return reward;
    },
    [s.money, s.cards, model, casePrice]
  );

  const completeAdWatch = useCallback(() => {
    setS((p) => ({ ...p, adReadyAt: Date.now() + AD_COOLDOWN_SECS * 1000 }));
  }, []);

  const canPrestige = s.modelIndex === MODELS.length - 1;

  const prestigeReset = useCallback(() => {
    setS((p) => ({
      ...initialState(),
      sound: p.sound,
      introSeen: true,
      prestige: p.prestige + 1,
    }));
    sfxWin();
  }, []);

  const toggleSound = useCallback(() => setS((p) => ({ ...p, sound: !p.sound })), []);
  const markIntroSeen = useCallback(() => setS((p) => ({ ...p, introSeen: true })), []);

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch { /* noop */ }
    setS(initialState());
  }, []);

  const totalCardPct = useMemo(
    () => CARDS.reduce((acc, c) => acc + c.pct * (s.cards[c.id] ?? 0), 0),
    [s.cards]
  );

  return {
    s,
    model,
    next,
    cardMult,
    totalCardPct,
    clickPower,
    cps,
    botClicks,
    botIncome,
    botSpeedMult,
    critChance,
    critMult,
    boostActive,
    prestigeMult,
    canPrestige,
    offlineGain,
    isFresh: loaded.isFresh,
    click,
    saveNow,
    buyNext,
    buyUpgrade,
    buyBot,
    buyCrit,
    rollCase,
    casePrice,
    completeAdWatch,
    prestigeReset,
    toggleSound,
    markIntroSeen,
    reset,
  };
}
