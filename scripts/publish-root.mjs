// Кладёт готовую одностраничную сборку игры в корень репозитория:
//   dist/index.html  →  index.html
//
// Корневой index.html — это и есть «один файл игры»: открывается двойным
// кликом (file://) и грузится на Яндекс Игры с полным SDK платформы
// (отдельной офлайн-версии без SDK в проекте больше нет).
//
// Запуск: npm run build (или node scripts/publish-root.mjs после vite build).
import { copyFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const distFile = path.join(root, "dist", "index.html");
const outFile = path.join(root, "index.html");

try {
  const info = await stat(distFile);
  if (!info.isFile()) throw new Error("не файл");
} catch {
  console.error("✖ dist/index.html не найден. Сначала выполните: npx vite build");
  process.exit(1);
}

await copyFile(distFile, outFile);
const sizeMb = ((await stat(outFile)).size / 1024 / 1024).toFixed(2);
console.log(`✔ Готово: корневой index.html (${sizeMb} МБ, один файл со встроенным SDK).`);
console.log("  Открой его двойным кликом — игра запустится и офлайн, и на Яндекс Играх.");
