"""NCSOFT dönüştürücü testi: gerçek bir karakterin NC cevabı (nklsgod/AION-2-Character-Check fixture'ı, 2026-10-26)."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import ncsoft  # noqa: E402

FX = json.load(open(os.path.join(os.path.dirname(__file__), "nc_fixture_nkls.json"), encoding="utf-8"))


def fake_get(url, timeout=20, ttl=600):
    if "/api/character/info" in url:
        return FX["character"]
    if "/api/character/equipment/item" in url:
        import urllib.parse as up
        q = up.parse_qs(up.urlparse(url).query)
        return FX["items"][q["slotPos"][0]]
    if "/api/character/equipment" in url:
        return FX["equipment"]
    if "search" in url:
        return {"list": [{"characterId": "abc%3D", "name": "<strong>nkls</strong>", "serverId": 2306, "serverName": "Nemon", "level": 45, "race": 2}],
                "pagination": {"endPage": 1}}
    raise AssertionError(url)


def test_profile():
    ncsoft._get = fake_get
    p = ncsoft.lookup("nkls", "eu")
    assert p["ok"] and p["name"] == "nkls" and p["server"] == "Nemon" and p["classKey"] == "Cleric"
    assert p["itemLevel"] == 2540 and p["combatPower"] == 120449
    groups = {}
    for e in p["equipment"]:
        groups.setdefault(e["group"], []).append(e["slot"])
    assert groups["weapon"] == ["MainHand", "SubHand"]
    assert len(groups["armor"]) == 7 and len(groups["arcana"]) == 5 and "Amulet" in groups["acc"]
    assert len(p["actives"]) == 12 and len(p["passives"]) == 10
    assert any(s["equipped"] for s in p["stigmas"]) and p["stigmas"][0]["equipped"]
    assert "Justice [Nezekan]" in p["deity"] and p["primary"]["Constitution"] == 64
    assert p["daevanion"]["nezekan"] == {"open": 58, "total": 88} and p["wing"]["name"] == "Forest Spirit Wings"
    it = ncsoft.item_lines("eu", 2306, "abc=", 1, 12, 1)
    assert it["name"] == "Enraged Kromede Warhammer" and len(it["stones"]) == 4 and it["main"][0]["name"] == "Attack"
