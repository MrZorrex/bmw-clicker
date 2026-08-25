import { mkdir, rm, cp, readdir, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import archiver from "archiver";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "publish");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const zipPath = resolve(out, "bmw-clicker.zip");
const archive = archiver("zip", { zlib: { level: 9 } });
archive.pipe(createWriteStream(zipPath));
archive.directory(resolve(root, "dist"), false);
await archive.finalize();
console.log(`Packed ${zipPath}`);
