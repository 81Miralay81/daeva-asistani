"""Savaş takibi: olaylardan dövüşler, oyuncular, parti üyeleri ve yetenek başına hasar dökümü.

Mantık cyberbadger6969/aion2-dps-meter (GPL-3.0) CombatTracker / EntityRegistry'den sadeleştirilerek alındı.
"""
import json
import os
import threading
import time

from . import protocol as P

ICON_BASE = "https://assets.playnccdn.com/static-aion2-gamedata/resources/"
ICON_CLS = {11: "GL", 12: "TE", 13: "AS", 14: "RA", 15: "SO", 16: "EL", 17: "CL", 18: "CH", 19: "GT"}
CLASS_TR = {"gladiator": "Gladiator", "templar": "Templar", "assassin": "Assassin", "ranger": "Ranger",
            "sorcerer": "Sorcerer", "spiritmaster": "Elementalist", "cleric": "Cleric", "chanter": "Chanter",
            "brawler": "Brawler", "": ""}


class GameData:
    """Yetenek / NPC / harita adları. Önce kullanıcının güncel kaynak klasörü, yoksa exe'ye gömülü tablolar."""

    def __init__(self, dirs):
        self.skills, self.icons, self.npcs, self.maps, self.servers = {}, {}, {}, {}, {}
        self.dots, self.heals = set(), set()
        self.fb_maps = {}
        for d in dirs:  # sonraki klasör öncekinin üstüne yazar
            self._load(d)

    @staticmethod
    def _read(path):
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return None

    def _load(self, d):
        if not d or not os.path.isdir(d):
            return
        j = self._read(os.path.join(d, "skills.json")) or {}
        self.skills.update({int(k): v for k, v in j.items() if k.isdigit() and v})
        j = self._read(os.path.join(d, "skill_icons.json")) or {}
        self.icons.update({int(k): v for k, v in j.items() if k.isdigit() and v})
        j = self._read(os.path.join(d, "npcs.json")) or {}
        for k, v in j.items():
            if k.isdigit():
                self.npcs[int(k)] = v if isinstance(v, dict) else {"name": v}
        j = self._read(os.path.join(d, "maps.json")) or {}
        self.maps.update({int(k): (v.get("name") if isinstance(v, dict) else v) for k, v in j.items() if k.isdigit()})
        j = self._read(os.path.join(d, "servers.json")) or {}
        self.servers.update({int(k): v for k, v in j.items() if k.isdigit() and v})
        j = self._read(os.path.join(d, "field_boss_maps.json")) or {}
        for k, v in (j.get("maps") or {}).items():
            if k.isdigit():
                self.fb_maps[int(k)] = v
        j = self._read(os.path.join(d, "dot_skill_ids.json"))
        if isinstance(j, list) and j:
            self.dots = set(int(x) for x in j)
        j = self._read(os.path.join(d, "healing_skill_ids.json"))
        if isinstance(j, list) and j:
            self.heals = set(int(x) for x in j)

    def is_damage_dot(self, raw):
        return not self.dots or raw in self.dots

    def is_non_damage(self, code):
        return (16_990_000 <= code <= 16_999_999 or 16_770_000 <= code <= 16_779_999
                or code in self.heals or P.base_skill(code) in self.heals)

    def skill_name(self, code):
        n = self.skills.get(code) or self.skills.get(P.base_skill(code))
        return n or f"Yetenek {code}"

    def icon(self, code):
        """Resmi NC oyun verisi CDN'inden yetenek ikonu adresi (yoksa boş)."""
        t = str(code)
        if code > 999 and t[:4].isdigit() and int(t[:4]) in self.icons:
            return ICON_BASE + self.icons[int(t[:4])] + ".png"
        if 30_000_000 <= code <= 30_999_999 and len(t) >= 7:
            st = int(t[5:7]) if t[5:7].isdigit() else 0
            return f"{ICON_BASE}Icon_Item_Usable_Godstone_WP_r_{st:03x}.png" if st else ""
        if not P.is_class_skill(code):
            return ""
        if code // 100 % 10_000 == 0 and code % 100:
            return ""
        cls = ICON_CLS.get(code // 1_000_000)
        if not cls:
            return ""
        sub = code // 10_000 % 100
        passive = sub >= 70
        if passive:
            sub -= 70
        return f"{ICON_BASE}ICON_{cls}_SKILL_{'Passive_' if passive else ''}{sub:03d}.png"

    def npc(self, code):
        return self.npcs.get(code) or {}

    def bosses_in_block(self, block):
        return sorted(c for c, n in self.npcs.items() if n.get("isBoss") and not n.get("isDummy") and c // 1000 == block)

    def map_name(self, mid):
        if mid in self.maps:
            return self.maps[mid]
        return f"Zindan {mid}" if 600_000 <= mid < 700_000 else "Açık dünya"


class Combatant:
    __slots__ = ("id", "name", "cls", "server", "gear", "cp", "is_self", "dmg", "hits", "crits", "max", "skills",
                 "first", "last", "heal", "taken")

    def __init__(self, cid):
        self.id, self.name, self.cls, self.server, self.gear, self.cp = cid, f"#{cid}", "", 0, 0, 0
        self.is_self = False
        self.dmg = self.hits = self.crits = self.max = self.heal = self.taken = 0
        self.skills = {}  # kod -> [hasar, vuruş, kritik, en büyük, dot?, arka, mükemmel]
        self.first = self.last = 0

    def add(self, skill, amount, flags, hits):
        self.dmg += amount
        self.hits += hits
        crit = 1 if flags & P.CRIT else 0
        self.crits += crit
        if amount > self.max:
            self.max = amount
        s = self.skills.get(skill)
        if s is None:
            s = self.skills[skill] = [0, 0, 0, 0, 1 if flags & P.DOT else 0, 0, 0]
        s[0] += amount
        s[1] += hits
        s[2] += crit
        if amount > s[3]:
            s[3] = amount
        if flags & P.BACK:
            s[5] += 1
        if flags & P.PERFECT:
            s[6] += 1


class Encounter:
    _seq = 0

    def __init__(self, t, zone):
        Encounter._seq += 1
        self.id = Encounter._seq
        self.start = self.last = t
        self.end = 0
        self.zone = zone
        self.total = 0
        self.by_target = {}
        self.cbt = {}
        self.boss_id = None
        self.boss_name = ""
        self.boss_code = 0
        self.boss_max = 0
        self.boss_hp = -1
        self.reason = ""

    @property
    def active(self):
        return self.end == 0


class Tracker:
    IDLE_MS = 10_000
    BOSS_IDLE_MS = 30_000
    MAX_HIT = 50_000_000
    BOSS_HP = 5_000_000
    HISTORY = 30

    def __init__(self, data):
        self.data = data
        self.lock = threading.RLock()
        self.players = {}      # id -> dict(name, server, cls)
        self.gear = {}         # ad -> (gear, cp)
        self.self_id = None
        self.self_info = {}
        self.npcs = {}         # id -> dict(code, maxhp, hp, boss)
        self.summon = {}       # pet id -> sahip id
        self.unowned = {}      # id -> sahip adı ya da None
        self.classy = set()    # sınıf yeteneği kullanan id'ler (oyuncu gibi)
        self.roster = []       # son parti listesi
        self.roster_names = set()
        self.map_id = 0
        self.zone = ""
        self.cur = None
        self.done = []
        self.last_event = 0
        self.fieldboss = {}    # harita -> {"t": alındığı an, "slots": [...]}
        self.pos = {}          # id -> (x, y, z, t)
        self.kills = {}        # npc kodu -> ölüm zamanı (açık dünya bossları)
        self.events = 0

    # ---------------------------------------------------------------- giriş
    def process(self, e):
        with self.lock:
            self.events += 1
            t = e[1]
            if t > self.last_event:
                self.last_event = t
            self._idle(t)
            k = e[0]
            if k == "dmg":
                self._dmg(e)
            elif k == "heal":
                if self.cur and self.cur.active:
                    c = self.cur.cbt.get(self._owner(e[2]))
                    if c:
                        c.heal += e[5]
            elif k == "self":
                _, t, pid, name, server, cls, level, cp = e
                if name:
                    if self.self_id is not None and self.self_id != pid:
                        old = self.players.get(self.self_id)
                        if old and old.get("name") == name:
                            del self.players[self.self_id]
                    self.self_id = pid
                    self._upsert(pid, name, server, cls)
                    self.self_info = {"name": name, "server": server, "cls": cls, "level": level, "cp": cp}
                    if cp:
                        g = self.gear.get(name, (0, 0))
                        self.gear[name] = (g[0], cp)
            elif k == "player":
                self._upsert(e[2], e[3], e[4], e[5])
            elif k == "roster":
                self.roster = e[2]
                self.roster_names = {m["name"] for m in e[2]}
                for m in e[2]:
                    self.gear[m["name"]] = (m["gear"], m["cp"])
                if self.cur and self.cur.active:
                    for c in self.cur.cbt.values():
                        self._ident(c)
            elif k == "summon":
                _, t, sid, owner, oname, code = e
                if not owner and oname:
                    owner = self._by_name(oname) or 0
                if owner and owner != sid:
                    self.summon[sid] = owner
                    self.npcs.pop(sid, None)
                    self.unowned.pop(sid, None)
                    self.classy.discard(sid)
                    p = self.players.get(sid)
                    if p:
                        del self.players[sid]
                else:
                    self.npcs.pop(sid, None)
                    self.summon.pop(sid, None)
                    self.classy.discard(sid)
                    self.unowned[sid] = oname
            elif k == "npc":
                _, t, nid, code, maxhp = e
                if nid in self.players:
                    return
                n = self._npc(nid, code)
                if maxhp:
                    n["maxhp"] = maxhp
                    if not self.data.npc(code) and maxhp >= self.BOSS_HP:
                        n["boss"] = True
                if self.cur and self.cur.active and self.cur.boss_id == nid:
                    self._boss_info(self.cur, nid)
            elif k == "pos":
                _, t, pid, x, y, z = e
                self.pos[self.self_id if pid == 0 and self.self_id else pid] = (x, y, z, t)
            elif k == "fieldboss":
                _, t, mp, cnt, slots = e
                info = self.data.fb_maps.get(mp) or {}
                codes = self.data.bosses_in_block(info.get("block", 0)) if info.get("block") else []
                for sl in slots:
                    place = sl["slot"] - mp * 100
                    code = codes[place - 1] if len(codes) == cnt and 1 <= place <= len(codes) else 0
                    sl["code"] = code
                    sl["name"] = (self.data.npc(code).get("name") if code else "") or f"Boss {place}"
                self.fieldboss[mp] = {"t": t, "map": info.get("en") or self.data.map_name(mp), "slots": slots}
            elif k == "hp":
                self._hp(e)
            elif k == "death":
                n = self.npcs.get(e[2])
                if n:
                    n["hp"] = 0
                    if n.get("boss") and n.get("code") and not self.data.npc(n["code"]).get("isDummy") and not 600_000 <= self.map_id < 700_000:
                        self.kills[n["code"]] = e[1]
                if self.cur and self.cur.active and self.cur.boss_id == e[2]:
                    self.cur.boss_hp = 0
                    self._finish("kill", max(e[1], self.cur.last))
            elif k == "zone":
                _, t, mid, tele = e
                if self.cur and self.cur.active and not tele:
                    self._finish("zone", self.cur.last)
                if not tele:
                    self.map_id, self.zone = mid, self.data.map_name(mid)
                    self.npcs.clear()
                    self.summon.clear()
                    self.unowned.clear()
                    self.classy.clear()
                    me = self.players.get(self.self_id)
                    self.players.clear()
                    if me:
                        self.players[self.self_id] = me

    def tick(self, now_ms):
        with self.lock:
            self._idle(now_ms)

    def reset(self):
        with self.lock:
            if self.cur and self.cur.active:
                self._finish("manual", self.cur.last)
            self.cur = None

    # ---------------------------------------------------------------- yardımcılar
    def _upsert(self, pid, name, server, cls):
        p = self.players.get(pid)
        if p is None:
            p = self.players[pid] = {"name": "", "server": 0, "cls": ""}
        if name:
            if p["name"] != name:
                for oid in [i for i, o in self.players.items() if i != pid and o["name"] == name]:
                    del self.players[oid]
            p["name"] = name
        if server:
            p["server"] = server
        if cls:
            p["cls"] = cls
        self.npcs.pop(pid, None)
        self.summon.pop(pid, None)
        self.unowned.pop(pid, None)
        if self.cur and pid in self.cur.cbt:
            self._ident(self.cur.cbt[pid])

    def _by_name(self, name):
        for i, p in self.players.items():
            if p["name"] == name:
                return i
        return None

    def _npc(self, nid, code=0):
        n = self.npcs.get(nid)
        if n is None:
            n = self.npcs[nid] = {"code": 0, "maxhp": 0, "hp": -1, "boss": False}
        if code and n["code"] != code:
            n["code"] = code
            d = self.data.npc(code)
            if d:
                n["boss"] = bool(d.get("isBoss") or d.get("isDummy"))
        return n

    def _owner(self, aid):
        for _ in range(4):
            o = self.summon.get(aid)
            if o is None:
                break
            aid = o
        return aid

    def _player_like(self, i):
        return i in self.players or i in self.classy

    def _likely_player(self, i):
        return self._player_like(i) or (self.cur is not None and self.cur.active and i in self.cur.cbt)

    def _likely_npc(self, i):
        return (i in self.npcs and not self._player_like(i)) or (self.cur is not None and self.cur.active and i in self.cur.by_target)

    def _ident(self, c):
        p = self.players.get(c.id)
        if p:
            if p["name"]:
                c.name = p["name"]
            if p["cls"]:
                c.cls = p["cls"]
            c.server = p["server"] or c.server
        g = self.gear.get(c.name)
        if g:
            c.gear, c.cp = g[0] or c.gear, g[1] or c.cp
        c.is_self = c.id == self.self_id

    def _boss_info(self, enc, nid):
        n = self.npcs.get(nid, {})
        enc.boss_code = n.get("code", 0)
        d = self.data.npc(enc.boss_code)
        enc.boss_name = d.get("name") or (f"NPC {enc.boss_code}" if enc.boss_code else f"#{nid}")
        enc.boss_max = n.get("maxhp", 0)

    # ---------------------------------------------------------------- hasar
    def _dmg(self, e):
        _, t, src0, tgt, skill, amount, flags, hits = e
        if amount <= 0 or amount > self.MAX_HIT * max(1, hits) or self.data.is_non_damage(skill):
            return
        src = self._owner(src0)
        if src0 in self.unowned and self.unowned[src0]:
            o = self._by_name(self.unowned[src0])
            if o:
                self.summon[src0] = o
                self.unowned.pop(src0, None)
                src = o
        if src == tgt or tgt in self.summon or tgt in self.unowned:
            return
        sc = P.class_from_skill(skill)
        if sc:
            if src not in self.unowned:
                self.classy.add(src)
        elif 1_000_000 <= skill <= 9_999_999 and not self._player_like(src) and src0 not in self.summon:
            self._npc(src)
        if self._likely_player(tgt):
            if not self._likely_player(src) and self.cur and self.cur.active:
                v = self.cur.cbt.get(tgt)
                if v:
                    v.taken += amount
            return
        if not self._likely_player(src) and self._likely_npc(src):
            return
        if src in self.unowned:  # sahibi bilinmeyen ruh/etki: oyuncu sayma
            return
        n = self._npc(tgt)
        if n["hp"] == 0:
            return
        if self.cur is None or not self.cur.active:
            self.cur = Encounter(t, self.zone)
        enc = self.cur
        if n["boss"] and (enc.boss_id is None or self.npcs.get(enc.boss_id, {}).get("hp", -1) == 0):
            enc.boss_id = tgt
            enc.boss_hp = n["hp"]
            self._boss_info(enc, tgt)
        c = enc.cbt.get(src)
        if c is None:
            c = enc.cbt[src] = Combatant(src)
            self._ident(c)
        if not c.cls and not flags & P.DOT:
            c.cls = sc
        c.add(skill, amount, flags, hits)
        if not c.first:
            c.first = t
        c.last = t
        enc.total += amount
        enc.by_target[tgt] = enc.by_target.get(tgt, 0) + amount
        if t > enc.last:
            enc.last = t

    def _hp(self, e):
        _, t, nid, hp, mx, is_npc = e
        if self._player_like(nid) or (not is_npc and nid not in self.npcs):
            return
        n = self._npc(nid)
        n["hp"] = hp
        if mx:
            n["maxhp"] = mx
            if not self.data.npc(n["code"]) and mx >= self.BOSS_HP:
                n["boss"] = True
        enc = self.cur
        if not enc or not enc.active:
            return
        if enc.boss_id is None and n["boss"] and nid in enc.by_target:
            enc.boss_id = nid
            self._boss_info(enc, nid)
        if enc.boss_id == nid:
            enc.boss_hp = hp
            if mx:
                enc.boss_max = mx
            if hp == 0:
                self._finish("kill", max(t, enc.last))

    def _idle(self, now):
        enc = self.cur
        if not enc or not enc.active:
            return
        boss_alive = enc.boss_id is not None and self.npcs.get(enc.boss_id, {}).get("hp", -1) != 0
        if now - enc.last > (self.BOSS_IDLE_MS if boss_alive else self.IDLE_MS):
            self._finish("idle", enc.last)

    def _finish(self, reason, end):
        enc = self.cur
        if not enc or not enc.active:
            return
        enc.reason = reason
        enc.end = max(end, enc.start + 1)
        if enc.total > 0:
            self.done.insert(0, enc)
            del self.done[self.HISTORY:]

    # ---------------------------------------------------------------- çıktı
    def _in_party(self, c):
        """Parti filtresi. Parti listesi henüz gelmediyse (ölçer zindana girdikten sonra açıldıysa) ya da oyuncunun
        adı bilinmiyorsa (#numara) gizleme: yoksa sadece kendi hasarın görünür."""
        if c.is_self:
            return True
        if not self.self_info.get("name"):
            return True  # kim olduğun henüz bilinmiyor (ölçer oyuna girdikten sonra açıldı): kimseyi gizleme
        if not self.roster_names:
            return False  # parti yok (tek başına): açık dünyada yakındaki yabancıları gösterme
        # Parti listesi seni içermiyorsa eski ya da yarım okunmuştur (sen her zaman kendi partindesin):
        # o zaman listeye güvenme, kimseyi gizleme.
        me = self.self_info.get("name")
        if not me or me not in self.roster_names or len(self.roster_names) < 2:
            return not c.name.startswith("#")
        if c.name.startswith("#"):
            return False  # adı bilinmeyen = yakındaki yabancı (parti üyesinin adı listeden bilinir)
        norm = lambda n: (n or "").split("[")[0].strip().lower()
        return norm(c.name) in {norm(n) for n in self.roster_names}

    def fight_dict(self, enc, party_only=True, now=None, detail=True):
        end = enc.last if enc.active else enc.end
        dur = max(1.0, (end - enc.start) / 1000.0)
        rows = [c for c in enc.cbt.values() if (not party_only or self._in_party(c))]
        for c in rows:
            self._ident(c)
        # Az oyunculu dövüşte (zindan/parti) kimseyi gizleme: parti listesi yarım/eski olsa da 6 kişiye kadar hepsi görünsün.
        players = [c for c in enc.cbt.values() if c.dmg > 0]
        # Boss dövüşünde (alan bossu dahil) partin yoksa herkesi göster: sıralamada kaçıncı olduğunu görürsün.
        if enc.boss_id is not None and (len(players) <= 6 or not self.roster_names):
            party_only = False
        rows = [c for c in enc.cbt.values() if (not party_only or self._in_party(c))]
        total = sum(c.dmg for c in rows) or 1
        rows.sort(key=lambda c: -c.dmg)
        out = []
        for c in rows:
            d = {"id": c.id, "name": c.name, "cls": c.cls, "clsName": CLASS_TR.get(c.cls, c.cls), "self": c.is_self,
                 "dmg": c.dmg, "dps": round(c.dmg / dur), "share": round(c.dmg * 100.0 / total, 1),
                 "hits": c.hits, "crit": round(c.crits * 100.0 / c.hits, 1) if c.hits else 0, "max": c.max,
                 "heal": c.heal, "taken": c.taken, "gear": c.gear, "cp": c.cp,
                 "party": self._in_party(c)}
            if detail:
                sk = sorted(c.skills.items(), key=lambda kv: -kv[1][0])
                d["skills"] = [{"id": k, "name": self.data.skill_name(k), "icon": self.data.icon(k), "dmg": v[0],
                                "hits": v[1], "crit": round(v[2] * 100.0 / v[1], 1) if v[1] else 0, "max": v[3],
                                "avg": round(v[0] / v[1]) if v[1] else 0, "dot": bool(v[4]),
                                "dps": round(v[0] / dur), "share": round(v[0] * 100.0 / c.dmg, 1) if c.dmg else 0,
                                "back": v[5], "perfect": v[6]} for k, v in sk]
            out.append(d)
        boss = None
        if enc.boss_id is not None:
            hp = self.npcs.get(enc.boss_id, {}).get("hp", enc.boss_hp) if enc.active else enc.boss_hp
            boss = {"name": enc.boss_name, "hp": hp, "max": enc.boss_max,
                    "pct": round(hp * 100.0 / enc.boss_max, 1) if enc.boss_max and hp >= 0 else None}
        hidden = len(enc.cbt) - len(rows)
        return {"id": enc.id, "start": enc.start, "dur": round(dur, 1), "active": enc.active, "zone": enc.zone,
                "total": sum(c.dmg for c in rows), "dps": round(sum(c.dmg for c in rows) / dur), "boss": boss,
                "members": out, "hidden": hidden, "reason": enc.reason}

    def snapshot(self, party_only=True, fight_id=None):
        with self.lock:
            enc = None
            if fight_id:
                enc = next((f for f in self.done if f.id == fight_id), None)
                if enc is None and self.cur and self.cur.id == fight_id:
                    enc = self.cur
            if enc is None:
                enc = self.cur if self.cur and (self.cur.active or not self.done) else (self.done[0] if self.done else None)
            fight = self.fight_dict(enc, party_only) if enc else None
            hist = []
            for f in self.done:
                rows = [c for c in f.cbt.values() if not party_only or self._in_party(c)]
                dur = max(1.0, (f.end - f.start) / 1000.0)
                top = max(rows, key=lambda c: c.dmg, default=None)
                hist.append({"id": f.id, "start": f.start, "dur": round(dur, 1), "zone": f.zone,
                             "boss": f.boss_name, "total": sum(c.dmg for c in rows), "reason": f.reason,
                             "top": top.name if top else ""})
            me = self.players.get(self.self_id, {})
            return {"fight": fight, "history": hist, "self": dict(self.self_info, id=self.self_id) if self.self_id else None,
                    "party": [dict(m, inMeter=any(c.name == m["name"] for c in (enc.cbt.values() if enc else []))) for m in self.roster],
                    "zone": self.zone, "known": len(self.players), "events": self.events,
                    "selfName": me.get("name", "")}

    def radar(self, max_age_ms=15_000):
        """Parti üyelerinin sana göre konumu (oyun sadece yakındaki oyuncuların konumunu gönderir)."""
        with self.lock:
            me = self.pos.get(self.self_id)
            now = max([p[3] for p in self.pos.values()] or [0])
            out = []
            for pid, (x, y, z, t) in self.pos.items():
                p = self.players.get(pid)
                if not p or pid == self.self_id or now - t > max_age_ms:
                    continue
                if p["name"] not in self.roster_names:
                    continue
                out.append({"name": p["name"], "cls": p["cls"], "x": x, "y": y, "z": z, "age": now - t,
                            "dx": (x - me[0]) if me else None, "dy": (y - me[1]) if me else None})
            return {"me": {"x": me[0], "y": me[1]} if me else None, "members": out}

    def overlay_rows(self, party_only=True):
        """Oyun üstü pencere: son boss dövüşü, bir sonraki boss'a vurulana kadar ekranda kalır.
        Kilit meşgulse (büyük dövüşte paket yağarken) beklemez, son hesaplanan tabloyu döndürür: pencere donmaz."""
        if not self.lock.acquire(timeout=0.03):
            return getattr(self, "_ov_cache", None)
        try:
            cur = self.cur
            if cur and cur.boss_id is not None:
                enc = cur
            else:
                enc = next((f for f in self.done if f.boss_id is not None), None) or cur or (self.done[0] if self.done else None)
            self._ov_cache = self.fight_dict(enc, party_only, detail=False) if enc else None
            return self._ov_cache
        finally:
            self.lock.release()
