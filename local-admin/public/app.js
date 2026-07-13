const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  signatures: null,
  members: [],
  csvText: "",
  csvDraft: null,
  quickDraft: null,
  validation: []
};

const metrics = $("#metrics");
const tabs = $("#tabs");
const signatureList = $("#signatureList");
const csvFile = $("#csvFile");
const csvText = $("#csvText");
const dropZone = $("#dropZone");
const mappingBox = $("#mappingBox");
const csvResult = $("#csvResult");
const previewCsv = $("#previewCsv");
const saveCsvDraft = $("#saveCsvDraft");
const downloadErrors = $("#downloadErrors");
const quickForm = $("#quickForm");
const quickResult = $("#quickResult");
const draftList = $("#draftList");
const backupList = $("#backupList");
const publicPreview = $("#publicPreview");
const gitStatus = $("#gitStatus");
const gitDiff = $("#gitDiff");

const columns = {
  signature_number: "시그니처 번호",
  signature_title: "시그니처 제목",
  signature_members: "시그니처 멤버",
  signature_tags: "콘텐츠 태그",
  signature_image_url: "이미지 URL",
  signature_description: "설명",
  signature_is_published: "시그니처 공개",
  signature_sort_order: "시그니처 정렬",
  timeline_title: "영상 제목",
  timeline_members: "영상 멤버",
  timeline_provider: "플랫폼",
  timeline_url: "영상 링크",
  timeline_start_time: "시작 시간",
  timeline_end_time: "종료 시간",
  timeline_is_primary: "대표 영상",
  timeline_is_published: "영상 공개",
  timeline_sort_order: "영상 정렬"
};

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatTimelineTime(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds || 0)));
  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  const s = value % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function providerLabel(provider) {
  return { youtube: "YouTube", soop: "SOOP", chzzk: "CHZZK", external: "외부 영상" }[provider] || "외부 영상";
}

function timelineRange(timeline) {
  if (!timeline) return "-";
  const start = formatTimelineTime(timeline.startTime || 0);
  return Number(timeline.endTime) > Number(timeline.startTime) ? `${start} ~ ${formatTimelineTime(timeline.endTime)}` : `${start}부터`;
}

function allowedSoopEmbedUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    return parsed.protocol === "https:" && ["vod.sooplive.com", "vod.afreecatv.com"].includes(host) && /^\/player\/\d+\/embed\/?$/.test(parsed.pathname);
  } catch {
    return false;
  }
}

function applySoopPlayerParams(embedUrl) {
  try {
    const parsed = new URL(String(embedUrl || "").trim());
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (parsed.protocol !== "https:" || !["vod.sooplive.com", "vod.afreecatv.com"].includes(host) || !/^\/player\/\d+\/embed\/?$/.test(parsed.pathname)) return "";
    parsed.searchParams.set("autoPlay", "true");
    parsed.searchParams.set("mutePlay", "true");
    return parsed.toString();
  } catch {
    return "";
  }
}

function toast(message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 3200);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.error || `요청 실패: ${response.status}`);
  return data;
}

