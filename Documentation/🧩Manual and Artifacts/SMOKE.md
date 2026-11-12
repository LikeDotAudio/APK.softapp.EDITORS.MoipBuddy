# Smoke test — EDITORS.MoipBuddy

Is `EDITORS.MoipBuddy` deployed? Written by `.apk.scripts/smoke.py` from the module's own shape; what each check means is in that script's header.

← [Wiki home](../README.md)

**❌ FAIL** — 2/3 checks, since 2026-11-12 00:16 EST

| Check | Target | Result | Detail |
|---|---|---|---|
| pushed | [APK.softapp.EDITORS.MoipBuddy](https://github.com/LikeDotAudio/APK.softapp.EDITORS.MoipBuddy.git) | ❌ | 1 commit(s) not pushed |
| web | [index.html](https://apk.audio/APK%3ASoftapps/EDITORS/EDITORS.MoipBuddy/index.html) | ✅ | HTTP 200 |
| app | `OS/Media Over IP` → `PODS/POD.THIN/Softapps/EDITORS/EDITORS.MoipBuddy/index.html` | ✅ | present |

Re-run: `python3 .apk.scripts/smoke.py PODS/POD.THIN/Softapps/EDITORS/EDITORS.MoipBuddy`

<!-- smoke:sig d2c790f424e2 since 2026-11-12 00:16 EST -->
