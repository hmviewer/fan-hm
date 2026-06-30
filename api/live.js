import fs from "node:fs/promises";
import path from "node:path";

const MEMBERS_PATH = path.join(process.cwd(), "static-api", "members.json");
const SOOP_LIVE_URL = "https://live.sooplive.co.kr/afreeca/player_live_api.php";
const SOOP_BROAD_LIST_URL = "https://live.sooplive.co.kr/api/main_broad_list_api.php";
const LIVE_CACHE_TTL_MS = 15000;

const liveCache = globalThis.__THE_HM_LIVE_CACHE || {
  payload: null,
  expiresAt: 0,
  pending: null
};
globalThis.__THE_HM_LIVE_CACHE = liveCache;

function liveThumbnailCandidates(broadNo, direct = "") {
  const id = String(broadNo || "").trim();
  const first = String(direct || "").trim();
  return [
    first,
    id ? `https://liveimg.sooplive.co.kr/m/${encodeURIComponent(id)}` : "",
    id ? `https://liveimg.afreecatv.com/m/${encodeURIComponent(id)}` : "",
    id ? `https://liveimg.sooplive.co.kr/h/${encodeURIComponent(id)}` : "",
    id ? `https://liveimg.afreecatv.com/h/${encodeURIComponent(id)}` : ""
  ].filter(Boolean).filter((url, index, arr) => arr.indexOf(url) === index);
}

function numberFrom(...values) {
  for (const value of values) {
    const normalized = Number(String(value ?? "").replaceAll(",", "").trim());
    if (Number.isFinite(normalized) && normalized > 0) return normalized;
  }
  return 0;
}

function normalizeProtocolUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  return url.startsWith("//") ? `https:${url}` : url;
}

async function fetchBroadListInfo(channel) {
  const broadNo = String(channel?.BNO || channel?.BROAD_NO || channel?.broad_no || "").trim();
  const userId = String(channel?.BJID || channel?.USER_ID || "").trim().toLowerCase();
  const category = String(channel?.CATE || "").trim();
  if (!broadNo && !userId) return null;

  const selectValue = category || "all";
  const selectType = category ? "cate" : "action";
  const maxPages = category ? 12 : 2;
  for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
    const query = new URLSearchParams({
      selectType,
      selectValue,
      orderType: "view_cnt",
      pageNo: String(pageNo),
      lang: "ko_KR"
    });
    const response = await fetch(`${SOOP_BROAD_LIST_URL}?${query.toString()}`, {
      headers: { "accept": "application/json", "user-agent": "Mozilla/5.0" }
    });
    if (!response.ok) continue;
    const payload = await response.json();
    const rows = Array.isArray(payload?.broad) ? payload.broad : [];
    const matched = rows.find((row) => {
      const rowBroadNo = String(row?.broad_no || row?.BNO || "").trim();
      const rowUserId = String(row?.user_id || row?.BJID || "").trim().toLowerCase();
      return (broadNo && rowBroadNo === broadNo) || (userId && rowUserId === userId);
    });
    if (matched) return matched;
    if (rows.length < 60) break;
  }
  return null;
}

