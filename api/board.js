import fs from "node:fs/promises";
import path from "node:path";

const MEMBERS_PATH = path.join(process.cwd(), "static-api", "members.json");
const SOOP_CHANNEL_API = "https://api-channel.sooplive.com/v1.1/channel";
const MAX_BOARDS_PER_MEMBER = 6;
const MAX_POSTS_PER_BOARD = 5;
const MAX_TOTAL_POSTS = 30;

async function readMembers() {
  const raw = await fs.readFile(MEMBERS_PATH, "utf8");
  const data = JSON.parse(raw);
  return Array.isArray(data) ? data : [];
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "Mozilla/5.0"
    }
  });
  if (!response.ok) throw new Error(`SOOP ${response.status}`);
  return response.json();
}

function pickBoards(menu) {
  const boards = Array.isArray(menu?.board) ? menu.board : [];
  const publicBoards = boards.filter((board) => {
    const authNo = Number(board?.authNo || 0);
    const displayType = Number(board?.displayType || 0);
    return authNo === 101 && (displayType === 103 || displayType === 104);
  });
  const important = publicBoards.filter((board) => /공지|오피셜|HM|General|게시판/i.test(String(board?.name || "")));
  const unique = new Map();
  [...important, ...publicBoards].forEach((board) => {
    const bbsNo = String(board?.bbsNo || "").trim();
    if (bbsNo && !unique.has(bbsNo)) unique.set(bbsNo, board);
  });
  return [...unique.values()].slice(0, MAX_BOARDS_PER_MEMBER);
}

function extractThumbnail(post) {
  const direct = post?.photos?.find?.((photo) => photo?.url)?.url;
  if (direct) return String(direct);
  const html = String(post?.content?.content || "");
  const match = html.match(/https?:\/\/[^"')\s<>]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^"')\s<>]*)?/i);
  return match ? match[0] : "";
}

function normalizePost(post, member, board) {
  const soopId = String(member.soopId || member.id || post?.userId || "").trim();
  const titleNo = String(post?.titleNo || "").trim();
  const title = String(post?.titleName || "").trim();
  if (!soopId || !titleNo || !title) return null;

  return {
    bjName: String(member.name || post?.userNick || soopId),
    soopId,
    title,
    summary: String(post?.content?.summary || post?.content?.textContent || "").trim(),
    url: `https://www.sooplive.com/station/${encodeURIComponent(soopId)}/post/${encodeURIComponent(titleNo)}`,
    regDate: String(post?.regDate || ""),
    commentCount: Number(post?.count?.commentCnt || 0),
    readCount: Number(post?.count?.readCnt || post?.count?.vodReadCnt || 0),
    thumbnail: extractThumbnail(post),
    isNotice: Number(post?.noticeYn || 0) > 0,
    boardName: String(post?.display?.bbsName || board?.name || "")
  };
}

async function fetchBoardPosts(member, board) {
  const soopId = String(member.soopId || member.id || "").trim();
  const bbsNo = String(board?.bbsNo || "").trim();
  if (!soopId || !bbsNo) return [];

  const params = new URLSearchParams({
    bbs_no: bbsNo,
    per_page: String(MAX_POSTS_PER_BOARD),
    field: "title,user_nick,user_id"
  });
  const payload = await fetchJson(`${SOOP_CHANNEL_API}/${encodeURIComponent(soopId)}/board?${params}`);
  const contents = Array.isArray(payload?.contents) ? payload.contents : [];
  return contents.slice(0, MAX_POSTS_PER_BOARD).map((post) => normalizePost(post, member, board)).filter(Boolean);
}

async function fetchMemberPosts(member) {
  const soopId = String(member.soopId || member.id || "").trim();
  if (!soopId) return [];

  const menu = await fetchJson(`${SOOP_CHANNEL_API}/${encodeURIComponent(soopId)}/menu`);
  const boards = pickBoards(menu);
  const settled = await Promise.allSettled(boards.map((board) => fetchBoardPosts(member, board)));
  return settled.flatMap((item) => (item.status === "fulfilled" ? item.value : []));
}

function sortPosts(posts) {
  const unique = new Map();
  posts.forEach((post) => {
    const key = `${post.soopId}:${post.url}`;
    if (!unique.has(key)) unique.set(key, post);
  });
  return [...unique.values()]
    .sort((a, b) => new Date(String(b.regDate).replace(" ", "T")) - new Date(String(a.regDate).replace(" ", "T")))
    .slice(0, MAX_TOTAL_POSTS);
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
    const settled = await Promise.allSettled(members.map(fetchMemberPosts));
    const posts = sortPosts(settled.flatMap((item) => (item.status === "fulfilled" ? item.value : [])));
    res.status(200).json(posts);
  } catch (error) {
    res.status(200).json([]);
  }
}