function metricCard(label, value) {
  return `<div class="metric-card"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
}

async function loadStatus() {
  const status = await api("/api/status");
  metrics.innerHTML = [
    metricCard("total", status.total),
    metricCard("with videos", status.withTimeline),
    metricCard("ready", status.ready),
    metricCard("timelines", status.totalTimelines),
    metricCard("drafts", status.drafts)
  ].join("");
}

function renderSignatureList() {
  const items = state.signatures?.items || [];
  signatureList.innerHTML = items.length ? items.map((item) => `
    <article class="signature-card">
      <img src="../signature/${esc(item.imageUrl || item.image || "")}" alt="">
      <div>
        <strong>${esc(item.number)} · ${esc(item.title)}</strong>
        <p class="meta-line">${esc((item.memberNames || []).join(" · ") || "멤버 미지정")}</p>
        <div class="badge-row">
          <span class="badge ${item.timelineCount > 0 ? "good" : "warn"}">${item.timelineCount > 0 ? `영상 ${item.timelineCount}개` : "영상 준비 중"}</span>
          <span class="badge">정렬 ${esc(item.sortOrder ?? item.number)}</span>
        </div>
      </div>
    </article>
  `).join("") : `<div class="empty">시그니처 데이터가 없습니다.</div>`;
}

async function loadSignatures() {
  state.signatures = await api("/api/signatures");
  renderSignatureList();
  publicPreview.textContent = JSON.stringify({
    total: state.signatures.total,
    generatedAt: state.signatures.generatedAt,
    sample: (state.signatures.items || []).slice(0, 5)
  }, null, 2);
}

async function loadMembers() {
  state.members = await api("/api/members");
}

function renderMapping(result) {
  const mapping = result.mapping || {};
  const headers = result.headers || [];
  mappingBox.innerHTML = Object.entries(columns).map(([key, label]) => {
    const index = mapping[key];
    const mapped = index === undefined ? "미감지" : headers[index];
    return `<div class="mapping-chip"><span>${esc(label)}</span><b>${esc(mapped)}</b></div>`;
  }).join("");
}

function renderValidation(result) {
  const summary = result.summary || {};
  const validation = result.validation || [];
  const issueRows = validation.filter((item) => item.errors?.length || item.warnings?.length).slice(0, 20);
  const issueMarkup = issueRows.length ? `
    <table class="validation-table">
      <thead><tr><th>행</th><th>상태</th><th>내용</th></tr></thead>
      <tbody>
        ${issueRows.map((item) => {
          const messages = [...(item.errors || []), ...(item.warnings || [])]
            .map((issue) => `${issue.column}: ${issue.message}`)
            .join("<br>");
          return `<tr><td>${esc(item.row?.__line || "-")}</td><td>${esc(item.status)}</td><td>${messages}</td></tr>`;
        }).join("")}
      </tbody>
    </table>` : `<p class="meta-line">오류 없이 검사되었습니다.</p>`;

  csvResult.innerHTML = `
    <div class="result-box">
      <div class="result-grid">
        <div class="result-item"><span>전체 행</span><strong>${esc(summary.totalRows || 0)}</strong></div>
        <div class="result-item"><span>정상</span><strong>${esc(summary.okRows || 0)}</strong></div>
        <div class="result-item"><span>경고</span><strong>${esc(summary.warningRows || 0)}</strong></div>
        <div class="result-item"><span>오류</span><strong>${esc(summary.errorRows || 0)}</strong></div>
      </div>
      ${issueMarkup}
    </div>`;
}

function validationCsv() {
  const rows = [["line", "status", "column", "value", "message"]];
  state.validation.forEach((item) => {
    [...(item.errors || []), ...(item.warnings || [])].forEach((issue) => {
      rows.push([item.row?.__line || "", item.status, issue.column || "", issue.value || "", issue.message || ""]);
    });
  });
  return rows.map((row) => row.map((cell) => {
    const text = String(cell ?? "");
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }).join(",")).join("\n");
}

function downloadText(filename, text, type = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function handlePreviewCsv() {
  const csv = csvText.value.trim() ? csvText.value : state.csvText;
  if (!csv.trim()) {
    toast("CSV 파일을 선택하거나 내용을 붙여넣어 주세요.");
    return;
  }
  const result = await api("/api/preview-csv", {
    method: "POST",
    body: JSON.stringify({ csv, options: { updateSignatureInfo: true } })
  });
  state.csvDraft = result.draft;
  state.validation = result.validation || [];
  renderMapping(result);
  renderValidation(result);
  saveCsvDraft.disabled = Boolean(result.summary?.errorRows);
  downloadErrors.disabled = !state.validation.some((item) => item.errors?.length || item.warnings?.length);
}

async function saveDraft(data, title) {
  const result = await api("/api/save-draft", {
    method: "POST",
    body: JSON.stringify({ data, title })
  });
  await Promise.all([loadStatus(), loadDrafts()]);
  toast(`초안 저장 완료: ${result.id}`);
}

function formToRow(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  data.timeline_is_primary = form.timeline_is_primary?.checked ? "true" : "false";
  data.signature_is_published = form.signature_is_published ? (form.signature_is_published.checked ? "true" : "false") : "";
  data.timeline_is_published = form.timeline_is_published?.checked ? "true" : "false";
  return data;
}

function findDraftTimeline(draft, signatureNumber) {
  const signature = (draft?.items || []).find((item) => String(item.number) === String(signatureNumber));
  const timelines = signature?.timelines || [];
  return timelines[timelines.length - 1] || null;
}

function renderQuickTimelinePreview(timeline, validation = []) {
  const issues = validation.flatMap((item) => [...(item.errors || []), ...(item.warnings || [])]);
  const issueMarkup = issues.length
    ? `<div class="badge-row">${issues.map((issue) => `<span class="badge ${issue.message.includes("확인") ? "warn" : "bad"}">${esc(issue.message)}</span>`).join("")}</div>`
    : "";
  if (!timeline) {
    return `
      <div class="quick-preview">
        <div class="empty">등록할 타임라인이 없습니다.</div>
        ${issueMarkup}
      </div>`;
  }
  const duration = timeline.duration ? `${timeline.duration}초` : "구간 미지정";
  const canEmbedSoop = timeline.provider === "soop" && allowedSoopEmbedUrl(timeline.embedUrl);
  const soopEmbedUrl = canEmbedSoop ? applySoopPlayerParams(timeline.embedUrl) : "";
  const embedMarkup = canEmbedSoop
    ? `<div class="quick-player" data-video="soop"><iframe src="${esc(soopEmbedUrl)}" title="${esc(timeline.title)}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`
    : "";
  const soopNotice = timeline.provider === "soop"
    ? `<p class="meta-line">SOOP 플레이어는 내부 재생이 가능하지만 시작 시간 자동 이동이 제한될 수 있습니다. 공개 화면에서 ${formatTimelineTime(timeline.startTime || 0)}부터 확인하도록 안내됩니다.</p>`
    : "";
  const sourceLink = timeline.sourceUrl
    ? `<a class="inline-link" href="${esc(timeline.sourceUrl)}" target="_blank" rel="noopener noreferrer">원본 VOD 보기</a>`
    : "";
  return `
    <div class="quick-preview">
      <div class="result-grid">
        <div class="result-item"><span>플랫폼</span><strong>${esc(providerLabel(timeline.provider))}</strong></div>
        <div class="result-item"><span>VOD ID</span><strong>${esc(timeline.videoId || "-")}</strong></div>
        <div class="result-item"><span>재생 구간</span><strong>${esc(duration)}</strong></div>
        <div class="result-item"><span>내부 재생</span><strong>${canEmbedSoop || timeline.provider === "youtube" ? "가능" : "확인 필요"}</strong></div>
      </div>
      <dl class="preview-detail">
        <div><dt>정규화 URL</dt><dd>${esc(timeline.normalizedUrl || "-")}</dd></div>
        <div><dt>Embed URL</dt><dd>${esc(timeline.embedUrl || "-")}</dd></div>
        <div><dt>시작/종료</dt><dd>${esc(timelineRange(timeline))}</dd></div>
      </dl>
      ${embedMarkup || `<div class="empty">내부 미리보기를 표시할 수 없습니다. 공개 화면에서는 원본 VOD fallback을 제공합니다.</div>`}
      ${soopNotice}
      ${sourceLink}
      ${issueMarkup}
    </div>`;
}

