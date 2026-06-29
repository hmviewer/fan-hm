import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const htmlPath = process.argv[2] || "/tmp/hmsigfinder.html";
const html = await readFile(htmlPath, "utf8");
const rows = [...html.matchAll(/\{file:"([^"]+)",\s*tag:"([^"]*)"\}/g)].map((match) => {
  const file = match[1];
  const tag = match[2];
  const stem = file.replace(/\.[^.]+$/, "");
  const number = Number((stem.match(/^\d+/) || ["0"])[0]);
  const title = stem.replace(/^\d+[\s-]*/, "").trim() || String(number || stem);
  return {
    number,
    title,
    tag,
    file,
    image: `images/${file}`,
  };
});

if (!rows.length) {
  throw new Error("No signature rows found.");
}

const imageDir = path.join(root, "signature", "images");
await mkdir(imageDir, { recursive: true });

let downloaded = 0;
let skipped = 0;
let failed = 0;

for (const row of rows) {
  const target = path.join(imageDir, row.file);
  if (existsSync(target)) {
    skipped += 1;
    continue;
  }
  const url = `https://hmsigfinder.vercel.app/images/${encodeURIComponent(row.file)}`;
  const response = await fetch(url);
  if (!response.ok) {
    failed += 1;
    console.error(`failed ${response.status}: ${row.file}`);
    continue;
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(target, buffer);
  downloaded += 1;
}

rows.sort((a, b) => a.number - b.number || a.title.localeCompare(b.title, "ko"));
await writeFile(
  path.join(root, "static-api", "signatures.json"),
  JSON.stringify(
    {
      updatedAt: new Date().toISOString(),
      source: "THE HM local signature archive",
      count: rows.length,
      items: rows,
    },
    null,
    2,
  ) + "\n",
);

console.log(JSON.stringify({ rows: rows.length, downloaded, skipped, failed }, null, 2));
