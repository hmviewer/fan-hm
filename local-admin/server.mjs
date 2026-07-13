import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  CSV_COLUMNS,
  buildCsv,
  buildDraftFromRows,
  normalizePublicData,
  readJson,
  rowsFromCsv,
  validateRows,
  writeJsonAtomic
} from "../scripts/signature-core.mjs";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 3100);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const publicDir = path.join(__dirname, "public");
const storageDir = path.join(__dirname, "storage");
const backupsDir = path.join(__dirname, "backups");
const signaturesPath = path.join(root, "static-api", "signatures.json");
const membersPath = path.join(root, "static-api", "members.json");
const draftsPath = path.join(storageDir, "drafts.json");
const historyPath = path.join(storageDir, "import-history.json");
const MAX_BODY = 12 * 1024 * 1024;

fs.mkdirSync(storageDir, { recursive: true });
fs.mkdirSync(backupsDir, { recursive: true });

function send(res, status, body, type = "application/json; charset=utf-8") {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": type,
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store"
  });
  res.end(payload);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml"
  }[ext] || "application/octet-stream";
  const payload = fs.readFileSync(filePath);
  res.writeHead(200, {
    "Content-Type": type,
    "Content-Length": payload.length,
    "Cache-Control": "no-store"
  });
  res.end(payload);
}

