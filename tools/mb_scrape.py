"""MetaBot.gg top oyuncu dizilimlerini çeker -> meta/mb_meta.json
Her sınıf için Endgame PvE ve PvP kartları (yetenek seviyeleri, stigmalar, rotasyon)
ve en çok kullanılan Daevanion dizilimi hash'i. Veri bozuk gelirse eski dosyaya dokunmaz."""
import json, re, sys, time, datetime, pathlib, urllib.request
from bs4 import BeautifulSoup

CLASSES = ["templar", "gladiator", "assassin", "ranger", "sorcerer", "spiritmaster", "cleric", "chanter"]
KEY = {"Endgame PvE": "pve", "PvP": "pvp"}
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 DaevaAsistani-meta (personal, non-commercial)"
OUT = pathlib.Path(__file__).resolve().parent.parent / "meta" / "mb_meta.json"


def get(url):
    for k in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en"})
            return urllib.request.urlopen(req, timeout=30).read().decode("utf-8")
        except Exception as e:
            print("  tekrar", k + 1, e, file=sys.stderr); time.sleep(5)
    raise RuntimeError("indirilemedi: " + url)


def num(t):
    m = re.search(r"\d+", t or ""); return int(m.group()) if m else 0


def parse(html):
    soup, out = BeautifulSoup(html, "html.parser"), {}
    for card in soup.select('article[class*="_card"]'):
        h = card.find("h3")
        if not h or h.get_text(strip=True) not in KEY: continue
        b, cur = {"sk": [], "st": [], "rot": []}, None
        for el in card.select("p, ul, ol"):
            if el.name == "p" and "_label" in " ".join(el.get("class", [])):
                cur = el.get_text(strip=True).lower(); continue
            if el.name in ("ul", "ol") and cur:
                for li in el.find_all("li", recursive=False):
                    nm_el, a = li.select_one('[class*="nameText"]'), li.find("a")
                    nm = nm_el.get_text(strip=True) if nm_el else (a.get("title", "") if a else "")
                    lv_el = li.select_one('[class*="_lv"]') or li.select_one('[class*="slotMeta"] span')
                    bo_el = li.select_one('[class*="_bonus"]')
                    lv, bo = num(lv_el.get_text() if lv_el else ""), num(bo_el.get_text() if bo_el else "")
                    if "skills" in cur: b["sk"].append([nm, lv, bo])
                    elif "stigma" in cur: b["st"].append([nm, lv])
                    elif "rotation" in cur: b["rot"].append(nm)
                cur = None
        out[KEY[h.get_text(strip=True)]] = b
    a = next((a for a in soup.find_all("a") if re.search(r"Open the most common", a.get_text(), re.I)), None)
    out["dv"] = (a.get("href", "").split("#", 1) + [""])[1] if a else ""
    return out


def ok(d):
    return all(d.get(k) and len(d[k]["sk"]) >= 5 and len(d[k]["st"]) >= 3 and d[k]["rot"] and all(x[0] for x in d[k]["sk"]) for k in ("pve", "pvp")) and re.match(r"^\d+-[0-9a-z.]+", d.get("dv", ""))


def main():
    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {"cls": {}}
    res, bad = {}, []
    for c in CLASSES:
        try:
            d = parse(get(f"https://metabot.gg/en/aion-2/classes/{c}/build"))
            if ok(d): res[c] = d; print(c, "tamam", len(d["pve"]["sk"]), len(d["pvp"]["sk"]))
            else: bad.append(c); print(c, "BOZUK veri, eskisi kalır", file=sys.stderr)
        except Exception as e:
            bad.append(c); print(c, "HATA", e, file=sys.stderr)
        time.sleep(2)
    if not res: sys.exit("hiç veri alınamadı")
    cls = dict(old.get("cls", {})); cls.update(res)
    if cls == old.get("cls"): print("değişiklik yok")
    else:
        OUT.parent.mkdir(exist_ok=True)
        OUT.write_text(json.dumps({"date": datetime.date.today().isoformat(), "src": "metabot.gg", "cls": cls}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print("güncellendi", sorted(res))
    if bad: sys.exit("okunamayan sınıflar (eski veri korundu): " + ", ".join(bad))


if __name__ == "__main__":
    main()
