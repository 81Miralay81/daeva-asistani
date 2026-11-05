"""DPS ölçerin yetenek / NPC / zindan tablolarını açık kaynak A2Tools-DPS-Meter (GPL-3.0) deposundan yeniler.

GitHub Actions (.github/workflows/dps_data.yml) her gün çalıştırır; tablolar değişirse
kaynak/masaustu/dps/data/ güncellenir ve meta/dps_kaynak.json sürümü artar. Uygulama açılışta bu sürümü
görünce kullanıcıya "Yeni DPS kaynağı var" diye sorar.

Kullanım:  python tools/dps_data.py              (internetten)
           python tools/dps_data.py <yerel_klon>  (A2Tools klonundan)
"""
import datetime
import json
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "kaynak", "masaustu", "dps", "data")
MANIFEST = os.path.join(ROOT, "meta", "dps_kaynak.json")
UP = "https://raw.githubusercontent.com/taengu/A2Tools-DPS-Meter/main/src/data/"
RAW = "https://raw.githubusercontent.com/81Miralay81/daeva-asistani/main/kaynak/masaustu/dps/data/"

FILES = {  # hedef: kaynak
    "skills.json": "i18n/skills/en.json",
    "npcs.json": "i18n/npcs/en.json",
    "maps.json": "i18n/dungeons/en.json",
    "dot_skill_ids.json": "dot_skill_ids.json",
    "skill_icons.json": "skill_icons.json",
    "servers.json": "servers.json",
}


def fetch(src, rel):
    if src:
        with open(os.path.join(src, "src", "data", rel), encoding="utf-8") as f:
            return json.load(f)
    req = urllib.request.Request(UP + rel, headers={"User-Agent": "daeva-asistani-dps-data"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else ""
    os.makedirs(OUT, exist_ok=True)
    changed = []
    for dst, rel in FILES.items():
        try:
            j = fetch(src, rel)
        except Exception as e:  # bir dosya okunamazsa eskisi kalır
            print(f"! {rel}: {e}")
            continue
        if dst == "servers.json" and isinstance(j, dict) and "servers" in j:
            j = {k: (v.get("en") if isinstance(v, dict) else v) for k, v in j["servers"].items()}
        if isinstance(j, dict):
            j = {k: v for k, v in j.items() if not k.startswith("_")}
        if not j:
            print(f"! {rel}: boş, atlandı")
            continue
        text = json.dumps(j, ensure_ascii=False, separators=(",", ":"), sort_keys=isinstance(j, dict))
        path = os.path.join(OUT, dst)
        old = open(path, encoding="utf-8").read() if os.path.exists(path) else ""
        if old != text:
            with open(path, "w", encoding="utf-8") as f:
                f.write(text)
            changed.append(dst)
    try:
        man = json.load(open(MANIFEST, encoding="utf-8"))
    except (OSError, ValueError):
        man = {}
    if changed or not man:
        today = datetime.date.today().isoformat()
        prev = str(man.get("version", ""))
        n = int(prev.rsplit(".", 1)[1]) + 1 if prev.startswith(today) and "." in prev[len(today):] else 1
        man["version"] = f"{today}.{n}"
        man["notes"] = "Yetenek/NPC tabloları yenilendi: " + ", ".join(changed) if changed else "İlk sürüm"
    man["files"] = {k: RAW + k for k in sorted(os.listdir(OUT)) if k.endswith(".json") and k != "dps_kaynak.json"}
    man.setdefault("opcodes", {})
    man.setdefault("heartbeats", [])
    for path in (MANIFEST, os.path.join(OUT, "dps_kaynak.json")):  # exe'ye gömülen kopya = yerel sürüm
        with open(path, "w", encoding="utf-8") as f:
            json.dump(man, f, ensure_ascii=False, indent=2)
    print("değişen:", changed or "yok", "| sürüm", man["version"])


if __name__ == "__main__":
    main()
