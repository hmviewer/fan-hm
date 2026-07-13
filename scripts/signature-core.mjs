import fs from "node:fs";
import path from "node:path";

export const CSV_COLUMNS = [
  "signature_number",
  "signature_title",
  "signature_members",
  "signature_tags",
  "signature_image_url",
  "signature_description",
  "signature_is_published",
  "signature_sort_order",
  "timeline_title",
  "timeline_members",
  "timeline_provider",
  "timeline_url",
  "timeline_start_time",
  "timeline_end_time",
  "timeline_is_primary",
  "timeline_is_published",
  "timeline_sort_order"
];

export const COLUMN_ALIASES = {
  signature_number: ["번호", "시그번호", "시그니처번호", "signature_number", "number"],
  signature_title: ["제목", "시그니처명", "signature_title", "title"],
  signature_members: ["멤버", "멤버명", "member", "members", "signature_members"],
  signature_tags: ["태그", "콘텐츠태그", "콘텐츠 태그", "tags", "signature_tags"],
  signature_image_url: ["이미지", "이미지URL", "이미지 URL", "signature_image_url", "image", "image_url"],
  signature_description: ["설명", "description", "signature_description"],
  signature_is_published: ["시그공개", "시그니처공개", "signature_is_published", "is_published"],
  signature_sort_order: ["정렬", "시그정렬", "signature_sort_order", "sort_order"],
  timeline_title: ["영상제목", "영상 제목", "타임라인제목", "timeline_title"],
  timeline_members: ["영상멤버", "타임라인멤버", "timeline_members"],
  timeline_provider: ["플랫폼", "provider", "timeline_provider"],
  timeline_url: ["영상링크", "영상 링크", "타임라인링크", "타임라인 링크", "url", "timeline_url", "source_url"],
  timeline_start_time: ["시작시간", "시작 시간", "start", "start_time", "timeline_start_time"],
  timeline_end_time: ["종료시간", "종료 시간", "end", "end_time", "timeline_end_time"],
  timeline_is_primary: ["대표", "대표영상", "대표 영상", "timeline_is_primary"],
  timeline_is_published: ["영상공개", "타임라인공개", "timeline_is_published"],
  timeline_sort_order: ["영상정렬", "타임라인정렬", "timeline_sort_order"]
};

const SAFE_URL_SCHEMES = new Set(["http:", "https:"]);
const SOOP_VOD_HOSTS = new Set(["vod.sooplive.com", "vod.afreecatv.com"]);
const TRUE_VALUES = new Set(["true", "1", "yes", "y", "공개", "예", "대표", "on"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "비공개", "아니오", "off"]);
export const SYSTEM_DEFAULT_DURATION = 30;
export const DURATION_SOURCES = new Set(["signature_default", "manually_confirmed", "estimated"]);

export function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

export function splitMulti(value) {
  return String(value ?? "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseBool(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return fallback;
}

export function parseTimelineInput(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const raw = String(value).trim().toLowerCase();
  if (/^\d+(?:\.\d+)?s?$/.test(raw)) return Math.floor(Number(raw.replace(/s$/, "")));

  const unitMatch = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (unitMatch && (unitMatch[1] || unitMatch[2] || unitMatch[3])) {
    return Number(unitMatch[1] || 0) * 3600 + Number(unitMatch[2] || 0) * 60 + Number(unitMatch[3] || 0);
  }

  if (/^\d+:\d{1,2}(?::\d{1,2})?$/.test(raw)) {
    const parts = raw.split(":").map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  return null;
}

export function formatTimelineTime(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds || 0)));
  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  const s = value % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function normalizePositiveSeconds(value, fallback = undefined) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

export function normalizeDurationSource(value, fallback = "estimated") {
  const clean = String(value || "").trim();
  return DURATION_SOURCES.has(clean) ? clean : fallback;
}

