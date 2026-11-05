"""Harita verisini aion2-interactive-map'ten (tc-imba, veri CC BY-NC 4.0) üretir:
konumlar, gizli küpler, Empyrean Trace, TOPLAMA MALZEMELERİ (Odyle, Orichalcum, Ruby…) ve petler.

Önce sitenin canlı dışa aktarımını dener (toplama noktaları orada), olmazsa deponun statik verisini kullanır.
GitHub Actions (.github/workflows/harita.yml) her gün çalıştırır; sonuç kaynak/masaustu/harita/harita.json.

Kullanım: python tools/harita_data.py <aion2-interactive-map klonu>
"""
import json
import os
import re
import sys
import urllib.request

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "kaynak", "masaustu", "harita", "harita.json")
LIVE = "https://aion2.tc-imba.com/api/v1/export/"
REPO_RAW = "https://raw.githubusercontent.com/aion2-interactive-map/aion2-interactive-map/main/public/"
CJK = re.compile(r"[　-鿿가-힯]")
CAT_TR = {"location": "Konumlar", "collection": "Toplanabilirler", "gathering": "Toplama malzemeleri", "creature": "Petler", "quest": "Görevler"}
TR = {"teleport": "Işınlanma", "hiddenCube": "Gizli küp", "monolithMaterial": "Empyrean Trace", "seal": "Mühür (keşif)",
      "battlefield": "Savaş alanı", "occupation": "Karakol", "village": "Köy"}


def get(rel, clone):
    """Önce canlı dışa aktarım, sonra yerel klon. YAML ya da None."""
    try:
        req = urllib.request.Request(LIVE + rel, headers={"User-Agent": "daeva-asistani-harita"})
        with urllib.request.urlopen(req, timeout=40) as r:
            return yaml.safe_load(r.read().decode("utf-8")), "canlı"
    except Exception as e:
        print("  canlı yok:", rel, str(e)[:80])
    p = os.path.join(clone, "public", rel)
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            return yaml.safe_load(f), "depo"
    return None, ""


def camel(k):
    return re.sub(r"(?<=[a-z])(?=[A-Z0-9])", " ", k or "")


def main():
    clone = sys.argv[1] if len(sys.argv) > 1 else "aion2-interactive-map"
    maps = {m["name"]: m for m in (get("data/maps.yaml", clone)[0] or {}).get("maps", [])}
    types_raw = get("data/types.yaml", clone)[0] or {}
    names_en = get("locales/en/types.yaml", clone)[0] or {}
    sub_en = names_en.get("subtypes") or {}
    types, cats = {}, {}
    for c in types_raw.get("categories", []):
        for s in c.get("subtypes", []):
            n = s["name"]
            types[n] = {"cat": c["name"], "name": TR.get(n) or (sub_en.get(n) or {}).get("name") or camel(n),
                        "icon": REPO_RAW + s["icon"] if s.get("icon") else ""}
        cats[c["name"]] = CAT_TR.get(c["name"], c["name"])
    out = {"source": "aion2-interactive-map (tc-imba, CC BY-NC 4.0)", "types": types, "cats": cats,
           "tiles": REPO_RAW + "UI/Map/WorldMap/", "maps": {}}
    for mn, mp in maps.items():
        w, h = mp["tileWidth"] * mp["tilesCountX"], mp["tileHeight"] * mp["tilesCountY"]
        mk_raw, src = get(f"data/markers/{mn}.yaml", clone)
        loc = get(f"locales/en/markers/{mn}.yaml", clone)[0] or {}
        reg = get(f"locales/en/regions/{mn}.yaml", clone)[0] or {}
        mk = []
        for m in (mk_raw or {}).get("markers", []) or []:
            nm = (loc.get(m.get("id")) or {}).get("name") or str(m.get("name", ""))
            rg = (reg.get(m.get("region")) or {}).get("name") or camel(m.get("region", ""))
            if CJK.search(rg):
                rg = ""
            if CJK.search(nm) or nm.isdigit() or not nm:
                nm = ""
            mk.append([m.get("subtype", ""), nm, rg, round(m.get("x", 0)), round(m.get("y", 0))])  # y: Leaflet (yukarı +)
        ref = [x for x in mk if x[2]]
        for x in mk:  # adı olmayanlara en yakın bölgenin adı
            if not x[2] and ref:
                x[2] = min(ref, key=lambda r: (r[3] - x[3]) ** 2 + (r[4] - x[4]) ** 2)[2]
            if not x[1]:
                x[1] = x[2] or types.get(x[0], {}).get("name", x[0])
        race = "Elyos" if "_L_" in mn or mn.endswith("_L") else "Asmodian" if "_D_" in mn else "Abyss"
        out["maps"][mn] = {"race": race, "w": w, "h": h, "tx": mp["tilesCountX"], "ty": mp["tilesCountY"],
                           "ts": mp["tileWidth"], "visible": mp.get("isVisible", True), "markers": mk}
        print(f"{mn}: {len(mk)} işaret ({src})")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print("yazıldı", OUT, os.path.getsize(OUT) // 1024, "KB")


if __name__ == "__main__":
    main()
