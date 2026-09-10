// Проверка многофайловой сборки для Яндекс Игр перед загрузкой в Консоль.
//
// Ловит причины отказа «Не встроено или некорректно встроено SDK» (п. 1.1),
// «Файл содержит URL-адрес внутреннего хранилища сервиса» и замечание
// «Обнаружена ссылка на сервисное хранилище» заранее, а не через модерацию:
//
//   node scripts/validate-yandex.mjs            — проверить dist/
//   node scripts/validate-yandex.mjs --zip publish/bmw-clicker-yandex.zip
//                                              — дополнительно проверить архив
//
// Использование: npm run build:yandex (сборка + проверки + упаковка).
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const distDir = path.join(root, "dist");
const publicDir = path.join(root, "public");

const failures = [];
const passes = [];

function check(name, ok, hint = "") {
  if (ok) passes.push(name);
  else failures.push(hint ? `${name} — ${hint}` : name);
}

function report() {
  for (const p of passes) console.log(`  ✔ ${p}`);
  if (failures.length > 0) {
    console.log("");
    for (const f of failures) console.log(`  ✖ ${f}`);
    console.log(`\nПроверка НЕ пройдена: ${failures.length} проблем(ы).`);
    process.exit(1);
  }
  console.log(`\nВсе проверки пройдены (${passes.length}). Можно грузить в Консоль Яндекс Игр.`);
  process.exit(0);
}

// ── Фрагменты адреса внутреннего хранилища (дефангированы!) ──────
// ВАЖНО: сам файл валидатора обязан быть чистым под сканером Консоли —
// его могут упаковать в архив по ошибке вместе с игрой, и цельные строки
// дали бы ложный отказ. Поэтому фрагменты хранятся с вкраплениями "1"
// (этой цифры нет в host-именах) и чистятся в рантайме: ни сырые куски,
// ни host целиком, ни его нормализованная форма в файле не встречаются.
// Короткое сочетание (буква s + цифра 3) и ключи fallback-механизма тоже
// собираются из кусков. Проверка №0 доказывает чистоту сканом самого файла.
const deFang = (s) => s.replace(/1/g, "");
const STORAGE_FRAGMENTS = [
  "s1d1k1.1g1a1m1e1s1.1s131.1y1a1n1d1e1x1.1n1e1t1",
  "s1d1k1.1g1a1m1e1s1.1s131",
  "g1a1m1e1s1.1s131.1y1a1n1d1e1x1",
  "s131.1y1a1n1d1e1x1.1n1e1t1",
  "s1d1k1.1g1a1m1e1s1",
  "g1a1m1e1s1.1s131",
  "s131.1y1a1n1d1e1x1",
  "y1a1n1d1e1x1.1n1e1t1/1s1d1k1",
  ".1n1e1t1/1s1d1k1.1j1s1",
].map(deFang);
const NORM_HOST = deFang("s1d1k1g1a1m1e1s1s131y1a1n1d1e1x1n1e1t1");
const S_THREE = "s" + "3";
const FB_KEYS = ["sdk" + "_fallback", "sdk" + "_abs"];
const sEdgeRe = () => new RegExp(`(^|[^a-z0-9])${S_THREE}|${S_THREE}([^a-z0-9]|$)`, "g");
const sdkAdjRe = /(games|yandex)[^a-z0-9]{0,3}sdk|sdk[^a-z0-9]{0,3}(games|yandex)/g;

/**
 * Полный скан текста на следы хранилища.
 * Возвращает список найденных проблем (пусто — чисто).
 */
function scanText(text) {
  const low = text.toLowerCase();
  const norm = low.replace(/[^a-z0-9]/g, "");
  const problems = [];
  const frags = STORAGE_FRAGMENTS.filter((f) => low.includes(f));
  if (frags.length > 0) problems.push(`фрагменты: ${frags.join(", ")}`);
  if (norm.includes(NORM_HOST)) problems.push("склейка host без знаков препинания");
  const edge = low.match(sEdgeRe());
  if (edge) problems.push(`короткий фрагмент у разделителей ×${edge.length}`);
  const adj = low.match(sdkAdjRe);
  // Легитимные упоминания платформы в UI покупок — не связки с SDK.
  const adjBad = (adj ?? []).filter((a) => !/yandex games|yandex id/.test(a));
  if (adjBad.length > 0) problems.push(`подозрительное соседство с sdk: ${[...new Set(adjBad)].slice(0, 3).join(" ")}`);
  if (FB_KEYS.some((k) => low.includes(k))) problems.push("следы fallback-механизма");
  return problems;
}

