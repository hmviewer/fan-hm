#!/usr/bin/env python3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse
import json
import os
import shutil
import time


ROOT = Path(__file__).resolve().parent
DATA_TARGETS = {
    "signatures": ROOT / "api" / "data.php",
    "members": ROOT / "api" / "members.php",
    "notices": ROOT / "api" / "notices.php",
    "rank": ROOT / "api" / "rank.php",
    "chatrank": ROOT / "api" / "chatrank.php",
    "shorts": ROOT / "api" / "shorts.php",
    "live": ROOT / "api" / "live.php",
    "board": ROOT / "api" / "board.php",
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

        if path == "/img.php":
            user_id = (query.get("id") or [""])[0]
            self.send_response(302)
            self.send_header("Location", f"https://fantaj.kr/img.php?id={quote(user_id)}")
            self.end_headers()
            return

        if path == "/api/rank.php":
            if query.get("months") == ["1"]:
                return self._send_file(ROOT / "api" / "rank-months.json", "application/json; charset=utf-8")
            return self._send_file(ROOT / "api" / "rank.php", "application/json; charset=utf-8")

        if path == "/api/chatrank.php":
            if query.get("rounds") == ["all"]:
                return self._send_file(ROOT / "api" / "chatrank-rounds.json", "application/json; charset=utf-8")
            return self._send_file(ROOT / "api" / "chatrank.php", "application/json; charset=utf-8")

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
