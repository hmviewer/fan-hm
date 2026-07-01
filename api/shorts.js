import fs from "node:fs/promises";
import path from "node:path";

const CHANNEL_ID = "UCUh7tcH-bz8Xj5WaSO_TWLQ";
const CHANNEL_NAME = "HM엑셀부";
const CHANNEL_URL = "https://www.youtube.com/@HM%EC%97%91%EC%85%80%EB%B6%80";
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const MAX_SHORTS = 12;
const FALLBACK_PATH = path.join(process.cwd(), "static-api", "shorts.json");
const SHORTS_CACHE_TTL_MS = 10 * 60 * 1000;

const shortsCache = globalThis.__THE_HM_SHORTS_CACHE || {
  payload: null,
  expiresAt: 0,
  pending: null
};
globalThis.__THE_HM_SHORTS_CACHE = shortsCache;

function decodeXml(value = "") {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'");
}

function firstMatch(source, pattern) {
  const match = source.match(pattern);
  return match ? decodeXml(match[1].trim()) : "";
}

function cleanTitle(title) {
  return title
    .replace(/^\[?HM엑셀부\]?\s*/i, "")
    .replace(/\s+#.+$/u, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function parseFeed(xml) {
  const entries = [...String(xml).matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((match) => match[1]);
  return entries.slice(0, MAX_SHORTS).map((entry) => {
    const videoId = firstMatch(entry, /<yt:videoId>(.*?)<\/yt:videoId>/);
    const rawTitle = firstMatch(entry, /<title>([\s\S]*?)<\/title>/);
    const published = firstMatch(entry, /<published>(.*?)<\/published>/);
    const thumb = firstMatch(entry, /<media:thumbnail[^>]+url="([^"]+)"/);
    const views = Number(firstMatch(entry, /<media:statistics[^>]+views="([^"]+)"/) || 0);
    return {
      videoId,
      title: cleanTitle(rawTitle) || rawTitle || "THE HM Shorts",
      thumb: thumb || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ""),
      url: videoId ? `https://www.youtube.com/shorts/${encodeURIComponent(videoId)}` : CHANNEL_URL,
      channel: CHANNEL_NAME,
      published,
      views
    };
  }).filter((item) => item.videoId);
}

async function fetchShorts() {
  const response = await fetch(FEED_URL, {
    headers: {
      accept: "application/atom+xml, application/xml, text/xml",
      "user-agent": "Mozilla/5.0"
    }
  });
  if (!response.ok) throw new Error(`YouTube ${response.status}`);
  const xml = await response.text();
  return parseFeed(xml);
}

async function readFallbackShorts() {
  const raw = await fs.readFile(FALLBACK_PATH, "utf8");
  const data = JSON.parse(raw);
  const shorts = Array.isArray(data?.shorts) ? data.shorts : [];
  return shorts.slice(0, MAX_SHORTS);
}

async function buildShortsPayload() {
  let shorts = [];
  try {
    shorts = await fetchShorts();
  } catch (error) {
    shorts = [];
  }

  if (!shorts.length) {
    shorts = await readFallbackShorts().catch(() => []);
  }

  return {
    shorts,
    channel: CHANNEL_NAME,
    channelUrl: CHANNEL_URL,
    updatedAt: Math.floor(Date.now() / 1000)
  };
}

async function getShortsPayload() {
  const now = Date.now();
  if (shortsCache.payload && shortsCache.expiresAt > now) return shortsCache.payload;
  if (shortsCache.pending) return shortsCache.pending;

  shortsCache.pending = buildShortsPayload()
    .then((payload) => {
      shortsCache.payload = payload;
      shortsCache.expiresAt = Date.now() + SHORTS_CACHE_TTL_MS;
      return payload;
    })
    .finally(() => {
      shortsCache.pending = null;
    });

  return shortsCache.pending;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=600, stale-while-revalidate=3600");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  res.status(200).json(await getShortsPayload());
}
