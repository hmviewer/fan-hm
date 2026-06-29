const CHANNEL_ID = "UCUh7tcH-bz8Xj5WaSO_TWLQ";
const CHANNEL_NAME = "HM엑셀부";
const CHANNEL_URL = "https://www.youtube.com/@HM%EC%97%91%EC%85%80%EB%B6%80";
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const MAX_SHORTS = 12;

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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=3600");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    const shorts = await fetchShorts();
    res.status(200).json({
      shorts,
      channel: CHANNEL_NAME,
      channelUrl: CHANNEL_URL,
      updatedAt: Math.floor(Date.now() / 1000)
    });
  } catch (error) {
    res.status(200).json({
      shorts: [],
      channel: CHANNEL_NAME,
      channelUrl: CHANNEL_URL,
      updatedAt: Math.floor(Date.now() / 1000)
    });
  }
}
