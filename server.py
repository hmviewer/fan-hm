#!/usr/bin/env python3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen
import json
import os
import shutil
import ssl
import time


ROOT = Path(__file__).resolve().parent
SOOP_LIVE_URL = "https://live.sooplive.co.kr/afreeca/player_live_api.php"
SOOP_CHANNEL_API = "https://api-channel.sooplive.com/v1.1/channel"
SSL_CONTEXT = ssl._create_unverified_context()
DATA_TARGETS = {
    "members": ROOT / "static-api" / "members.json",
    "notices": ROOT / "static-api" / "notices.json",
    "rank": ROOT / "static-api" / "rank.json",
    "chatrank": ROOT / "static-api" / "chatrank.json",
    "shorts": ROOT / "static-api" / "shorts.json",
    "live": ROOT / "static-api" / "live.json",
    "board": ROOT / "static-api" / "board.json",
}
API_ROUTES = {
    "/api/members.php": ROOT / "static-api" / "members.json",
    "/api/notices.php": ROOT / "static-api" / "notices.json",
    "/api/rank.php": ROOT / "static-api" / "rank.json",
    "/api/chatrank.php": ROOT / "static-api" / "chatrank.json",
    "/api/shorts.php": ROOT / "static-api" / "shorts.json",
    "/api/live.php": ROOT / "static-api" / "live.json",
    "/api/board.php": ROOT / "static-api" / "board.json",
}


def live_thumbnail_candidates(broad_no, direct=""):
    broad_no = str(broad_no or "").strip()
    direct = str(direct or "").strip()
    candidates = []
    if direct:
        candidates.append(direct)
    if broad_no:
        candidates.extend([
            f"https://liveimg.sooplive.co.kr/m/{broad_no}",
            f"https://liveimg.afreecatv.com/m/{broad_no}",
            f"https://liveimg.sooplive.co.kr/h/{broad_no}",
            f"https://liveimg.afreecatv.com/h/{broad_no}",
        ])
    return list(dict.fromkeys(candidates))


class TheHMLocalHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/auth/auth.php":
            self._send_json({"success": False, "message": "로컬 미러에서는 로그인 기능이 비활성화되어 있습니다."})
            return
        if parsed.path == "/local-admin/save":
            return self._save_local_data()
        self.send_error(404)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path == "/index.php":
            self.path = "/index.html"
            return super().do_GET()

        if path == "/admin/login.php":
            self.send_response(302)
            self.send_header("Location", "/admin/")
            self.end_headers()
            return

        if path == "/api/rank.php":
            return self._send_file(API_ROUTES[path], "application/json; charset=utf-8")

        if path == "/api/chatrank.php":
            return self._send_file(API_ROUTES[path], "application/json; charset=utf-8")

        if path == "/api/live.php":
            return self._send_live_status()

        if path == "/api/board.php":
            return self._send_board_posts()

        if path in API_ROUTES:
            return self._send_file(API_ROUTES[path], "application/json; charset=utf-8")

        if path == "/local-admin/meta":
            return self._send_admin_meta()

        return super().do_GET()

    def _read_json_body(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        raw = self.rfile.read(length)
        if not raw:
            return None
        return json.loads(raw.decode("utf-8"))

    def _save_local_data(self):
        try:
            payload = self._read_json_body()
            if not isinstance(payload, dict):
                raise ValueError("JSON body must be an object.")
            target = str(payload.get("target") or "")
            if target not in DATA_TARGETS:
                raise ValueError("Unknown target.")
            data = payload.get("data")
            if not isinstance(data, (list, dict)):
                raise ValueError("Data must be an array or object.")

            path = DATA_TARGETS[target]
            path.parent.mkdir(parents=True, exist_ok=True)
            backup_dir = ROOT / "backups"
            backup_dir.mkdir(exist_ok=True)
            if path.exists():
                stamp = time.strftime("%Y%m%d-%H%M%S")
                shutil.copy2(path, backup_dir / f"{path.name}.{stamp}.bak")

            body = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
            path.write_bytes(body + b"\n")
            self._send_json({"success": True, "target": target, "bytes": len(body), "path": str(path.relative_to(ROOT))})
        except Exception as exc:
            self._send_json({"success": False, "message": str(exc)})

    def _send_admin_meta(self):
        payload = {}
        for name, path in DATA_TARGETS.items():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                count = len(data) if isinstance(data, list) else len(data.keys()) if isinstance(data, dict) else 0
                payload[name] = {"path": str(path.relative_to(ROOT)), "count": count}
            except Exception as exc:
                payload[name] = {"path": str(path.relative_to(ROOT)), "error": str(exc)}
        self._send_json(payload)

    def _fetch_member_live_state(self, member):
        soop_id = str(member.get("soopId") or member.get("id") or "").strip()
        if not soop_id:
            return {**member, "isLive": False}
        body = urlencode({"bid": soop_id, "type": "live", "player_type": "html5"}).encode("utf-8")
        request = Request(
            SOOP_LIVE_URL,
            data=body,
            headers={
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "Origin": "https://play.sooplive.com",
                "Referer": f"https://play.sooplive.com/{soop_id}",
                "User-Agent": "Mozilla/5.0",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=4, context=SSL_CONTEXT) as response:
                payload = json.loads(response.read().decode("utf-8"))
            channel = payload.get("CHANNEL") or {}
            is_live = int(channel.get("RESULT") or 0) == 1
            broad_no = str(channel.get("BNO") or channel.get("BROAD_NO") or "").strip()
            title = str(channel.get("TITLE") or channel.get("BROAD_TITLE") or "").strip()
            viewer = int(channel.get("VIEW_CNT") or channel.get("TOTAL_VIEW_CNT") or channel.get("PC_VIEW_CNT") or 0)
            thumbnail = str(
                channel.get("BROAD_IMG")
                or channel.get("BROAD_THUMB")
                or channel.get("BROAD_THUMBNAIL")
                or channel.get("THUMBNAIL")
                or channel.get("THUMB")
                or channel.get("TITLE_IMG")
                or ""
            ).strip()
            thumbnail_candidates = live_thumbnail_candidates(broad_no, thumbnail)
            started_at = str(channel.get("BROAD_START") or channel.get("START_TIME") or "").strip()
            return {
                **member,
                "soopId": soop_id,
                "isLive": is_live,
                "viewer": viewer if is_live else 0,
                "title": title if is_live else "",
                "startedAt": started_at if is_live else "",
                "thumbnail": thumbnail_candidates[0] if is_live and thumbnail_candidates else "",
                "thumbnailCandidates": thumbnail_candidates if is_live else [],
                "broadNo": broad_no if is_live else "",
                "url": f"https://play.sooplive.co.kr/{soop_id}/{broad_no}" if is_live and broad_no else f"https://play.sooplive.co.kr/{soop_id}",
            }
        except Exception:
            return {
                **member,
                "soopId": soop_id,
                "isLive": False,
                "viewer": 0,
                "title": "",
                "startedAt": "",
                "thumbnail": "",
                "thumbnailCandidates": [],
                "broadNo": "",
                "url": f"https://play.sooplive.co.kr/{soop_id}",
            }

    def _send_live_status(self):
        try:
            members = json.loads((ROOT / "static-api" / "members.json").read_text(encoding="utf-8"))
            if not isinstance(members, list):
                members = []
            live_members = [self._fetch_member_live_state(member) for member in members]
            payload = {
                "members": live_members,
                "liveCount": sum(1 for member in live_members if member.get("isLive")),
                "total": len(live_members),
                "updatedAt": int(time.time()),
            }
        except Exception:
            payload = {"members": [], "liveCount": 0, "total": 0, "updatedAt": int(time.time()), "error": "LIVE 정보를 불러오지 못했습니다."}
        self._send_json(payload)

    def _fetch_json_url(self, url):
        request = Request(
            url,
            headers={
                "Accept": "application/json",
                "User-Agent": "Mozilla/5.0",
            },
        )
        with urlopen(request, timeout=5, context=SSL_CONTEXT) as response:
            return json.loads(response.read().decode("utf-8"))

    def _pick_boards(self, menu):
        boards = menu.get("board") if isinstance(menu, dict) else []
        if not isinstance(boards, list):
            return []
        public_boards = []
        for board in boards:
            if not isinstance(board, dict):
                continue
            auth_no = int(board.get("authNo") or 0)
            display_type = int(board.get("displayType") or 0)
            if auth_no == 101 and display_type in (103, 104):
                public_boards.append(board)
        important = [
            board for board in public_boards
            if any(token in str(board.get("name") or "") for token in ("공지", "오피셜", "HM", "General", "게시판"))
        ]
        unique = {}
        for board in [*important, *public_boards]:
            bbs_no = str(board.get("bbsNo") or "").strip()
            if bbs_no and bbs_no not in unique:
                unique[bbs_no] = board
        return list(unique.values())[:6]

    def _extract_board_thumbnail(self, post):
        photos = post.get("photos") if isinstance(post, dict) else []
        if isinstance(photos, list):
            for photo in photos:
                if isinstance(photo, dict) and photo.get("url"):
                    return str(photo.get("url"))
        return ""

    def _normalize_board_post(self, post, member, board):
        soop_id = str(member.get("soopId") or member.get("id") or post.get("userId") or "").strip()
        title_no = str(post.get("titleNo") or "").strip()
        title = str(post.get("titleName") or "").strip()
        if not soop_id or not title_no or not title:
            return None
        content = post.get("content") if isinstance(post.get("content"), dict) else {}
        count = post.get("count") if isinstance(post.get("count"), dict) else {}
        display = post.get("display") if isinstance(post.get("display"), dict) else {}
        return {
            "bjName": str(member.get("name") or post.get("userNick") or soop_id),
            "soopId": soop_id,
            "title": title,
            "summary": str(content.get("summary") or content.get("textContent") or "").strip(),
            "url": f"https://www.sooplive.com/station/{soop_id}/post/{title_no}",
            "regDate": str(post.get("regDate") or ""),
            "commentCount": int(count.get("commentCnt") or 0),
            "readCount": int(count.get("readCnt") or count.get("vodReadCnt") or 0),
            "thumbnail": self._extract_board_thumbnail(post),
            "isNotice": int(post.get("noticeYn") or 0) > 0,
            "boardName": str(display.get("bbsName") or board.get("name") or ""),
        }

    def _fetch_member_posts(self, member):
        soop_id = str(member.get("soopId") or member.get("id") or "").strip()
        if not soop_id:
            return []
        menu = self._fetch_json_url(f"{SOOP_CHANNEL_API}/{soop_id}/menu")
        posts = []
        for board in self._pick_boards(menu):
            bbs_no = str(board.get("bbsNo") or "").strip()
            if not bbs_no:
                continue
            query = urlencode({"bbs_no": bbs_no, "per_page": 5, "field": "title,user_nick,user_id"})
            try:
                payload = self._fetch_json_url(f"{SOOP_CHANNEL_API}/{soop_id}/board?{query}")
            except Exception:
                continue
            contents = payload.get("contents") if isinstance(payload, dict) else []
            if not isinstance(contents, list):
                continue
            for post in contents[:5]:
                if isinstance(post, dict):
                    normalized = self._normalize_board_post(post, member, board)
                    if normalized:
                        posts.append(normalized)
        return posts

    def _send_board_posts(self):
        try:
            members = json.loads((ROOT / "static-api" / "members.json").read_text(encoding="utf-8"))
            if not isinstance(members, list):
                members = []
            posts = []
            for member in members:
                try:
                    posts.extend(self._fetch_member_posts(member))
                except Exception:
                    continue
            unique = {}
            for post in posts:
                key = f"{post.get('soopId')}:{post.get('url')}"
                if key not in unique:
                    unique[key] = post
            sorted_posts = sorted(
                unique.values(),
                key=lambda item: str(item.get("regDate") or ""),
                reverse=True,
            )[:30]
        except Exception:
            sorted_posts = []
        self._send_json(sorted_posts)

    def _send_json(self, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path, content_type):
        if not path.exists():
            self.send_error(404)
            return
        body = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    port = int(os.environ.get("PORT", "4173"))
    server = ThreadingHTTPServer(("127.0.0.1", port), TheHMLocalHandler)
    print(f"THE HM local mirror: http://127.0.0.1:{port}/")
    server.serve_forever()


if __name__ == "__main__":
    main()
