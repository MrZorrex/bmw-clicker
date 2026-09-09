/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Абсолютный адрес SDK Яндекс Игр для сборки «свой домен (iframe)».
   * Задаётся ТОЛЬКО для iframe-сборки: значение попадает в бандл строкой,
   * поэтому такой билд нельзя загружать в Консоль архивом.
   * В обычной сборке для архива переменная не задаётся — в бандле
   * не остаётся и следа адреса (см. SDK_ABS_URL в src/game/yandex.ts).
   */
  readonly VITE_YA_SDK_FALLBACK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