// ── 0. Исходники чистые (защита от упаковки лишнего в архив) ──────
// Целевого адреса хранилища не должно быть ни в одном tracked-файле
// (кроме package-lock.json — там URL реестра npm, руками не правится).
// Иначе архив, собранный из репозитория по ошибке, даст отказ Консоли.
try {
  const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8", cwd: root })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((f) => f !== "package-lock.json");
  const offenders = [];
  for (const f of tracked) {
    let buf;
    try {
      buf = await readFile(path.join(root, f));
    } catch {
      continue;
    }
    const low = buf.toString("utf8").toLowerCase();
    if (STORAGE_FRAGMENTS.some((frag) => low.includes(frag))) offenders.push(f);
  }
  check(
    `в исходниках нет адреса хранилища (${tracked.length} файлов)`,
    offenders.length === 0,
    `найдено в: ${offenders.join(", ")}`
  );
  // Сам валидатор — полным сканом (доказательство дефанга выше).
  const selfText = await readFile(path.join(root, "scripts", "validate-yandex.mjs"), "utf8");
  const selfProblems = scanText(selfText);
  check("валидатор чист под собственным сканом", selfProblems.length === 0, selfProblems.join("; "));
} catch (e) {
  check("скан исходников", false, String(e?.message ?? e).split("\n")[0]);
}

// ── 1. Структура dist/ ───────────────────────────────────────────
async function tree(dir, prefix = "") {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await tree(path.join(dir, e.name), rel)));
    else out.push(rel);
  }
  return out;
}

const distFiles = await tree(distDir);
if (!distFiles) {
  check("dist/ существует", false, "сначала выполните: npm run build");
  report();
}
check("dist/ существует", true);
check("index.html в корне dist/", distFiles.includes("index.html"), `содержимое: ${distFiles.join(", ")}`);

const jsFiles = distFiles.filter((f) => f.startsWith("assets/") && f.endsWith(".js"));
const cssFiles = distFiles.filter((f) => f.startsWith("assets/") && f.endsWith(".css"));
check("ровно один JS-бандл в assets/", jsFiles.length === 1, jsFiles.join(", "));
check("отдельного CSS нет (стили инлайнены в JS)", cssFiles.length === 0, cssFiles.join(", "));

// Картинки в dist — байт в байт как в public/ (источник правды).
const publicFiles = (await tree(publicDir)) ?? [];
const distImages = distFiles.filter((f) => /^(models|cards|rewards)\//.test(f));
const missing = publicFiles.filter((f) => !distFiles.includes(f));
check(`все картинки из public/ в dist/ (${publicFiles.length})`, missing.length === 0, missing.join(", "));
let imagesMatch = missing.length === 0;
for (const f of publicFiles) {
  if (!distFiles.includes(f)) continue;
  const [a, b] = await Promise.all([readFile(path.join(publicDir, f)), readFile(path.join(distDir, f))]);
  if (!a.equals(b)) {
    imagesMatch = false;
    break;
  }
}
check("картинки в dist/ байт в байт как в public/", imagesMatch, "пересоберите: npm run build");
const known = new Set(["index.html", ...jsFiles, ...distImages]);
const stray = distFiles.filter((f) => !known.has(f));
check("в dist/ нет лишних файлов", stray.length === 0, stray.join(", "));

const htmlPath = path.join(distDir, "index.html");
const html = await readFile(htmlPath, "utf8");
const jsPath = jsFiles.length === 1 ? path.join(distDir, jsFiles[0]) : null;
const js = jsPath ? await readFile(jsPath, "utf8") : "";

// ── 2. Тег SDK и подключение бандла (п. 1.1, 1.19.1) ──────────────
const headEnd = html.indexOf("</head>");
const head = headEnd >= 0 ? html.slice(0, headEnd) : html;
const sdkTag = head.match(/<script[^>]*src="\/sdk\.js"[^>]*>/);
check('тег <script src="/sdk.js"> в <head>', !!sdkTag, "актуальный путь SDK для сервера Яндекса");
const bundleTag = html.match(/<script[^>]*src="(\.?\/assets\/[^"]+\.js)"[^>]*><\/script>/);
check("бандл подключён относительным путём", !!bundleTag, "тег <script src=\"./assets/game-*.js\">");
if (sdkTag && bundleTag) {
  check(
    "тег SDK идёт ДО бандла игры",
    sdkTag.index < bundleTag.index,
    "YaGames.init() вызывается из бандла — sdk.js обязан загрузиться раньше"
  );
}
check("бандл классический (не module)", !/<script[^>]*type="module"/.test(html), "file:// не умеет ES-модули с диска");
check("стили в бандле (CSS-in-JS)", js.includes('createElement("style")'));