function normalizeChannel(member, channel) {
  const result = Number(channel?.RESULT || 0);
  const isLive = result === 1;
  const broadNo = String(channel?.BNO || channel?.BROAD_NO || channel?.broad_no || "").trim();
  const title = String(channel?.TITLE || channel?.BROAD_TITLE || channel?.broad_title || "").trim();
  const viewer = numberFrom(channel?.TOTAL_VIEW_CNT, channel?.total_view_cnt, channel?.VIEW_CNT, channel?.CURRENT_VIEW_CNT, channel?.current_view_cnt, channel?.PC_VIEW_CNT, channel?.pc_view_cnt);
  const thumbnail = normalizeProtocolUrl(channel?.BROAD_IMG || channel?.broad_thumb || channel?.BROAD_THUMB || channel?.BROAD_THUMBNAIL || channel?.THUMBNAIL || channel?.THUMB || channel?.TITLE_IMG || "");
  const thumbnailCandidates = liveThumbnailCandidates(broadNo, thumbnail);
  const startedAt = String(channel?.BROAD_START || channel?.broad_start || channel?.START_TIME || "").trim();
  const soopId = String(member.soopId || member.id || "").trim();

  return {
    ...member,
    soopId,
    isLive,
    viewer: isLive ? viewer : 0,
    title: isLive ? title : "",
    startedAt: isLive ? startedAt : "",
    thumbnail: isLive ? (thumbnailCandidates[0] || "") : "",
    thumbnailCandidates: isLive ? thumbnailCandidates : [],
    broadNo: isLive ? broadNo : "",
    url: isLive && broadNo
      ? `https://play.sooplive.co.kr/${encodeURIComponent(soopId)}/${encodeURIComponent(broadNo)}`
      : `https://play.sooplive.co.kr/${encodeURIComponent(soopId)}`
  };
}

async function readMembers() {
  const raw = await fs.readFile(MEMBERS_PATH, "utf8");
  const data = JSON.parse(raw);
  return Array.isArray(data) ? data : [];
}

async function fetchLiveState(member) {
  const soopId = String(member.soopId || member.id || "").trim();
  if (!soopId) return { ...member, isLive: false };

  const body = new URLSearchParams({
    bid: soopId,
    type: "live",
    player_type: "html5"
  });

  const response = await fetch(SOOP_LIVE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "origin": "https://play.sooplive.com",
      "referer": `https://play.sooplive.com/${encodeURIComponent(soopId)}`
    },
    body
  });

  if (!response.ok) throw new Error(`SOOP ${response.status}`);
  const payload = await response.json();
  const channel = payload?.CHANNEL || {};
  if (Number(channel?.RESULT || 0) === 1) {
    const broadInfo = await fetchBroadListInfo(channel).catch(() => null);
    return normalizeChannel(member, broadInfo ? { ...channel, ...broadInfo } : channel);
  }
  if (channel?.CATE) {
    const broadInfo = await fetchBroadListInfo({ BJID: soopId, CATE: channel.CATE }).catch(() => null);
    if (broadInfo) {
      return normalizeChannel(member, { ...broadInfo, RESULT: 1 });
    }
  }
  return normalizeChannel(member, channel);
}

async function buildLivePayload() {
  const members = await readMembers();
  const settled = await Promise.allSettled(members.map(fetchLiveState));
  const liveMembers = settled.map((item, index) => {
    if (item.status === "fulfilled") return item.value;
    const member = members[index] || {};
    const soopId = String(member.soopId || member.id || "").trim();
    return {
      ...member,
      soopId,
      isLive: false,
      viewer: 0,
      title: "",
      startedAt: "",
      thumbnail: "",
      thumbnailCandidates: [],
      broadNo: "",
      url: soopId ? `https://play.sooplive.co.kr/${encodeURIComponent(soopId)}` : "#"
    };
  });

  return {
    members: liveMembers,
    liveCount: liveMembers.filter((member) => member.isLive).length,
    total: liveMembers.length,
    updatedAt: Math.floor(Date.now() / 1000)
  };
}

async function getLivePayload() {
  const now = Date.now();
  if (liveCache.payload && liveCache.expiresAt > now) return liveCache.payload;
  if (liveCache.pending) return liveCache.pending;

  liveCache.pending = buildLivePayload()
    .then((payload) => {
      liveCache.payload = payload;
      liveCache.expiresAt = Date.now() + LIVE_CACHE_TTL_MS;
      return payload;
    })
    .finally(() => {
      liveCache.pending = null;
    });

  return liveCache.pending;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=10, stale-while-revalidate=20");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    res.status(200).json(await getLivePayload());
  } catch (error) {
    res.status(500).json({
      members: [],
      liveCount: 0,
      total: 0,
      updatedAt: Math.floor(Date.now() / 1000),
      error: "LIVE 정보를 불러오지 못했습니다."
    });
  }
}
