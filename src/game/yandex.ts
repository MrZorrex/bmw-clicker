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

/** Товар из каталога Консоли разработчика (payments.getCatalog). */
export interface YaProduct {
  id: string;
  title: string;
  description: string;
  imageURI: string;
  price: string; // "<цена> <код валюты>"
  priceValue: string;
  priceCurrencyCode: string;
  getPriceCurrencyImage(size: "small" | "medium" | "svg"): string;
}

export interface YaPayments {
  purchase(opts: { id: string; developerPayload?: string }): Promise<YaPurchase>;
  getPurchases(): Promise<YaPurchase[] | { signature: string }>;
  consumePurchase(token: string): Promise<void>;
  getCatalog(): Promise<YaProduct[]>;
}

export interface YaSdk {
  features?: {
    LoadingAPI?: { ready: () => void };
    GameplayAPI?: { start: () => void; stop: () => void };
  };
  getPlayer(opts?: { scopes?: boolean }): Promise<YaPlayer>;
  getStorage(): Promise<Storage>;
  getPayments?(opts?: { signed?: boolean }): Promise<YaPayments>;
  /** Объект покупок доступен и напрямую — лениво инициализируется при первом вызове. */
  payments?: YaPayments;
  on(event: string, cb: () => void): void;
  off?(event: string, cb: () => void): void;
  /** Имена платформенных событий (HISTORY_BACK, EXIT, ACCOUNT_SELECTION_DIALOG_*). */
  EVENTS?: Record<string, string>;
  dispatchEvent?(eventName: string, detail?: object): Promise<unknown>;
  auth?: { openAuthDialog(): Promise<void> };
  environment?: { i18n?: { lang?: string; tld?: string } };
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

/**
 * Про подключение SDK: на сервере Яндекса SDK уже подключён тегом
 * `<script src="/sdk.js">` в index.html (см. шаблон dev.html). Если глобала
 * `YaGames` нет (локальная разработка, двойной клик по файлу), игра честно
 * уходит в офлайн-режим — динамической догрузки SDK по абсолютному адресу
 * в коде НЕТ специально: Консоль отклоняет архив с адресом внутреннего
 * хранилища сервиса (S3) в любом виде — ни цельной строкой, ни по частям
 * («Файл содержит URL-адрес внутреннего хранилища сервиса» /
 * «Обнаружена ссылка на сервисное хранилище»). Для интеграции «свой домен
 * (iframe)» абсолютный адрес из документации ставится обычным тегом
 * `<script>` в хостинг-HTML на своём домене, а не в исходниках игры.
 */

/**
 * Промис с таймаутом: висящий вызов SDK не должен вешать старт игры.
 * Без этого при зависшем `YaGames.init()` видна только заглушка «Прогреваем
 * мотор», `LoadingAPI.ready()` не вызывается — и платформа фиксирует
 * «SDK некорректно встроено» (п. 1.1).
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`ysdk-timeout: ${label}`)), ms);
  });
  const raced = Promise.race([promise, timeout]) as Promise<T>;
  // `finally` создаёт новый промис — возвращаем его, чтобы таймер точно снимался.
  return raced.finally(() => clearTimeout(timer));
}

/**
 * Проверяет наличие `window.YaGames` (тег `/sdk.js` из index.html).
 * Динамической догрузки SDK здесь нет специально (см. комментарий выше):
 * абсолютному адресу внутреннего хранилища не место в сборке для архива.
 */
async function ensureSdkScript(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  return !!window.YaGames;
}

let ysdk: YaSdk | null = null;
let player: YaPlayer | null = null;
let readyCalled = false;
let gameplayRunning = false;

/**
 * Код языка интерфейса платформы (ISO 639-1: 'ru', 'en', ...).
 * Читается строго при запуске — так работает автоопределение языка (п. 2.14):
 * индикатор I18N на debug-панели зеленеет именно в момент чтения
 * ysdk.environment.i18n.lang на старте, а не в процессе игры.
 */
let sdkLang: string | null = null;
let langResolved = false;
export const getSdkLang = () => sdkLang;

type LangListener = (lang: string | null) => void;
const langListeners = new Set<LangListener>();

/** Вызывает подписчиков ровно один раз — сразу после чтения языка. */
function emitSdkLang() {
  if (!langResolved) return;
  for (const cb of [...langListeners]) {
    try {
      cb(sdkLang);
    } catch {
      /* чужой колбэк не должен ломать инициализацию SDK */
    }
  }
  langListeners.clear();
}

/**
 * Подписка на код языка платформы (п. 2.14). Нужен, чтобы применить язык в ту
 * же секунду, как SDK его вернул, — не дожидаясь хранилища, игрока и облачных
 * сохранений. Если язык уже известен (или платформы нет вовсе) — колбэк
 * выполняется сразу, поэтому старт игры никогда не ждёт Яндекс Игры бесконечно.
 */
export function onSdkLang(cb: LangListener): () => void {
  if (langResolved) {
    try {
      cb(sdkLang);
    } catch {
      /* noop */
    }
    return () => {};
  }
  langListeners.add(cb);
  return () => langListeners.delete(cb);
}

export const isYandex = () => ysdk !== null;

// ── Инап-покупки ───────────────────────────────────────────────
// Обработка платежей — на клиенте (сервера у игры нет), поэтому по доке
// getPayments() вызывается БЕЗ параметра signed: данные приходят в открытом
// виде. Покупки доступны только на платформе; вне её — безопасный no-op.

let paymentsMod: YaPayments | null = null;
let paymentsTried = false;

/** Ленивая инициализация модуля покупок. null — покупки недоступны. */
export async function getPaymentsModule(): Promise<YaPayments | null> {
  if (paymentsMod) return paymentsMod;
  if (!ysdk || paymentsTried) return paymentsMod;
  paymentsTried = true; // не дёргаем инициализацию повторно
  try {
    paymentsMod = ysdk.getPayments
      ? await withTimeout(ysdk.getPayments(), 6000, "payments")
      : (ysdk.payments ?? null);
  } catch {
    paymentsMod = ysdk.payments ?? null;
  }
  return paymentsMod;
}

/** Каталог товаров из Консоли разработчика — источник цены и валюты (п. 1.13.2). */
export async function getCatalog(): Promise<YaProduct[]> {
  try {
    const p = await getPaymentsModule();
    return p ? await p.getCatalog() : [];
  } catch {
    return [];
  }
}

/** Покупки игрока (для проверки необработанных покупок, п. 1.13.1). */
export async function listPurchases(): Promise<YaPurchase[]> {
  try {
    const p = await getPaymentsModule();
    if (!p) return [];
    const res = await p.getPurchases();
    return Array.isArray(res) ? res : [];
  } catch {
    return [];
  }
}

export async function buyProduct(productId: string, developerPayload?: string): Promise<YaPurchase | null> {
  try {
    const p = await getPaymentsModule();
    return p ? await p.purchase({ id: productId, developerPayload }) : null;
  } catch {
    // игрок закрыл окно оплаты, не авторизован, нет средств и т. д.
    return null;
  }
}

export async function consumeProduct(token: string): Promise<boolean> {
  try {
    const p = await getPaymentsModule();
    if (!p) return false;
    await p.consumePurchase(token);
    return true;
  } catch {
    return false;
  }
}

/** Авторизация через Яндекс ID — только по явному действию игрока (п. 1.2.1). */
export async function openAuthDialog(): Promise<boolean> {
  try {
    if (!ysdk?.auth) return false;
    await ysdk.auth.openAuthDialog();
    try {
      player = await ysdk!.getPlayer();
    } catch {
      /* noop */
    }
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

export const isPlayerAuthorized = () => {
  try {
    return !!player?.isAuthorized();
  } catch {
    return false;
  }
};

/**
 * Инициализация SDK. Возвращает true, если платформа доступна.
 * Язык платформы (п. 2.14) читается и раздаётся подписчикам до всего остального.
 *
 * Идемпотентна: повторные вызовы возвращают тот же промис — двойного
 * `YaGames.init()` не бывает (п. 1.1). Каждый шаг ограничен таймаутом,
 * чтобы висящая сеть не вешала старт игры (см. withTimeout).
 */
let initPromise: Promise<boolean> | null = null;
export function initYandex(): Promise<boolean> {
  if (!initPromise) initPromise = doInitYandex();
  return initPromise;
}

async function doInitYandex(): Promise<boolean> {
  try {
    // Единый файл игры (index.html) открывается и двойным кликом (file://),
    // и на любом хостинге как обычная страница. Платформы там нет в принципе:
    // SDK с file:// недоступен, а YaGames.init() без родительского iframe Яндекса
    // некому отвечать. Не дёргаем сеть и не ждём таймауты — сразу честный
    // офлайн-режим (localStorage, язык по сейву/браузеру). Внутри iframe
    // Яндекс Игр (сам черновик, превью с debug-панелью, свой домен через iframe)
    // проверка не срабатывает — SDK инициализируется как обычно (/sdk.js, п. 1.1).
    let inIframe = false;
    try {
      inIframe = typeof window !== "undefined" && window.self !== window.top;
    } catch {
      inIframe = true; // доступ к top закрыт — вероятно, платформенный iframe
    }
    const onDisk = typeof location !== "undefined" && location.protocol === "file:";
    if (onDisk || !inIframe) {
      ysdk = null;
      langResolved = true;
      emitSdkLang();
      return false;
    }
    // Скрипт /sdk.js должен быть загружен ДО YaGames.init() (п. 1.1):
    // сначала тег в index.html, при его отсутствии — динамическая догрузка.
    const hasSdk = await ensureSdkScript();
    if (!hasSdk || !window.YaGames) {
      // Платформы нет (локальная разработка, ПК-сборка) — язык резолвится по браузеру.
      langResolved = true;
      emitSdkLang();
      return false;
    }
    ysdk = await withTimeout(window.YaGames.init(), 7000, "init");

    // Автоопределение языка при запуске (п. 2.14). Читаем ПЕРВЫМ делом — сразу
    // после init(), до хранилища и getPlayer(): индикатор I18N на debug-панели
    // должен стать зелёным на старте. Читаем всегда — даже если игрок раньше
    // сохранял свой выбор: решение «уважать сейв или автоопределение» принимает
    // resolveStartLang(), а факт обращения к SDK должен состояться при запуске.
    try {
      sdkLang = ysdk.environment?.i18n?.lang ?? null;
    } catch {
      sdkLang = null;
    }
    langResolved = true;
    emitSdkLang();

    // Надёжное хранилище вместо localStorage (актуально для iOS, п. «Потеря прогресса на iOS»)
    try {
      const safeStorage = await withTimeout(ysdk.getStorage(), 4000, "storage");
      if (safeStorage) {
        Object.defineProperty(window, "localStorage", { get: () => safeStorage, configurable: true });
      }
    } catch {
      /* используем обычный localStorage */
    }

    try {
      player = await withTimeout(ysdk.getPlayer(), 4000, "player");
    } catch {
      player = null; // гостевой режим — прогресс останется локальным
    }
    return true;
  } catch {
    ysdk = null;
    langResolved = true; // язык не пришёл — пусть работает резервный (браузер/сейв)
    emitSdkLang();
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

// ── Смена игрового аккаунта ──────────────────────────────────
// У игрока может быть два прогресса (гостевой и под логином) — платформа
// показывает диалог выбора. Пока он открыт, облачную синхронизацию ставим
// на паузу; после закрытия игра перезапрашивает игрока (см. App).

let accountDialogOpen = false;

/** Подписка на открытие/закрытие диалога выбора аккаунта. */
export function onAccountDialog(onOpen: () => void, onClose: () => void) {
  try {
    const ev = ysdk?.EVENTS;
    if (!ysdk || !ev?.ACCOUNT_SELECTION_DIALOG_OPENED || !ev?.ACCOUNT_SELECTION_DIALOG_CLOSED) return;
    ysdk.on(ev.ACCOUNT_SELECTION_DIALOG_OPENED, () => {
      accountDialogOpen = true;
      onOpen();
    });
    ysdk.on(ev.ACCOUNT_SELECTION_DIALOG_CLOSED, () => {
      accountDialogOpen = false;
      onClose();
    });
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
    const data = await withTimeout(player.getData([CLOUD_KEY]), 5000, "cloud-load");
    const raw = data?.[CLOUD_KEY];
    if (!raw) return null;
    return (typeof raw === "string" ? JSON.parse(raw) : raw) as T;
  } catch {
    return null;
  }
}

export async function cloudSave(state: unknown, flush = false): Promise<void> {
  if (!player || accountDialogOpen) return;
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
    const cbs: RewardedCallbacks = {
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
    };
    // Передаём колбэки и плоско, и вложенно в `callbacks`: в разных версиях
    // документации фигурируют обе формы — так обработчики сработают в любом случае.
    ysdk.adv.showRewardedVideo({ ...cbs, callbacks: { ...cbs } } as never);
  } catch (e) {
    setSoundSuspended(false);
    opts.onError?.(e);
  }
}

/**
 * Полноэкранная реклама (Interstitial). Показывается в логических паузах
 * (после значимых событий, не по «голому» таймеру — антифрод РСЯ) и не
 * прерывает игру сразу после запуска. onClose получает wasShown.
 */
export async function showInterstitial(opts?: {
  onClose?: (wasShown?: boolean) => void;
  onError?: (e: unknown) => void;
}) {
  try {
    if (!ysdk?.adv) throw new Error("adv unavailable");
    ysdk.adv.showFullscreenAdv({
      callbacks: {
        onOpen: () => setSoundSuspended(true),
        onClose: (wasShown?: boolean) => {
          setSoundSuspended(false);
          opts?.onClose?.(wasShown);
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
