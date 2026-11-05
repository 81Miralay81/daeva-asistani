"""Bilgisayar sürümü kendini günceller (telefondaki gibi): GitHub Releases'taki en yeni exe-v* sürümünü indirir,
uygulama kapanınca eski exe'nin yerine koyar ve yeniden açar."""
import json
import os
import subprocess
import sys
import tempfile
import urllib.request

API = "https://api.github.com/repos/81Miralay81/daeva-asistani/releases?per_page=20"
UA = {"User-Agent": "DaevaAsistani-Updater", "Accept": "application/vnd.github+json"}


def _ver(v):
    return tuple(int(x) if x.isdigit() else 0 for x in str(v).split("."))


def latest():
    req = urllib.request.Request(API, headers=UA)
    with urllib.request.urlopen(req, timeout=20) as r:
        rels = json.loads(r.read().decode("utf-8"))
    best = None
    for rel in rels:
        tag = rel.get("tag_name", "")
        if not tag.startswith("exe-v") or rel.get("draft"):
            continue
        asset = next((a for a in rel.get("assets", []) if a["name"].lower().endswith(".exe")), None)
        if asset and (best is None or _ver(tag[5:]) > _ver(best["version"])):
            best = {"version": tag[5:], "url": asset["browser_download_url"], "size": asset.get("size", 0),
                    "notes": rel.get("body", ""), "page": rel.get("html_url", "")}
    return best


def check(current):
    try:
        b = latest()
    except Exception as e:
        return {"ok": False, "error": str(e)}
    if not b:
        return {"ok": True, "new": False}
    return dict(b, ok=True, new=_ver(b["version"]) > _ver(current), current=current,
                canAuto=bool(getattr(sys, "frozen", False)) and sys.platform == "win32")


def install(url):
    """Yeni exe'yi indirir, kapanınca yerine koyacak küçük betiği başlatır. Dönüşte uygulama kapanmalı."""
    if not (getattr(sys, "frozen", False) and sys.platform == "win32"):
        return {"ok": False, "error": "Otomatik güncelleme sadece exe sürümünde çalışır."}
    exe = sys.executable
    tmp = os.path.join(tempfile.gettempdir(), "DaevaAsistani_yeni.exe")
    req = urllib.request.Request(url, headers={"User-Agent": UA["User-Agent"]})
    with urllib.request.urlopen(req, timeout=300) as r, open(tmp, "wb") as f:
        while True:
            chunk = r.read(1 << 16)
            if not chunk:
                break
            f.write(chunk)
    if os.path.getsize(tmp) < 1_000_000:
        return {"ok": False, "error": "İndirilen dosya eksik"}
    bat = os.path.join(tempfile.gettempdir(), "daeva_guncelle.bat")
    with open(bat, "w", encoding="mbcs", errors="replace") as f:
        f.write(f'''@echo off
set /a n=0
:bekle
timeout /t 1 /nobreak >nul
tasklist /fi "PID eq {os.getpid()}" | find "{os.getpid()}" >nul && (set /a n+=1 & if %n% lss 30 goto bekle)
move /y "{tmp}" "{exe}" >nul || (timeout /t 2 /nobreak >nul & move /y "{tmp}" "{exe}" >nul)
start "" "{exe}"
del "%~f0"
''')
    subprocess.Popen(["cmd", "/c", bat], creationflags=0x08000000 | 0x00000008)  # CREATE_NO_WINDOW | DETACHED
    return {"ok": True}