function safeJoin(base, requestPath) {
  const resolved = path.resolve(base, requestPath.replace(/^\/+/, ""));
  if (!resolved.startsWith(base)) return null;
  return resolved;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("BODY_TOO_LARGE"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function readJsonBody(req) {
  return readBody(req).then((body) => body ? JSON.parse(body) : {});
}

function getPublicData() {
  return normalizePublicData(readJson(signaturesPath, { items: [] }));
}

function getMembers() {
  return readJson(membersPath, []);
}

function getDrafts() {
  return readJson(draftsPath, []);
}

function saveDrafts(drafts) {
  writeJsonAtomic(draftsPath, drafts);
}

function getHistory() {
  return readJson(historyPath, []);
}

function saveHistory(history) {
  writeJsonAtomic(historyPath, history);
}

function summarize(data) {
  const items = Array.isArray(data.items) ? data.items : [];
  const totalTimelines = items.reduce((sum, item) => sum + Number(item.timelineCount || 0), 0);
  const ready = items.filter((item) => Number(item.timelineCount || 0) === 0).length;
  return {
    total: items.length,
    withTimeline: items.length - ready,
    ready,
    totalTimelines
  };
}

function templateCsv() {
  const exampleRows = [
    CSV_COLUMNS,
    ["572", "귀여워서미안해", "달리", "귀여움|댄스|리액션", "images/572 귀여워서미안해.png", "달리 시그니처", "true", "572", "2026 HM 대회 3회차", "달리", "youtube", "https://www.youtube.com/watch?v=abc123&t=3725s", "01:02:05", "01:02:18", "true", "true", "1"],
    ["572", "귀여워서미안해", "달리", "귀여움|댄스|리액션", "images/572 귀여워서미안해.png", "달리 시그니처", "true", "572", "달리 개인 방송", "달리|해루", "soop", "https://example.com/video/123", "02:15:42", "02:15:55", "false", "true", "2"]
  ];
  return `\uFEFF${buildCsv(exampleRows)}\n`;
}

function backupCurrent() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  const target = path.join(backupsDir, `signatures-${stamp}.json`);
  fs.copyFileSync(signaturesPath, target);
  return target;
}

function listBackups() {
  if (!fs.existsSync(backupsDir)) return [];
  return fs.readdirSync(backupsDir)
    .filter((name) => /^signatures-\d{8}-\d{6}\.json$/.test(name))
    .map((name) => {
      const file = path.join(backupsDir, name);
      const data = readJson(file, { items: [] });
      const stat = fs.statSync(file);
      return { name, size: stat.size, createdAt: stat.mtime.toISOString(), ...summarize(normalizePublicData(data)) };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

function gitStatus() {
  try {
    const status = execFileSync("git", ["status", "--short"], { cwd: root, encoding: "utf8" });
    const diff = execFileSync("git", ["diff", "--", "static-api/signatures.json"], { cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024 });
    return { status, diff };
  } catch (error) {
    return { status: "", diff: "", error: error.message };
  }
}

async function handleApi(req, res, pathname) {
  if (pathname === "/api/status") {
    const data = getPublicData();
    const drafts = getDrafts();
    return send(res, 200, { ...summarize(data), drafts: drafts.length, errors: 0, members: getMembers().length });
  }
  if (pathname === "/api/signatures") return send(res, 200, getPublicData());
  if (pathname === "/api/members") return send(res, 200, getMembers());
  if (pathname === "/api/template") return send(res, 200, templateCsv(), "text/csv; charset=utf-8");
  if (pathname === "/api/drafts") return send(res, 200, getDrafts().map(({ data, ...draft }) => ({ ...draft, summary: summarize(data) })));
  if (pathname === "/api/backups") return send(res, 200, listBackups());
  if (pathname === "/api/git") return send(res, 200, gitStatus());

  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });

  if (pathname === "/api/preview-csv") {
    const body = await readJsonBody(req);
    const csv = String(body.csv || "");
    if (Buffer.byteLength(csv) > 10 * 1024 * 1024) return send(res, 400, { error: "CSV는 최대 10MB까지 지원합니다." });
    const parsed = rowsFromCsv(csv, body.mapping || null);
    if (parsed.rows.length > 5000) return send(res, 400, { error: "CSV는 최대 5,000행까지 지원합니다." });
    const draft = buildDraftFromRows(parsed.rows, getPublicData(), getMembers(), body.options || {});
    return send(res, 200, {
      headers: parsed.headers,
      mapping: parsed.mapping,
      previewRows: parsed.rows.slice(0, 20),
      validation: draft.validation,
      summary: draft.summary,
      draft: draft.data
    });
  }

  if (pathname === "/api/quick-preview") {
    const row = await readJsonBody(req);
    const draft = buildDraftFromRows([{ __line: 1, ...row }], getPublicData(), getMembers(), { updateSignatureInfo: true });
    return send(res, 200, { validation: draft.validation, summary: draft.summary, draft: draft.data });
  }

  if (pathname === "/api/save-draft") {
    const body = await readJsonBody(req);
    const data = normalizePublicData(body.data || body.draft || {});
    const validation = validateRows([], getMembers());
    const drafts = getDrafts();
    const draft = {
      id: `draft-${Date.now()}`,
      title: body.title || `초안 ${new Date().toLocaleString("ko-KR")}`,
      createdAt: new Date().toISOString(),
      validation,
      data
    };
    drafts.unshift(draft);
    saveDrafts(drafts);
    return send(res, 200, { ok: true, id: draft.id });
  }

  if (pathname === "/api/apply-draft") {
    const body = await readJsonBody(req);
    const drafts = getDrafts();
    const draft = drafts.find((item) => item.id === body.id);
    if (!draft) return send(res, 404, { error: "초안을 찾을 수 없습니다." });
    const data = normalizePublicData(draft.data);
    const backup = backupCurrent();
    const nextPath = path.join(path.dirname(signaturesPath), "signatures.next.json");
    writeJsonAtomic(nextPath, data);
    writeJsonAtomic(signaturesPath, readJson(nextPath, data));
    fs.unlinkSync(nextPath);
    saveHistory([{ id: draft.id, appliedAt: new Date().toISOString(), backup: path.basename(backup), summary: summarize(data) }, ...getHistory()]);
    return send(res, 200, { ok: true, backup: path.basename(backup), summary: summarize(data) });
  }

  if (pathname === "/api/restore") {
    const body = await readJsonBody(req);
    const name = path.basename(String(body.name || ""));
    const source = safeJoin(backupsDir, name);
    if (!source || !fs.existsSync(source)) return send(res, 404, { error: "백업을 찾을 수 없습니다." });
    const backup = backupCurrent();
    const data = normalizePublicData(readJson(source, { items: [] }));
    writeJsonAtomic(signaturesPath, data);
    return send(res, 200, { ok: true, currentBackup: path.basename(backup), summary: summarize(data) });
  }

  return send(res, 404, { error: "Not found" });
}

function serveStatic(req, res, pathname) {
  const imagePrefix = "/signature/images/";
  const imageDir = path.join(root, "signature", "images");
  const filePath = pathname === "/"
    ? path.join(publicDir, "index.html")
    : pathname.startsWith(imagePrefix)
      ? safeJoin(imageDir, decodeURIComponent(pathname.slice(imagePrefix.length)))
      : safeJoin(publicDir, pathname);
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return send(res, 404, "Not found", "text/plain; charset=utf-8");
  }
  sendFile(res, filePath);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url.pathname);
    return serveStatic(req, res, url.pathname);
  } catch (error) {
    const message = error.message === "BODY_TOO_LARGE" ? "요청 데이터가 너무 큽니다." : error.message;
    return send(res, 500, { error: message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`THE HM signature manager: http://${HOST}:${PORT}`);
});
