"""Aion 2 ağ protokolü: TCP akışından oyun paketlerine, paketlerden savaş olaylarına.

Bu dosya cyberbadger6969/aion2-dps-meter (GPL-3.0) projesinin C# çözücüsünün Python'a aktarılmış hâlidir;
paket düzenleri o projenin ve A2Tools-DPS-Meter'in (GPL-3.0) belgelediği gibidir. Bkz. dps/NOTICE.md.
Oyunun belleğine dokunmaz, oyuna hiçbir şey göndermez: sadece bilgisayara gelen trafiği okur.

    çerçeve = varint uzunluk, [0xF0..0xFE], yük            (çerçeve boyu = uzunluk + varint baytları − 4)
    yük     = opcode(2) gövde | FF FF u32 hamBoy lz4-blok  (blok içinde başka çerçeveler olur)
"""
import struct

# ---------------------------------------------------------------- olay türleri ve bayraklar
CRIT, PARRY, PERFECT, DOUBLE, HEAVY, BACK, FRONT, DOT, MULTI = 1, 2, 4, 8, 16, 32, 64, 128, 256

# Opcode'lar kablodaki iki bayt (ilk bayt << 8 | ikinci bayt). Haziran 2026 sonrası istemci (Global).
# Kaynak güncellemesiyle (dps_kaynak.json) değiştirilebilir.
OPCODES = {
    "heartbeat": 0x0036, "self": 0x3336, "player": 0x4536, "player_old": 0x4436, "spawn": 0x4136,
    "death": 0x4236, "map": 0x2136, "pos": 0x2336, "cast": 0x0238, "hit": 0x0338, "damage": 0x0438, "dot": 0x0538,
    "remain_hp": 0x008D, "fieldboss": 0x0191, "kill": 0x048D, "hpmp": 0x1B92, "roster": 0x0297,
}
HEARTBEATS = [b"\x0e\x00\x36", b"\x06\x00\x36"]


def apply_overrides(cfg):
    """dps_kaynak.json içindeki "opcodes" / "heartbeats" alanlarıyla tabloları günceller."""
    global HEARTBEATS
    for k, v in (cfg.get("opcodes") or {}).items():
        try:
            OPCODES[k] = int(v, 16) if isinstance(v, str) else int(v)
        except (TypeError, ValueError):
            pass
    hb = cfg.get("heartbeats")
    if hb:
        try:
            HEARTBEATS = [bytes.fromhex(h) for h in hb]
        except ValueError:
            pass


# ---------------------------------------------------------------- ilkel okuyucular
def varint(b, o):
    """LEB128, en fazla 5 bayt. (değer, yeni_ofset) ya da (None, o)."""
    v = 0
    shift = 0
    n = len(b)
    i = o
    while i < n and i - o < 5:
        c = b[i]
        v |= (c & 0x7F) << shift
        i += 1
        if not c & 0x80:
            return v & 0xFFFFFFFF, i
        shift += 7
    return None, o


def u16(b, o):
    return b[o] | b[o + 1] << 8


def u32(b, o):
    return b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24


def u64(b, o):
    return struct.unpack_from("<Q", b, o)[0]


def is_entity(i):
    return i is not None and 1 <= i <= 9_999_999


def name_field(field):
    """1–36 bayt geçerli UTF-8, sadece harf/rakam, en az bir harf, en fazla 16 karakter."""
    if not 1 <= len(field) <= 36:
        return None
    try:
        s = bytes(field).decode("utf-8")
    except UnicodeDecodeError:
        return None
    if len(s) > 16 or not s.isalnum() or not any(ch.isalpha() for ch in s):
        return None
    return s


def is_text(field):
    try:
        s = bytes(field).decode("utf-8")
    except UnicodeDecodeError:
        return False
    return not any(ord(ch) < 32 or 127 <= ord(ch) < 160 for ch in s)


def lz4_block(src, size):
    """Saf Python LZ4 blok çözücü. Hatalı veride None."""
    dst = bytearray()
    i, n = 0, len(src)
    try:
        while i < n:
            tok = src[i]
            i += 1
            lit = tok >> 4
            if lit == 15:
                while True:
                    c = src[i]
                    i += 1
                    lit += c
                    if c != 255:
                        break
            dst += src[i:i + lit]
            i += lit
            if i >= n or len(dst) >= size:
                break
            off = src[i] | src[i + 1] << 8
            i += 2
            ml = tok & 15
            if ml == 15:
                while True:
                    c = src[i]
                    i += 1
                    ml += c
                    if c != 255:
                        break
            ml += 4
            start = len(dst) - off
            if off == 0 or start < 0:
                return None
            if off >= ml:
                dst += dst[start:start + ml]
            else:
                for k in range(ml):
                    dst.append(dst[start + k])
            if len(dst) > size:
                return None
    except IndexError:
        return None
    return bytes(dst[:size])


