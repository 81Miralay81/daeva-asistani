"""NCSOFT'un resmi Aion 2 karakter sayfasının (aion2.plaync.com) kullandığı JSON uçları.

Belgelenmiş bir API değil; NC'nin kendi karakter araması ne gönderiyorsa o (uç adları ve parametreler
github.com/nuriland/aion2-api'den, Ekim 2026). NC bir alanın adını değiştirirse bu dosya güncellenir.
"""
import json
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

SITE = "https://aion2.plaync.com"
SEARCH = "https://api-search.plaync.com/aion2global/search/v2/character"
LANG = "en-US"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      "Accept": "application/json, text/plain, */*", "Accept-Language": "en-US,en;q=0.9", "Referer": SITE + "/", "Origin": SITE}
# Uygulamadaki bölge kodu → NC'nin Global bölge parametresi
REGION = {"eu": "eu", "na": "nae", "nae": "nae", "naw": "naw", "sa": "la", "la": "la", "as": "as", "asia": "as", "jp": "as"}
CLASS_KEY = {"gladiator": "gladiator", "templar": "templar", "assassin": "assassin", "ranger": "ranger", "sorcerer": "sorcerer",
             "elementalist": "spiritmaster", "spiritmaster": "spiritmaster", "cleric": "cleric", "chanter": "chanter"}

_LAST = [0.0]
_LOCK = threading.Lock()
_CACHE = {}


def _get(url, timeout=20, ttl=600):
    hit = _CACHE.get(url)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    with _LOCK:  # NC'yi yormayalım: istekler arası en az 0.25 sn
        wait = _LAST[0] + 0.25 - time.time()
        if wait > 0:
            time.sleep(wait)
        _LAST[0] = time.time()
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = json.loads(r.read().decode("utf-8"))
    _CACHE[url] = (time.time(), body)
    return body


def _site(path, **q):
    q = {k: v for k, v in q.items() if v not in (None, "")}
    return f"{SITE}{path}?{urllib.parse.urlencode(dict(lang=LANG, **q))}"


def shard(region):
    return REGION.get((region or "eu").lower(), "eu")


def search(name, region="eu", race=None, pages=3):
    """İsimde 'name' geçen karakterler (iki ırk birden). [{characterId, name, serverId, serverName, level, race, pcId}]"""
    q = {"keyword": name, "page": 1, "size": 40, "region": shard(region), "localeInfo": LANG}
    if race:
        q["race"] = race
    rows = []
    first = _get(f"{SEARCH}?{urllib.parse.urlencode(q)}", ttl=180)
    rows += first.get("list") or []
    end = min((first.get("pagination") or {}).get("endPage") or 1, pages)
    for p in range(2, end + 1):
        q["page"] = p
        rows += _get(f"{SEARCH}?{urllib.parse.urlencode(q)}", ttl=180).get("list") or []
    for r in rows:
        r["characterId"] = urllib.parse.unquote(r.get("characterId") or "")
        r["name"] = re.sub(r"<[^>]*>", "", str(r.get("name") or ""))
    return rows


def choose(rows, name, server=""):
    exact = [r for r in rows if r["name"].lower() == name.lower()]
    srv = (server or "").strip().lower()
    if srv:
        exact = [r for r in exact if str(r.get("serverName", "")).lower() == srv or str(r.get("serverId")) == srv]
    if not exact:
        return {"ok": False, "code": 404, "error": "Karakter bulunamadı",
                "matches": [_match(r) for r in rows[:15]]}
    if len(exact) > 1:
        return {"ok": False, "code": 300, "error": "Birden fazla eşleşme var, sunucuyu seç", "matches": [_match(r) for r in exact[:15]]}
    return {"ok": True, "row": exact[0]}


def _match(r):
    return {"serverName": r.get("serverName", ""), "serverId": r.get("serverId"), "classKey": "", "level": r.get("level", 0),
            "name": r.get("name", ""), "characterId": r.get("characterId", ""), "race": r.get("race")}


def info(region, server_id, char_id):
    return _get(_site("/api/character/info", region=shard(region), serverId=server_id, characterId=char_id))


def equipment(region, server_id, char_id):
    return _get(_site("/api/character/equipment", region=shard(region), serverId=server_id, characterId=char_id))


