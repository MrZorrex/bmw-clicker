/**
 * Обёртка над SDK Яндекс Игр.
 * Документация: https://yandex.ru/dev/games/doc/ru/sdk/sdk-about
 *
 * Все вызовы безопасны вне платформы: если SDK недоступен (локальная разработка),
 * методы деградируют до no-op, а сохранения уходят в localStorage.
 */
import { setSoundSuspended } from "./sound";

export interface YaPlayer {
  getUniqueID(): string;
  getName(): string;
  isAuthorized(): boolean;
  setData(data: object, flush?: boolean): Promise<void>;
  getData(keys?: string[]): Promise<Record<string, unknown>>;
}

export interface YaPurchase {
  purchaseToken: string;
  productID: string;
  developerPayload?: string;
}

export interface YaPayments {
  purchase(opts: { id: string; developerPayload?: string }): Promise<YaPurchase>;
  getPurchases(): Promise<YaPurchase[]>;
  consumePurchase(token: string): Promise<void>;
}

export interface YaSdk {
  features?: {
    LoadingAPI?: { ready: () => void };
    GameplayAPI?: { start: () => void; stop: () => void };
  };
  getPlayer(opts?: { scopes?: boolean }): Promise<YaPlayer>;
  getStorage(): Promise<Storage>;
  getPayments?(opts?: { signed?: boolean }): Promise<YaPayments>;
  on(event: string, cb: () => void): void;
  off?(event: string, cb: () => void): void;
  auth?: { openAuthDialog(): Promise<void> };
  environment?: { i18n?: { lang?: string } };
  isAvailableMethod?(name: string): Promise<boolean>;
  adv?: {
    showFullscreenAdv(opts: { callbacks?: FullscreenCallbacks }): void;
    showRewardedVideo(opts: RewardedCallbacks): void;
  };
}

export interface FullscreenCallbacks {
  onOpen?: () => void;
  onClose?: (wasShown?: boolean) => void;
  onError?: (e: unknown) => void;
  onOffline?: () => void;
}

export interface RewardedCallbacks {
  onOpen?: () => void;
  onRewarded?: () => void;
  onClose?: () => void;
  onError?: (e: unknown) => void;
}

declare global {
  interface Window {
    YaGames?: { init(opts?: { signed?: boolean }): Promise<YaSdk> };
  }
}

let ysdk: YaSdk | null = null;
let player: YaPlayer | null = null;
let readyCalled = false;
let gameplayRunning = false;

export const isYandex = () => ysdk !== null;

/** IAP Яндекс Игр. Покупки доступны только на платформе, вне её это no-op. */
export async function buyProduct(productId: string, developerPayload?: string): Promise<YaPurchase | null> {
  try {
    const payments = await ysdk?.getPayments?.({ signed: true });
    return payments ? await payments.purchase({ id: productId, developerPayload }) : null;
  } catch {
    return null;
  }
}

export async function consumeProduct(token: string): Promise<boolean> {
  try {
    const payments = await ysdk?.getPayments?.({ signed: true });
    if (!payments) return false;
    await payments.consumePurchase(token);
    return true;
  } catch {
    return false;
  }
}
export const getPlayerName = () => {
  try {
    return player?.isAuthorized() ? player.getName() : "";
  } catch {
    return "";
  }
};

/** Инициализация SDK. Возвращает true, если платформа доступна. */
export async function initYandex(): Promise<boolean> {
  try {
    if (!window.YaGames) return false;
    ysdk = await window.YaGames.init();

    // Надёжное хранилище вместо localStorage (актуально для iOS, п. «Потеря прогресса на iOS»)
    try {
      const safeStorage = await ysdk.getStorage();
      if (safeStorage) {
        Object.defineProperty(window, "localStorage", { get: () => safeStorage, configurable: true });
      }
    } catch {
      /* используем обычный localStorage */
    }

    try {
      player = await ysdk.getPlayer();
    } catch {
      player = null; // гостевой режим — прогресс останется локальным
    }
    return true;
  } catch {
    ysdk = null;
    return false;
  }
}

