"""DPS çözücü testleri. Bayt dizileri gerçek EU yakalamalarından (cyberbadger6969/aion2-dps-meter testleri,
oyun içi Damage Analyzer ile karşılaştırılmış). Çalıştır: python -m pytest kaynak/masaustu/tests"""
import os
import struct
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dps import protocol as P  # noqa: E402
from dps.tracker import GameData, Tracker  # noqa: E402

DATA = GameData([os.path.join(os.path.dirname(__file__), "..", "dps", "data")])


def parse(op, hexs, data=None):
    ev = []
    p = P.PacketParser(ev.append, data)
    p.t = 1000
    p.handle(op, bytes.fromhex(hexs.replace(" ", "")))
    return ev


DMG = [
    ("b1ea013600f30a40c0f4007a038000010b199b5f01000000ac52a40d021818", 30001, 1395, 1700, 3, True),
    ("b1ea013400f30ae0b7f800cd028bd3276101000000ac52d330010159", 30001, 1395, 6227, 2, False),
    ("fe9e0224009e9b01c3f8f5000302792b156002000000ac52e10301060200", 36734, 19870, 481, 2, False),
    ("fe9e0224009e9b01c18601001702a7a2980001000000ac52e401030303030100", 36734, 19870, 228, 4, False),
    ("fe9e0204009e9b01c3f8f5000302792b156003000000ac52b7030300", 36734, 19870, 439, 1, False),
    ("b1ea011600f30a40c0f40063028000010b199b5f01000000ac52d007", 30001, 1395, 976, 1, False),
]


def test_damage_records():
    for hx, tgt, act, dmg, hits, crit in DMG:
        ev = parse(P.OPCODES["damage"], hx)
        assert len(ev) == 1, hx
        k, t, a, tg, skill, amount, flags, h = ev[0]
        assert (k, a, tg, amount, h, bool(flags & P.CRIT)) == ("dmg", act, tgt, dmg, hits, crit), (hx, ev)


def test_layout6_back_and_skill():
    ev = parse(P.OPCODES["damage"], "b1ea011600f30a40c0f40063028000010b199b5f01000000ac52d007")
    assert ev[0][6] & P.BACK and not ev[0][6] & P.PERFECT
    assert ev[0][4] == 16040000


def test_self_record():
    ev = parse(P.OPCODES["self"], "ed745e91c12837064e696d61726118051e000000011c0000007f0100007f0100001c000000d002040000000000")
    assert ev == [("self", 1000, 14957, "Nimara", 1304, "cleric", 28, 0)]


def test_self_combat_power():
    b = bytes([0xF8, 0x6A, 0, 0, 0, 0, 0x01, 7]) + b"Sylvaen" + bytes([0x01, 0x09, 24, 0, 0, 0, 0, 45, 0, 0, 0])
    b += bytes(60) + struct.pack("<QQ", 59072, 59072) + bytes(32)
    ev = parse(P.OPCODES["self"], b.hex())
    assert ev[0][3:] == ("Sylvaen", 2305, "spiritmaster", 45, 59072)


def roster(members, vacant=0):
    b = bytearray([1, 2, 3, 4, 5]) + b"Raids" + bytes([5]) + struct.pack("<I", 600091) + bytes(2)
    b += struct.pack("<Q", (2305 << 48) | 1) + bytes(3) + bytes([len(members) + vacant])
    for i, (name, srv, cls, lv, gear, cp, flags, tail) in enumerate(members):
        nb = name.encode()
        b += bytes([0x2C, i + 1]) + struct.pack("<Q", (srv << 48) | (1000 + i)) + bytes([len(nb)]) + nb
        b += struct.pack("<III", cls, lv, gear) + bytes(flags) + struct.pack("<HH", srv, srv) + bytes([0])
        b += struct.pack("<Q", cp) + bytes(tail)
    return bytes(b)


def test_party_roster():
    body = roster([("Sylvaen", 2305, 24, 45, 2859, 59072, [1], [0, 0, 0]),
                   ("Borgrim", 2305, 6, 45, 3012, 61234, [0, 1], [1, 5, 16, 0, 0, 0, 0, 0]),
                   ("Квилл", 1102, 36, 44, 2650, 38900, [1], [0, 0, 0])], vacant=3)
    ev = parse(P.OPCODES["roster"], body.hex())
    assert len(ev) == 1
    m = ev[0][2]
    assert [(x["name"], x["server"], x["level"], x["gear"], x["cp"], x["cls"]) for x in m] == [
        ("Sylvaen", 2305, 45, 2859, 59072, "spiritmaster"), ("Borgrim", 2305, 45, 3012, 61234, "gladiator"),
        ("Квилл", 1102, 44, 2650, 38900, "chanter")]
    assert parse(P.OPCODES["roster"], "0102030 4c8090909".replace(" ", "")) == []


