import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePublicData, readJson, writeJsonAtomic } from "./signature-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const signaturesPath = path.join(root, "static-api", "signatures.json");

const current = readJson(signaturesPath, {});
const normalized = normalizePublicData(current);
writeJsonAtomic(signaturesPath, normalized);

console.log(JSON.stringify({
  file: signaturesPath,
  total: normalized.total,
  timelineCount: normalized.items.reduce((sum, item) => sum + Number(item.timelineCount || 0), 0)
}, null, 2));
