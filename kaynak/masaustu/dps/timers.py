"""Geri sayımlar. Bütün saatler bilgisayarın yerel saatiyle (Türkiye, UTC+3) gösterilir; sunucu saati kullanılmaz.

Sabit programlar (Global, kaynaklı):
  - Spacetime Rift: UTC 00:00'dan başlayarak 3 saatte bir, girişler 10 dk  (jackships/aion2-data, CC BY 4.0)
  - Günlük sıfırlama 07:00 UTC, haftalık Çarşamba 07:00 UTC               (aion2-data)
  - Watcher Kaira (Reshanta): sunucu saatiyle 01:00'den 3 saatte bir      (aion2hub.com)
Saha bossları: oyun içi haritada boss listesi açılınca oyunun gönderdiği zamanlar, ya da ölçerin gördüğü ölüm + yeniden doğma süresi.
Kullanıcının eklediği özel sayaçlar (ör. siege, Abyss savaşları) haftalık/günlük tekrar eder.
"""
import time

H = 3600
SCHEDULES = [
    {"id": "rift", "name": "Spacetime Rift", "kind": "olay", "anchor": 0, "every": 3 * H, "dur": 600,
     "note": "Portallar 10 dk açık, sonra 1 saat düşman bölgesi"},
    {"id": "kaira", "name": "Watcher Kaira (Reshanta)", "kind": "abyss", "anchor": 16 * H, "every": 3 * H, "dur": 0,
     "note": "Abyss dünya bossu"},
    {"id": "daily", "name": "Günlük sıfırlama", "kind": "sıfırlama", "anchor": 7 * H, "every": 24 * H, "dur": 0, "note": ""},
    {"id": "weekly", "name": "Haftalık sıfırlama", "kind": "sıfırlama", "anchor": 7 * H + 6 * 24 * H, "every": 7 * 24 * H,
     "dur": 0, "note": "Çarşamba"},  # 1970-01-07 Çarşamba
]
LONG_RESPAWN = ("lagta", "gartua")  # 12 saat; diğer saha bossları 6 saat


def _next(anchor, every, dur, now):
    k = (now - anchor) // every
    start = anchor + k * every
    if dur and start <= now < start + dur:
        return start, True
    return start + every, False


def _custom_next(c, now):
    """c: {name, days:[0-6 Pzt=0] ya da boş=her gün, time:'HH:MM', dur:dk} — yerel saat."""
    try:
        hh, mm = [int(x) for x in c.get("time", "20:00").split(":")]
    except ValueError:
        return None, False
    lt = time.localtime(now)
    base = time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday, hh, mm, 0, 0, 0, -1))
    days = c.get("days") or list(range(7))
    dur = int(c.get("dur") or 0) * 60
    for d in range(0, 8):
        t = base + d * 86400
        wd = time.localtime(t).tm_wday
        if wd in days and (t > now or (dur and t <= now < t + dur)):
            return t, t <= now
    return None, False


def all_timers(tracker=None, custom=None, race=None, hidden=(), now=None):
    now = int(now or time.time())
    out = []
    for s in SCHEDULES:
        t, active = _next(s["anchor"], s["every"], s["dur"], now)
        out.append({"id": s["id"], "name": s["name"], "kind": s["kind"], "at": t, "active": active,
                    "end": t + s["dur"] if active else 0, "note": s["note"], "src": "program"})
    for i, c in enumerate(custom or []):
        t, active = _custom_next(c, now)
        if t:
            out.append({"id": f"c{i}", "name": c.get("name", "Özel"), "kind": "özel", "at": int(t), "active": active,
                        "end": int(t) + int(c.get("dur") or 0) * 60 if active else 0, "note": c.get("note", ""), "src": "sen"})
    if tracker is not None:
        with tracker.lock:
            for mp, fb in tracker.fieldboss.items():
                for sl in fb["slots"]:
                    at = sl["at"] // 1000 if sl["at"] else 0
                    item = {"id": f"fb{sl['slot']}", "name": sl["name"], "kind": "saha bossu", "map": fb["map"],
                            "src": "oyun", "note": fb["map"]}
                    if sl["alive"]:
                        item.update(at=at, active=True, end=0, note=f"{fb['map']} · şu an hayatta")
                    elif at:
                        item.update(at=at, active=at <= now, end=0)
                    else:
                        continue
                    out.append(item)
            seen = {o.get("name") for o in out}
            for code, kt in tracker.kills.items():
                nm = tracker.data.npc(code).get("name") or f"NPC {code}"
                if nm in seen:
                    continue
                hrs = 12 if any(x in nm.lower() for x in LONG_RESPAWN) else 6
                at = kt // 1000 + hrs * H
                out.append({"id": f"k{code}", "name": nm, "kind": "saha bossu", "at": at, "active": at <= now, "end": 0,
                            "note": f"ölümünden {hrs} saat sonra (tahmini)", "src": "ölçer"})
    for o in out:
        o["left"] = max(0, o["at"] - now) if not o["active"] else 0
        o["hidden"] = o["id"] in hidden
        o["local"] = time.strftime("%a %H:%M", time.localtime(o["at"])) if o["at"] else ""
    out.sort(key=lambda o: (not o["active"], o["at"]))
    return out