def item(region, server_id, char_id, item_id, enchant, slot_pos):
    return _get(_site("/api/character/equipment/item", region=shard(region), serverId=server_id, characterId=char_id,
                      id=item_id, enchantLevel=enchant, slotPos=slot_pos), ttl=1800)


def daevanion(region, server_id, char_id, board_id):
    return _get(_site("/api/character/daevanion/detail", region=shard(region), serverId=server_id, characterId=char_id,
                      boardId=board_id))


# ---------------------------------------------------------------- uygulama modeline çevir
SLOT_GROUP = {
    "MainHand": ("weapon", "Ana el"), "SubHand": ("weapon", "Yan el"),
    "Helmet": ("armor", "Kask"), "Shoulder": ("armor", "Omuzluk"), "Torso": ("armor", "Göğüslük"),
    "Pants": ("armor", "Bacaklık"), "Gloves": ("armor", "Eldiven"), "Boots": ("armor", "Bot"), "Cape": ("armor", "Pelerin"),
    "Necklace": ("acc", "Kolye"), "Earring1": ("acc", "Küpe 1"), "Earring2": ("acc", "Küpe 2"), "Ring1": ("acc", "Yüzük 1"),
    "Ring2": ("acc", "Yüzük 2"), "Bracelet1": ("acc", "Bilezik 1"), "Bracelet2": ("acc", "Bilezik 2"), "Belt": ("acc", "Kemer"),
    "Amulet": ("acc", "Muska"), "Rune1": ("acc", "Rün 1"), "Rune2": ("acc", "Rün 2"),
}
GRADE_COLOR = {"Common": "#bfbfbf", "Rare": "#4fc3f7", "Special": "#5fd38a", "Legend": "#e8b94a", "Unique": "#ff8a3c",
               "Epic": "#c58cf5", "Mythic": "#ef6b62", "Heroic": "#c58cf5"}
GRADE_TR = {"Common": "Sıradan", "Rare": "Nadir", "Special": "Özel", "Legend": "Efsanevi", "Unique": "Eşsiz", "Epic": "Destansı",
            "Mythic": "Mitik", "Heroic": "Kahramanlık"}
SLOT_ORDER = list(SLOT_GROUP) + [f"Arcana{i}" for i in range(1, 9)]


def _slot(name):
    if str(name).startswith("Arcana"):
        n = re.sub(r"\D", "", name) or ""
        return "arcana", f"Arcana {n}".strip()
    return SLOT_GROUP.get(name, ("other", name))


def _eq(e):
    grp, tr = _slot(e.get("slotPosName", ""))
    return {"slot": e.get("slotPosName", ""), "slotTr": tr, "group": grp, "item": e.get("name", ""),
            "enchant": e.get("enchantLevel") or 0, "exceed": e.get("exceedLevel") or 0, "icon": e.get("icon") or "",
            "grade": e.get("grade") or "", "gradeTr": GRADE_TR.get(e.get("grade"), e.get("grade") or ""),
            "rarity": GRADE_COLOR.get(e.get("grade"), ""), "id": e.get("id"), "slotPos": e.get("slotPos"),
            "label": f"{e.get('slotPosName', '')}: {e.get('name', '')}"}


