import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import confetti from "canvas-confetti";
import { Bot, Coins, Dices, MousePointerClick, Sparkles, Star, TrendingUp, X } from "lucide-react";
import Header from "./components/Header";
import Timeline from "./components/Timeline";
import CarStage from "./components/CarStage";
import Shop from "./components/Shop";
import GachaModal from "./components/GachaModal";
import UnlockModal from "./components/UnlockModal";
import { useGame, type Reward } from "./game/useGame";
import { CASES, MODELS, PRESTIGE_BONUS, type CarModel, type CaseDef } from "./data/game";
import { fmtMoney } from "./game/format";
import { setSoundSuspended, sfxFail } from "./game/sound";
import {
  gameplayStart,
  gameplayStop,
  isYandex,
  loadingReady,
  onPlatformPause,
  showInterstitial,
  showRewardedVideo,
} from "./game/yandex";

/** Монетизация обязательна для публикации (требование 1.12). */
export const ADS_ENABLED = true;
const adsActive = ADS_ENABLED && isYandex();

export default function App() {
  const game = useGame();
  const { s } = game;

  const [unlock, setUnlock] = useState<CarModel | null>(null);
  const [gacha, setGacha] = useState<{ reward: Reward; caseDef: CaseDef } | null>(null);
  const [prestigeOpen, setPrestigeOpen] = useState(false);
  const [showOffline, setShowOffline] = useState(game.offlineGain > 0);
  const [showIntro, setShowIntro] = useState(!game.s.introSeen);

  // ── SDK Яндекс Игр: готовность, разметка геймплея, паузы ──
  useEffect(() => {
    loadingReady(); // п. 1.19.2 — игра готова к взаимодействию
    return () => gameplayStop();
  }, []);

  useEffect(() => {
    // геймплей идёт, когда не открыто ни одно модальное окно
    const inMenu = showIntro || prestigeOpen || !!unlock || !!gacha;
    if (inMenu) gameplayStop();
    else gameplayStart();
  }, [showIntro, prestigeOpen, unlock, gacha]);

  useEffect(() => {
    // п. 1.3 — при потере фокуса звук останавливается
    const suspend = () => setSoundSuspended(true);
    const resume = () => setSoundSuspended(false);
    const onVis = () => (document.visibilityState === "hidden" ? suspend() : resume());

    window.addEventListener("blur", suspend);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", onVis);
    onPlatformPause(suspend, resume); // п. 1.19.4

    // п. 1.6.2.7 — контекстное меню не открывается по игровому полю
    const onCtx = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", onCtx);

    return () => {
      window.removeEventListener("blur", suspend);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("contextmenu", onCtx);
    };
  }, []);

  // предзагрузка следующих машин
  useEffect(() => {
    for (let i = 1; i <= 2; i++) {
      const m = MODELS[s.modelIndex + i];
      if (m) {
        const im = new Image();
        im.src = m.img;
      }
    }
  }, [s.modelIndex]);

  const buyNext = useCallback(() => {
    const nextModel = game.next;
    if (game.buyNext() && nextModel) {
      setUnlock(nextModel);
      game.saveNow(); // п. 1.9 — прогресс фиксируется сразу после значимого действия
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.next, game.s.money, game.saveNow]);

  // Полноэкранная реклама в логических паузах (требование 4.4):
  // не чаще раза в 4 минуты и только когда на экране нет модалок.
  const lastInterstitial = useRef(Date.now());
  useEffect(() => {
    if (!adsActive) return;
    const iv = setInterval(() => {
      if (showIntro || unlock || gacha || prestigeOpen) return;
      if (Date.now() - lastInterstitial.current < 4 * 60_000) return;
      lastInterstitial.current = Date.now();
      void showInterstitial();
    }, 60_000);
    return () => clearInterval(iv);
  }, [showIntro, unlock, gacha, prestigeOpen]);

  const openCase = useCallback(
    (c: CaseDef) => {
      const r = game.rollCase(c);
      if (r) setGacha({ reward: r, caseDef: c });
      else sfxFail();
    },
    [game.rollCase]
  );

  // Rewarded Video: смотрит рекламу Яндекса → получает бесплатный контейнер (требование 4.5).
  const watchAd = useCallback(() => {
    if (!adsActive || Date.now() < game.s.adReadyAt) return;
    void showRewardedVideo({
      onRewarded: () => {
        game.completeAdWatch();
        const freeCase = CASES[0];
        const r = game.rollCase(freeCase, true);
        if (r) setGacha({ reward: r, caseDef: freeCase });
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.s.adReadyAt, game.completeAdWatch, game.rollCase]);

  const doPrestige = useCallback(() => {
    game.prestigeReset();
    setPrestigeOpen(false);
    setUnlock(null);
    setGacha(null);
    game.saveNow();
    confetti({ particleCount: 160, spread: 90, origin: { y: 0.5 }, colors: ["#f5c542", "#ffffff", "#1c69d4"] });
  }, [game]);

  const reset = useCallback(() => {
    if (window.confirm("Сбросить весь прогресс (включая круги и бонусы) и начать с Dixi 1928 года?")) {
      game.reset();
      setUnlock(null);
      setGacha(null);
      setShowOffline(false);
      setPrestigeOpen(false);
      setShowIntro(true);
    }
  }, [game]);

  useEffect(() => {
    if (!showOffline) return;
    const t = setTimeout(() => setShowOffline(false), 8000);
    return () => clearTimeout(t);
  }, [showOffline]);

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden">
      <div className="noise-overlay" />

      {/* фоновое свечение */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-40 left-1/4 size-[520px] rounded-full bg-bmw/10 blur-[140px]" />
        <div className="absolute -bottom-40 right-1/5 size-[460px] rounded-full bg-fuchsia-900/15 blur-[140px]" />
      </div>

      <div className="shrink-0">
        <Header
          money={s.money}
          clickPower={game.clickPower}
          cps={game.cps}
          botClicks={game.botClicks}
          botIncome={game.botIncome}
          critChance={game.critChance}
          critMult={game.critMult}
          prestige={s.prestige}
          modelName={game.model.name}
          modelBase={game.model.base}
          cardPct={game.totalCardPct}
          botSpeedMult={game.botSpeedMult}
          clickLevels={Object.values(s.clickLv).reduce((a, b) => a + b, 0)}
          autoLevels={Object.values(s.autoLv).reduce((a, b) => a + b, 0)}
          boostActive={game.boostActive}
          boostMult={s.boostMult}
          boostUntil={s.boostUntil}
          sound={s.sound}
          onToggleSound={game.toggleSound}
          onReset={reset}
        />
        <Timeline modelIndex={s.modelIndex} />
      </div>

      {/* Игровое поле: собственная прокрутка на мобильных, без прокрутки страницы */}
      <main className="relative z-10 min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain lg:overflow-hidden">
        <div className="mx-auto grid h-full max-w-[1600px] content-start gap-3 p-3 sm:gap-4 sm:p-4 lg:grid-cols-[minmax(0,1fr)_400px] lg:content-stretch xl:grid-cols-[minmax(0,1fr)_440px]">
          <CarStage
            model={game.model}
            next={game.next}
            money={s.money}
            modelIndex={s.modelIndex}
            botIncome={game.botIncome}
            cps={game.cps}
            critChance={game.critChance}
            critMult={game.critMult}
            prestige={s.prestige}
            canPrestige={game.canPrestige}
            sound={s.sound}
            onClick={game.click}
            onBuyNext={buyNext}
            onPrestige={() => setPrestigeOpen(true)}
          />
          <Shop game={game} onBuyNext={buyNext} onOpenCase={openCase} onWatchAd={watchAd} adsEnabled={adsActive} />
        </div>
      </main>

      {/* модалки */}
      <AnimatePresence>
        {gacha && <GachaModal key="gacha" reward={gacha.reward} caseDef={gacha.caseDef} onClose={() => setGacha(null)} />}
        {unlock && <UnlockModal key={unlock.id} model={unlock} onClose={() => setUnlock(null)} />}
        {prestigeOpen && (
          <PrestigeModal
            key="prestige"
            prestige={s.prestige}
            onConfirm={doPrestige}
            onClose={() => setPrestigeOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* оффлайн-бонус */}
      <AnimatePresence>
        {showOffline && !showIntro && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            className="glass fixed bottom-4 left-4 z-40 flex max-w-xs items-center gap-3 rounded-2xl p-4 shadow-2xl"
          >
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-mint/15 text-mint">
              <Coins className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[12px] font-extrabold text-white">Пока вас не было</div>
              <div className="tabular text-[12px] font-bold text-mint">+{fmtMoney(game.offlineGain)} заработано</div>
            </div>
            <button
              onClick={() => setShowOffline(false)}
              className="ml-auto grid size-7 shrink-0 place-items-center rounded-lg text-white/40 transition hover:bg-white/10 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* интро */}
      <AnimatePresence>
        {showIntro && (
          <IntroModal
            onStart={() => {
              game.markIntroSeen();
              setShowIntro(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Модалка престижа ────────────────────────────────────────

function PrestigeModal({
  prestige,
  onConfirm,
  onClose,
}: {
  prestige: number;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const current = Math.round(prestige * PRESTIGE_BONUS * 100);
  const next = Math.round((prestige + 1) * PRESTIGE_BONUS * 100);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-night/90 p-4 backdrop-blur-lg"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.88, y: 30 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20, opacity: 0 }}
        transition={{ type: "spring", stiffness: 240, damping: 22 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-deep my-auto w-full max-w-[480px] overflow-hidden rounded-3xl"
      >
        <div className="flex flex-col items-center gap-3 border-b border-line bg-gradient-to-b from-gold/10 to-transparent px-6 pb-6 pt-8 text-center">
          <motion.div
            initial={{ rotate: -20, scale: 0.5 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 12, delay: 0.1 }}
            className="grid size-16 place-items-center rounded-3xl border border-gold/30 bg-gold/15"
          >
            <Star className="size-8 text-gold" />
          </motion.div>
          <h2 className="font-display text-xl font-black text-white">ПРОДАТЬ КОЛЛЕКЦИЮ?</h2>
          <p className="max-w-sm text-[12.5px] font-medium leading-relaxed text-white/55">
            Весь гараж, прокачка и карты удачи сгорают. Но ты получишь звание{" "}
            <span className="font-bold text-gold">«Опытный коллекционер»</span> и постоянный бонус на новый круг.
          </p>
        </div>

        <div className="space-y-3 p-5">
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <span className="text-[12px] font-bold text-white/50">Текущий бонус дохода</span>
            <span className="tabular font-display text-sm font-black text-white/70">+{current}%</span>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-gold/25 bg-gold/[0.07] px-4 py-3">
            <span className="flex items-center gap-1.5 text-[12px] font-bold text-gold">
              <Sparkles className="size-3.5" /> После нового круга
            </span>
            <span className="tabular font-display text-base font-black text-gold">+{next}%</span>
          </div>
          <p className="px-1 text-[10.5px] font-medium leading-relaxed text-white/30">
            Бонус суммируется с каждым следующим кругом и умножает всё: клик, пассивный доход и автокликер.
          </p>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={onClose}
              className="rounded-2xl border border-white/10 bg-white/5 py-3.5 font-display text-[12px] font-black tracking-wide text-white/60 transition hover:bg-white/10"
            >
              ОСТАТЬСЯ
            </button>
            <button
              onClick={onConfirm}
              className="shine-btn rounded-2xl bg-gradient-to-r from-amber-500 to-gold py-3.5 font-display text-[12px] font-black tracking-wide text-night shadow-[0_10px_35px_-8px_rgba(245,197,66,.7)] transition hover:brightness-110 active:scale-[0.98]"
            >
              НОВЫЙ КРУГ
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Интро ───────────────────────────────────────────────────

function IntroModal({ onStart }: { onStart: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-night/90 p-4 backdrop-blur-lg"
    >
      <motion.div
        initial={{ scale: 0.9, y: 30 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 240, damping: 22 }}
        className="glass-deep my-auto w-full max-w-[520px] overflow-hidden rounded-3xl"
      >
        <div className="relative h-36 overflow-hidden sm:h-44">
          <img src={MODELS[0].img} alt="BMW 3/15 Dixi" className="size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0e14] via-[#0a0e14]/30 to-transparent" />
          <div className="m-stripes absolute left-5 top-5 h-1.5 w-24 rounded-full" />
          <div className="absolute bottom-4 left-5 right-5">
            <h1 className="font-display text-2xl font-black text-white sm:text-3xl">ПЕРЕКУП BMW</h1>
            <p className="text-[12px] font-bold text-white/60">1928 → 2026 · вся история марки в твоём гараже</p>
          </div>
        </div>

        <div className="space-y-2.5 p-5 sm:p-6">
          {[
            { icon: MousePointerClick, text: "Кликай или тапай по машине — так ты зарабатываешь на торге" },
            { icon: TrendingUp, text: "Прокачивай клик, пассив и автокликер, который работает за тебя" },
            { icon: Coins, text: "Выкупай всё более новые модели — от Dixi до Neue Klasse" },
            { icon: Dices, text: "Испытай удачу: контейнеры с кэшем, бустами и редкими легендами" },
            { icon: Bot, text: "Собери всю коллекцию — и начни новый круг с весомым бонусом" },
          ].map((b, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.08 }}
              className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-2.5 sm:p-3"
            >
              <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-bmw/15 text-bmw-soft">
                <b.icon className="size-4.5" />
              </div>
              <span className="text-[12.5px] font-semibold text-white/70">{b.text}</span>
            </motion.div>
          ))}

          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            onClick={onStart}
            className="shine-btn mt-2 w-full rounded-2xl bg-gradient-to-r from-bmw to-bmw-soft py-4 font-display text-sm font-black tracking-wide text-white shadow-[0_10px_35px_-8px_rgba(28,105,212,.8)] transition hover:brightness-110 active:scale-[0.98]"
          >
            НАЧАТЬ ТОРГ
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
