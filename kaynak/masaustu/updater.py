"""Bilgisayar sürümü kendini günceller (telefondaki gibi): GitHub Releases'taki en yeni exe-v* sürümünü indirir,
uygulama kapanınca eski exe'nin yerine koyar ve yeniden açar."""
import json
import os
import subprocess
import sys
import tempfile
import urllib.request

API = "https://api.github.com/repos/81Miralay81/daeva-asistani/releases?per_page=100"
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
    import time as _t
    for deneme in range(4):  # GitHub ara sıra 502/504 veriyor: birkaç kez yeniden dene
        try:
            with urllib.request.urlopen(req, timeout=300) as r, open(tmp, "wb") as f:
                while True:
                    chunk = r.read(1 << 16)
                    if not chunk:
                        break
                    f.write(chunk)
            break
        except Exception:
            if deneme == 3:
                raise
            _t.sleep(3 * (deneme + 1))
    if os.path.getsize(tmp) < 1_000_000:
        return {"ok": False, "error": "İndirilen dosya eksik"}
    # Onefile exe iki işlemdir (başlatıcı + uygulama); ikisi de kapanınca dosya serbest kalır.
    pids = ",".join(str(p) for p in {os.getpid(), os.getppid()})
    ps1 = os.path.join(tempfile.gettempdir(), "daeva_guncelle.ps1")
    with open(ps1, "w", encoding="utf-8-sig") as f:
        f.write(f"""$ErrorActionPreference = 'SilentlyContinue'
foreach ($p in @({pids})) {{ Wait-Process -Id $p -Timeout 40 }}
for ($i = 0; $i -lt 20; $i++) {{
  try {{ Move-Item -LiteralPath '{tmp}' -Destination '{exe}' -Force -ErrorAction Stop; break }} catch {{ Start-Sleep -Milliseconds 700 }}
}}
Start-Sleep -Seconds 2
# Yeni sürümü Windows Gezgini başlatsın: Gezgin'in kendi temiz ortamı kullanılır, eski exe'nin
# geçici klasör (_MEI) ayarları hiçbir şekilde taşınmaz ("Failed to load Python DLL" bu yüzdendi).
Start-Process -FilePath "$env:WINDIR\\explorer.exe" -ArgumentList ('"' + '{exe}' + '"')
Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force
""")
    # Yeni exe eski exe'nin geçici klasör ayarlarını (_MEI…) miras almasın; yoksa "Failed to load Python DLL" der.
    env = {k: v for k, v in os.environ.items() if not k.upper().startswith(("_MEI", "_PYI"))}
    env["PYINSTALLER_RESET_ENVIRONMENT"] = "1"
    subprocess.Popen(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", ps1],
                     creationflags=0x08000000, close_fds=True, env=env)  # CREATE_NO_WINDOW: pencere açılmaz
    return {"ok": True}