// ── 3. index.html лёгкий: никакого base64 ─────────────────────────
check("в index.html нет JPEG-base64", !html.includes("data:image/jpeg;base64"), "картинки — отдельными файлами");
const htmlKb = Buffer.byteLength(html, "utf8") / 1024;
check(`index.html лёгкий (${htmlKb.toFixed(0)} КБ < 1500 КБ)`, htmlKb < 1500, "похоже, в HTML попал base64");
check("в сборке нет HTML-комментариев", !html.includes("<!--"), "их вырезает vite.config.ts");

// ── 4. Инициализация SDK в бандле (п. 1.1) ────────────────────────
check("YaGames.init() в бандле", js.includes("YaGames.init"), "без инициализации платформа не увидит SDK");

// ── 5. Скан текстовых файлов на следы хранилища ──────────────────
for (const [name, text] of [["index.html", html], [jsFiles[0] ?? "бандл", js]]) {
  if (!text) continue;
  const problems = scanText(text);
  check(`чисто: ${name}`, problems.length === 0, problems.join("; "));
}

// ── 6. Бинарные файлы: только цельный адрес (случайное совпадение невозможно)
for (const f of distImages) {
  const buf = await readFile(path.join(distDir, f));
  const low = buf.toString("utf8").toLowerCase();
  if (STORAGE_FRAGMENTS.some((frag) => low.includes(frag))) {
    check(`чисто: ${f}`, false, "цельный фрагмент адреса в бинарнике — невероятно, проверьте файл");
  }
}
check(`бинарники без цельного адреса (${distImages.length} jpg)`, true);

// ── 7. Загрузка и разметка геймплея (п. 1.19.2–1.19.4) ────────────
check("LoadingAPI.ready()", js.includes("LoadingAPI") && js.includes(".ready("), "п. 1.19.2");
check(
  "GameplayAPI.start/stop",
  js.includes("GameplayAPI") && js.includes(".start(") && js.includes(".stop("),
  "п. 1.19.3"
);
check("паузы платформы (game_api_pause)", js.includes("game_api_pause"), "п. 1.19.4");

// ── 8. Монетизация через SDK (п. 1.12) ─────────────────────────────
check("fullscreen-реклама (showFullscreenAdv)", js.includes("showFullscreenAdv"), "п. 1.12/4.4");
check("rewarded-реклама (showRewardedVideo)", js.includes("showRewardedVideo"), "п. 4.5");

// ── 9. Автоопределение языка (п. 2.14) ─────────────────────────────
check(
  "чтение ysdk.environment.i18n.lang",
  js.includes("environment") && js.includes("i18n") && js.includes(".lang"),
  "иначе индикатор 文 на debug-панели не позеленеет"
);

// ── 10. Локали RU+EN ──────────────────────────────────────────────
check("русская локаль в сборке", js.includes("Прогреваем мотор") || html.includes("Прогреваем мотор"));
check("английская локаль в сборке", js.includes("Warming up") || html.includes("Warming up"));

// ── 11. Картинки прилинкованы через A() ───────────────────────────
// В бандле лежат ключи вида "/models/dixi.jpg" (аргументы A()), а ведущий
// "/" срезается в рантайме (A() в src/utils/assets.ts) — на выходе
// относительные пути рядом с index.html.
const absent = publicFiles.filter((f) => !js.includes(`"/${f}"`) && !js.includes(`'/${f}'`));
check(`все ${publicFiles.length} ключей картинок в бандле`, absent.length === 0, absent.join(", "));
check("A() срезает ведущий /", js.includes("slice(1)") && js.includes("startsWith"));

// ── 12. Нет внешних запросов (п. 8.4.2) ────────────────────────────
const allText = `${html}\n${js}`;
const resourceUrls = [
  ...allText.matchAll(/\ssrc="(https?:\/\/[^"]+)"/g),
  ...allText.matchAll(/\shref="(https?:\/\/[^"]+)"/g),
  ...allText.matchAll(/url\(\s*["']?(https?:\/\/[^"')]+)["']?\s*\)/g),
  ...allText.matchAll(/@import\s+["'](https?:\/\/[^"']+)["']/g),
  ...allText.matchAll(/\bimport\(\s*["'](https?:\/\/[^"']+)["']/g),
].map((m) => m[1]);
const forbidden = [...new Set(resourceUrls)];
check("нет внешних ресурсов (п. 8.4.2)", forbidden.length === 0, forbidden.join(", "));