def test_dot_split():
    sk = struct.pack("<I", 1_604_000_000).hex()
    rec = lambda e: "b1ea01" + f"{e:02x}" + "f30a00" + sk + "f403"
    assert parse(P.OPCODES["dot"], rec(2))[0][0] == "dmg"
    assert parse(P.OPCODES["dot"], rec(0x0B))[0][0] == "heal"
    assert parse(P.OPCODES["dot"], rec(8)) == []
    d = parse(P.OPCODES["dot"], rec(0x0A))[0]
    assert d[5] == 500 and d[4] == 16040000 and d[6] & P.DOT


def test_map_and_spawn():
    ev = parse(P.OPCODES["map"], "01000000d52709003b1a350000000000f7e646460d7fb0c6")
    assert ev[0][:3] == ("zone", 1000, 600021)
    ev = parse(P.OPCODES["spawn"], "d1ca021f0000cf902c0040025ec7ea47f11ed1c70048a546a263c741b911019d549d54d20f0000d20f0000"
                                   "0000000000000000000000000000c8f401006400000000f049020001000000")
    assert ev[0][0] == "summon" and ev[0][2] == 42321 and ev[0][3] == 0


# ---------------------------------------------------------------- çerçeveleme
def vint(v):
    out = bytearray()
    while True:
        c = v & 0x7F
        v >>= 7
        out.append(c | (0x80 if v else 0))
        if not v:
            return bytes(out)


def frame(payload):
    return vint(len(payload) + 4) + payload


def packet(op, body):
    return frame(bytes([op >> 8, op & 0xFF]) + body)


HB = packet(0x0036, bytes(8))


def lz4_literal_only(data):
    """Sadece literal içeren geçerli LZ4 bloğu (test için)."""
    n = len(data)
    out = bytearray()
    if n < 15:
        out.append(n << 4)
    else:
        out.append(0xF0)
        r = n - 15
        while r >= 255:
            out.append(255)
            r -= 255
        out.append(r)
    return bytes(out) + data


def test_heartbeat_and_split():
    assert HB[:3] == b"\x0e\x00\x36" and len(HB) == 11
    seen = []
    d = P.FrameDecoder(lambda op, b: seen.append((op, len(b))))
    big = packet(0x1234, bytes(300))
    s = HB + b"\x00\x00" + big + HB
    d.feed(s[:7]); d.feed(s[7:107]); d.feed(s[107:])
    assert seen == [(0x0036, 8), (0x1234, 300), (0x0036, 8)]


def test_lz4_bundle_and_match():
    inner = packet(0x4136, bytes(20)) + packet(0x0438, bytes(40))
    bundle = frame(b"\xff\xff" + struct.pack("<I", len(inner)) + lz4_literal_only(inner))
    seen = []
    d = P.FrameDecoder(lambda op, b: seen.append(op))
    d.feed(HB + bundle + HB)
    assert seen == [0x0036, 0x4136, 0x0438, 0x0036]
    # eşleşmeli blok: "abcabcabcabc" = literal "abc" + (off 3, uzunluk 9)
    blk = bytes([0x35]) + b"abc" + bytes([3, 0])
    assert P.lz4_block(blk, 12) == b"abcabcabcabc"


def test_resync_after_gap():
    seen = []
    d = P.FrameDecoder(lambda op, b: seen.append(op))
    dmg = packet(0x0438, bytes(30))
    d.feed(dmg[:10]); d.reset(); d.feed(dmg[15:] + HB + packet(0x4136, bytes(5)))
    assert seen == [0x0036, 0x4136]


def test_reassembler_out_of_order():
    got = bytearray()
    r = P.TcpReassembler(got.extend, lambda: None)
    r.start(100)
    r.push(105, b"FGHIJ", 0)
    r.push(100, b"ABCDE", 0)
    r.push(103, b"DEFG", 0)  # yinelenen
    assert bytes(got) == b"ABCDEFGHIJ"


# ---------------------------------------------------------------- takip
def test_tracker_party_and_skills():
    t = Tracker(DATA)
    t.process(("self", 0, 100, "Sylvaen", 2305, "spiritmaster", 45, 59072))
    t.process(("player", 0, 101, "Borgrim", 2305, "gladiator"))
    t.process(("player", 0, 102, "Yabanci", 2305, "ranger"))
    t.process(("roster", 0, [{"name": "Sylvaen", "server": 2305, "level": 45, "gear": 2859, "cp": 59500, "cls": "spiritmaster"},
                             {"name": "Borgrim", "server": 2305, "level": 45, "gear": 3012, "cp": 61234, "cls": "gladiator"}]))
    t.process(("npc", 0, 500, 2000002, 10_000_000))
    t.process(("dmg", 1000, 100, 500, 16040000, 1000, P.CRIT, 1))
    t.process(("dmg", 2000, 100, 500, 16040000, 3000, 0, 1))
    t.process(("dmg", 2000, 101, 500, 11020000, 1500, 0, 1))
    t.process(("dmg", 2500, 102, 500, 14020000, 9999, 0, 1))
    t.process(("summon", 2500, 900, 100, None, 0))
    t.process(("dmg", 3000, 900, 500, 16110000, 500, 0, 1))  # pet hasarı sahibine
    s = t.snapshot(party_only=True)
    m = {x["name"]: x for x in s["fight"]["members"]}
    assert {"Sylvaen", "Borgrim"} <= set(m)  # 6 kişiye kadar dövüşte herkes gösterilir
    assert m["Sylvaen"]["dmg"] == 4500 and m["Sylvaen"]["self"] and m["Sylvaen"]["gear"] == 2859
    assert m["Sylvaen"]["skills"][0]["dmg"] == 4000 and m["Sylvaen"]["skills"][0]["crit"] == 50.0
    assert m["Sylvaen"]["skills"][0]["icon"].endswith(".png")
    assert s["fight"]["hidden"] == 1
    allp = t.snapshot(party_only=False)
    assert len(allp["fight"]["members"]) == 3
    t.tick(20_000)
    s = t.snapshot()
    assert not s["fight"]["active"] and len(s["history"]) == 1


