import fs from "node:fs/promises";
import path from "node:path";

const MEMBERS_PATH = path.join(process.cwd(), "static-api", "members.json");
const SOOP_LIVE_URL = "https://live.sooplive.co.kr/afreeca/player_live_api.php";

function normalizeChannel(member, channel) {
  const result = Number(channel?.RESULT || 0);
  const isLive = result === 1;
  const broadNo = String(channel?.BNO || channel?.BROAD_NO || channel?.broad_no || "").trim();
  const title = String(channel?.TITLE || channel?.BROAD_TITLE || "").trim();
  const viewer = Number(channel?.VIEW_CNT || channel?.TOTAL_VIEW_CNT || channel?.PC_VIEW_CNT || 0);
  const thumbnail = String(channel?.BROAD_IMG || channel?.THUMBNAIL || "").trim();
  const startedAt = String(channel?.BROAD_START || channel?.START_TIME || "").trim();
  const soopId = String(member.soopId || member.id || "").trim();

  return {
    ...member,
    soopId,
    isLive,
    viewer: isLive ? viewer : 0,
    title: isLive ? title : "",
    startedAt: isLive ? startedAt : "",
    thumbnail: isLive ? thumbnail : "",
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
  return normalizeChannel(member, payload?.CHANNEL || {});
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
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
        broadNo: "",
        url: soopId ? `https://play.sooplive.co.kr/${encodeURIComponent(soopId)}` : "#"
      };
    });
    const liveCount = liveMembers.filter((member) => member.isLive).length;

    res.status(200).json({
      members: liveMembers,
      liveCount,
      total: liveMembers.length,
      updatedAt: Math.floor(Date.now() / 1000)
    });
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
