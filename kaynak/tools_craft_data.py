"""Zanaat verisini hazırlar: tarifler + eşya adları.
Kaynak: SkeeveAN/Aion-DPS-Meter (MIT lisansı) - Client/assets/aion2/craft/recipes.json ve Backend/src/data/aion2/item_info.json
Kullanım: python kaynak/tools_craft_data.py <Aion-DPS-Meter klasörü>"""
import json, sys, pathlib
src = pathlib.Path(sys.argv[1])
R = json.loads((src / "Client/assets/aion2/craft/recipes.json").read_text(encoding="utf-8"))
I = json.loads((src / "Backend/src/data/aion2/item_info.json").read_text(encoding="utf-8"))
ids = {r["p"] for r in R["recipes"]} | {x[0] for r in R["recipes"] for x in r["k"]} | {a[0] for r in R["recipes"] for x in r["k"] if len(x) > 2 for a in x[2]}
names = {str(i): I[str(i)][0] for i in ids if str(i) in I}
grades = {str(i): I[str(i)][2] for i in ids if str(i) in I and len(I[str(i)]) > 2}
out = pathlib.Path(__file__).parent / "masaustu" / "craft"
out.mkdir(exist_ok=True)
(out / "craft.json").write_text(json.dumps({"v": R.get("v"), "recipes": R["recipes"], "names": names, "grades": grades,
    "kaynak": "SkeeveAN/Aion-DPS-Meter (MIT)"}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(len(R["recipes"]), "tarif,", len(names), "/", len(ids), "ad")