/**
 * Требование 1.19.2 — вызывается в момент, когда пользователь может приступить к игре.
 */
export function loadingReady() {
  if (readyCalled) return;
  readyCalled = true;
  try {
    ysdk?.features?.LoadingAPI?.ready();
  } catch {
    /* noop */
  }
}

/** Требование 1.19.3 — разметка геймплея. */
export function gameplayStart() {
  if (gameplayRunning) return;
  gameplayRunning = true;
  try {
    ysdk?.features?.GameplayAPI?.start();
  } catch {
    /* noop */
  }
}

export function gameplayStop() {
  if (!gameplayRunning) return;
  gameplayRunning = false;
  try {
    ysdk?.features?.GameplayAPI?.stop();
  } catch {
    /* noop */
  }
}

/** Требование 1.19.4 — обработка пауз платформы (реклама, сворачивание). */
export function onPlatformPause(pause: () => void, resume: () => void) {
  try {
    ysdk?.on("game_api_pause", pause);
    ysdk?.on("game_api_resume", resume);
  } catch {
    /* noop */
  }
}

// ── Облачные сохранения ──────────────────────────────────────

const CLOUD_KEY = "save";

/** Снимок облачного сохранения, полученный до старта игры. */
let cloudSnapshot: unknown = null;
export const setCloudSnapshot = (v: unknown) => {
  cloudSnapshot = v;
};
export const getCloudSnapshot = () => cloudSnapshot;

export async function cloudLoad<T>(): Promise<T | null> {
  if (!player) return null;
  try {
    const data = await player.getData([CLOUD_KEY]);
    const raw = data?.[CLOUD_KEY];
    if (!raw) return null;
    return (typeof raw === "string" ? JSON.parse(raw) : raw) as T;
  } catch {
    return null;
  }
}

export async function cloudSave(state: unknown, flush = false): Promise<void> {
  if (!player) return;
  try {
    await player.setData({ [CLOUD_KEY]: JSON.stringify(state) }, flush);
  } catch {
    /* сеть недоступна — локальная копия уже сохранена */
  }
}

// ── Реклама ───────────────────────────────────────────────────
// Требование 1.12 + 4.1: монетизация только через SDK Яндекс Игр.

/**
 * Реклама за вознаграждение (Rewarded Video).
 * Звук ставится на паузу на время показа (требование 4.7).
 */
export async function showRewardedVideo(opts: {
  onRewarded: () => void;
  onClose?: () => void;
  onError?: (e: unknown) => void;
}) {
  try {
    if (!ysdk?.adv) throw new Error("adv unavailable");
    ysdk.adv.showRewardedVideo({
      onOpen: () => setSoundSuspended(true),
      onRewarded: opts.onRewarded,
      onClose: () => {
        setSoundSuspended(false);
        opts.onClose?.();
      },
      onError: (e) => {
        setSoundSuspended(false);
        opts.onError?.(e);
      },
    });
  } catch (e) {
    setSoundSuspended(false);
    opts.onError?.(e);
  }
}

/**
 * Полноэкранная реклама (Interstitial). Показывается в логических паузах
 * и не прерывает сразу после запуска.
 */
export async function showInterstitial(opts?: { onClose?: () => void; onError?: (e: unknown) => void }) {
  try {
    if (!ysdk?.adv) throw new Error("adv unavailable");
    ysdk.adv.showFullscreenAdv({
      callbacks: {
        onOpen: () => setSoundSuspended(true),
        onClose: () => {
          setSoundSuspended(false);
          opts?.onClose?.();
        },
        onError: (e) => {
          setSoundSuspended(false);
          opts?.onError?.(e);
        },
      },
    });
  } catch (e) {
    opts?.onError?.(e);
  }
}