// ── 13. Локальные ссылки относительные ────────────────────────────
const localRefs = [...html.matchAll(/\s(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
const localBad = [...new Set(localRefs)].filter(
  (u) => u.startsWith("/") && u !== "/sdk.js" && !u.startsWith("data:")
);
check("локальные ссылки относительные (кроме /sdk.js)", localBad.length === 0, localBad.join(", "));

// ── 14. Размер ─────────────────────────────────────────────────────
let totalBytes = 0;
for (const f of distFiles) totalBytes += (await stat(path.join(distDir, f))).size;
const totalMb = totalBytes / 1024 / 1024;
check(`размер dist/ ${totalMb.toFixed(2)} МБ < 100 МБ`, totalMb < 100, "п. 1.21");

// ── 15. Архив (п. 1.22: index.html в корне) ────────────────────────
const zipIdx = process.argv.indexOf("--zip");
if (zipIdx >= 0) {
  const zipPath = process.argv[zipIdx + 1];
  if (!zipPath) {
    check("--zip <путь>", false, "не указан путь к архиву");
  } else {
    try {
      const abs = path.isAbsolute(zipPath) ? zipPath : path.join(root, zipPath);
      const out = execFileSync(
        "python3",
        ["-c", "import zipfile,sys; print('\\n'.join(i.filename for i in zipfile.ZipFile(sys.argv[1]).infolist()))", abs],
        { encoding: "utf8" }
      );
      const names = out.trim().split("\n").filter(Boolean);
      check(`архив ${zipPath} открывается`, true);
      check("index.html в корне архива (п. 1.22)", names.includes("index.html"), `содержимое: ${names.join(", ")}`);
      const sameTree =
        names.length === distFiles.length && distFiles.every((f) => names.includes(f));
      check("дерево архива = дерево dist/", sameTree, `в архиве: ${names.join(", ")}`);
      const zipMb = (await stat(abs)).size / 1024 / 1024;
      check(`размер архива ${zipMb.toFixed(2)} МБ < 100 МБ`, zipMb < 100, "п. 1.21");

      // Каждый текстовый файл архива — полным сканом, бинарники — на цельный адрес.
      const SCAN_PY = [
        "import re, sys, zipfile",
        "frags = " + JSON.stringify(STORAGE_FRAGMENTS),
        "norm = " + JSON.stringify(NORM_HOST),
        "edge = " + JSON.stringify(S_THREE),
        "fb0 = " + JSON.stringify(FB_KEYS[0]),
        "fb1 = " + JSON.stringify(FB_KEYS[1]),
        "zf = zipfile.ZipFile(sys.argv[1])",
        "bad = []",
        "for info in zf.infolist():",
        "    raw = zf.read(info.filename)",
        "    text = raw.decode('utf-8', 'ignore').lower()",
        "    if any(f in text for f in frags) or re.sub(r'[^a-z0-9]', '', text).find(norm) >= 0:",
        "        bad.append(info.filename + ':host'); continue",
        "    if info.filename.endswith(('.html', '.js', '.css')):",
        "        if re.search(r'(^|[^a-z0-9])' + edge + r'|' + edge + r'([^a-z0-9]|$)', text): bad.append(info.filename + ':s-edge')",
        "        adj = [a for a in re.findall(r'(?:games|yandex)[^a-z0-9]{0,3}sdk|sdk[^a-z0-9]{0,3}(?:games|yandex)', text) if 'yandex games' not in a and 'yandex id' not in a]",
        "        if adj: bad.append(info.filename + ':adj')",
        "        if fb0 in text or fb1 in text: bad.append(info.filename + ':fb')",
        "print('\\n'.join(bad))",
      ].join("\n");
      const scanOut = execFileSync("python3", ["-c", SCAN_PY, abs], { encoding: "utf8" }).trim();
      check("в архиве нет следов хранилища (все файлы)", scanOut === "", scanOut.split("\n").join(", "));
    } catch (e) {
      check(`архив ${zipPath} открывается`, false, String(e?.message ?? e).split("\n")[0]);
    }
  }
}

report();
