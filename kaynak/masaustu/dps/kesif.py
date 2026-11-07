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
                        self.d["objs"][key]["gotAt"] = int(time.time())
                        self.dirty = True
            elif k == "zone":
                self.zone = e[2]
            elif k == "pos" and e[2] == 0 and (abs(e[3]) > 1 or abs(e[4]) > 1):  # bölgeye giriş / ışınlanma varışı: kendi konumun
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

    def add_cal(self, key, mx, my):
        """Elle ayar: oyundaki bir noktanın (anahtar) haritadaki yeri. 2 farklı nokta yeter."""
        with self.lock:
            o = self.d["objs"].get(key)
            if not o:
                return {"ok": False, "error": "nokta bulunamadı"}
            cal = [c for c in self.d.setdefault("cal", []) if c[0] != key]
            cal.append([key, o["x"], o["y"], float(mx), float(my)])
            self.d["cal"] = cal[-6:]
            self.dirty = True
        self.save()
        return {"ok": True, "n": len(self.d["cal"])}

    def clear_cal(self):
        with self.lock:
            self.d["cal"] = []
            self.dirty = True
        self.save()
        return {"ok": True}

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
        cal = [list(c) for c in self.d.get("cal", [])]
        tf = fit_cal(cal) or (None if cal else fit(tps, teleports))
        if tf:
            for o in objs:
                o["mx"], o["my"] = apply(tf, o["x"], o["y"])
        codes = {}
        for o in objs:
            c = codes.setdefault(o["code"], {"code": o["code"], "n": 0, "got": 0, "name": names.get(str(o["code"]), "")})
            c["n"] += 1
            c["got"] += o["got"]
        recent = sorted([o for o in objs if o.get("gotAt")], key=lambda o: -o["gotAt"])[:5]
        for o in recent:
            o["key"] = f"{o['code']}:{round(o['x'] / GRID) * GRID}:{round(o['y'] / GRID) * GRID}"
            o["name"] = names.get(str(o["code"]), "")
        return {"objs": objs, "types": sorted(codes.values(), key=lambda c: (-c["got"], -c["n"])),
                "tps": len(tps), "calibrated": bool(tf), "tf": tf, "cal": len(cal), "recent": recent}


def fit_cal(cal):
    """Elle verilen eşleşmelerden (oyun x,y -> harita x,y) eksen başına ölçek+kaydırma (en küçük kareler)."""
    if len(cal) < 2:
        return None

    def axis(g, m):
        n = len(g)
        mg, mm = sum(g) / n, sum(m) / n
        v = sum((a - mg) ** 2 for a in g)
        if v < 1e-6:
            return None
        k = sum((a - mg) * (b - mm) for a, b in zip(g, m)) / v
        return k, mm - k * mg
    ax = axis([c[1] for c in cal], [c[3] for c in cal])
    ay = axis([c[2] for c in cal], [c[4] for c in cal])
    if not ax or not ay:
        return None
    # apply() biçimine çevir: a/s*sx+ox  ->  s=1/|k|, sx=işaret
    return ("lin", ax[0], ay[0], ax[1], ay[1], 0)


def apply(tf, x, y):
    if tf[0] == "lin":
        _, kx, ky, ox, oy, _ = tf
        return round(x * kx + ox, 1), round(y * ky + oy, 1)
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
    """Işınlanma varışlarını (oyun koord.) haritadaki ışınlanma taşlarına oturtur. Farklı bölgelerdeki
    (başka harita) varışlar eşleşmeyebilir: her birini çapa deneyip en çok varışı yakına düşüren çözüm seçilir."""
    pts = [(p[1], p[2]) for p in tps]
    if len(pts) < 3 or len(marks) < 3:
        return None
    TOL = 40.0
    grid = {}
    for u, w in marks:
        grid.setdefault((int(u // TOL), int(w // TOL)), []).append((u, w))

    def near(x, y):
        cx, cy, bd = int(x // TOL), int(y // TOL), None
        for i in (cx - 1, cx, cx + 1):
            for k in (cy - 1, cy, cy + 1):
                for u, w in grid.get((i, k), ()):
                    d = math.hypot(x - u, y - w)
                    if bd is None or d < bd:
                        bd = d
        return bd
    best = None
    for sw in (0, 1):
        for sx in (1, -1):
            for sy in (1, -1):
                for s10 in range(40, 600, 2):
                    s = s10 / 10.0
                    T = [((b if sw else a) / s * sx, (a if sw else b) / s * sy) for a, b in pts]
                    for ai in range(min(len(T), 4)):
                        for mx, my in marks:
                            ox, oy = mx - T[ai][0], my - T[ai][1]
                            hit, err = 0, 0.0
                            for j, (a, b) in enumerate(T):
                                if j == ai:
                                    continue
                                d = near(a + ox, b + oy)
                                if d is not None and d < TOL:
                                    hit += 1
                                    err += d
                            if hit >= 3 and (best is None or (hit, -err) > (best[0], -best[1])):
                                best = (hit, err, (s, sx, sy, ox, oy, sw))
    return best[2] if best else None