export function resolveTimelineEnd(timeline, signature = {}, nextTimeline = null, systemDefaultDuration = SYSTEM_DEFAULT_DURATION) {
  const startTime = Math.max(0, Number(timeline?.startTime || 0));
  const manualEnd = normalizePositiveSeconds(timeline?.endTime);
  const defaultDuration = normalizePositiveSeconds(signature?.defaultDuration);
  const fallbackDuration = normalizePositiveSeconds(systemDefaultDuration, SYSTEM_DEFAULT_DURATION);
  const nextStart = nextTimeline && Number(nextTimeline.startTime) > startTime ? Number(nextTimeline.startTime) : null;
  const limit = nextStart !== null ? Math.max(startTime, Math.floor(nextStart) - 1) : Infinity;

  let rawEnd;
  let source;
  let confirmed = false;
  if (manualEnd !== undefined && manualEnd > startTime) {
    rawEnd = manualEnd;
    source = "manually_confirmed";
    confirmed = true;
  } else if (defaultDuration !== undefined) {
    rawEnd = startTime + defaultDuration;
    source = "signature_default";
  } else {
    rawEnd = startTime + fallbackDuration;
    source = "estimated";
  }

  const effectiveEndTime = Math.max(startTime, Math.min(rawEnd, limit));
  return {
    effectiveEndTime,
    effectiveDuration: Math.max(0, effectiveEndTime - startTime),
    estimatedEndTime: rawEnd,
    nextTimelineStartTime: nextStart,
    durationSource: source,
    isEndTimeConfirmed: confirmed
  };
}

export function applyEffectiveTimelineEnds(signature, systemDefaultDuration = SYSTEM_DEFAULT_DURATION) {
  const timelines = (Array.isArray(signature?.timelines) ? signature.timelines : [])
    .map((timeline) => ({ ...timeline }))
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  for (let index = 0; index < timelines.length; index += 1) {
    const timeline = timelines[index];
    const nextTimeline = timelines
      .filter((entry) => Number(entry.startTime) > Number(timeline.startTime || 0))
      .sort((a, b) => Number(a.startTime || 0) - Number(b.startTime || 0))[0] || null;
    const resolved = resolveTimelineEnd(timeline, signature, nextTimeline, systemDefaultDuration);
    timeline.estimatedEndTime = resolved.estimatedEndTime;
    timeline.effectiveEndTime = resolved.effectiveEndTime;
    timeline.effectiveDuration = resolved.effectiveDuration;
    timeline.nextTimelineStartTime = resolved.nextTimelineStartTime;
    timeline.durationSource = resolved.durationSource;
    timeline.isEndTimeConfirmed = resolved.isEndTimeConfirmed;
    if (timeline.endTime !== undefined && Number(timeline.endTime) > Number(timeline.startTime || 0)) {
      timeline.duration = Number(timeline.endTime) - Number(timeline.startTime || 0);
    } else {
      delete timeline.duration;
    }
  }
  return timelines;
}

export function signatureReviewStats(data) {
  const normalized = normalizePublicData(data);
  const timelines = normalized.items.flatMap((signature) => signature.timelines.map((timeline) => ({ signature, timeline })));
  const totalTimelines = timelines.length;
  const confirmed = timelines.filter(({ timeline }) => timeline.isEndTimeConfirmed === true || timeline.durationSource === "manually_confirmed").length;
  const signatureDefault = timelines.filter(({ timeline }) => timeline.durationSource === "signature_default" && timeline.isEndTimeConfirmed !== true).length;
  const unconfirmed = timelines.filter(({ timeline }) => timeline.isEndTimeConfirmed !== true && timeline.durationSource !== "signature_default").length;
  const progress = totalTimelines ? ((confirmed + signatureDefault) / totalTimelines) * 100 : 100;
  return {
    totalTimelines,
    confirmed,
    signatureDefault,
    unconfirmed,
    progress
  };
}

export function reviewQueue(data) {
  const normalized = normalizePublicData(data);
  const items = [];
  for (const signature of normalized.items) {
    for (const timeline of signature.timelines) {
      const needsReview = timeline.endTime === undefined
        || timeline.isEndTimeConfirmed === false
        || timeline.durationSource === "signature_default"
        || timeline.durationSource === "estimated";
      if (!needsReview) continue;
      items.push({
        signatureNumber: signature.number,
        signatureTitle: signature.title,
        signatureMembers: signature.memberNames,
        defaultDuration: signature.defaultDuration,
        timelineId: timeline.id,
        timelineTitle: timeline.title,
        provider: timeline.provider,
        sourceUrl: timeline.sourceUrl,
        normalizedUrl: timeline.normalizedUrl,
        embedUrl: timeline.embedUrl,
        videoId: timeline.videoId,
        startTime: timeline.startTime,
        estimatedEndTime: timeline.estimatedEndTime,
        effectiveEndTime: timeline.effectiveEndTime,
        nextTimelineStartTime: timeline.nextTimelineStartTime,
        effectiveDuration: timeline.effectiveDuration,
        durationSource: timeline.durationSource,
        isEndTimeConfirmed: timeline.isEndTimeConfirmed,
        members: timeline.members
      });
    }
  }
  return items.sort((a, b) => Number(a.signatureNumber || 0) - Number(b.signatureNumber || 0) || Number(a.startTime || 0) - Number(b.startTime || 0));
}