# ---------------------------------------------------------------- çerçeve çözücü
MAX_FRAME = 65_535
MAX_UNBUNDLED_WAIT = 16_384
MAX_BUNDLE = 8 * 1024 * 1024
MAX_HUNT = 256 * 1024


class FrameDecoder:
    """Sunucu→istemci bayt akışını oyun paketlerine böler. Kayıp veriden sonra kalp atışı çerçevesini
    (0E 00 36, saniyede ~19) arar; uydurma uzunluklarla hayalet hasar üretmez."""

    def __init__(self, on_packet, aligned=True):
        self.on_packet = on_packet
        self.buf = bytearray()
        self.hunting = not aligned
        self.hunted = 0
        self.frames = self.bundles = self.bad = self.resyncs = 0

    def reset(self):
        self.buf = bytearray()
        self.hunting = True
        self.hunted = 0

    def feed(self, data):
        if not data:
            return
        self.buf += data
        self._drain()

    def _find_hb(self, b, start):
        best = -1
        for sig in HEARTBEATS:
            i = b.find(sig, start)
            if i >= 0 and (best < 0 or i < best):
                best = i
        return best

    def _resync(self):
        self.resyncs += 1
        if self.hunted <= MAX_HUNT:
            self.hunting = True
            self.hunted = 0
        return 1

    def _drain(self):
        b = self.buf
        pos = 0
        n = len(b)
        while pos < n:
            if self.hunting:
                hb = self._find_hb(b, pos)
                if hb < 0:
                    keep = min(n - pos, 2)
                    skip = n - pos - keep
                    pos += skip
                    self.hunted += skip
                    if self.hunted > MAX_HUNT:
                        self.hunting = False
                    break
                pos = hb
                self.hunting = False
                continue
            if b[pos] == 0:
                pos += 1
                continue
            ln, o2 = varint(b, pos)
            if ln is None:
                if n - pos < 5:
                    break
                pos += self._resync()
                continue
            vlen = o2 - pos
            size = ln + vlen - 4
            if ln < 6 or size > MAX_FRAME:
                pos += self._resync()
                continue
            if size > n - pos:
                if size > MAX_UNBUNDLED_WAIT and not self._is_bundle(b, pos, vlen):
                    pos += self._resync()
                    continue
                break
            self._frame(b[pos:pos + size], vlen, 0)
            pos += size
        if pos:
            del b[:pos]

    @staticmethod
    def _is_bundle(b, pos, vlen):
        o = pos + vlen
        if o < len(b) and 0xF0 <= b[o] <= 0xFE:
            o += 1
        return o + 1 < len(b) and b[o] == 0xFF and b[o + 1] == 0xFF

    def _frame(self, f, vlen, depth):
        self.frames += 1
        o = vlen
        if o < len(f) and 0xF0 <= f[o] <= 0xFE:
            o += 1
        if o + 2 > len(f):
            return
        if f[o] == 0xFF and f[o + 1] == 0xFF:
            self.bundles += 1
            o += 2
            if o + 4 > len(f) or depth > 4:
                self.bad += 1
                return
            raw = u32(f, o)
            o += 4
            if raw == 0 or raw > MAX_BUNDLE:
                self.bad += 1
                return
            out = lz4_block(bytes(f[o:]), raw)
            if not out:
                self.bad += 1
                return
            self._inner(out, depth + 1)
            return
        self.on_packet(f[o] << 8 | f[o + 1], bytes(f[o + 2:]))

    def _inner(self, d, depth):
        pos, n = 0, len(d)
        while pos < n:
            if d[pos] == 0:
                pos += 1
                continue
            ln, o2 = varint(d, pos)
            if ln is None:
                return
            size = ln + (o2 - pos) - 4
            if ln < 6 or size > n - pos:
                return
            self._frame(d[pos:pos + size], o2 - pos, depth)
            pos += size


