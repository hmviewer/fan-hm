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
            thumbnail = str(channel.get("BROAD_IMG") or channel.get("THUMBNAIL") or "").strip()
            started_at = str(channel.get("BROAD_START") or channel.get("START_TIME") or "").strip()
            return {
                **member,
                "soopId": soop_id,
                "isLive": is_live,
                "viewer": viewer if is_live else 0,
                "title": title if is_live else "",
                "startedAt": started_at if is_live else "",
                "thumbnail": thumbnail if is_live else "",
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
