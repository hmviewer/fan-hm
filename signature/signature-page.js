const DATA_URL = "../static-api/signatures.json";
const FAVORITE_KEY = "the-hm-signature-favorites";
const PAGE_SIZE = 40;

const grid = document.getElementById("signatureGrid");
const searchInput = document.getElementById("searchInput");
const memberFilters = document.getElementById("memberFilters");
const videoFilters = document.getElementById("videoFilters");
const rangeTabs = document.getElementById("rangeTabs");
const pagination = document.getElementById("signaturePagination");
const totalCount = document.getElementById("totalCount");
const filteredCount = document.getElementById("filteredCount");
const sectionTitle = document.getElementById("sectionTitle");
const sectionNote = document.getElementById("sectionNote");

const modal = document.getElementById("signatureModal");
const modalBackdrop = document.getElementById("signatureBackdrop");
const modalPanel = document.getElementById("signatureDialog");
const modalClose = document.getElementById("signatureClose");
const modalTitle = document.getElementById("signatureModalTitle");
const modalKicker = document.getElementById("signatureModalKicker");
const modalMembers = document.getElementById("signatureModalMembers");
const modalFavorite = document.getElementById("signatureFavorite");
const modalShare = document.getElementById("signatureShare");
const modalPlayer = document.getElementById("signaturePlayer");
const modalPlayerMeta = document.getElementById("signaturePlayerMeta");
const modalTags = document.getElementById("signatureTags");
const modalInfo = document.getElementById("signatureInfo");
const modalSource = document.getElementById("signatureSource");
const modalShareBottom = document.getElementById("signatureShareBottom");
const modalFeedback = document.getElementById("signatureFeedback");
const timelineList = document.getElementById("timelineList");
const timelineTitle = document.getElementById("timelineTitle");

const ranges = [
  { id: "all", label: "전체", min: 0, max: Infinity },
  { id: "under1000", label: "~999", min: 0, max: 999 },
  { id: "1000", label: "1000대", min: 1000, max: 1999 },
  { id: "2000", label: "2000대", min: 2000, max: 2999 },
  { id: "3000", label: "3000대", min: 3000, max: 9999 },
  { id: "10000", label: "10000+", min: 10000, max: Infinity },
];

let signatures = [];
let selectedRange = "all";
let selectedMember = "all";
let selectedVideo = "all";
let currentPage = 1;
let activeSignature = null;
let activeTimeline = null;
let lastFocus = null;
let favoriteIds = readFavorites();

function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function parseTime(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const raw = String(value).trim().toLowerCase();
  if (/^\d+(?:\.\d+)?s?$/.test(raw)) return Math.floor(Number(raw.replace(/s$/, "")));
  const unit = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (unit && (unit[1] || unit[2] || unit[3])) return Number(unit[1] || 0) * 3600 + Number(unit[2] || 0) * 60 + Number(unit[3] || 0);
  if (/^\d+:\d{1,2}(?::\d{1,2})?$/.test(raw)) {
    const parts = raw.split(":").map(Number);
    return parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return null;
}

function formatTime(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds || 0)));
  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  const s = value % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function detectProvider(url) {
  try {
    const host = new URL(String(url || "")).hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtube.com" || host === "youtu.be" || host === "youtube-nocookie.com") return "youtube";
    if (host.includes("sooplive.com") || host.includes("afreecatv.com")) return "soop";
    if (host.includes("chzzk.naver.com")) return "chzzk";
  } catch {}
  return "external";
}