export function confirmTimelineEnd(data, signatureNumber, timelineId, endTime) {
  const normalized = normalizePublicData(data);
  const signature = normalized.items.find((item) => String(item.number) === String(signatureNumber));
  if (!signature) throw new Error("시그니처를 찾을 수 없습니다.");
  const timeline = signature.timelines.find((item) => String(item.id) === String(timelineId));
  if (!timeline) throw new Error("타임라인을 찾을 수 없습니다.");
  const resolvedEnd = normalizePositiveSeconds(endTime);
  if (resolvedEnd === undefined || resolvedEnd <= Number(timeline.startTime || 0)) throw new Error("종료 시간은 시작 시간보다 커야 합니다.");
  timeline.endTime = resolvedEnd;
  timeline.duration = resolvedEnd - Number(timeline.startTime || 0);
  timeline.durationSource = "manually_confirmed";
  timeline.isEndTimeConfirmed = true;
  timeline.updatedAt = new Date().toISOString();
  return normalizePublicData({ ...normalized, generatedAt: new Date().toISOString(), items: normalized.items });
}

export function approveTimelineDefault(data, signatureNumber, timelineId) {
  const normalized = normalizePublicData(data);
  const signature = normalized.items.find((item) => String(item.number) === String(signatureNumber));
  if (!signature) throw new Error("시그니처를 찾을 수 없습니다.");
  const timeline = signature.timelines.find((item) => String(item.id) === String(timelineId));
  if (!timeline) throw new Error("타임라인을 찾을 수 없습니다.");
  delete timeline.endTime;
  delete timeline.duration;
  timeline.durationSource = normalizePositiveSeconds(signature.defaultDuration) !== undefined ? "signature_default" : "estimated";
  timeline.isEndTimeConfirmed = false;
  timeline.updatedAt = new Date().toISOString();
  return normalizePublicData({ ...normalized, generatedAt: new Date().toISOString(), items: normalized.items });
}

export function setSignatureDefaultDuration(data, signatureNumber, defaultDuration, applyToUnconfirmed = false) {
  const normalized = normalizePublicData(data);
  const signature = normalized.items.find((item) => String(item.number) === String(signatureNumber));
  if (!signature) throw new Error("시그니처를 찾을 수 없습니다.");
  const duration = normalizePositiveSeconds(defaultDuration);
  if (duration === undefined) throw new Error("기본 길이는 1초 이상이어야 합니다.");
  signature.defaultDuration = duration;
  if (applyToUnconfirmed) {
    signature.timelines = signature.timelines.map((timeline) => {
      if (timeline.durationSource === "manually_confirmed" || timeline.isEndTimeConfirmed === true) return timeline;
      const next = { ...timeline };
      delete next.endTime;
      delete next.duration;
      next.durationSource = "signature_default";
      next.isEndTimeConfirmed = false;
      next.updatedAt = new Date().toISOString();
      return next;
    });
  }
  return normalizePublicData({ ...normalized, generatedAt: new Date().toISOString(), items: normalized.items });
}

export function detectProvider(url) {
  let parsed;
  try {
    parsed = new URL(String(url || ""));
  } catch {
    return "external";
  }
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "youtube.com" || host === "youtu.be" || host === "youtube-nocookie.com") return "youtube";
  if (host === "vod.sooplive.com" || host === "vod.afreecatv.com" || host.includes("sooplive.com") || host.includes("afreecatv.com")) return "soop";
  if (host.includes("chzzk.naver.com")) return "chzzk";
  return "external";
}

