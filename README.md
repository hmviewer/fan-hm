# THE HM

Static THE HM site prepared for local preview, GitHub, and Vercel.

## Run

```bash
cd the-hm
python3 server.py
```

Open:

```text
http://127.0.0.1:4173/
```

## Notes

- Signature images are stored under `signature/images/` and rendered by `/signature/`.
- Music files are intentionally not integrated or deployed here.
- Legacy `image/` and `music/` folders are not included in this project.
- Public pages and small JSON API snapshots are stored locally.
- `server.py` maps the original query-based API routes such as `/api/rank.php?months=1`.
- Vercel rewrites `/api/*.php` requests to `static-api/*.json`.
- Profile images load from the original public profile image proxy because those profile images are external/live SOOP assets.
- Member and admin login are present as login screens, but real protected sessions are not mirrored.