def profile(region, row):
    """Arama satırından tam karakter: MetaBot modeliyle uyumlu sözlük + NC'ye özel ek alanlar."""
    sid, cid = row["serverId"], row["characterId"]
    inf = info(region, sid, cid)
    eq = equipment(region, sid, cid)
    pr = inf.get("profile") or {}
    stats = (inf.get("stat") or {}).get("statList") or []
    out = {"ok": True, "via": "ncsoft", "source": "NCSOFT", "name": pr.get("characterName") or row.get("name"),
           "server": pr.get("serverName") or row.get("serverName"), "serverId": sid, "characterId": cid, "region": region,
           "classKey": pr.get("className", ""), "level": pr.get("characterLevel") or row.get("level") or 0,
           "combatPower": pr.get("combatPower") or 0, "race": pr.get("raceName", ""), "gender": pr.get("genderName", ""),
           "legion": pr.get("regionName", "") if pr.get("regionName") and "legion" in str(pr.get("regionName")).lower() else "",
           "title": {"name": pr.get("titleName", ""), "grade": pr.get("titleGrade", "")},
           "portrait": pr.get("profileImage") or "",
           "url": SITE,  # NC'nin karakter sayfası adresi doğrulanmadı: resmi siteye bağlanır
           "actives": [], "passives": [], "stigmas": [], "equipment": [], "skins": [], "primary": {}, "deity": {},
           "statInfo": {}, "daevanion": {}, "dvBoards": [], "titles": {}, "rankings": [], "pet": None, "wing": None, "wingSkin": None}
    out["itemLevel"] = 0
    for st in stats:
        nm, val = st.get("name", ""), st.get("value") or 0
        sec = [x for x in (st.get("statSecondList") or []) if x]
        typ = st.get("type", "")
        if typ in ("STR", "DEX", "INT", "CON", "AGI", "WIS"):
            out["primary"][nm] = val
        elif "[" in nm:
            out["deity"][nm] = {"value": val, "effect": ", ".join(sec)}
        elif re.search(r"item\s*level|아이템레벨|itemlevel", nm, re.I) or typ.lower() == "itemlevel":
            out["itemLevel"] = val
        else:
            out["statInfo"][nm] = {"value": val, "effect": ", ".join(sec)}
        if sec and nm in out["primary"]:
            out["statInfo"][nm] = {"value": val, "effect": ", ".join(sec)}
    t = inf.get("title") or {}
    out["titles"] = {"owned": t.get("ownedCount"), "total": t.get("totalCount"),
                     "list": [{"name": x.get("name"), "grade": x.get("grade"), "cat": x.get("equipCategory"),
                               "equip": [s.get("desc") for s in x.get("equipStatList") or []],
                               "stats": [s.get("desc") for s in x.get("statList") or []]} for x in t.get("titleList") or []]}
    out["rankings"] = [{"name": r.get("rankingContentsName"), "rank": r.get("rank"), "grade": r.get("gradeName"),
                        "point": r.get("point"), "icon": r.get("gradeIcon")} for r in (inf.get("ranking") or {}).get("rankingList") or []
                       if r.get("rank")]
    for b in (inf.get("daevanion") or {}).get("boardList") or []:
        k = str(b.get("name", "")).lower()
        out["daevanion"][k] = {"open": b.get("openNodeCount") or 0, "total": b.get("totalNodeCount") or 0}
        out["dvBoards"].append({"id": b.get("id"), "name": b.get("name"), "open": b.get("openNodeCount") or 0,
                                "total": b.get("totalNodeCount") or 0, "pct": b.get("openPercent") or 0, "icon": b.get("icon") or ""})
    e = eq.get("equipment") or {}
    items = [_eq(x) for x in e.get("equipmentList") or []]
    items.sort(key=lambda x: SLOT_ORDER.index(x["slot"]) if x["slot"] in SLOT_ORDER else 99)
    out["equipment"] = items
    out["skins"] = [_eq(x) for x in e.get("skinList") or []]
    pw = eq.get("petwing") or {}
    if (pw.get("pet") or {}).get("name"):
        out["pet"] = {"name": pw["pet"]["name"], "level": pw["pet"].get("level"), "icon": pw["pet"].get("icon", "")}
    for k in ("wing", "wingSkin"):
        w = pw.get(k) or {}
        if w.get("name"):
            out[k] = {"name": w["name"], "enchant": w.get("enchantLevel") or 0, "grade": w.get("grade") or "",
                      "rarity": GRADE_COLOR.get(w.get("grade"), ""), "icon": w.get("icon", "")}
    for s in (eq.get("skill") or {}).get("skillList") or []:
        cat = s.get("category")
        d = {"name": s.get("name", ""), "level": s.get("skillLevel") or 0, "icon": s.get("icon") or "", "id": s.get("id"),
             "acquired": bool(s.get("acquired")), "equipped": bool(s.get("equip"))}
        if cat == "Active":
            out["actives"].append(d)
        elif cat == "Passive":
            out["passives"].append(d)
        elif cat in ("Dp", "Stigma"):
            if d["acquired"] or d["level"]:
                out["stigmas"].append(d)
    out["stigmas"].sort(key=lambda s: (not s["equipped"], -s["level"]))
    return out