export function extractSoopVodId(url) {
  let parsed;
  try {
    parsed = new URL(String(url || "").trim());
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  if (!SOOP_VOD_HOSTS.has(host)) return null;
  const parts = parsed.pathname.split("/").filter(Boolean);
  const playerIndex = parts.indexOf("player");
  const id = playerIndex >= 0 ? parts[playerIndex + 1] : "";
  return /^\d+$/.test(id || "") ? id : null;
}

export function normalizeSoopUrl(url) {
  const id = extractSoopVodId(url);
  if (!id) return null;
  let parsed;
  try {
    parsed = new URL(String(url || "").trim());
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  if (!SOOP_VOD_HOSTS.has(host)) return null;
  return `https://${host}/player/${id}`;
}

export function buildSoopEmbedUrl(vodId, host = "vod.sooplive.com") {
  const id = String(vodId || "").trim();
  const cleanHost = String(host || "vod.sooplive.com").replace(/^www\./, "").toLowerCase();
  if (!/^\d+$/.test(id) || !SOOP_VOD_HOSTS.has(cleanHost)) return null;
  return applySoopPlayerParams(`https://${cleanHost}/player/${id}/embed`);
}

export function applySoopPlayerParams(embedUrl) {
  let parsed;
  try {
    parsed = new URL(String(embedUrl || "").trim());
  } catch {
    return "";
  }
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  if (parsed.protocol !== "https:" || !SOOP_VOD_HOSTS.has(host) || !/^\/player\/\d+\/embed\/?$/.test(parsed.pathname)) return "";
  parsed.searchParams.set("autoPlay", "true");
  parsed.searchParams.set("mutePlay", "true");
  return parsed.toString();
}

export function isAllowedSoopEmbedUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url || "").trim());
  } catch {
    return false;
  }
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  return parsed.protocol === "https:" && SOOP_VOD_HOSTS.has(host) && /^\/player\/\d+\/embed\/?$/.test(parsed.pathname);
}

export function extractTimelineFromUrl(inputUrl) {
  const sourceUrl = String(inputUrl || "").trim();
  let parsed;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    return { provider: "external", sourceUrl, normalizedUrl: "", videoId: "", startTime: null, embeddable: false };
  }

  if (!SAFE_URL_SCHEMES.has(parsed.protocol)) {
    return { provider: "external", sourceUrl, normalizedUrl: "", videoId: "", startTime: null, embeddable: false, blocked: true };
  }

  const provider = detectProvider(sourceUrl);
  let videoId = "";
  const timeParam = parsed.searchParams.get("t") || parsed.searchParams.get("start") || parsed.hash.replace(/^#t=?/, "");
  const startTime = parseTimelineInput(timeParam);

  if (provider === "youtube") {
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") videoId = parsed.pathname.split("/").filter(Boolean)[0] || "";
    else if (parsed.pathname.startsWith("/shorts/")) videoId = parsed.pathname.split("/").filter(Boolean)[1] || "";
    else if (parsed.pathname.startsWith("/embed/")) videoId = parsed.pathname.split("/").filter(Boolean)[1] || "";
    else videoId = parsed.searchParams.get("v") || "";
    const normalizedUrl = videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : sourceUrl;
    return { provider, sourceUrl, normalizedUrl, videoId, startTime, embeddable: Boolean(videoId) };
  }

  if (provider === "soop") {
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const normalizedUrl = normalizeSoopUrl(sourceUrl);
    const soopVideoId = extractSoopVodId(sourceUrl) || "";
    const embedUrl = soopVideoId && SOOP_VOD_HOSTS.has(host) ? buildSoopEmbedUrl(soopVideoId, host) : "";
    return {
      provider,
      sourceUrl,
      normalizedUrl: normalizedUrl || "",
      videoId: soopVideoId,
      embedUrl: embedUrl || "",
      startTime,
      embeddable: Boolean(embedUrl),
      warning: embedUrl ? "" : "SOOP VOD ID를 확인할 수 없습니다. SOOP 플레이어 주소를 직접 입력해주세요. 권장 형식: https://vod.sooplive.com/player/영상번호"
    };
  }

  parsed.hash = "";
  parsed.searchParams.delete("t");
  parsed.searchParams.delete("start");
  return { provider, sourceUrl, normalizedUrl: parsed.toString(), videoId: "", startTime, embeddable: false };
}

