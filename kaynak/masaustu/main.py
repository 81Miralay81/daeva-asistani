"""Daeva Asistanı - masaüstü sürümü (pywebview).

Gemini: kullanıcının kendi Google AI Studio anahtarıyla, Google arama destekli cevaplar.
Anahtar %APPDATA%\\DaevaAsistani\\gemini_key.txt dosyasında saklanır, exe'nin içine girmez.
Karakter sorgusu: MetaBot.GG Armory, gizli bir tarayıcı penceresiyle (normal ziyaret gibi) okunur.
"""
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser

import webview

import armory
import ncsoft
import updater
from dps.manager import DpsManager

APP_VERSION = "1.4.0"  # GitHub Actions derlerken 1.4.<çalıştırma no> yazar
API = "https://generativelanguage.googleapis.com/v1beta"
DATA_DIR = os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), "DaevaAsistani")
KEY_FILE = os.path.join(DATA_DIR, "gemini_key.txt")


def resource(path):
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, path)


def _read_key():
    try:
        with open(KEY_FILE, encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return ""


def _err(code, status="", message="", retry=0):
    return {"code": code, "status": status, "message": message, "retry": retry}


def _request(method, path, key, body=None, timeout=120):
    """(sonuç, hata) döndürür. Hata: {code, status, message, retry(sn)}"""
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method,
                                 headers={"x-goog-api-key": key, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8")), None
    except urllib.error.HTTPError as e:
        retry = int(e.headers.get("Retry-After") or 0) if e.headers else 0
        status, msg = "", e.reason
        try:
            err = json.loads(e.read().decode("utf-8")).get("error", {})
            status, msg = err.get("status", ""), err.get("message", msg)
            quota = []
            for d in err.get("details", []) or []:
                m = re.match(r"(\d+(?:\.\d+)?)s", str(d.get("retryDelay", "")))
                if m:
                    retry = max(retry, int(float(m.group(1))) + 1)
                # Hangi kota doldu? (QuotaFailure ayrıntısı: dakikalık/günlük, limit, model)
                for v in d.get("violations", []) or []:
                    dims = v.get("quotaDimensions") or {}
                    quota.append(f"quotaId={v.get('quotaId', '')} metric={v.get('quotaMetric', '')} "
                                 f"model={dims.get('model', '')} limit: {v.get('quotaValue', '?')}")
            if quota:
                msg = f"{msg} | " + " ; ".join(quota)
        except Exception:
            pass
        if e.code == 429 and not retry:
            m = re.search(r"retry in (\d+(?:\.\d+)?)", str(msg), re.I)
            retry = int(float(m.group(1))) + 1 if m else 60
        return None, _err(e.code, status, str(msg), retry)
    except Exception as e:  # ağ hatası, zaman aşımı
        return None, _err(0, "NETWORK", str(e))


def _version(n):
    m = re.search(r"gemini-(\d+(?:\.\d+)?)", n)
    return float(m.group(1)) if m else 0.0


def _models(key):
    res, err = _request("GET", "/models?pageSize=1000", key, timeout=30)
    if err:
        return None, err
    names = [m["name"].split("/", 1)[1] for m in res.get("models", [])
             if "generateContent" in m.get("supportedGenerationMethods", []) and "gemini" in m["name"]
             and not any(x in m["name"] for x in ("embedding", "tts", "image", "live", "audio", "robotics", "computer-use"))]

    def rank(n):
        kind = 0 if ("flash" in n and "lite" not in n) else 1 if "pro" in n else 2 if "lite" in n else 3
        unstable = 1 if any(x in n for x in ("preview", "exp", "-0", "latest")) else 0
        return (unstable, kind, -_version(n), n)

    names.sort(key=rank)
    return names, None


def _parse(res):
    cand = (res.get("candidates") or [{}])[0]
    text = "".join(p.get("text", "") for p in cand.get("content", {}).get("parts", []))
    sources, seen = [], set()
    for ch in (cand.get("groundingMetadata") or {}).get("groundingChunks", []) or []:
        web = ch.get("web") or {}
        if web.get("uri") and web["uri"] not in seen:
            seen.add(web["uri"])
            sources.append({"uri": web["uri"], "title": web.get("title", "")})
    return text, sources, cand.get("finishReason", "")


# ---------- MetaBot: gizli tarayıcı penceresi ----------
_HW = None
_HW_LOCK = threading.Lock()


def _hidden_window():
    global _HW
    if _HW is None:
        loaded = threading.Event()
        _HW = webview.create_window("metabot", "https://metabot.gg/en/aion-2/armory", hidden=True)
        _HW.events.loaded += lambda *a: loaded.set()
        loaded.wait(40)
    return _HW


def _load(win, url, timeout=40):
    loaded = threading.Event()
    handler = lambda *a: loaded.set()
    win.events.loaded += handler
    try:
        win.load_url(url)
        if not loaded.wait(timeout):
            raise TimeoutError("Sayfa yüklenemedi (zaman aşımı)")
    finally:
        win.events.loaded -= handler


def _js_get(win, path):
    """Sayfanın içinden (normal ziyaretçi gibi) eşzamanlı istek; Promise beklemeye gerek kalmaz."""
    js = ("(function(){try{var x=new XMLHttpRequest();x.open('GET'," + json.dumps(path) + ",false);x.send();"
          "return JSON.stringify({s:x.status,t:x.responseText});}catch(e){return JSON.stringify({s:-1,t:String(e)});}})()")
    raw = win.evaluate_js(js)
    try:
        r = json.loads(raw) if isinstance(raw, str) else (raw or {})
    except Exception:
        r = {}
    return int(r.get("s", -1) or -1), r.get("t", "") or ""


def _wait_ready(win, timeout=25):
    """Cloudflare 'Just a moment' kontrol sayfası geçene kadar bekle."""
    end = time.time() + timeout
    while time.time() < end:
        try:
            t = str(win.evaluate_js("document.title + '|' + document.readyState") or "")
        except Exception:
            t = ""
        if t.endswith("complete") and "just a moment" not in t.lower() and "bir dakika" not in t.lower():
            return True
        time.sleep(1)
    return False


def _browser_lookup(name, region, server, cls):
    with _HW_LOCK:
        win = _hidden_window()
        if not _wait_ready(win):
            return {"ok": False, "code": -2, "error": "MetaBot sayfası açılamadı (güvenlik kontrolü geçilemedi)"}
        q = urllib.parse.urlencode({"q": name, "region": region, "mode": "nc"})
        status, text = _js_get(win, f"/api/aion-2/armory/search?{q}")
        if status != 200:
            return {"ok": False, "code": status if status > 0 else -2,
                    "error": f"Arama başarısız (HTTP {status})" if status > 0 else "Arama başarısız", "detail": text[:300]}
        try:
            rows = json.loads(text).get("rows", [])
        except Exception:
            return {"ok": False, "code": -2, "error": "Arama cevabı okunamadı", "detail": text[:300]}
        pick = armory.choose(rows, name, server, cls)
        if not pick.get("ok"):
            return pick
        r = pick["row"]
        url = f"{armory.BASE}/en{r['path']}"
        _load(win, url)
        _wait_ready(win)
        time.sleep(1.0)  # sayfanın tamamlanması için kısa bekleme
        html = win.evaluate_js("document.documentElement.outerHTML")
        prof = armory.parse_profile(armory.html_lines(html), html)
        try:
            armory.merge_icons(prof, win.evaluate_js(armory.ICON_JS))
        except Exception:
            pass
        try:  # Daevanion: hangi düğümler açık
            raw = win.evaluate_js(armory.dv_js(r.get("key", "")))
            prof["dv"] = json.loads(raw) if isinstance(raw, str) and raw else {}
        except Exception:
            prof["dv"] = {}
        prof.update({"ok": True, "name": r["name"], "server": r.get("serverName"), "region": region,
                     "classKey": r.get("classKey"), "url": url, "via": "browser"})
        return prof


def _item_detail(url, label):
    with _HW_LOCK:
        win = _hidden_window()
        cur = str(win.evaluate_js("location.href") or "").split("#")[0]
        if cur != url:
            _load(win, url)
            _wait_ready(win)
            time.sleep(1.0)
        if win.evaluate_js(armory.item_click_js(label)) != "OK":
            return {"ok": False, "error": "Eşya MetaBot sayfasında bulunamadı (karakteri yeniden sorgula)"}
        text = ""
        for _ in range(24):  # en fazla ~12 sn
            time.sleep(0.5)
            text = str(win.evaluate_js(armory.ITEM_READ_JS) or "")
            if text and "loading item details" not in text.lower():
                break
        try:
            win.evaluate_js(armory.ITEM_CLOSE_JS)
        except Exception:
            pass
        lines = [l.strip() for l in text.splitlines() if l.strip()]
        return {"ok": bool(lines), "lines": lines, "error": "" if lines else "Eşya detayı okunamadı"}


_CH_CACHE = {}
_DPS = None


def dps():
    global _DPS
    if _DPS is None:
        _DPS = DpsManager(DATA_DIR, resource(os.path.join("dps", "data")), APP_VERSION)
    return _DPS


def _harita():
    try:
        with open(resource(os.path.join("harita", "harita.json")), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {"maps": {}}


def _safe(fn):
    try:
        return fn()
    except urllib.error.HTTPError as e:
        return {"ok": False, "code": e.code, "error": f"NCSOFT cevap vermedi (HTTP {e.code})"}
    except Exception as e:
        return {"ok": False, "code": 0, "error": str(e)}


class Api:
    # ---------------- NCSOFT resmi karakter verisi
    def nc_lookup(self, name, region, server=""):
        return _safe(lambda: ncsoft.lookup(name, region, server))

    def nc_lookup_id(self, region, server_id, char_id):
        return _safe(lambda: ncsoft.lookup_id(region, server_id, char_id))

    def nc_item(self, region, server_id, char_id, item_id, enchant, slot_pos):
        return _safe(lambda: ncsoft.item_lines(region, server_id, char_id, item_id, enchant, slot_pos))

    def item_search(self, q):
        return _safe(lambda: {"ok": True, "items": ncsoft.item_search(q)})

    def item_info(self, item_id, region="eu"):
        return _safe(lambda: ncsoft.item_info(item_id, region))

    def servers(self):
        d = dps().data.servers
        return [{"id": k, "name": v, "race": "Elyos" if k < 2000 else "Asmodian"} for k, v in sorted(d.items())]

    def harita(self):
        return _harita()

    # ---------------- DPS ölçer / zamanlayıcı
    def dps_settings(self, upd=None):
        return dps().settings(upd)

    def dps_start(self, launch=None):
        return dps().start(launch)

    def dps_stop(self):
        return dps().stop()

    def dps_reset(self):
        return dps().reset()

    def dps_snapshot(self, party_only=None, fight_id=None):
        return dps().snapshot(party_only, fight_id)

    def dps_overlay(self, on):
        return dps().overlay_toggle(on)

    def npcap_install(self):
        return dps().install_npcap()

    def dps_launch(self):
        return dps().launch_game()

    def dps_check_update(self):
        return dps().check_update()

    def dps_apply_update(self):
        return dps().apply_update()

    def timers(self):
        return {"timers": dps().timers(), "game": dps().game_live(), "running": dps().running()}

    def pick_file(self):
        try:
            r = webview.windows[0].create_file_dialog(webview.OPEN_DIALOG, file_types=("Program (*.exe;*.lnk;*.url)", "Tümü (*.*)"))
            return r[0] if r else ""
        except Exception:
            return ""

    def app_version(self):
        return APP_VERSION

    def app_check(self):
        return updater.check(APP_VERSION)

    def app_install(self, url):
        r = updater.install(url)
        if r.get("ok"):
            threading.Timer(1.0, lambda: os._exit(0)).start()  # betik eski exe kapanınca yenisini koyup açar
        return r

    def lookup_character(self, name, region, server="", cls="", source="ncsoft"):
        """NCSOFT resmi verisi önce; olmazsa MetaBot."""
        if source != "metabot":
            r = self.nc_lookup(name, region, server)
            if r.get("ok") or r.get("code") in (300,):
                return r
            if r.get("code") == 404 and r.get("matches") is not None:
                return r
        return self._mb_lookup(name, region, server, cls)

    def _mb_lookup(self, name, region, server="", cls=""):
        """Önce doğrudan, site engellerse (403) gizli tarayıcı penceresiyle dener. Aynı sorgu 10 dk önbellekte."""
        key = (name.lower(), region, server.lower(), cls.lower())
        hit = _CH_CACHE.get(key)
        if hit and time.time() - hit[0] < 600:
            return hit[1]
        try:
            res = armory.lookup(name, region, server, cls)
        except urllib.error.HTTPError as e:
            try:
                res = _browser_lookup(name, region, server, cls)
            except Exception as e2:
                return {"ok": False, "code": e.code, "error": f"HTTP {e.code}: {e.reason}", "detail": str(e2)}
            if not res.get("ok"):
                res["detail"] = f"Doğrudan istek: HTTP {e.code} {e.reason}. Gizli tarayıcı: {res.get('error', '')} {res.get('detail', '')}".strip()
        except Exception as e:
            try:
                res = _browser_lookup(name, region, server, cls)
            except Exception as e2:
                return {"ok": False, "code": 0, "error": str(e), "detail": str(e2)}
        if res.get("ok"):
            _CH_CACHE[key] = (time.time(), res)
        return res

    def item_detail(self, url, label):
        if not (isinstance(url, str) and url.startswith(armory.BASE)):
            return {"ok": False, "error": "Geçersiz adres"}
        try:
            return _item_detail(url, label)
        except Exception as e:
            return {"ok": False, "error": f"Eşya detayı okunamadı: {e}"}

    def open_url(self, url):
        if isinstance(url, str) and url.startswith(("http://", "https://")):
            webbrowser.open(url)

    def has_key(self):
        return bool(_read_key())

    def save_key(self, key):
        key = (key or "").strip()
        if not key:
            return {"ok": False, "error": "Anahtar boş"}
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(KEY_FILE, "w", encoding="utf-8") as f:
            f.write(key)
        return {"ok": True}

    def delete_key(self):
        try:
            os.remove(KEY_FILE)
        except OSError:
            pass
        return {"ok": True}

    def list_models(self):
        key = _read_key()
        if not key:
            return {"ok": False, "error": _err(401, "NO_KEY", "API key missing")}
        names, err = _models(key)
        if err:
            return {"ok": False, "error": err}
        if not names:
            return {"ok": False, "error": _err(404, "NO_MODELS", "No Gemini models available")}
        return {"ok": True, "models": names}

    def ask_gemini(self, model, prompt, search=True):
        key = _read_key()
        if not key:
            return {"ok": False, "error": _err(401, "NO_KEY", "API key missing"), "model": model}
        if not model:
            names, err = _models(key)
            if err:
                return {"ok": False, "error": err, "model": model}
            model = names[0]
        body = {"contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.4}}
        if search:
            body["tools"] = [{"google_search": {}}]
        res, err = _request("POST", f"/models/{model}:generateContent", key, body)
        if err and search and err["code"] == 400:  # arama aracı desteklenmiyorsa aramasız dene
            body.pop("tools", None)
            res, err2 = _request("POST", f"/models/{model}:generateContent", key, body)
            err = None if res else err2
        if err:
            return {"ok": False, "error": err, "model": model}
        text, sources, finish = _parse(res)
        if not text:
            return {"ok": False, "error": _err(200, "EMPTY", f"Empty response (finishReason={finish})"), "model": model}
        return {"ok": True, "text": text, "sources": sources, "model": model}


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    win = webview.create_window("Kanatix Daeva Asistanı", resource(os.path.join("app", "index.html")),
                                js_api=Api(), width=1280, height=860, min_size=(420, 600))

    def on_closed(*_):
        # Ana pencere kapanınca gizli MetaBot penceresini de kapat ve işlemi tamamen sonlandır
        try:
            if _DPS is not None:
                _DPS.stop()
                _DPS._stop_overlay()
        except Exception:
            pass
        try:
            if _HW is not None:
                _HW.destroy()
        except Exception:
            pass
        os._exit(0)

    win.events.closed += on_closed
    # private_mode=False + storage_path: seviyeler ve ayarlar kapatınca silinmesin
    webview.start(private_mode=False, storage_path=DATA_DIR)
    os._exit(0)  # pencereler kapandıktan sonra arkada hiçbir şey kalmasın


if __name__ == "__main__":
    main()