def test_tracker_mob_hitting_player_is_not_dps():
    t = Tracker(DATA)
    t.process(("self", 0, 100, "Ben", 2305, "templar", 45, 0))
    t.process(("npc", 0, 500, 2000002, 100000))
    t.process(("dmg", 1000, 500, 100, 1234567, 800, 0, 1))
    assert t.snapshot()["fight"] is None
    t.process(("dmg", 1100, 100, 500, 12010000, 300, 0, 1))
    t.process(("dmg", 1200, 500, 100, 1234567, 800, 0, 1))
    f = t.snapshot()["fight"]
    assert f["members"][0]["dmg"] == 300 and f["members"][0]["taken"] == 800


def test_party_filter_without_roster_shows_everyone():
    t = Tracker(DATA)
    t.process(("self", 0, 100, "Ben", 2305, "templar", 45, 0))
    t.process(("npc", 0, 500, 2000002, 10_000_000))
    t.process(("dmg", 1000, 100, 500, 12010000, 1000, 0, 1))
    t.process(("dmg", 1000, 777, 500, 11020000, 2000, 0, 1))  # adı bilinmeyen parti üyesi
    names = {m["name"] for m in t.snapshot(party_only=True)["fight"]["members"]}
    assert names == {"Ben", "#777"}  # parti yokken herkes görünür


def test_overlay_keeps_last_boss_fight():
    t = Tracker(DATA)
    t.process(("self", 0, 100, "Ben", 2305, "templar", 45, 0))
    t.process(("npc", 0, 500, 2000412, 10_000_000))
    t.process(("dmg", 1000, 100, 500, 12010000, 5000, 0, 1))
    t.process(("death", 2000, 500))
    t.process(("npc", 0, 600, 0, 1000))
    t.process(("dmg", 3000, 100, 600, 12010000, 10, 0, 1))
    assert t.overlay_rows()["members"][0]["dmg"] == 5000


def test_all_modules_compile():
    """Exe'ye giren her dosya derlenebilmeli (bir girinti hatası uygulamayı hiç açılmaz yapar)."""
    import glob
    import py_compile
    base = os.path.join(os.path.dirname(__file__), "..")
    for f in glob.glob(os.path.join(base, "*.py")) + glob.glob(os.path.join(base, "dps", "*.py")):
        py_compile.compile(f, doraise=True)


def test_partial_roster_does_not_hide_party():
    t = Tracker(DATA)
    t.process(("self", 0, 100, "Miralay", 2305, "cleric", 45, 0))
    t.process(("player", 0, 101, "Arzbaby", 2305, "sorcerer"))
    t.process(("player", 0, 102, "Liisara", 2305, "ranger"))
    t.process(("roster", 0, [{"name": "Arzbaby", "server": 2305, "level": 45, "gear": 2015, "cp": 0, "cls": "sorcerer"}]))
    t.process(("npc", 0, 500, 0, 1000))
    for a in (100, 101, 102):
        t.process(("dmg", 1000, a, 500, 15010000, 1000, 0, 1))
    assert {m["name"] for m in t.snapshot(party_only=True)["fight"]["members"]} == {"Miralay", "Arzbaby", "Liisara"}


def test_kesif_fit_recovers_transform(tmp_path):
    from dps import kesif as K
    marks = [(1000 + 137 * i % 3000, 2000 + 311 * i % 2500) for i in range(40)]
    s, ox, oy = 16.0, 500.0, 300.0
    tps = [[1, (mx - ox) * s, (my - oy) * s] for mx, my in [marks[3], marks[17], marks[29], marks[35]]]
    tf = K._fit(tps, marks)
    assert tf and abs(tf[0] - s) < 0.3
    x, y = K.apply(tf, *[(marks[5][0] - ox) * s, (marks[5][1] - oy) * s])
    assert abs(x - marks[5][0]) < 10 and abs(y - marks[5][1]) < 10
    k = K.Kesif(str(tmp_path))
    k.process(("obj", 0, 7, 1500004, 100.0, 200.0, 5.0))
    k.process(("gather", 0, 7))
    d = k.data([])
    assert d["types"][0]["code"] == 1500004 and d["types"][0]["got"] == 1
