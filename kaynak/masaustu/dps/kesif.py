"""Kendi kendine öğrenen harita: oyunun ekrana getirdiği toplama noktalarını, küpleri ve diğer nesneleri
koordinatlarıyla kaydeder. Işınlanma varışlarındaki kendi konumun, haritadaki ışınlanma taşlarıyla eşleştirilerek
oyun koordinatı -> harita pikseli dönüşümü kendiliğinden bulunur.

Veri: %APPDATA%/DaevaAsistani/kesif_harita.json
  objs:  "kod:x:y" -> {code, x, y, z, zone, first, last, seen, got}
  names: kod -> kullanıcının verdiği ad (örn. 1500004 -> "Orichalcum")
  tps:   [[zone, x, y], ...]  ışınlanma varışları (kalibrasyon için)
"""
import json
import math
import os
import threading
import time

GRID = 60  # aynı noktayı tekrar saymamak için oyun birimi yuvarlaması


class Kesif:
    def __init__(self, data_dir):
        self.path = os.path.join(data_dir, "kesif_harita.json")
        self.lock = threading.Lock()
        self.zone = None
        self.byid = {}  # oyun içi varlık id -> anahtar (o oturum için)
        self.dirty = False
        self.last_save = 0
        self.d = {"objs": {}, "names": {}, "tps": []}
        try:
            with open(self.path, encoding="utf-8") as f:
                self.d.update(json.load(f))
        except Exception:
            pass

    # ------------------------------------------------------------ olaylar (yakalama iş parçacığından)
    def process(self, e):
        try:
            k = e[0]
            if k == "obj":
                _, t, eid, code, x, y, z = e
                key = f"{code}:{round(x / GRID) * GRID}:{round(y / GRID) * GRID}"
                now = int(time.time())
                with self.lock:
                    o = self.d["objs"].get(key)
                    if not o:
                        o = self.d["objs"][key] = {"code": code, "x": round(x), "y": round(y), "z": round(z),
                                                   "zone": self.zone, "first": now, "seen": 0, "got": 0}
                    o["last"] = now
                    o["seen"] += 1
                    self.byid[eid] = key
                    self.dirty = True
            elif k == "gather":
                with self.lock:
                    key = self.byid.get(e[2])
                    if key and key in self.d["objs"]:
                        self.d["objs"][key]["got"] += 1
                        self.dirty = True
            elif k == "zone":
                self.zone = e[2]
            elif k == "pos" and e[2] == 0:  # bölgeye giriş / ışınlanma varışı: kendi konumun
                with self.lock:
                    p = [self.zone, round(e[3]), round(e[4])]
                    if not any(q[0] == p[0] and abs(q[1] - p[1]) < 300 and abs(q[2] - p[2]) < 300 for q in self.d["tps"]):
                        self.d["tps"].append(p)
                        self.dirty = True
            if self.dirty and time.time() - self.last_save > 20:
                self.save()
        except Exception:
            pass

    def save(self):
        with self.lock:
            if not self.dirty:
                return
            tmp = self.path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self.d, f, ensure_ascii=False)
            os.replace(tmp, self.path)
            self.dirty = False
            self.last_save = time.time()

    def set_name(self, code, name):
        with self.lock:
            name = (name or "").strip()[:40]
            if name:
                self.d["names"][str(code)] = name
            else:
                self.d["names"].pop(str(code), None)
            self.dirty = True
        self.save()
        return {"ok": True}

    # ------------------------------------------------------------ haritaya çevirme
    def data(self, teleports):
        """teleports: haritadaki ışınlanma taşları [(x, y), ...] (harita pikseli). Dönüşüm bulunursa
        her nesneye mx, my eklenir."""
        with self.lock:
            objs = [dict(o) for o in self.d["objs"].values()]
            names = dict(self.d["names"])
            tps = [list(p) for p in self.d["tps"]]
        tf = fit(tps, teleports)
        if tf:
            for o in objs:
                o["mx"], o["my"] = apply(tf, o["x"], o["y"])
        codes = {}
        for o in objs:
            c = codes.setdefault(o["code"], {"code": o["code"], "n": 0, "got": 0, "name": names.get(str(o["code"]), "")})
            c["n"] += 1
            c["got"] += o["got"]
        return {"objs": objs, "types": sorted(codes.values(), key=lambda c: (-c["got"], -c["n"])),
                "tps": len(tps), "calibrated": bool(tf), "tf": tf}


def apply(tf, x, y):
    s, sx, sy, ox, oy, sw = tf
    a, b = (y, x) if sw else (x, y)
    return round(a / s * sx + ox, 1), round(b / s * sy + oy, 1)


_FIT_CACHE = {}


def fit(tps, marks):
    key = (tuple(tuple(p) for p in tps), tuple(marks))
    if key not in _FIT_CACHE:
        _FIT_CACHE.clear()
        _FIT_CACHE[key] = _fit(tps, marks)
    return _FIT_CACHE[key]


def _fit(tps, marks):
    """Işınlanma varışlarını (oyun koord.) haritadaki ışınlanma taşlarına oturtan ölçek+kaydırma+eksen yönünü arar.
    En az 3 varış gerekir (2 ile birden fazla çözüm çıkabiliyor)."""
    pts = [(p[1], p[2]) for p in tps]
    if len(pts) < 3 or len(marks) < 3:
        return None
    best = None
    for sw in (0, 1):
        for sx in (1, -1):
            for sy in (1, -1):
                for s10 in range(40, 600, 2):
                    s = s10 / 10.0
                    T = [((b if sw else a) / s * sx, (a if sw else b) / s * sy) for a, b in pts]
                    for mx, my in marks:
                        ox, oy = mx - T[0][0], my - T[0][1]
                        err = 0
                        for a, b in T[1:]:
                            d = min(math.hypot(a + ox - u, b + oy - w) for u, w in marks)
                            err += d
                            if err > 40 * len(T):
                                break
                        if best is None or err < best[0]:
                            best = (err, (s, sx, sy, ox, oy, sw))
    if best and best[0] <= 15 * (len(pts) - 1):  # her varış bir taşın 15 piksel yakınına düşmeli
        return best[1]
    return None