function parseYouTube(url) {
  try {
    const parsed = new URL(String(url || ""));
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    let videoId = "";
    if (host === "youtu.be") videoId = parsed.pathname.split("/").filter(Boolean)[0] || "";
    else if (parsed.pathname.startsWith("/shorts/")) videoId = parsed.pathname.split("/").filter(Boolean)[1] || "";
    else if (parsed.pathname.startsWith("/embed/")) videoId = parsed.pathname.split("/").filter(Boolean)[1] || "";
    else videoId = parsed.searchParams.get("v") || "";
    const urlTime = parseTime(parsed.searchParams.get("t") || parsed.searchParams.get("start") || parsed.hash.replace(/^#t=?/, ""));
    return { videoId, urlTime, normalizedUrl: videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : String(url || "") };
  } catch {
    return { videoId: "", urlTime: null, normalizedUrl: String(url || "") };
  }
}

function normalizeMemberRef(member) {
  if (!member) return null;
  if (typeof member === "string") return { id: member.trim(), name: member.trim() };
  const name = String(member.name || member.id || "").trim();
  return name ? { id: String(member.id || name).trim(), name, imageUrl: member.imageUrl || "" } : null;
}

function normalizeTimeline(timeline, fallbackMembers, number, index) {
  const sourceUrl = String(timeline.sourceUrl || timeline.url || "").trim();
  const provider = timeline.provider || detectProvider(sourceUrl);
  const youtube = provider === "youtube" ? parseYouTube(sourceUrl) : { videoId: "", urlTime: null, normalizedUrl: sourceUrl };
  const startTime = Number.isFinite(Number(timeline.startTime)) ? Number(timeline.startTime) : Number(youtube.urlTime || 0);
  const endTime = Number.isFinite(Number(timeline.endTime)) ? Number(timeline.endTime) : undefined;
  const members = (Array.isArray(timeline.members) && timeline.members.length ? timeline.members : fallbackMembers)
    .map(normalizeMemberRef)
    .filter(Boolean);
  return {
    id: String(timeline.id || `timeline-${number}-${index + 1}`),
    title: String(timeline.title || "타임라인"),
    provider,
    sourceUrl,
    normalizedUrl: timeline.normalizedUrl || youtube.normalizedUrl || sourceUrl,
    videoId: timeline.videoId || youtube.videoId || "",
    startTime,
    ...(endTime !== undefined ? { endTime } : {}),
    duration: endTime !== undefined && endTime > startTime ? endTime - startTime : undefined,
    thumbnailUrl: String(timeline.thumbnailUrl || ""),
    members,
    isPrimary: Boolean(timeline.isPrimary),
    isPublished: timeline.isPublished !== false,
    sortOrder: Number(timeline.sortOrder || index + 1)
  };
}

function normalizeSignature(item, index) {
  const number = item.number ?? index + 1;
  const id = String(item.id || `signature-${number}`);
  const legacyMember = item.tag ? [{ id: item.tag, name: item.tag }] : [];
  const members = (Array.isArray(item.members) && item.members.length ? item.members : (Array.isArray(item.memberNames) ? item.memberNames : legacyMember))
    .map(normalizeMemberRef)
    .filter(Boolean);
  const timelines = (Array.isArray(item.timelines) ? item.timelines : [])
    .map((timeline, timelineIndex) => normalizeTimeline(timeline, members, number, timelineIndex))
    .filter((timeline) => timeline.isPublished)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const primaryTimeline = timelines.find((timeline) => timeline.isPrimary) || timelines[0] || null;
  return {
    ...item,
    id,
    number,
    title: String(item.title || "시그니처"),
    description: String(item.description || ""),
    imageUrl: item.imageUrl || item.image || "",
    members,
    memberNames: members.map((member) => member.name),
    tags: Array.isArray(item.tags) ? item.tags : [],
    isPublished: item.isPublished !== false,
    sortOrder: Number(item.sortOrder ?? number ?? index),
    timelineCount: timelines.length,
    primaryTimelineId: primaryTimeline?.id || "",
    timelines
  };
}

function readFavorites() {
  try {
    const parsed = JSON.parse(localStorage.getItem(FAVORITE_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writeFavorites() {
  try {
    localStorage.setItem(FAVORITE_KEY, JSON.stringify([...favoriteIds]));
  } catch {}
}

function currentRange() {
  return ranges.find((range) => range.id === selectedRange) || ranges[0];
}

function filteredItems() {
  const q = searchInput.value.trim().toLowerCase();
  const range = currentRange();
  return signatures.filter((item) => {
    const n = Number(item.number || 0);
    const haystack = [
      item.number,
      item.title,
      ...item.memberNames,
      ...item.tags
    ].join(" ").toLowerCase();
    const passSearch = !q || haystack.includes(q);
    const passMember = selectedMember === "all" || item.memberNames.includes(selectedMember);
    const passRange = n >= range.min && n <= range.max;
    const passVideo = selectedVideo === "all" || (selectedVideo === "has" ? item.timelineCount > 0 : item.timelineCount === 0);
    return passSearch && passMember && passRange && passVideo;
  });
}

function renderRangeTabs() {
  rangeTabs.innerHTML = ranges.map((range) => `<button class="range-btn ${range.id === selectedRange ? "active" : ""}" type="button" data-range="${range.id}">${range.label}</button>`).join("");
}

function renderMemberFilters() {
  const members = [...new Set(signatures.flatMap((item) => item.memberNames).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  memberFilters.innerHTML = [`<button class="filter-btn ${selectedMember === "all" ? "active" : ""}" type="button" data-member="all">전체</button>`]
    .concat(members.map((member) => `<button class="filter-btn ${selectedMember === member ? "active" : ""}" type="button" data-member="${esc(member)}">${esc(member)}</button>`))
    .join("");
}

function renderVideoFilters() {
  const filters = [
    ["all", "전체"],
    ["has", "영상 있음"],
    ["ready", "영상 준비 중"]
  ];
  videoFilters.innerHTML = filters.map(([id, label]) => `<button class="filter-btn ${selectedVideo === id ? "active" : ""}" type="button" data-video="${id}">${label}</button>`).join("");
}

function timelineBadge(item) {
  return item.timelineCount > 0 ? `영상 ${item.timelineCount.toLocaleString("ko-KR")}개` : "영상 준비 중";
}

function cardMarkup(item) {
  const title = `${item.number ? item.number + " · " : ""}${item.title || "시그니처"}`;
  const member = item.memberNames.length ? `<span class="member-chip">${esc(item.memberNames.join(" · "))}</span>` : "";
  return `
    <button class="sig-card" type="button" data-id="${esc(item.id)}" aria-label="${esc(title)} 상세 보기">
      <span class="sig-thumb"><img src="${esc(item.imageUrl)}" alt="${esc(title)}" loading="lazy" decoding="async" width="320" height="180"></span>
      <span class="sig-meta">
        <span class="sig-row"><span class="sig-number">${esc(item.number || "")}</span><span class="sig-video-badge">${timelineBadge(item)}</span></span>
        <strong>${esc(item.title || "시그니처")}</strong>
        ${member}
      </span>
    </button>`;
}

function renderPagination(totalItems) {
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);
  if (totalPages <= 1) {
    pagination.innerHTML = "";
    return;
  }
  const pages = [];
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  for (let page = start; page <= end; page += 1) pages.push(page);
  pagination.innerHTML = `
    <button class="page-btn" type="button" data-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""}>이전</button>
    ${pages.map((page) => `<button class="page-btn ${page === currentPage ? "active" : ""}" type="button" data-page="${page}" aria-current="${page === currentPage ? "page" : "false"}">${page}</button>`).join("")}
    <button class="page-btn" type="button" data-page="${currentPage + 1}" ${currentPage === totalPages ? "disabled" : ""}>다음</button>`;
}

function render() {
  const items = filteredItems();
  const range = currentRange();
  const start = (currentPage - 1) * PAGE_SIZE;
  const visibleItems = items.slice(start, start + PAGE_SIZE);
  totalCount.textContent = signatures.length.toLocaleString("ko-KR");
  filteredCount.textContent = items.length.toLocaleString("ko-KR");
  sectionTitle.textContent = selectedMember === "all" ? "전체 시그니처" : `${selectedMember} 시그니처`;
  sectionNote.textContent = `${range.label} · ${items.length.toLocaleString("ko-KR")}개`;
  renderRangeTabs();
  renderMemberFilters();
  renderVideoFilters();
  renderPagination(items.length);
  grid.innerHTML = visibleItems.length ? visibleItems.map(cardMarkup).join("") : `<div class="empty-card">검색 결과가 없습니다.</div>`;
}

function memberTags(members) {
  const safeMembers = members && members.length ? members : [];
  return safeMembers.length
    ? safeMembers.map((member) => `<span class="modal-member-chip"><span class="member-dot" aria-hidden="true">${esc(member.name.slice(0, 1))}</span>${esc(member.name)}</span>`).join("")
    : `<span class="modal-member-chip muted">멤버 미지정</span>`;
}

function contentTags(tags) {
  return tags && tags.length ? tags.map((tag) => `<span class="content-chip">${esc(tag)}</span>`).join("") : `<span class="content-chip muted">콘텐츠 태그 없음</span>`;
}

function providerLabel(provider) {
  return { youtube: "YouTube", soop: "SOOP", chzzk: "CHZZK", external: "외부 영상" }[provider] || "외부 영상";
}

function timelineRange(timeline) {
  if (!timeline) return "";
  const start = formatTime(timeline.startTime || 0);
  return Number(timeline.endTime) > Number(timeline.startTime) ? `${start} ~ ${formatTime(timeline.endTime)}` : `${start}부터`;
}

function buildYoutubeEmbed(timeline) {
  if (!timeline || timeline.provider !== "youtube" || !timeline.videoId) return "";
  const params = new URLSearchParams({
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
    start: String(Math.max(0, Number(timeline.startTime || 0)))
  });
  if (Number(timeline.endTime) > Number(timeline.startTime)) params.set("end", String(Number(timeline.endTime)));
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(timeline.videoId)}?${params.toString()}`;
}

function renderPlayer() {
  if (!activeTimeline) {
    modalPlayer.innerHTML = `<div class="player-empty"><strong>영상 준비 중</strong><span>등록된 영상이 없습니다.</span></div>`;
    modalPlayerMeta.innerHTML = `<span>등록된 영상이 없습니다</span>`;
    modalSource.hidden = true;
    return;
  }
  const embedUrl = buildYoutubeEmbed(activeTimeline);
  if (embedUrl) {
    modalPlayer.innerHTML = `<iframe class="signature-iframe" src="${esc(embedUrl)}" title="${esc(activeTimeline.title)}" loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
  } else {
    modalPlayer.innerHTML = `<div class="player-empty"><strong>${providerLabel(activeTimeline.provider)}</strong><span>이 플랫폼은 내부 재생을 지원하지 않아 원본 영상으로 이동합니다.</span></div>`;
  }
  const duration = activeTimeline.duration ? ` · 재생 구간 ${activeTimeline.duration}초` : "";
  modalPlayerMeta.innerHTML = `<span>${providerLabel(activeTimeline.provider)} · ${esc(activeTimeline.title)}</span><span>${timelineRange(activeTimeline)}${duration}</span>`;
  modalSource.hidden = !activeTimeline.sourceUrl;
  modalSource.href = activeTimeline.sourceUrl || "#";
}

function renderTimelineList() {
  timelineTitle.textContent = `등록된 타임라인 (${activeSignature.timelines.length})`;
  if (!activeSignature.timelines.length) {
    timelineList.innerHTML = `<div class="timeline-empty">등록된 영상이 없습니다.</div>`;
    return;
  }
  timelineList.innerHTML = activeSignature.timelines.map((timeline, index) => {
    const selected = activeTimeline?.id === timeline.id;
    const thumb = timeline.thumbnailUrl || activeSignature.imageUrl;
    const duration = timeline.duration ? `${timeline.duration}초` : "구간 미지정";
    return `
      <button class="timeline-card ${selected ? "active" : ""}" type="button" data-timeline="${esc(timeline.id)}" aria-pressed="${selected ? "true" : "false"}">
        <span class="timeline-index">${index + 1}</span>
        <span class="timeline-thumb"><img src="${esc(thumb)}" alt="" loading="lazy" decoding="async"></span>
        <span class="timeline-body">
          <span class="timeline-top">${timeline.isPrimary ? `<span class="primary-badge">대표</span>` : ""}${selected ? `<span class="playing-badge">선택됨</span>` : ""}</span>
          <strong>${esc(timeline.title)}</strong>
          <span>${providerLabel(timeline.provider)} · ${timelineRange(timeline)} · ${duration}</span>
          <span class="timeline-members">${memberTags(timeline.members.length ? timeline.members : activeSignature.members)}</span>
        </span>
      </button>`;
  }).join("");
}

function renderInfo() {
  const primary = activeSignature.timelines.find((timeline) => timeline.id === activeSignature.primaryTimelineId) || activeSignature.timelines[0];
  modalInfo.innerHTML = [
    ["시그니처 번호", activeSignature.number],
    ["시그니처 제목", activeSignature.title],
    ["등록 멤버", activeSignature.memberNames.join(", ") || "-"],
    ["등록일", activeSignature.createdAt ? new Date(activeSignature.createdAt).toLocaleDateString("ko-KR") : "-"],
    ["대표 영상", primary?.title || "-"],
    ["총 타임라인", `${activeSignature.timelineCount.toLocaleString("ko-KR")}개`]
  ].map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("");
}

function selectTimeline(timelineId) {
  activeTimeline = activeSignature.timelines.find((timeline) => timeline.id === timelineId) || activeSignature.timelines.find((timeline) => timeline.id === activeSignature.primaryTimelineId) || activeSignature.timelines[0] || null;
  renderPlayer();
  renderTimelineList();
  renderInfo();
  updateUrl();
}

function isFavorite(id) {
  return favoriteIds.has(id);
}

function renderFavorite() {
  const on = isFavorite(activeSignature.id);
  modalFavorite.classList.toggle("active", on);
  modalFavorite.textContent = on ? "즐겨찾기 해제" : "즐겨찾기";
  modalFavorite.setAttribute("aria-pressed", on ? "true" : "false");
}

function openSignature(signatureId, timelineId = "", trigger = null) {
  activeSignature = signatures.find((item) => item.id === signatureId || String(item.number) === String(signatureId));
  if (!activeSignature) return;
  lastFocus = trigger || document.activeElement;
  activeTimeline = activeSignature.timelines.find((timeline) => timeline.id === timelineId) || activeSignature.timelines.find((timeline) => timeline.id === activeSignature.primaryTimelineId) || activeSignature.timelines[0] || null;
  modalKicker.textContent = `SIGNATURE ${activeSignature.number || ""}`;
  modalTitle.textContent = `${activeSignature.number ? activeSignature.number + ". " : ""}${activeSignature.title}`;
  modalMembers.innerHTML = memberTags(activeSignature.members);
  modalTags.innerHTML = contentTags(activeSignature.tags);
  renderFavorite();
  renderPlayer();
  renderTimelineList();
  renderInfo();
  modal.classList.add("active");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("signature-modal-open");
  updateUrl();
  setTimeout(() => modalClose.focus(), 0);
}

function closeSignature() {
  if (!modal.classList.contains("active")) return;
  modal.classList.remove("active");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("signature-modal-open");
  modalPlayer.innerHTML = "";
  activeSignature = null;
  activeTimeline = null;
  const url = new URL(window.location.href);
  url.searchParams.delete("signature");
  url.searchParams.delete("timeline");
  history.replaceState(null, "", url);
  if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
}

function updateUrl() {
  if (!activeSignature) return;
  const url = new URL(window.location.href);
  url.searchParams.set("signature", activeSignature.id);
  if (activeTimeline?.id) url.searchParams.set("timeline", activeTimeline.id);
  else url.searchParams.delete("timeline");
  history.replaceState(null, "", url);
}

async function shareActive() {
  if (!activeSignature) return;
  updateUrl();
  const url = window.location.href;
  try {
    if (navigator.share) await navigator.share({ title: activeSignature.title, url });
    else await navigator.clipboard.writeText(url);
    modalFeedback.textContent = navigator.share ? "공유 창을 열었습니다." : "공유 URL을 복사했습니다.";
  } catch {
    try {
      await navigator.clipboard.writeText(url);
      modalFeedback.textContent = "공유 URL을 복사했습니다.";
    } catch {
      modalFeedback.textContent = url;
    }
  }
  setTimeout(() => { modalFeedback.textContent = ""; }, 2200);
}

function trapFocus(event) {
  if (!modal.classList.contains("active") || event.key !== "Tab") return;
  const focusable = [...modal.querySelectorAll("a[href], button:not([disabled]), iframe, [tabindex]:not([tabindex='-1'])")].filter((el) => el.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function resetPaging() {
  currentPage = 1;
  render();
}

rangeTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-range]");
  if (!button) return;
  selectedRange = button.dataset.range;
  resetPaging();
});

memberFilters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-member]");
  if (!button) return;
  selectedMember = button.dataset.member;
  resetPaging();
});

videoFilters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-video]");
  if (!button) return;
  selectedVideo = button.dataset.video;
  resetPaging();
});

