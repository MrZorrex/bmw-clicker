// Чистит base64 картинок в src/assets-data.ts от сочетаний, которые сканер
// Консоли Яндекс Игр может принять за фрагменты адреса сервисного хранилища:
// каждое "s3"/"S3" обязано быть окружено [A-Za-z0-9] с обеих сторон. Запрещены
// "/s3", "s3/", "s3" рядом с "+" / "=" / кавычками и на краях блоба — в base64
// длиной ~1.5 МБ такие сочетания неизбежно возникают случайно.
//
// Фаза 1 (без потерь): вставка JPEG COM-сегмента после SOI. Длина вставки
// меняет выравнивание base64-групп (по mod 3) и первые символы — иногда этого
// достаточно. Пиксели не меняются, вьюверы COM игнорируют.
// Фаза 2 (пережатие): sharp с перебором quality/mozjpeg — байты полностью
// новые. Один лишний JPEG-проход на качестве 70+ для карточек игры
// визуально неотличим; размеры контролируются.
//
// Скрипт идемпотентен (чистые картинки не трогает) и детерминирован
// (варианты перебираются в фиксированном порядке).
//
// Запуск: node scripts/scrub-base64.mjs            — почистить файл
//         node scripts/scrub-base64.mjs --check    — только проверить
// После чистки: npm run build:yandex (валидатор проверяет результат).
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const assetsFile = path.join(root, "src", "assets-data.ts");

// «Грязно», если s3 граничит хоть с одной стороны с не-буквой-не-цифрой
// (включая начало/конец блоба — там соседи `,`/`"`).
const DIRTY = /(^|[^a-z0-9])s3|s3([^a-z0-9]|$)/i;
const isClean = (b64) => !DIRTY.test(b64);

/** Вставляет COM-сегмент после SOI: FF D8 | FF FE lenHi lenLo payload... */
function withCom(bytes, payload) {
  const len = payload.length + 2;
  if (len > 65535) throw new Error("COM слишком длинный");
  const head = Buffer.from([0xff, 0xd8, 0xff, 0xfe, (len >> 8) & 0xff, len & 0xff]);
  return Buffer.concat([head, Buffer.from(payload), bytes.subarray(2)]);
}

/** Фаза 1: lossless-варианты (разная длина = разное выравнивание base64). */
function* losslessVariants(bytes) {
  yield { bytes, how: "оригинал" };
  const lens = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  for (const n of lens) {
    for (const fill of n <= 2 ? [0x41, 0x42, 0x43] : [0x41]) {
      yield { bytes: withCom(bytes, new Array(n).fill(fill)), how: `COM len=${n + 4}` };
    }
  }
}

/** Фаза 2: пережатие (каждый вариант — полностью новые байты). */
async function* reencodeVariants(bytes) {
  const { default: sharp } = await import("sharp");
  const qualities = [84, 82, 80, 86, 78, 88, 76, 90, 74, 92, 72, 94, 70, 96, 68, 98];
  for (const q of qualities) {
    for (const moz of [false, true]) {
      for (const sub of ["4:2:0", "4:4:4"]) {
        const buf = await sharp(bytes)
          .jpeg({ quality: q, mozjpeg: moz, chromaSubsampling: sub })
          .toBuffer();
        yield { bytes: buf, how: `sharp q=${q} moz=${moz ? 1 : 0} ${sub}` };
      }
    }
  }
}

const checkOnly = process.argv.includes("--check");
const content = await readFile(assetsFile, "utf8");
const entries = [...content.matchAll(/"([^"]+)":\s*"data:image\/([a-z]+);base64,([A-Za-z0-9+/=]+)"/g)];
console.log(`Найдено изображений: ${entries.length}`);

const dirtyKeys = [];
let newContent = content;
for (const m of entries) {
  const [full, key, fmt, b64] = m;
  if (fmt !== "jpeg") {
    console.log(`  ! ${key}: формат ${fmt} — пропускаю`);
    continue;
  }
  if (isClean(b64)) continue;
  dirtyKeys.push(key);
  if (checkOnly) continue;
  const bytes = Buffer.from(b64, "base64");
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
    throw new Error(`${key}: не JPEG`);
  }
  let fixed = null;
  let how = "";
  for (const v of losslessVariants(bytes)) {
    const cand = v.bytes.toString("base64");
    if (isClean(cand)) {
      fixed = cand;
      how = v.how;
      break;
    }
  }
  if (!fixed) {
    for await (const v of reencodeVariants(bytes)) {
      const cand = v.bytes.toString("base64");
      if (isClean(cand)) {
        // Санити: валидный JPEG, размер не убежал
        if (v.bytes[0] !== 0xff || v.bytes[1] !== 0xd8) continue;
        if (v.bytes.length > bytes.length * 1.6) continue;
        fixed = cand;
        how = v.how;
        break;
      }
    }
  }
  if (!fixed) throw new Error(`${key}: не удалось почистить base64`);
  const oldUri = `"data:image/${fmt};base64,${b64}"`;
  const newUri = `"data:image/${fmt};base64,${fixed}"`;
  if (!newContent.includes(oldUri)) throw new Error(`${key}: URI не найден для замены`);
  newContent = newContent.replace(oldUri, newUri);
  console.log(`  ✓ ${key}: ${how} (${bytes.length} → ${Buffer.from(fixed, "base64").length} байт)`);
}

if (checkOnly) {
  if (dirtyKeys.length > 0) {
    console.log(`ГРЯЗНЫЕ (${dirtyKeys.length}): ${dirtyKeys.join(", ")}`);
    process.exit(1);
  }
  console.log("Все base64 чистые.");
} else if (dirtyKeys.length > 0) {
  const marker = "// base64 картинок почищен scripts/scrub-base64.mjs";
  if (!newContent.includes(marker)) {
    newContent = newContent.replace(
      "// ни один билд не зависит от внешних файлов и сети.",
      `// ни один билд не зависит от внешних файлов и сети.\n${marker} от сочетаний вида /s3, s3/ (ложные срабатывания сканера Консоли).`
    );
  }
  await writeFile(assetsFile, newContent, "utf8");
  console.log(`Почищены (${dirtyKeys.length}): ${dirtyKeys.join(", ")}`);
} else {
  console.log("Все base64 уже чистые, файл не менялся.");
}
