# Smoke test — EDITORS.MoipBuddy

Is `EDITORS.MoipBuddy` deployed? Written by `.apk.scripts/smoke.py` from the module's own shape; what each check means is in that script's header.

← [Wiki home](../README.md)

**✅ PASS** — 3/3 checks, since 2026-11-12 00:27 EST

| Check | Target | Result | Detail |
|---|---|---|---|
| pushed | [APK.softapp.EDITORS.MoipBuddy](https://github.com/LikeDotAudio/APK.softapp.EDITORS.MoipBuddy.git) | ✅ | HEAD is on origin |
| web | [index.html](https://apk.audio/APK%3ASoftapps/EDITORS/EDITORS.MoipBuddy/index.html) | ✅ | HTTP 200 |
| app | `OS/Media Over IP` → `PODS/POD.THIN/Softapps/EDITORS/EDITORS.MoipBuddy/index.html` | ✅ | present |

Re-run: `python3 .apk.scripts/smoke.py PODS/POD.THIN/Softapps/EDITORS/EDITORS.MoipBuddy`

<!-- smoke:sig 8b4f22e4e6ab since 2026-11-12 00:27 EST -->