async function handleQuick(event) {
  event.preventDefault();
  const row = formToRow(quickForm);
  const result = await api("/api/quick-preview", {
    method: "POST",
    body: JSON.stringify(row)
  });
  state.quickDraft = result.draft;
  const timeline = findDraftTimeline(result.draft, row.signature_number);
  quickResult.innerHTML = `
    <div class="result-box">
      <div class="result-grid">
        <div class="result-item"><span>전체 행</span><strong>${esc(result.summary.totalRows)}</strong></div>
        <div class="result-item"><span>오류</span><strong>${esc(result.summary.errorRows)}</strong></div>
        <div class="result-item"><span>영상 등록 시그</span><strong>${esc(result.draft.items.filter((item) => item.timelineCount > 0).length)}</strong></div>
      </div>
      ${renderQuickTimelinePreview(timeline, result.validation || [])}
      <div class="actions">
        <button id="saveQuickDraft" ${result.summary.errorRows ? "disabled" : ""}>초안으로 저장</button>
      </div>
    </div>`;
}

function draftCard(draft) {
  return `
    <article class="draft-card">
      <strong>${esc(draft.title)}</strong>
      <p class="meta-line">${new Date(draft.createdAt).toLocaleString("ko-KR")}</p>
      <div class="badge-row">
        <span class="badge">전체 ${esc(draft.summary?.total || 0)}</span>
        <span class="badge good">영상 ${esc(draft.summary?.withTimeline || 0)}</span>
        <span class="badge warn">준비 ${esc(draft.summary?.ready || 0)}</span>
      </div>
      <div class="actions">
        <button data-apply-draft="${esc(draft.id)}">이 초안 적용</button>
      </div>
    </article>`;
}

async function loadDrafts() {
  const drafts = await api("/api/drafts");
  draftList.innerHTML = drafts.length ? drafts.map(draftCard).join("") : `<div class="empty">저장된 초안이 없습니다.</div>`;
}