# ---------------------------------------------------------------- TCP sıralayıcı
class TcpReassembler:
    """Tek yönlü TCP akışını sıraya koyar; dolmayan boşluğu 1.5 sn sonra atlar ve haber verir."""
    MAX_PENDING = 2 * 1024 * 1024
    GAP_MS = 1500

    def __init__(self, on_data, on_gap):
        self.on_data, self.on_gap = on_data, on_gap
        self.pending = []  # (seq, data, t)
        self.pend_bytes = 0
        self.next = 0
        self.started = False
        self.gaps = 0

    def start(self, seq):
        self.next = seq & 0xFFFFFFFF
        self.started = True

    @staticmethod
    def _diff(a, b):
        d = (a - b) & 0xFFFFFFFF
        return d - 0x100000000 if d & 0x80000000 else d

    def push(self, seq, payload, t):
        if not payload:
            return
        if not self.started:
            self.start(seq)
        diff = self._diff(seq, self.next)
        if diff < 0:
            if -diff >= len(payload):
                return
            payload = payload[-diff:]
            seq = self.next
            diff = 0
        if diff == 0:
            self._deliver(payload)
            self._drain()
        else:
            if not any(p[0] == seq and len(p[1]) >= len(payload) for p in self.pending):
                self.pending.append((seq, bytes(payload), t))
                self.pend_bytes += len(payload)
        while self.pending and (self.pend_bytes > self.MAX_PENDING or t - min(p[2] for p in self.pending) > self.GAP_MS):
            best = min(self.pending, key=lambda p: self._diff(p[0], self.pending[0][0]))
            self.next = best[0]
            self.gaps += 1
            self.on_gap()
            self._drain()

    def _drain(self):
        progressed = True
        while progressed:
            progressed = False
            for i, (seq, data, _) in enumerate(self.pending):
                d = self._diff(seq, self.next)
                if d > 0:
                    continue
                self.pending.pop(i)
                self.pend_bytes -= len(data)
                if -d < len(data):
                    self._deliver(data[-d:] if d else data)
                progressed = True
                break

    def _deliver(self, data):
        self.next = (self.next + len(data)) & 0xFFFFFFFF
        self.on_data(data)


# ---------------------------------------------------------------- paket çözücü
def _class_from_wire(v):
    for lo, c in ((5, "gladiator"), (9, "templar"), (13, "ranger"), (17, "assassin"), (21, "spiritmaster"),
                  (25, "sorcerer"), (29, "cleric"), (33, "chanter"), (45, "brawler")):
        if lo <= v <= lo + 3:
            return c
    return ""


CLASS_BY_SKILL = {11: "gladiator", 12: "templar", 13: "assassin", 14: "ranger", 15: "sorcerer",
                  16: "spiritmaster", 17: "cleric", 18: "chanter", 19: "brawler"}


def is_class_skill(c):
    return 10_000_000 <= c <= 19_999_999


def base_skill(c):
    return c - c % 10_000 if is_class_skill(c) else c


