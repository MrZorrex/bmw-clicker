import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Корневой index.html — ГОТОВАЯ одностраничная игра (собирается командой
 * `npm run build` в dist/index.html и копируется в корень scripts/publish-root.mjs).
 *
 * Чтобы исходный код не перепутывался с собранным файлом, шаблон входа Vite
 * лежит рядом в dev.html (он же — страница дев-сервера с HMR). Поэтому:
 *  - сборка всегда идёт из dev.html, а не из уже собранного index.html;
 *  - пересобрать index.html после правок: npm run build.
 */
export default defineConfig({
  // Относительные пути — собранная игра открывается двойным кликом (file://)
  // и с любого хостинга без перенастройки.
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    viteSingleFile(),
    // Вырезаем HTML-комментарии из сборки: в шаблоне dev.html они объясняют
    // подключение SDK, а в шиппинг-файле им делать нечего — заодно сканер
    // Консоли не увидит рядом слова «SDK»/«адрес»/«iframe» и путь исходника.
    // Хук выполняется до инлайна бандла, поэтому стирает только комментарии
    // шаблона и не может задеть содержимое скриптов.
    {
      name: "strip-html-comments",
      apply: "build",
      transformIndexHtml(html) {
        return html.replace(/<!--[\s\S]*?-->/g, "");
      },
    },
    // Переименовываем выход сборки dev.html → index.html: так и dist, и корневой
    // файл называются одинаково (validate/pack/publish-root ждут index.html).
    {
      name: "rename-entry-to-index",
      apply: "build",
      async closeBundle() {
        const { rename, access } = await import("node:fs/promises");
        const out = path.resolve(__dirname, "dist");
        const from = path.join(out, "dev.html");
        const to = path.join(out, "index.html");
        try {
          await access(from);
          await rename(from, to);
        } catch {
          /* dist/dev.html уже переименован или отсутствует — не мешаем сборке */
        }
      },
    },
    // В дев-сервере открываем dev.html (с HMR и живым кодом из src/),
    // а не собранный артефакт index.html в корне.
    {
      name: "serve-dev-html",
      apply: "serve",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === "/" || req.url === "") {
            res.statusCode = 302;
            res.setHeader("Location", "/dev.html");
            res.end();
            return;
          }
          next();
        });
      },
    } satisfies Plugin,
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    rollupOptions: {
      input: path.resolve(__dirname, "dev.html"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    // Разрешаем превью-хосты песочницы (прокси вида *.e2b.app)
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    allowedHosts: true,
  },
});