pagination.addEventListener("click", (event) => {
  const button = event.target.closest("[data-page]");
  if (!button || button.disabled) return;
  currentPage = Math.max(1, Number(button.dataset.page || 1));
  render();
  grid.scrollIntoView({ behavior: "smooth", block: "start" });
});

grid.addEventListener("click", (event) => {
  const button = event.target.closest(".sig-card");
  if (button) openSignature(button.dataset.id, "", button);
});

timelineList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-timeline]");
  if (button) selectTimeline(button.dataset.timeline);
});

searchInput.addEventListener("input", resetPaging);
modalClose.addEventListener("click", closeSignature);
modalBackdrop.addEventListener("click", closeSignature);
modalShare.addEventListener("click", shareActive);
modalShareBottom.addEventListener("click", shareActive);
modalFavorite.addEventListener("click", () => {
  if (!activeSignature) return;
  if (favoriteIds.has(activeSignature.id)) favoriteIds.delete(activeSignature.id);
  else favoriteIds.add(activeSignature.id);
  writeFavorites();
  renderFavorite();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeSignature();
  trapFocus(event);
});

async function loadSignatures() {
  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error("signature data");
    const payload = await response.json();
    const rows = Array.isArray(payload.items) ? payload.items : (Array.isArray(payload.signatures) ? payload.signatures : []);
    signatures = rows.map(normalizeSignature).filter((item) => item.isPublished).sort((a, b) => Number(a.sortOrder || a.number || 0) - Number(b.sortOrder || b.number || 0));
    render();
    const params = new URLSearchParams(window.location.search);
    const signatureParam = params.get("signature");
    if (signatureParam) openSignature(signatureParam, params.get("timeline") || "");
  } catch (error) {
    console.error(error);
    grid.innerHTML = `<div class="empty-card">시그니처 데이터를 불러오지 못했습니다.</div>`;
    sectionNote.textContent = "오류";
  }
}

loadSignatures();