def lookup(name, region, server=""):
    rows = search(name, region)
    pick = choose(rows, name, server)
    if not pick.get("ok"):
        return pick
    return profile(region, pick["row"])


def lookup_id(region, server_id, char_id):
    return profile(region, {"serverId": server_id, "characterId": char_id})


def item_lines(region, server_id, char_id, item_id, enchant, slot_pos):
    """Eşya detayı (oyundaki ipucu penceresi gibi): ana/ek statlar, manataşları, tanrı taşı, eşya yetenekleri."""
    d = item(region, server_id, char_id, item_id, enchant, slot_pos)
    out = {"ok": True, "name": d.get("name"), "grade": d.get("grade"), "gradeTr": GRADE_TR.get(d.get("grade"), d.get("grade")),
           "rarity": GRADE_COLOR.get(d.get("grade"), ""), "icon": d.get("icon"), "level": d.get("level"),
           "category": d.get("categoryName"), "enchant": d.get("enchantLevel"), "maxEnchant": d.get("maxEnchantLevel"),
           "maxExceed": d.get("maxExceedEnchantLevel"), "soulBind": d.get("soulBindRate"), "equipLevel": d.get("equipLevel"),
           "main": [{"name": s.get("name"), "value": s.get("value"), "extra": s.get("extra"), "min": s.get("minValue"),
                     "exceed": s.get("exceed")} for s in d.get("mainStats") or []],
           "sub": [{"name": s.get("name"), "value": s.get("value")} for s in d.get("subStats") or []],
           "subCount": d.get("subStatCount"), "skills": [{"name": s.get("name"), "level": s.get("level"), "icon": s.get("icon")}
                                                          for s in d.get("subSkills") or []],
           "stones": [{"name": s.get("name"), "value": s.get("value"), "grade": s.get("grade"), "icon": s.get("icon")}
                      for s in d.get("magicStoneStat") or []], "stoneSlots": d.get("magicStoneSlotCount"),
           "god": [{"name": s.get("name"), "desc": s.get("desc"), "grade": s.get("grade"), "icon": s.get("icon")}
                   for s in d.get("godStoneStat") or []],
           "set": d.get("setInfo") or d.get("set") or None, "sources": d.get("sources") or []}
    return out


# ---------------------------------------------------------------- eşya / pet arama
DICT = "https://tw.ncsoft.com/aion2_tw/v2.0/dict/search/item"  # NC'nin eşya sözlüğü (Global'de yok; TW, İngilizce)


def item_search(q, size=30):
    """İsme göre eşya/pet ara: [{id, name, icon, grade, category, options}]"""
    url = f"{DICT}?{urllib.parse.urlencode({'searchKeyword': q, 'page': 1, 'size': size, 'locale': 'en-US'})}"
    d = _get(url, ttl=3600)
    return [{"id": x.get("id"), "name": x.get("name"), "icon": x.get("image"), "grade": x.get("grade"),
             "gradeTr": GRADE_TR.get(x.get("grade"), x.get("grade")), "rarity": GRADE_COLOR.get(x.get("grade"), ""),
             "category": x.get("categoryName"), "options": x.get("options") or [], "tradable": x.get("tradable")}
            for x in d.get("contents") or []]


def item_info(item_id, region="eu"):
    """Eşyanın resmi bilgisi; 'sources' = NC'nin söylediği elde etme yolları (ör. Crafting, Dungeon)."""
    d = _get(f"{SITE}/en-us/api/gameconst/item?{urllib.parse.urlencode({'lang': LANG, 'region': shard(region), 'id': item_id, 'enchantLevel': 0})}", ttl=86400)
    return {"ok": True, "id": item_id, "name": d.get("name"), "icon": d.get("icon"), "grade": d.get("grade"),
            "gradeTr": GRADE_TR.get(d.get("grade"), d.get("grade")), "category": d.get("categoryName"),
            "level": d.get("equipLevel") or d.get("level"), "classes": d.get("classNames") or [],
            "sources": d.get("sources") or [], "tradable": d.get("tradable"),
            "main": [{"name": s.get("name"), "value": s.get("value")} for s in d.get("mainStats") or []],
            "desc": d.get("desc") or d.get("description") or ""}
