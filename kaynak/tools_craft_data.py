"""Zanaat verisini hazırlar: tarifler, eşya adları, toplama noktaları (haritada), boss/zindan düşüşleri.
Kaynak: SkeeveAN/Aion-DPS-Meter (MIT lisansı) - oyun istemcisinden okunmuş tablolar.
Kullanım: python kaynak/tools_craft_data.py <Aion-DPS-Meter klasörü>"""
import json, math, re, sys, pathlib
import numpy as np

src = pathlib.Path(sys.argv[1])
here = pathlib.Path(__file__).parent
J = lambda p: json.loads((src / p).read_text(encoding="utf-8"))
R = J("Client/assets/aion2/craft/recipes.json")["recipes"]
N = J("Client/assets/aion2/items/item_names.json")
G = J("Client/assets/aion2/maps/gather.json")
MM = J("Client/assets/aion2/maps/maps.json")["maps"]
BL = J("Backend/src/data/aion2/boss_loot.json")
H = json.loads((here / "masaustu/harita/harita.json").read_text(encoding="utf-8"))["maps"]

ids = {r["p"] for r in R} | {x[0] for r in R for x in r["k"]} | {a[0] for r in R for x in r["k"] if len(x) > 2 for a in x[2]}
names = {str(i): N[str(i)][1] for i in ids if str(i) in N}
grades = {str(i): N[str(i)][0] for i in ids if str(i) in N}

# --- oyun koordinatı -> bizim harita pikseli (Leaflet: [lat, lng] = [h - y, x])
TABLE2OURS = {"World/World_L/World_L_A": "World_L_A", "World/World_D/World_D_A": "World_D_A", "Intersever/Abyss/Abyss_Reshanta_A": "Abyss_Reshanta_A"}
conv = {}
for mk, m in MM.items():
    ours = TABLE2OURS.get(m.get("table"))
    if not ours or ours not in H or ours in conv:
        continue
    r = H[ours]["w"] / (m["tile"] * m["grid"])
    conv[ours] = {"s": m["scale"] * r, "ox": m["offsetX"] * r, "oy": m["offsetY"] * r, "h": H[ours]["h"], "a": 1.0, "b": 0.0, "c": 1.0, "d": 0.0}
    # ince ayar: istemcideki "Empyrean Trace" noktalarını haritadaki aynı işaretlere oturt
    frag = [p for k, ps in G["maps"].get(m["table"], {}).items() if G["objects"].get(k, {}).get("kind") == "Fragment" for p in ps]
    marks = [(x[3], x[4]) for x in H[ours]["markers"] if x[0] == "monolithMaterial"]
    if len(frag) > 50 and len(marks) > 50:
        c = conv[ours]; P = []
        for x, y, _ in frag:
            px, py = x * c["s"] + c["ox"], c["h"] - (y * c["s"] + c["oy"])
            u, w = min(marks, key=lambda q: math.hypot(px - q[0], py - q[1]))
            if math.hypot(px - u, py - w) < 40:
                P.append((px, py, u, w))
        c["a"], c["b"] = np.linalg.lstsq(np.array([[p[0], 1] for p in P]), np.array([p[2] for p in P]), rcond=None)[0]
        c["c"], c["d"] = np.linalg.lstsq(np.array([[p[1], 1] for p in P]), np.array([p[3] for p in P]), rcond=None)[0]
        err = sorted(math.hypot(p[0] * c["a"] + c["b"] - p[2], p[1] * c["c"] + c["d"] - p[3]) for p in P)
        print(ours, "ince ayar", len(P), "nokta, ortanca hata", round(err[len(err) // 2], 1), "px")


def to_map(ours, x, y):
    c = conv[ours]
    px, py = x * c["s"] + c["ox"], c["h"] - (y * c["s"] + c["oy"])
    return [round(py * c["c"] + c["d"]), round(px * c["a"] + c["b"])]  # [lat, lng]


# --- toplama: malzeme adında toplama nesnesinin adı geçiyorsa (kelime olarak) o nesnenin noktaları
gobj = {k: v for k, v in G["objects"].items() if v["kind"] not in ("Fragment", "Cube")}
KIND_TR = {"Od": "Odyle (havada, kanatla)", "Ore": "Maden", "Herb": "Bitki", "Food": "Yiyecek bitkisi", "Wood": "Odun", "Cotton": "Pamuk/lif", "Gemstone": "Değerli taş"}
gather = {}
products = {str(r["p"]) for r in R}
for i, n in names.items():
    if i in products or "(Bound)" in n:  # üretilen ya da mağazadan alınan (Bound) eşyalar toplanmaz
        continue
    hits = [k for k, v in gobj.items() if re.search(r"\b" + re.escape(v["names"]["en"]) + r"\b", n, re.I)]
    if not hits:
        continue
    best = max(len(gobj[k]["names"]["en"]) for k in hits)  # en uzun eşleşme (Splendent Odyle > Odyle)
    hits = [k for k in hits if len(gobj[k]["names"]["en"]) == best]
    pts = {}
    for t, ours in TABLE2OURS.items():
        if ours not in conv:
            continue
        for k in hits:
            for x, y, _ in G["maps"].get(t, {}).get(k, []):
                pts.setdefault(ours, []).append(to_map(ours, x, y))
    gather[i] = {"node": gobj[hits[0]]["names"]["en"], "kind": KIND_TR.get(gobj[hits[0]]["kind"], gobj[hits[0]]["kind"]), "pts": pts}

# --- boss / zindan düşüşleri
MODE = {"grade1": "Normal", "grade2": "Zor", "grade3": "Kâbus", "explore": "Keşif", "conquest": "Fetih", "conquest-hard": "Fetih (zor)", "easy": "Kolay"}
drops = {}
for key, b in BL["bosses"].items():
    dung, slug = key.split("/", 1)
    bname = slug.replace("-", " ").title()
    for lo in b.get("loot", []):
        for roll in lo.get("rolls", []):
            for it in roll.get("items", []):
                i = str(it["itemId"])
                if int(i) not in ids:
                    continue
                ch = roll.get("chance", 100) * it.get("chance", 100) / 100 * roll.get("times", 1)
                drops.setdefault(i, []).append({"boss": bname, "dungeon": lo.get("dungeon", dung), "mode": MODE.get(lo.get("mode"), lo.get("mode")), "chance": round(ch, 2), "count": it.get("count")})
for v in drops.values():
    v.sort(key=lambda d: -d["chance"])
    del v[12:]

out = here / "masaustu" / "craft"
out.mkdir(exist_ok=True)
(out / "craft.json").write_text(json.dumps({"recipes": R, "names": names, "grades": grades, "gather": gather, "drops": drops,
    "kaynak": "SkeeveAN/Aion-DPS-Meter (MIT)"}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(len(R), "tarif,", len(names), "/", len(ids), "ad,", len(gather), "toplanan malzeme,", len(drops), "düşen malzeme")
