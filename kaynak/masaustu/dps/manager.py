"""DPS ölçer yöneticisi: ayarlar, yakalama, takip, overlay, oyunu başlatma ve kaynak güncellemesi."""
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser

from . import capture as C
from . import protocol as P
from .overlay import Overlay
from .tracker import GameData, Tracker
from . import timers as TM

MANIFEST_URL = "https://raw.githubusercontent.com/81Miralay81/daeva-asistani/main/meta/dps_kaynak.json"
RELEASES = "https://github.com/81Miralay81/daeva-asistani/releases/latest"
STEAM_APP = 3393110
UA = {"User-Agent": "DaevaAsistani-DPS"}


def ver_key(v):
    """'2026-11-03.12' ya da '1.4.2' → karşılaştırılabilir demet."""
    out = []
    for part in str(v or "0").replace("-", ".").split("."):
        out.append(int(part) if part.isdigit() else 0)
    return tuple(out)


class DpsManager:
    def __init__(self, data_dir, bundled_dir, app_version="0"):
        self.data_dir = data_dir                      # %APPDATA%\DaevaAsistani
        self.upd_dir = os.path.join(data_dir, "dps_kaynak")
        self.bundled = bundled_dir                    # exe içindeki dps/data
        self.app_version = app_version
        self.set_path = os.path.join(data_dir, "dps_ayarlar.json")
        self.s = {"launcher": "steam", "gamePath": "", "partyOnly": True, "overlay": True,
                  "overlayAlpha": 0.75, "overlayX": 12, "overlayY": 12, "overlayRows": 8,
                  "showDps": True, "showTimers": False, "dpsMin": False, "timersMin": False, "timerRows": 6,
                  "hiddenTimers": [], "ovTimers": [], "customTimers": [], "race": "", "serverId": 0, "serverName": "", "region": "eu",
                  "launchGame": True}
        try:
            with open(self.set_path, encoding="utf-8") as f:
                self.s.update(json.load(f))
        except (OSError, ValueError):
            pass
        self.data = None
        self.tracker = None
        self.cap = None
        self.overlay = None
        self.log_lines = []
        self.started_at = 0
        self.update_info = None
        self.tracker = Tracker(self.data)
        self._ticker = None
        self._reload_data()

    # ------------------------------------------------------------ ayarlar / veri
    def _save(self):
        try:
            os.makedirs(self.data_dir, exist_ok=True)
            with open(self.set_path, "w", encoding="utf-8") as f:
                json.dump(self.s, f, ensure_ascii=False, indent=1)
        except OSError:
            pass

    def log(self, msg):
        self.log_lines.append(time.strftime("%H:%M:%S ") + str(msg))
        del self.log_lines[:-60]

    def local_manifest(self):
        for d in (self.upd_dir, self.bundled):
            try:
                with open(os.path.join(d, "dps_kaynak.json"), encoding="utf-8") as f:
                    m = json.load(f)
                    m["_from"] = "güncel" if d == self.upd_dir else "gömülü"
                    return m
            except (OSError, ValueError):
                continue
        return {"version": "0"}

    def _reload_data(self):
        man = self.local_manifest()
        dirs = [self.bundled]
        if man.get("_from") == "güncel":
            dirs.append(self.upd_dir)
        self.data = GameData(dirs)
        P.apply_overrides(man)
        if self.tracker is not None:
            self.tracker.data = self.data
        if self.cap is not None:
            self.cap.pipeline.parser.data = self.data
            self.cap.pipeline.parser._dispatch = None

    def settings(self, upd=None):
        if upd:
            for k, v in upd.items():
                if k in self.s:
                    self.s[k] = v
            self._save()
            if self.overlay:
                self.overlay.update_settings(self._ov_settings())
            if "overlay" in upd:
                (self._start_overlay() if upd["overlay"] else self._stop_overlay())
        ok, msg = C.npcap_status()
        return dict(self.s, npcap=ok, npcapMsg=msg, appVersion=self.app_version,
                    kaynak=self.local_manifest().get("version", "0"))

    # ------------------------------------------------------------ çalıştır / durdur
    def running(self):
        return bool(self.cap and self.cap.running)

    def start(self, launch=None):
        if self.running():
            return {"ok": True, "already": True}
        self.cap = C.Capture(self.tracker.process, self.data, log=self.log)
        if not self.cap.start():
            err = self.cap.error
            self.cap = None
            return {"ok": False, "error": err, "npcap": C.npcap_status()[0]}
        self.started_at = time.time()
        self._ticker = threading.Thread(target=self._tick_loop, daemon=True)
        self._ticker.start()
        if self.s.get("overlay"):
            self._start_overlay()
        game = None
        if self.s.get("launchGame") if launch is None else launch:
            game = self.launch_game()
        return {"ok": True, "game": game}

    def stop(self):
        if self.cap:
            self.cap.stop()
            self.cap = None
        return {"ok": True}

    def _tick_loop(self):
        while self.running():
            if self.tracker:
                self.tracker.tick(int(time.time() * 1000))
            time.sleep(1.0)

    def reset(self):
        if self.tracker:
            self.tracker.reset()
        return {"ok": True}

    # ------------------------------------------------------------ overlay
    def _ov_settings(self):
        return {"x": self.s["overlayX"], "y": self.s["overlayY"], "alpha": self.s["overlayAlpha"], "rows": self.s["overlayRows"],
                "showDps": self.s["showDps"], "showTimers": self.s["showTimers"], "dpsMin": self.s["dpsMin"],
                "timersMin": self.s["timersMin"], "timerRows": self.s["timerRows"], "hidden": []}

    def game_live(self):
        return bool(self.cap and self.cap.running and self.cap.pipeline.game_servers()
                    and time.time() * 1000 - self.cap.pipeline.last_game_ms < 10_000)

    def timers(self):
        out = TM.all_timers(self.tracker, self.s.get("customTimers"), self.s.get("race"), set())
        shown = set(self.s.get("ovTimers") or [])
        for t in out:
            t["hidden"] = t["id"] not in shown  # oyun üstünde sadece seçilenler (varsayılan hepsi gizli)
        return out

    def _start_overlay(self):
        if self.overlay and self.overlay.alive:
            return

        def changed(o):
            self.s.update(overlayX=o["x"], overlayY=o["y"], showDps=o["showDps"], showTimers=o["showTimers"],
                          dpsMin=o["dpsMin"], timersMin=o["timersMin"],
                          ovTimers=[i for i in self.s.get("ovTimers", []) if i not in (o.get("hidden") or [])])
            self._save()
        self.overlay = Overlay(lambda: self.tracker.overlay_rows(self.s.get("partyOnly", True)) if self.tracker else None,
                               self.timers, lambda: {"game": self.game_live()}, self._ov_settings(), changed)
        if not self.overlay.start():
            self.log("overlay açılamadı (tkinter yok)")

    def _stop_overlay(self):
        if self.overlay:
            self.overlay.stop()
            self.overlay = None

    # ------------------------------------------------------------ oyun
    @staticmethod
    def game_running():
        """Aion 2 açık mı? (işlem adında 'aion2' geçen bir program var mı)"""
        if sys.platform != "win32":
            return False
        try:
            out = subprocess.run(["tasklist", "/fo", "csv", "/nh"], capture_output=True, text=True, timeout=10,
                                 creationflags=0x08000000).stdout.lower()
            return "aion2" in out or "aion 2" in out
        except Exception:
            return False

    def launch_game(self):
        if self.game_running():
            return {"ok": True, "how": "already", "note": "Oyun zaten açık; yeniden açılmadı, ölçer açık oyuna bağlandı."}
        mode = self.s.get("launcher", "steam")
        path = (self.s.get("gamePath") or "").strip()
        try:
            if mode == "custom" and path:
                if not os.path.exists(path):
                    return {"ok": False, "error": f"Dosya bulunamadı: {path}"}
                if sys.platform == "win32":
                    os.startfile(path)  # .exe ya da kısayol (.lnk / .url)
                else:
                    subprocess.Popen([path], cwd=os.path.dirname(path) or None)
                return {"ok": True, "how": "custom"}
            if mode == "purple":
                for p in (path, r"C:\Program Files (x86)\NCSOFT\Purple\PurpleLauncher.exe",
                          r"C:\Program Files\NCSOFT\Purple\PurpleLauncher.exe"):
                    if p and os.path.exists(p):
                        if sys.platform == "win32":
                            os.startfile(p)
                        return {"ok": True, "how": "purple", "note": "PURPLE açıldı; oyunu oradan Oyna ile başlat."}
                return {"ok": False, "error": "PURPLE bulunamadı. Ayarlardan PurpleLauncher.exe dosyasını seç."}
            webbrowser.open(f"steam://rungameid/{STEAM_APP}")
            return {"ok": True, "how": "steam"}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    # ------------------------------------------------------------ çıktı
    def snapshot(self, party_only=None, fight_id=None):
        po = self.s.get("partyOnly", True) if party_only is None else bool(party_only)
        snap = self.tracker.snapshot(po, fight_id) if self.tracker else {"fight": None, "history": [], "party": []}
        st = self.cap.status() if self.cap else {"state": "stopped", "error": ""}
        snap["status"] = st
        snap["running"] = self.running()
        snap["uptime"] = int(time.time() - self.started_at) if self.running() else 0
        snap["partyOnly"] = po
        snap["log"] = self.log_lines[-8:]
        snap["game"] = self.game_live()
        return snap

    # ------------------------------------------------------------ güncelleme
    def _get_json(self, url, timeout=15):
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))

    def check_update(self):
        try:
            remote = self._get_json(MANIFEST_URL)
        except Exception as e:
            return {"ok": False, "error": f"Kaynak kontrol edilemedi: {e}"}
        local = self.local_manifest()
        out = {"ok": True, "local": local.get("version", "0"), "remote": remote.get("version", "0"),
               "notes": remote.get("notes", ""), "data": ver_key(remote.get("version")) > ver_key(local.get("version"))}
        app = remote.get("app") or {}
        out["appLocal"] = self.app_version
        out["appRemote"] = app.get("version", "")
        out["appNew"] = bool(app.get("version")) and ver_key(app["version"]) > ver_key(self.app_version)
        out["appUrl"] = app.get("url") or RELEASES
        out["appNotes"] = app.get("notes", "")
        self.update_info = remote
        return out

    def apply_update(self):
        remote = self.update_info
        if not remote:
            r = self.check_update()
            if not r.get("ok"):
                return r
            remote = self.update_info
        tmp = self.upd_dir + ".yeni"
        shutil.rmtree(tmp, ignore_errors=True)
        os.makedirs(tmp, exist_ok=True)
        files = remote.get("files") or {}
        try:
            for name, url in files.items():
                if "/" in name or "\\" in name or not name.endswith(".json"):
                    continue
                req = urllib.request.Request(url, headers=UA)
                with urllib.request.urlopen(req, timeout=60) as r:
                    body = r.read()
                json.loads(body.decode("utf-8"))  # bozuk dosya yazılmasın
                with open(os.path.join(tmp, name), "wb") as f:
                    f.write(body)
            with open(os.path.join(tmp, "dps_kaynak.json"), "w", encoding="utf-8") as f:
                json.dump(remote, f, ensure_ascii=False, indent=1)
        except Exception as e:
            shutil.rmtree(tmp, ignore_errors=True)
            return {"ok": False, "error": f"İndirme başarısız: {e}"}
        shutil.rmtree(self.upd_dir, ignore_errors=True)
        os.replace(tmp, self.upd_dir)
        self._reload_data()
        return {"ok": True, "version": remote.get("version"), "files": len(files),
                "skills": len(self.data.skills), "npcs": len(self.data.npcs)}

    def open_url(self, url):
        webbrowser.open(url)

    def install_npcap(self):
        """Npcap'in resmi kurulum dosyasını npcap.com'dan indirip kurulumu başlatır (Windows izin sorar)."""
        import re
        import tempfile
        try:
            req = urllib.request.Request("https://npcap.com/", headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=20) as r:
                html = r.read().decode("utf-8", "replace")
            m = re.search(r"(?:https://npcap\.com/)?dist/(npcap-[0-9.]+\.exe)", html)
            if not m:
                return {"ok": False, "error": "npcap.com'da kurulum dosyası bulunamadı"}
            url = "https://npcap.com/dist/" + m.group(1)
            path = os.path.join(tempfile.gettempdir(), m.group(1))
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=120) as r, open(path, "wb") as f:
                shutil.copyfileobj(r, f)
            if sys.platform == "win32":
                os.startfile(path)
            return {"ok": True, "file": m.group(1)}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def overlay_toggle(self, on):
        (self._start_overlay() if on else self._stop_overlay())
        return {"ok": True, "on": bool(self.overlay and self.overlay.alive)}