def class_from_skill(c):
    if not is_class_skill(c) or c // 10_000 % 100 == 0:
        return ""
    return CLASS_BY_SKILL.get(c // 1_000_000, "")


_BLOCKS = {4: (8,), 5: (11, 12), 6: (11, 10), 7: (11, 14)}
_SPIRIT_ANCHOR = bytes([0x80, 0x75, 0xD5, 0x2A, 0xBB, 0x03, 0x00, 0x00])


class PacketParser:
    """Oyun paketlerini olaylara çevirir. Her okuyucu sıkı doğrular; tahmin edilmiş sayı üretmek yerine kaydı atar.

    Olaylar (tuple, ilk eleman tür):
      ("dmg", t, actor, target, skill, amount, flags, hits)   ("heal", t, actor, target, skill, amount)
      ("self", t, id, name, server, cls, level, cp)            ("player", t, id, name, server, cls)
      ("roster", t, [ {name, server, level, gear, cp, cls} ])  ("summon", t, id, owner_id, owner_name, npc)
      ("npc", t, id, code, maxhp)  ("death", t, id)  ("zone", t, map_id)  ("hp", t, id, hp, max, is_npc)
    """

    def __init__(self, sink, data=None):
        self.sink = sink
        self.data = data
        self.t = 0
        self.damage_ok = self.damage_bad = self.heartbeats = 0
        self._last_map = -1
        self._dispatch = None

    def _table(self):
        O = OPCODES
        return {
            O["heartbeat"]: self._hb, O["damage"]: self._damage, O["dot"]: self._dot,
            O["self"]: self._self, O["roster"]: self._roster, O["player"]: self._player,
            O["player_old"]: self._player, O["spawn"]: self._spawn, O["death"]: self._death,
            O["map"]: self._map, O["pos"]: self._pos, O["remain_hp"]: self._remain_hp, O["fieldboss"]: self._fieldboss, O["hpmp"]: self._hpmp, O["kill"]: self._kill,
        }

    def handle(self, op, body):
        if self._dispatch is None:
            self._dispatch = self._table()
        f = self._dispatch.get(op)
        if f:
            f(body)
        elif op not in (OPCODES["cast"], OPCODES["hit"]) and len(body) >= 16:
            self._scan_ids(body)
            self._scan_roster(body)
            self._scan_bundles(body)

    def _emit(self, *e):
        self.sink(e)

    def _hb(self, b):
        self.heartbeats += 1

    # ---- gömülü paketler
    def _scan_bundles(self, b):
        i, n = 1, len(b)
        while i + 8 < n:
            if b[i] == 0xFF and b[i + 1] == 0xFF:
                for k in (3, 2, 1):
                    at = i - k
                    if at < 0:
                        continue
                    ln, o2 = varint(b, at)
                    if ln is None or o2 - at != k:
                        continue
                    end = at + ln + k - 4
                    if ln < 12 or end > n:
                        continue
                    raw = u32(b, i + 2)
                    if raw == 0 or raw > MAX_BUNDLE:
                        continue
                    out = lz4_block(b[i + 6:end], raw)
                    if not out:
                        continue
                    self._scan_ids(out)
                    self._scan_roster(out)
                    i = end - 1
                    break
            i += 1

    def _scan_ids(self, b):
        n = len(b)
        i = b.find(b"\x36", 1)
        while 0 < i and i + 9 < n:
            op = b[i - 1]
            if op in (0x33, 0x45, 0x44):
                self._identity(b, i + 1, op == 0x33)
            i = b.find(b"\x36", i + 1)

    def _scan_roster(self, b):
        i = b.find(b"\x02\x97")
        while 0 <= i and i + 40 < len(b):
            if self._roster(b[i + 2:]):
                return
            i = b.find(b"\x02\x97", i + 1)

    # ---- hasar (04 38)
    def _damage(self, b):
        o, first = 0, True
        while o < len(b):
            if o + 1 < len(b) and b[o] == 0x01 and b[o + 1] == 0x00:
                o += 2
            elif not first:
                break
            if first:
                tgt, p = varint(b, o)
                sw = varint(b, p)[0] if tgt is not None else None
                if sw is not None and (sw & 0x0F) == 0:
                    return  # yetenek duyurusu, hasar yok
            r = self._dmg_record(b, o)
            if r is None:
                if first:
                    self.damage_bad += 1
                break
            o, clean = r
            self.damage_ok += 1
            first = False
            if not clean:
                break

    def _dmg_record(self, b, o):
        target, o = varint(b, o)
        if not is_entity(target):
            return None
        sw, o = varint(b, o)
        if sw is None:
            return None
        layout = sw & 0x0F
        if not 4 <= layout <= 7:
            return None
        x, o = varint(b, o)
        if x is None:
            return None
        actor, o = varint(b, o)
        if not is_entity(actor) or o + 5 > len(b):
            return None
        skill = u32(b, o)
        o += 4
        if 3_000_000 <= skill <= 3_099_999:
            skill = skill * 10 + 1  # Theostone
        if not 1 <= skill <= 299_999_999:
            return None
        o += 1  # vuruş uid
        dtype, o = varint(b, o)
        if dtype is None:
            return None
        flags = CRIT if dtype == 3 else 0
        if layout >= 5 and o + 2 < len(b):
            mods, d = b[o], b[o + 2]
            if mods & 0x02:
                flags |= PARRY
            if mods & 0x04:
                flags |= PERFECT
            if mods & 0x08:
                flags |= DOUBLE
            if mods & 0x20:
                flags |= HEAVY
            if d == 1:
                flags |= BACK
            elif d == 2:
                flags |= FRONT
        chosen = None
        for blen in _BLOCKS[layout]:
            v = self._values(b, o + blen, layout, dtype)
            if v is None:
                continue
            end, scalar, dmg = v
            if not 1 <= dmg <= 99_999_999:
                continue
            if scalar == 0 or 1000 <= scalar <= 200_000:
                chosen = (end, scalar, dmg)
                break
            if chosen is None:
                chosen = (end, 0, dmg)
        if chosen is None:
            return None
        o, scalar, dmg = chosen
        hits, clean = 1, False
        t = self._tail(b, o, layout, sw, dmg)
        if t is None and layout != 6:
            t = self._tail(b, o, 6, sw, dmg)
        if t is not None:
            o, extra = t
            hits += extra
            clean = True
        elif sw & 0x20:
            cnt, _ = varint(b, o)
            if cnt is not None and 1 <= cnt <= 25:
                hits += cnt
        if clean and o + 1 < len(b) and b[o] == 0x03 and b[o + 1] == 0x00:
            o += 2
            _, o2 = varint(b, o)
            o = o2
        skill = self._norm(skill)
        if actor == target:
            self._emit("heal", self.t, actor, target, skill, dmg)
        else:
            self._emit("dmg", self.t, actor, target, skill, dmg, flags | (MULTI if hits > 1 else 0), hits)
        return o, clean

    @staticmethod
    def _values(b, o, layout, dtype):
        if o >= len(b):
            return None
        v1, o = varint(b, o)
        if v1 is None:
            return None
        after1 = o
        v2, o = varint(b, o)
        if v2 is None:
            return None
        if v1 == 0:
            v1, after1 = v2, o
            v2, o = varint(b, o)
            if v2 is None:
                return None
        if layout == 6 and dtype == 3 and 1000 <= v1 <= 5_000_000 and v2 <= 25:
            return after1, 0, v1
        return o, v1, v2

    @staticmethod
    def _tail(b, o, layout, sw, dmg):
        extra = 0
        if layout == 4:
            f, o = varint(b, o)
            if f is None or not 1 <= f <= 25:
                return None
        if sw & 0x20:
            cnt, o = varint(b, o)
            if cnt is None or not 1 <= cnt <= 25:
                return None
            s = 0
            for _ in range(cnt):
                h, o = varint(b, o)
                if h is None:
                    return None
                s += h
            if s >= dmg:
                return None
            extra = cnt
        rest = len(b) - o
        if rest == 0 or (rest >= 2 and b[o + 1] == 0 and 1 <= b[o] <= 7) or (rest >= 2 and b[o] == 0x04 and b[o + 1] == 0x38):
            return o, extra
        return None

    def _norm(self, raw):
        if not is_class_skill(raw):
            return raw
        bs = base_skill(raw)
        if bs == raw or not self.data:
            return bs
        a, c = self.data.skills.get(raw), self.data.skills.get(bs)
        return raw if a and c and a != c else bs

    # ---- DoT / HoT (05 38)
    def _dot(self, b):
        target, o = varint(b, 0)
        if not is_entity(target) or o >= len(b):
            return
        eff = b[o]
        o += 1
        dmg_e, heal_e = eff in (0x02, 0x0A), eff in (0x01, 0x09, 0x0B)
        if not dmg_e and not heal_e:
            return
        actor, o = varint(b, o)
        if not is_entity(actor):
            return
        x, o = varint(b, o)
        if x is None or o + 4 > len(b):
            return
        skill = u32(b, o) // 100
        o += 4
        if not 1 <= skill <= 299_999_999:
            return
        amt, o = varint(b, o)
        if amt is None or not 1 <= amt <= 99_999_999:
            return
        if heal_e:
            self._emit("heal", self.t, actor, target, self._norm(skill), amt)
            return
        if actor == target or (self.data and not self.data.is_damage_dot(skill)):
            return
        self._emit("dmg", self.t, actor, target, self._norm(skill), amt, DOT, 1)

    # ---- kimlikler (33 36 / 45 36)
    def _self(self, b):
        self._identity(b, 0, True, self._self_cp(b))
        self._scan_bundles(b)

    def _player(self, b):
        self._identity(b, 0, False)
        self._scan_bundles(b)

    def _identity(self, b, o, is_self, cp=0):
        pid, o = varint(b, o)
        if not is_entity(pid):
            return False
        o += 4
        if o + 2 > len(b) or not b[o] & 0x01:
            return False
        ln = b[o + 1]
        o += 2
        if not 1 <= ln <= 36 or o + ln > len(b):
            return False
        field = b[o:o + ln]
        o += ln
        if len(field) > 1 and field[0] == 0x24:  # "$..." öğretici yer tutucu
            if is_self:
                self._emit("self", self.t, pid, "", 0, "", 0, 0)
            return True
        name = name_field(field)
        if not name:
            return False
        server, cls, level = 0, "", 0
        if o + 6 <= len(b):
            s, c = u16(b, o), _class_from_wire(u32(b, o + 2))
            if 1000 <= s < 3000 and c:
                server, cls = s, c
                if o + 11 <= len(b):
                    lv = u32(b, o + 7)
                    if 1 <= lv <= 99:
                        level = lv
            elif not is_self and o + 4 <= len(b):
                cls = _class_from_wire(u32(b, o))
        if is_self:
            self._emit("self", self.t, pid, name, server, cls, level, cp)
        else:
            self._emit("player", self.t, pid, name, server, cls)
        return True

    @staticmethod
    def _self_cp(b):
        n = len(b)
        for o in range(n - 16, max(0, n - 16 - 255) - 1, -1):
            if o < 0:
                break
            cur, hi = u64(b, o), u64(b, o + 8)
            if 1000 <= cur <= 10_000_000 and 1000 <= hi <= 10_000_000 and cur <= hi:
                return cur
        return 0

    # ---- parti listesi (02 97)
    def _roster(self, b):
        o = 4
        if o >= len(b):
            return False
        pnl = b[o]
        o += 1
        if pnl > 64 or o + pnl + 18 > len(b) or not is_text(b[o:o + pnl]):
            return False
        o += pnl
        if not 1 <= b[o] <= 12:
            return False
        o += 1 + 4 + 2 + 8 + 3
        cnt, o = varint(b, o)
        if cnt is None or not 1 <= cnt <= 12:
            return False
        members = []
        i = 0
        while i < cnt and o + 11 <= len(b):
            mask, slot, server, nl = b[o], b[o + 1], u16(b, o + 8), b[o + 10]
            if nl == 0:
                break
            name = name_field(b[o + 11:o + 11 + nl]) if 0 < server <= 9999 and nl <= 40 and o + 11 + nl + 12 <= len(b) else None
            if not name:
                break
            o += 11 + nl
            cls, level, gear = _class_from_wire(u32(b, o)), u32(b, o + 4), u32(b, o + 8)
            o += 12
            if not 1 <= level <= 200:
                break
            if mask & 0x01 and gear < 100 and o + 4 <= len(b) and 100 <= u32(b, o) <= 50_000:
                gear = u32(b, o)
                o += 4
            anchor = -1
            for at in range(o, min(o + 10, len(b) - 2) + 1):
                if u16(b, at) == server:
                    anchor = at
                    break
            if anchor < 0 or anchor + 13 > len(b):
                break
            power = u64(b, anchor + 5)
            if power > 10_000_000:
                break
            o = anchor + 13
            members.append({"name": name, "server": server, "level": level,
                            "gear": gear if 1 <= gear <= 50_000 else 0, "cp": power, "cls": cls})
            if i + 1 == cnt:
                break
            nxt = self._find_member(b, o, (slot + 1) & 0xFF)
            if nxt < 0:
                break
            o = nxt
            i += 1
        if not members:
            return False
        self._emit("roster", self.t, members)
        return True

    @staticmethod
    def _find_member(b, frm, slot):
        for i in range(frm, min(frm + 32, len(b) - 12) + 1):
            if b[i + 1] != slot:
                continue
            server, nl = u16(b, i + 8), b[i + 10]
            if not 0 < server <= 9999 or not 0 < nl <= 40 or i + 11 + nl > len(b):
                continue
            if name_field(b[i + 11:i + 11 + nl]):
                return i
        return -1

    # ---- doğan varlıklar (41 36)
    def _spawn(self, b):
        raw, o = varint(b, 0)
        if not raw:
            return
        eid = (raw & 0x3FFF) | 0x4000 if raw > 1_000_000 else raw
        if o + 2 > len(b):
            return
        ms = o
        mask = u32(b, o) if o + 4 <= len(b) else (b[o] | b[o + 1] << 8)
        kind = b[o]
        sname, cursor = None, ms + 5
        for sub in (4, 2):
            g = ms + sub
            if g + 2 >= len(b) or not b[g] & 0x01:
                continue
            ln = b[g + 1]
            if not 1 <= ln <= 36 or g + 2 + ln > len(b):
                continue
            nm = name_field(b[g + 2:g + 2 + ln])
            if not nm:
                continue
            sname, cursor = nm, g + 2 + ln
            break
        code, maxhp = self._npc_code(b, ms)
        summonish = kind in (0x5F, 0x1C, 0x1F, 0x1D, 0x5D)
        if kind == 0x5F and mask & 0x10:
            owner = self._parent_key(b, cursor, eid)
            if owner:
                self._emit("summon", self.t, eid, owner, None, code)
                return
        if summonish and sname:
            self._emit("summon", self.t, eid, 0, sname, code)
            return
        if kind in (0x5F, 0x1F, 0x1D, 0x5D):
            so = self._spirit_owner(b, ms)
            self._emit("summon", self.t, eid, so if so and so != eid else 0, None, code)
            return
        if kind in (0x0C, 0x0D) or (not summonish and code):
            self._emit("npc", self.t, eid, code, maxhp)

    @staticmethod
    def _npc_code(b, start):
        end = min(len(b) - 2, start + 60)
        for i in range(start, end):
            if b[i] != 0 or b[i + 1] not in (0x40, 0x00) or b[i + 2] != 0x02:
                continue
            if i < start + 3:
                return 0, 0
            code = b[i - 3] | b[i - 2] << 8 | b[i - 1] << 16
            maxhp = 0
            for h in range(i + 3, min(len(b) - 2, i + 67)):
                if b[h] != 0x01:
                    continue
                cur, o = varint(b, h + 1)
                if not cur:
                    continue
                mx, _ = varint(b, o)
                if mx is None or mx < cur:
                    continue
                maxhp = mx
                break
            return code, maxhp
        return 0, 0

    @staticmethod
    def _parent_key(b, frm, self_id):
        for i in range(max(1, frm), len(b) - 12):
            if b[i - 1] != 0x06:
                continue
            parent = u32(b, i)
            if not is_entity(parent) or parent == self_id or u16(b, i + 8) != 0:
                continue
            if not 1000 <= u16(b, i + 10) < 3000:
                continue
            ln = b[i + 12]
            if not 1 <= ln <= 48 or i + 13 + ln > len(b) or not is_text(b[i + 13:i + 13 + ln]):
                continue
            return parent
        return None

    @staticmethod
    def _spirit_owner(b, frm):
        i = b.find(_SPIRIT_ANCHOR, frm, frm + 128 + len(_SPIRIT_ANCHOR))
        if i < 0:
            return None
        v, _ = varint(b, i + len(_SPIRIT_ANCHOR))
        return v if is_entity(v) else None

    # ---- saha boss listesi (01 91): oyun içi haritada boss listesi açılınca gelir
    def _fieldboss(self, b):
        """u16 0, harita u32, adet u8, adet × {canlı u8, slot varint, [canlıysa x y z f32], [bazen u8], zaman u64 ms}"""
        if len(b) < 7:
            return
        mp, cnt, o, slots = u32(b, 2), b[6], 7, []
        for n in range(cnt):
            r = self._fb_slot(b, o, mp, n == cnt - 1)
            if r is None:
                break
            o, slot = r
            slots.append(slot)
        if slots:
            self._emit("fieldboss", self.t, mp, cnt, slots)

    @staticmethod
    def _fb_head(b, o, mp):
        if o >= len(b) or b[o] > 1:
            return None
        v, nxt = varint(b, o + 1)
        if v is None or not mp * 100 < v < mp * 100 + 100:
            return None
        return b[o] == 1, v, nxt

    def _fb_slot(self, b, o, mp, last):
        h = self._fb_head(b, o, mp)
        if h is None:
            return None
        alive, sid, at = h
        xyz = (0.0, 0.0, 0.0)
        if alive:
            if at + 12 > len(b):
                return None
            xyz = struct.unpack_from("<fff", b, at)
            at += 12
        for extra in (0, 1):
            t = at + extra
            if t + 8 > len(b):
                break
            tm = struct.unpack_from("<q", b, t)[0]
            if tm != 0 and not 1_600_000_000_000 <= tm <= 2_600_000_000_000:
                continue
            end = t + 8
            fits = (not any(b[end:]) and len(b) - end <= 8) if last else self._fb_head(b, end, mp) is not None
            if fits:
                return end, {"slot": sid, "alive": alive, "at": tm, "x": xyz[0], "y": xyz[1]}
        return None

    # ---- ölüm, can, bölge
    def _death(self, b):
        eid, o = varint(b, 0)
        if not is_entity(eid):
            return
        x, o = varint(b, o)
        flag, o = varint(b, o) if x is not None else (None, o)
        if flag in (1, 3):
            self._emit("death", self.t, eid)

    def _kill(self, b):
        eid, o = varint(b, 0)
        if not is_entity(eid) or o + 4 > len(b):
            return
        mid = u32(b, o)
        o += 4
        killer, o = varint(b, o)
        if killer is None or (mid == 0 and killer == 0):
            return
        self._emit("death", self.t, eid)

    def _remain_hp(self, b):
        eid, o = varint(b, 0)
        if not is_entity(eid):
            return
        kind, o = varint(b, o)
        if kind != 2:
            return
        for _ in range(2):
            v, o = varint(b, o)
            if v is None:
                return
        if o + 4 > len(b):
            return
        lo = u32(b, o)
        hi = u32(b, o + 4) if o + 8 <= len(b) else 0
        hp = hi << 32 | lo
        if hp <= 10_000_000_000:
            self._emit("hp", self.t, eid, hp, 0, True)

    def _hpmp(self, b):
        eid, o = varint(b, 0)
        if not is_entity(eid):
            return
        hp, o = varint(b, o)
        mx, o = varint(b, o) if hp is not None else (None, o)
        if mx and hp <= mx:
            self._emit("hp", self.t, eid, hp, mx, False)

    def _pos(self, b):
        """23 36: varlık id varint (0 = kendin, bölge yüklemesi), sonra x y z f32. Deneysel."""
        eid, o = varint(b, 0)
        if eid is None or o + 12 > len(b):
            return
        x, y, z = struct.unpack_from("<fff", b, o)
        if all(v == v and abs(v) < 1e7 for v in (x, y, z)):
            self._emit("pos", self.t, eid, x, y, z)

    def _map(self, b):
        if len(b) < 8:
            return
        mid = u32(b, 4)
        if 0 < mid <= 9_999_999:
            self._emit("zone", self.t, mid, mid == self._last_map)
            self._last_map = mid


# ---------------------------------------------------------------- akış seçici
GAME_PORT = 13328


def count_heartbeats(p):
    c = 0
    for sig in HEARTBEATS:
        i = p.find(sig)
        while i >= 0:
            end = i + 11
            if end == len(p) or (end < len(p) and p[end] != 0xFF):
                c += 1
            i = p.find(sig, i + 3)
    return c


class _Flow:
    __slots__ = ("game", "tls", "hb", "syn_next", "last", "pre", "pre_bytes", "dec", "rea")

    def __init__(self):
        self.game = self.tls = False
        self.hb = 0
        self.syn_next = None
        self.last = 0
        self.pre = []
        self.pre_bytes = 0
        self.dec = self.rea = None


class Pipeline:
    """TCP parçaları girer, olaylar çıkar. Her sunucu→istemci akışında kalp atışı aranır; yeterince görülünce
    akış oyun akışı olarak kilitlenir ve o ana kadar biriken veri baştan işlenir (bağlanırken gelen kendi
    karakter kaydı kaybolmasın)."""
    PRE_BYTES = 512 * 1024
    IDLE_MS = 120_000

    def __init__(self, sink, data=None):
        self.parser = PacketParser(sink, data)
        self.flows = {}
        self.segments = 0
        self.game_bytes = 0
        self.last_game_ms = 0
        self.gaps = 0
        self.locked_server = None
        self._prune = 0

    def on_segment(self, t, key, seq, syn, fin, payload):
        self.segments += 1
        if t - self._prune > 10_000:
            self._prune = t
            for k in [k for k, f in self.flows.items() if t - f.last > self.IDLE_MS]:
                del self.flows[k]
        f = self.flows.get(key)
        if f is None:
            if not payload and not syn:
                return
            f = self.flows[key] = _Flow()
        f.last = t
        if syn:
            f.syn_next = (seq + 1) & 0xFFFFFFFF
            return
        if fin and not payload:
            if not f.game:
                self.flows.pop(key, None)
            return
        if not payload or f.tls:
            return
        if not f.game:
            if not f.pre and len(payload) >= 5 and 0x14 <= payload[0] <= 0x17 and payload[1] == 3 and payload[2] <= 4:
                f.tls = True
                return
            f.hb += count_heartbeats(payload)
            f.pre.append((seq, bytes(payload), t))
            f.pre_bytes += len(payload)
            while f.pre_bytes > self.PRE_BYTES and len(f.pre) > 1:
                f.pre_bytes -= len(f.pre.pop(0)[1])
                f.syn_next = None
            need = 3 if key[1] == GAME_PORT else 6
            if f.hb < need:
                return
            # Aynı oyun akışı iki karttan (ör. ping hızlandırıcı + gerçek kart) görünürse hasar iki kez sayılmasın:
            # başka bir akış hâlâ canlıyken yenisini kilitleme; o susunca (yükleme ekranı) yenisine geçilir.
            if any(o.game and o is not f for o in self.flows.values()) and t - self.last_game_ms < 3000:
                return
            self._lock(key, f)
            return
        self._feed(f, seq, payload, t)

    def _lock(self, key, f):
        f.game = True
        first = f.pre[0]
        f.dec = FrameDecoder(self.parser.handle, f.syn_next is not None and f.syn_next == first[0])
        dec = f.dec

        def gap():
            self.gaps += 1
            dec.reset()
        f.rea = TcpReassembler(dec.feed, gap)
        f.rea.start(first[0])
        pre, f.pre, f.pre_bytes = f.pre, [], 0
        self.locked_server = f"{key[0]}:{key[1]}"
        for seq, data, t in pre:
            self._feed(f, seq, data, t)

    def _feed(self, f, seq, payload, t):
        self.parser.t = t
        self.game_bytes += len(payload)
        self.last_game_ms = t
        f.rea.push(seq, payload, t)

    def game_servers(self):
        """Kilitlenmiş oyun sunucuları: [(ip, port)]"""
        return [(k[0], k[1]) for k, f in list(self.flows.items()) if f.game]  # kopya: yakalama iş parçacığı değiştirebilir