export function normalizeTimelineUrl(url) {
  return extractTimelineFromUrl(url).normalizedUrl || String(url || "").trim();
}

export function buildPlaybackUrl(timeline) {
  if (!timeline) return "";
  if (timeline.provider === "soop") {
    if (isAllowedSoopEmbedUrl(timeline.embedUrl)) return applySoopPlayerParams(timeline.embedUrl);
    const parsed = extractTimelineFromUrl(timeline.sourceUrl || timeline.normalizedUrl || "");
    return parsed.embedUrl || buildSoopEmbedUrl(timeline.videoId) || "";
  }
  if (timeline.provider !== "youtube" || !timeline.videoId) return "";
  const params = new URLSearchParams({
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
    start: String(Math.max(0, Number(timeline.startTime || 0)))
  });
  if (Number(timeline.endTime) > Number(timeline.startTime)) params.set("end", String(Number(timeline.endTime)));
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(timeline.videoId)}?${params.toString()}`;
}

export function memberRef(name, imageUrl = "") {
  const clean = String(name || "").trim();
  return clean ? { id: slugify(clean) || clean, name: clean, ...(imageUrl ? { imageUrl } : {}) } : null;
}

export function normalizeLegacySignature(item, index = 0) {
  const number = item.number ?? item.id ?? index + 1;
  const id = String(item.id || `signature-${number}`).trim();
  const tagNames = Array.isArray(item.memberNames) ? item.memberNames : splitMulti(item.tag || "");
  const members = Array.isArray(item.members) && item.members.length
    ? item.members.map((m) => memberRef(m.name || m.id, m.imageUrl)).filter(Boolean)
    : tagNames.map((name) => memberRef(name)).filter(Boolean);
  const defaultDuration = normalizePositiveSeconds(item.defaultDuration);
  const baseSignature = { ...item, defaultDuration };
  const timelines = applyEffectiveTimelineEnds({ ...baseSignature, timelines: normalizeTimelines(item.timelines || [], members) });
  const publicTimelines = timelines.filter((timeline) => timeline.isPublished);
  const primary = pickPrimaryTimeline(timelines);
  const imageUrl = item.imageUrl || item.image || "";
  return {
    ...item,
    id,
    number,
    title: String(item.title || "시그니처"),
    description: String(item.description || ""),
    imageUrl,
    image: item.image || imageUrl,
    members,
    memberNames: members.map((m) => m.name),
    tag: item.tag || (members[0]?.name || ""),
    tags: Array.isArray(item.tags) ? item.tags : splitMulti(item.tags || ""),
    ...(defaultDuration !== undefined ? { defaultDuration } : {}),
    isPublished: item.isPublished !== false,
    sortOrder: Number(item.sortOrder ?? number ?? index),
    timelineCount: publicTimelines.length,
    primaryTimelineId: primary?.id || "",
    timelines
  };
}

export function normalizeTimelines(timelines, fallbackMembers = []) {
  let primarySeen = false;
  return (Array.isArray(timelines) ? timelines : [])
    .map((timeline, index) => {
      const parsed = extractTimelineFromUrl(timeline.sourceUrl || timeline.url || "");
      const provider = timeline.provider || parsed.provider;
      const startTime = Number.isFinite(Number(timeline.startTime)) ? Number(timeline.startTime) : parsed.startTime;
      const startNumber = Math.max(0, Number(startTime || 0));
      const parsedEndTime = normalizePositiveSeconds(timeline.endTime);
      const endTime = parsedEndTime !== undefined && parsedEndTime > startNumber ? parsedEndTime : undefined;
      const confirmed = timeline.isEndTimeConfirmed === true || (endTime !== undefined && normalizeDurationSource(timeline.durationSource, "manually_confirmed") === "manually_confirmed");
      const durationSource = endTime !== undefined
        ? normalizeDurationSource(timeline.durationSource, "manually_confirmed")
        : normalizeDurationSource(timeline.durationSource, "estimated");
      const embedUrl = provider === "soop"
        ? (isAllowedSoopEmbedUrl(timeline.embedUrl) ? applySoopPlayerParams(timeline.embedUrl) : parsed.embedUrl || buildSoopEmbedUrl(timeline.videoId))
        : timeline.embedUrl || parsed.embedUrl || "";
      const members = Array.isArray(timeline.members) && timeline.members.length
        ? timeline.members.map((m) => memberRef(m.name || m.id, m.imageUrl)).filter(Boolean)
        : fallbackMembers;
      const isPrimary = Boolean(timeline.isPrimary) && !primarySeen;
      if (isPrimary) primarySeen = true;
      return {
        id: String(timeline.id || `timeline-${index + 1}`),
        title: String(timeline.title || "타임라인"),
        provider,
        sourceUrl: String(timeline.sourceUrl || timeline.url || ""),
        normalizedUrl: timeline.normalizedUrl || parsed.normalizedUrl,
        videoId: timeline.videoId || parsed.videoId,
        ...(embedUrl ? { embedUrl } : {}),
        startTime: startNumber,
        ...(endTime !== undefined ? { endTime } : {}),
        ...(endTime !== undefined && Number(endTime) > startNumber ? { duration: Number(endTime) - startNumber } : {}),
        durationSource,
        isEndTimeConfirmed: confirmed,
        thumbnailUrl: String(timeline.thumbnailUrl || ""),
        members,
        isPrimary,
        isPublished: timeline.isPublished !== false,
        sortOrder: Number(timeline.sortOrder || index + 1),
        ...(timeline.createdAt ? { createdAt: timeline.createdAt } : {}),
        ...(timeline.updatedAt ? { updatedAt: timeline.updatedAt } : {})
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function pickPrimaryTimeline(timelines) {
  const publicTimelines = (Array.isArray(timelines) ? timelines : [])
    .filter((timeline) => timeline.isPublished)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  return publicTimelines.find((timeline) => timeline.isPrimary) || publicTimelines[0] || null;
}

export function normalizePublicData(data) {
  const sourceItems = Array.isArray(data?.items) ? data.items : (Array.isArray(data?.signatures) ? data.signatures : []);
  const items = sourceItems
    .map((item, index) => normalizeLegacySignature(item, index))
    .filter((item) => item.isPublished !== false)
    .sort((a, b) => Number(a.sortOrder || a.number || 0) - Number(b.sortOrder || b.number || 0));
  return {
    ...data,
    version: Number(data?.version || 1),
    generatedAt: data?.generatedAt || new Date().toISOString(),
    total: items.length,
    count: items.length,
    items,
    signatures: items
  };
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const input = String(text || "").replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows.filter((items) => items.some((item) => String(item).trim() !== ""));
}

export function detectColumnMapping(headers) {
  const normalizedHeaders = headers.map((header) => String(header || "").trim());
  const mapping = {};
  for (const column of CSV_COLUMNS) {
    const aliases = new Set([column, ...(COLUMN_ALIASES[column] || [])].map((item) => item.toLowerCase().replace(/\s+/g, "")));
    const index = normalizedHeaders.findIndex((header) => aliases.has(header.toLowerCase().replace(/\s+/g, "")));
    if (index >= 0) mapping[column] = index;
  }
  return mapping;
}

export function rowsFromCsv(text, mapping = null) {
  const table = parseCsv(text);
  if (table.length < 2) return { headers: table[0] || [], mapping: {}, rows: [] };
  const headers = table[0].map((header) => String(header || "").trim());
  const resolvedMapping = mapping || detectColumnMapping(headers);
  const rows = table.slice(1).map((cells, index) => {
    const row = { __line: index + 2 };
    for (const column of CSV_COLUMNS) {
      const columnIndex = resolvedMapping[column];
      row[column] = columnIndex === undefined ? "" : String(cells[columnIndex] || "").trim();
    }
    return row;
  });
  return { headers, mapping: resolvedMapping, rows };
}

export function validateRows(rows, members = []) {
  const memberNames = new Set(members.map((member) => member.name || member).filter(Boolean));
  const seenTimelines = [];
  const primaryBySignature = new Set();
  const results = rows.map((row) => {
    const errors = [];
    const warnings = [];
    const number = String(row.signature_number || "").trim();
    const title = String(row.signature_title || "").trim();
    const url = String(row.timeline_url || "").trim();
    const parsed = extractTimelineFromUrl(url);
    const provider = String(row.timeline_provider || parsed.provider || "external").toLowerCase();
    const startTime = row.timeline_start_time ? parseTimelineInput(row.timeline_start_time) : parsed.startTime;
    const endTime = row.timeline_end_time ? parseTimelineInput(row.timeline_end_time) : null;

    if (!number) errors.push({ column: "signature_number", value: row.signature_number, message: "시그니처 번호가 필요합니다." });
    if (!title) errors.push({ column: "signature_title", value: row.signature_title, message: "시그니처 제목이 필요합니다." });
    if (url) {
      try {
        const safeUrl = new URL(url);
        if (!SAFE_URL_SCHEMES.has(safeUrl.protocol)) errors.push({ column: "timeline_url", value: url, message: "http 또는 https URL만 허용됩니다." });
      } catch {
        errors.push({ column: "timeline_url", value: url, message: "올바른 URL이 아닙니다." });
      }
      if (!["youtube", "soop", "chzzk", "external"].includes(provider)) errors.push({ column: "timeline_provider", value: provider, message: "지원하지 않는 provider입니다." });
      if (provider === "soop" && !parsed.videoId) warnings.push({
        column: "timeline_url",
        value: url,
        message: "SOOP VOD ID를 확인할 수 없습니다. SOOP 플레이어 주소를 직접 입력해주세요. 권장 형식: https://vod.sooplive.com/player/영상번호"
      });
      if (startTime === null) errors.push({ column: "timeline_start_time", value: row.timeline_start_time, message: "시작 시간을 확인할 수 없습니다." });
      if (endTime !== null && startTime !== null && endTime <= startTime) errors.push({ column: "timeline_end_time", value: row.timeline_end_time, message: "종료 시간은 시작 시간보다 커야 합니다." });
    }

    splitMulti(row.signature_members).concat(splitMulti(row.timeline_members)).forEach((name) => {
      if (memberNames.size && !memberNames.has(name)) warnings.push({ column: "members", value: name, message: "현재 멤버 목록에 없는 이름입니다." });
    });

    const comparableTimeline = { provider, videoId: parsed.videoId, normalizedUrl: parsed.normalizedUrl, sourceUrl: url, startTime: Number(startTime || 0) };
    if (url && seenTimelines.some((timeline) => isSimilarTimeline(timeline, comparableTimeline))) {
      warnings.push({ column: "timeline_url", value: url, message: "유사한 타임라인이 CSV 안에 이미 있습니다." });
    }
    if (url) seenTimelines.push(comparableTimeline);

    const primaryKey = String(number);
    const isPrimary = parseBool(row.timeline_is_primary, false);
    if (isPrimary && primaryBySignature.has(primaryKey)) warnings.push({ column: "timeline_is_primary", value: row.timeline_is_primary, message: "대표 타임라인은 첫 번째 행만 적용됩니다." });
    if (isPrimary) primaryBySignature.add(primaryKey);

    return { row, parsed, provider, startTime, endTime, errors, warnings, status: errors.length ? "오류" : (warnings.length ? "경고" : "정상") };
  });
  return results;
}

export function timelineKey(timeline) {
  return `${timeline.provider}:${timeline.videoId || timeline.normalizedUrl || timeline.sourceUrl}:${Math.round(Number(timeline.startTime || 0) / 2)}`;
}

export function isSimilarTimeline(a, b) {
  const sameSource = String(a.provider || "") === String(b.provider || "")
    && String(a.videoId || a.normalizedUrl || a.sourceUrl || "") === String(b.videoId || b.normalizedUrl || b.sourceUrl || "");
  return sameSource && Math.abs(Number(a.startTime || 0) - Number(b.startTime || 0)) <= 2;
}

export function buildDraftFromRows(rows, existingData, members = [], options = {}) {
  const validation = validateRows(rows, members);
  const validRows = validation.filter((item) => !item.errors.length);
  const existing = normalizePublicData(existingData);
  const byNumber = new Map(existing.items.map((item) => [String(item.number), structuredClone(item)]));

  for (const item of validRows) {
    const row = item.row;
    const number = String(row.signature_number).trim();
    const original = byNumber.get(number);
    const signatureMembers = splitMulti(row.signature_members).map((name) => memberRef(name)).filter(Boolean);
    const tags = splitMulti(row.signature_tags);
    const signature = original || normalizeLegacySignature({
      number,
      title: row.signature_title,
      image: row.signature_image_url,
      imageUrl: row.signature_image_url,
      tag: signatureMembers[0]?.name || "",
      members: signatureMembers,
      tags,
      description: row.signature_description,
      isPublished: parseBool(row.signature_is_published, true),
      sortOrder: Number(row.signature_sort_order || number || byNumber.size + 1)
    }, byNumber.size);
    const rowDefaultDuration = normalizePositiveSeconds(row.signature_default_duration);

    if (options.updateSignatureInfo || !original) {
      signature.title = row.signature_title || signature.title;
      signature.description = row.signature_description || signature.description || "";
      signature.imageUrl = row.signature_image_url || signature.imageUrl || signature.image || "";
      signature.image = signature.image || signature.imageUrl;
      if (signatureMembers.length) signature.members = signatureMembers;
      if (tags.length) signature.tags = tags;
      signature.isPublished = parseBool(row.signature_is_published, signature.isPublished !== false);
      signature.sortOrder = Number(row.signature_sort_order || signature.sortOrder || number || 0);
      if (rowDefaultDuration !== undefined) signature.defaultDuration = rowDefaultDuration;
    }

    const sourceUrl = String(row.timeline_url || "").trim();
    if (sourceUrl) {
      const parsed = extractTimelineFromUrl(sourceUrl);
      const timelineMembers = splitMulti(row.timeline_members).map((name) => memberRef(name)).filter(Boolean);
      const timeline = {
        id: `timeline-${number}-${(signature.timelines || []).length + 1}`,
        title: row.timeline_title || row.signature_title || `시그니처 ${number}`,
        provider: row.timeline_provider || parsed.provider,
        sourceUrl,
        normalizedUrl: parsed.normalizedUrl,
        videoId: parsed.videoId,
        ...(parsed.embedUrl ? { embedUrl: parsed.embedUrl } : {}),
        startTime: Number(item.startTime || 0),
        ...(item.endTime !== null ? { endTime: Number(item.endTime) } : {}),
        ...(item.endTime !== null && Number(item.endTime) > Number(item.startTime || 0) ? { duration: Number(item.endTime) - Number(item.startTime || 0) } : {}),
        durationSource: item.endTime !== null ? "manually_confirmed" : (normalizePositiveSeconds(signature.defaultDuration) !== undefined ? "signature_default" : "estimated"),
        isEndTimeConfirmed: item.endTime !== null,
        thumbnailUrl: "",
        members: timelineMembers.length ? timelineMembers : signature.members,
        isPrimary: parseBool(row.timeline_is_primary, false),
        isPublished: parseBool(row.timeline_is_published, true),
        sortOrder: Number(row.timeline_sort_order || ((signature.timelines || []).length + 1)),
        createdAt: new Date().toISOString()
      };
      const hasDuplicate = (signature.timelines || []).some((entry) => isSimilarTimeline(entry, timeline));
      if (!hasDuplicate || options.allowDuplicates) {
        if (timeline.isPrimary) signature.timelines.forEach((entry) => { entry.isPrimary = false; });
        signature.timelines = [...(signature.timelines || []), timeline];
      }
    }

    const normalized = normalizeLegacySignature(signature);
    byNumber.set(number, normalized);
  }

  const items = [...byNumber.values()].sort((a, b) => Number(a.sortOrder || a.number || 0) - Number(b.sortOrder || b.number || 0));
  return {
    data: normalizePublicData({ ...existing, generatedAt: new Date().toISOString(), items }),
    validation,
    summary: summarizeValidation(validation)
  };
}

export function summarizeValidation(validation) {
  return {
    totalRows: validation.length,
    okRows: validation.filter((item) => !item.errors.length && !item.warnings.length).length,
    warningRows: validation.filter((item) => !item.errors.length && item.warnings.length).length,
    errorRows: validation.filter((item) => item.errors.length).length
  };
}

export function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildCsv(rows) {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

export function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}`);
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  JSON.parse(fs.readFileSync(tmp, "utf8"));
  fs.renameSync(tmp, filePath);
}