function backupCard(backup) {
  return `
    <article class="backup-card">
      <strong>${esc(backup.name)}</strong>
      <p class="meta-line">${new Date(backup.createdAt).toLocaleString("ko-KR")} · ${(backup.size / 1024).toFixed(1)}KB</p>
      <div class="badge-row">
        <span class="badge">전체 ${esc(backup.total)}</span>
        <span class="badge good">영상 ${esc(backup.withTimeline)}</span>
        <span class="badge warn">준비 ${esc(backup.ready)}</span>
      </div>
      <div class="actions">
        <button data-restore="${esc(backup.name)}">이 백업으로 복원</button>
      </div>
    </article>`;
}

async function loadBackups() {
  const backups = await api("/api/backups");
  backupList.innerHTML = backups.length ? backups.map(backupCard).join("") : `<div class="empty">아직 백업이 없습니다. 초안을 적용하면 자동으로 생성됩니다.</div>`;
}

async function loadGit() {
  const git = await api("/api/git");
  gitStatus.textContent = git.status || "변경사항 없음";
  gitDiff.textContent = git.diff || "static-api/signatures.json 변경 diff 없음";
}

async function applyDraft(id) {
  if (!confirm("이 초안을 공개 시그니처 데이터에 적용할까요? 현재 파일은 자동 백업됩니다.")) return;
  const result = await api("/api/apply-draft", {
    method: "POST",
    body: JSON.stringify({ id })
  });
  await Promise.all([loadStatus(), loadSignatures(), loadDrafts(), loadBackups(), loadGit()]);
  toast(`적용 완료. 백업: ${result.backup}`);
}

async function restoreBackup(name) {
  if (!confirm(`${name} 백업으로 복원할까요? 현재 파일도 새 백업으로 보관됩니다.`)) return;
  await api("/api/restore", {
    method: "POST",
    body: JSON.stringify({ name })
  });
  await Promise.all([loadStatus(), loadSignatures(), loadBackups(), loadGit()]);
  toast("복원 완료");
}

tabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-tab]");
  if (!button) return;
  $$(".tabs button").forEach((item) => item.classList.toggle("active", item === button));
  $$(".panel").forEach((panel) => panel.classList.toggle("active", panel.id === `tab-${button.dataset.tab}`));
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("dragging");
});

dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragging"));
dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragging");
  const file = event.dataTransfer.files?.[0];
  if (file) readFile(file);
});

csvFile.addEventListener("change", () => {
  const file = csvFile.files?.[0];
  if (file) readFile(file);
});

function readFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    state.csvText = String(reader.result || "");
    csvText.value = state.csvText;
    dropZone.querySelector("strong").textContent = file.name;
    toast(`CSV 로드 완료: ${file.name}`);
  };
  reader.readAsText(file, "utf-8");
}

previewCsv.addEventListener("click", () => handlePreviewCsv().catch((error) => toast(error.message)));
saveCsvDraft.addEventListener("click", () => {
  if (!state.csvDraft) return;
  saveDraft(state.csvDraft, `CSV 초안 ${new Date().toLocaleString("ko-KR")}`).catch((error) => toast(error.message));
});
downloadErrors.addEventListener("click", () => downloadText("the-hm-signature-validation.csv", `\uFEFF${validationCsv()}\n`));

quickForm.addEventListener("submit", (event) => handleQuick(event).catch((error) => toast(error.message)));
quickResult.addEventListener("click", (event) => {
  if (!event.target.closest("#saveQuickDraft") || !state.quickDraft) return;
  saveDraft(state.quickDraft, `빠른 등록 ${new Date().toLocaleString("ko-KR")}`).catch((error) => toast(error.message));
});

draftList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-apply-draft]");
  if (button) applyDraft(button.dataset.applyDraft).catch((error) => toast(error.message));
});

backupList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-restore]");
  if (button) restoreBackup(button.dataset.restore).catch((error) => toast(error.message));
});

$("#reloadData").addEventListener("click", () => Promise.all([loadStatus(), loadSignatures()]).catch((error) => toast(error.message)));
$("#loadDrafts").addEventListener("click", () => loadDrafts().catch((error) => toast(error.message)));
$("#loadBackups").addEventListener("click", () => loadBackups().catch((error) => toast(error.message)));
$("#loadGit").addEventListener("click", () => loadGit().catch((error) => toast(error.message)));

Promise.all([loadMembers(), loadStatus(), loadSignatures(), loadDrafts(), loadBackups(), loadGit()])
  .catch((error) => toast(error.message));
