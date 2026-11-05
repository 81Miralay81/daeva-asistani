"""Npcap (Windows) / libpcap üzerinden pasif paket yakalama. Sadece okur; oyuna hiçbir şey göndermez.

Bütün ağ kartları dinlenir (ExitLag gibi ping hızlandırıcılar oyunu yerel olarak aktardığı için loopback dahil);
oyunun akışı kalp atışlarından tanınır, bulununca filtre o sunucuya daralır, akış susunca yeniden genişler.
"""
import ctypes
import ctypes.util
import os
import socket
import struct
import sys
import threading
import time

from .protocol import Pipeline

PCAP_ERRBUF = 256
BROAD = "tcp"


class _Addr(ctypes.Structure):
    pass


class _If(ctypes.Structure):
    pass


_If._fields_ = [("next", ctypes.POINTER(_If)), ("name", ctypes.c_char_p), ("description", ctypes.c_char_p),
                ("addresses", ctypes.c_void_p), ("flags", ctypes.c_uint)]


class _Hdr(ctypes.Structure):
    _fields_ = [("sec", ctypes.c_long), ("usec", ctypes.c_long), ("caplen", ctypes.c_uint32), ("len", ctypes.c_uint32)]


class _Bpf(ctypes.Structure):
    _fields_ = [("len", ctypes.c_uint), ("insns", ctypes.c_void_p)]


_LIB = None
_LIB_ERR = ""


def load_pcap():
    """wpcap.dll (Npcap) ya da libpcap'i yükler. Yoksa None (hata metni _LIB_ERR'de)."""
    global _LIB, _LIB_ERR
    if _LIB is not None:
        return _LIB
    names = []
    if sys.platform == "win32":
        npcap = os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), "System32", "Npcap")
        if os.path.isdir(npcap):
            try:
                os.add_dll_directory(npcap)
            except (AttributeError, OSError):
                pass
            names.append(os.path.join(npcap, "wpcap.dll"))
        names.append("wpcap.dll")
    else:
        names += [ctypes.util.find_library("pcap") or "", "libpcap.so.1", "libpcap.so.0.8", "libpcap.so"]
    for n in names:
        if not n:
            continue
        try:
            lib = ctypes.CDLL(n)
            break
        except OSError as e:
            _LIB_ERR = str(e)
    else:
        return None
    lib.pcap_findalldevs.argtypes = [ctypes.POINTER(ctypes.POINTER(_If)), ctypes.c_char_p]
    lib.pcap_freealldevs.argtypes = [ctypes.POINTER(_If)]
    lib.pcap_create.restype = ctypes.c_void_p
    lib.pcap_create.argtypes = [ctypes.c_char_p, ctypes.c_char_p]
    for f in ("pcap_set_snaplen", "pcap_set_promisc", "pcap_set_timeout", "pcap_set_buffer_size", "pcap_set_immediate_mode"):
        getattr(lib, f).argtypes = [ctypes.c_void_p, ctypes.c_int]
    lib.pcap_activate.argtypes = [ctypes.c_void_p]
    lib.pcap_datalink.argtypes = [ctypes.c_void_p]
    lib.pcap_compile.argtypes = [ctypes.c_void_p, ctypes.POINTER(_Bpf), ctypes.c_char_p, ctypes.c_int, ctypes.c_uint32]
    lib.pcap_setfilter.argtypes = [ctypes.c_void_p, ctypes.POINTER(_Bpf)]
    lib.pcap_freecode.argtypes = [ctypes.POINTER(_Bpf)]
    lib.pcap_next_ex.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.POINTER(_Hdr)), ctypes.POINTER(ctypes.POINTER(ctypes.c_ubyte))]
    lib.pcap_close.argtypes = [ctypes.c_void_p]
    lib.pcap_geterr.restype = ctypes.c_char_p
    lib.pcap_geterr.argtypes = [ctypes.c_void_p]
    lib.pcap_breakloop.argtypes = [ctypes.c_void_p]
    _LIB = lib
    return lib


def npcap_status():
    """(kurulu_mu, açıklama)"""
    lib = load_pcap()
    if lib is None:
        return False, "Npcap kurulu değil" + (f" ({_LIB_ERR})" if _LIB_ERR else "")
    return True, "Npcap hazır"


def list_devices():
    lib = load_pcap()
    if lib is None:
        return []
    err = ctypes.create_string_buffer(PCAP_ERRBUF)
    head = ctypes.POINTER(_If)()
    if lib.pcap_findalldevs(ctypes.byref(head), err) != 0:
        raise OSError(err.value.decode(errors="replace"))
    out = []
    node = head
    while node:
        d = node.contents
        out.append((d.name.decode(errors="replace"), (d.description or b"").decode(errors="replace")))
        node = d.next
    lib.pcap_freealldevs(head)
    return out


def _skip_device(name, desc):
    t = (name + " " + desc).lower()
    if sys.platform != "win32":
        return any(x in t for x in ("bluetooth", "dbus", "nflog", "nfqueue", "usbmon", "any"))
    return any(x in t for x in ("bluetooth", "wan miniport", "etw", "usbpcap"))


def parse_frame(dlt, raw):
    """Bağlantı katmanından IPv4/IPv6 + TCP'yi çıkarır: (src, sport, dst, dport, seq, syn, fin, payload) ya da None."""
    o = 0
    n = len(raw)
    if dlt == 1:  # Ethernet
        if n < 14:
            return None
        et = raw[12] << 8 | raw[13]
        o = 14
        while et in (0x8100, 0x88A8) and n >= o + 4:
            et = raw[o + 2] << 8 | raw[o + 3]
            o += 4
        if et == 0x0800:
            ver = 4
        elif et == 0x86DD:
            ver = 6
        else:
            return None
    elif dlt == 0 or dlt == 108:  # BSD loopback (Npcap Loopback Adapter)
        if n < 4:
            return None
        fam = struct.unpack("<I" if dlt == 0 else ">I", raw[:4])[0]
        o = 4
        ver = 4 if fam == 2 else 6 if fam in (23, 24, 28, 30) else 0
    elif dlt in (12, 14, 101):  # ham IP
        ver = raw[0] >> 4 if n else 0
    elif dlt == 113:  # Linux cooked
        if n < 16:
            return None
        et = raw[14] << 8 | raw[15]
        o = 16
        ver = 4 if et == 0x0800 else 6 if et == 0x86DD else 0
    elif dlt == 276:  # Linux cooked v2
        if n < 20:
            return None
        et = raw[0] << 8 | raw[1]
        o = 20
        ver = 4 if et == 0x0800 else 6 if et == 0x86DD else 0
    else:
        return None
    if ver == 4:
        if n < o + 20:
            return None
        ihl = (raw[o] & 0x0F) * 4
        if raw[o + 9] != 6 or ihl < 20:
            return None
        if raw[o + 6] & 0x1F or raw[o + 7]:  # parça
            return None
        total = raw[o + 2] << 8 | raw[o + 3]
        end = min(n, o + total) if total else n
        src = socket.inet_ntoa(raw[o + 12:o + 16])
        dst = socket.inet_ntoa(raw[o + 16:o + 20])
        o += ihl
    elif ver == 6:
        if n < o + 40 or raw[o + 6] != 6:
            return None
        plen = raw[o + 4] << 8 | raw[o + 5]
        src = socket.inet_ntop(socket.AF_INET6, bytes(raw[o + 8:o + 24]))
        dst = socket.inet_ntop(socket.AF_INET6, bytes(raw[o + 24:o + 40]))
        o += 40
        end = min(n, o + plen)
    else:
        return None
    if end < o + 20:
        return None
    sport = raw[o] << 8 | raw[o + 1]
    dport = raw[o + 2] << 8 | raw[o + 3]
    seq = struct.unpack(">I", raw[o + 4:o + 8])[0]
    off = (raw[o + 12] >> 4) * 4
    fl = raw[o + 13]
    if off < 20:
        return None
    return src, sport, dst, dport, seq, bool(fl & 0x02), bool(fl & 0x05), raw[o + off:end]


class Capture:
    """Kartları açar, iş parçacıklarında okur, TCP parçalarını Pipeline'a verir."""
    QUIET_MS = 5000

    def __init__(self, sink, data=None, log=None):
        self.pipeline = Pipeline(sink, data)
        self.lock = threading.Lock()
        self.log = log or (lambda *a: None)
        self.threads = []
        self.handles = []
        self.running = False
        self.error = ""
        self.packets = 0
        self.devices = []
        self.want_filter = BROAD

    # ------------------------------------------------------------ yaşam döngüsü
    def start(self):
        lib = load_pcap()
        if lib is None:
            self.error = "Npcap kurulu değil. https://npcap.com adresinden indirip varsayılan ayarlarla kur."
            return False
        try:
            devs = [d for d in list_devices() if not _skip_device(*d)]
        except OSError as e:
            self.error = f"Ağ kartları okunamadı: {e}"
            return False
        self.running = True
        opened, errors = [], []
        for name, desc in devs:
            h = self._open(lib, name)
            if isinstance(h, str):
                errors.append(f"{desc or name}: {h}")
                continue
            self.handles.append(h)
            opened.append(desc or name)
            th = threading.Thread(target=self._loop, args=(lib, h, name), daemon=True, name=f"pcap-{len(self.threads)}")
            self.threads.append(th)
            th.start()
        self.devices = opened
        if not opened:
            self.running = False
            joined = "; ".join(errors[:3])
            perm = any("permission" in e.lower() or "denied" in e.lower() or "erişim" in e.lower() for e in errors)
            self.error = ("Ağ kartları açılamadı: yönetici izni gerekiyor. Npcap'i 'Restrict to Administrators' "
                          "kutusu boş olarak yeniden kur ya da programı yönetici olarak çalıştır." if perm else
                          f"Hiçbir ağ kartı açılamadı. {joined}")
            return False
        self.error = ""
        self.log(f"dinleniyor: {', '.join(opened)}")
        return True

    def stop(self):
        self.running = False
        lib = load_pcap()
        for h in self.handles:
            try:
                lib.pcap_breakloop(h)
            except Exception:
                pass
        for th in self.threads:
            th.join(timeout=1.5)
        for h in self.handles:
            try:
                lib.pcap_close(h)
            except Exception:
                pass
        self.threads, self.handles = [], []

    def _open(self, lib, name):
        err = ctypes.create_string_buffer(PCAP_ERRBUF)
        h = lib.pcap_create(name.encode(), err)
        if not h:
            return err.value.decode(errors="replace") or "açılamadı"
        lib.pcap_set_snaplen(h, 65535)
        lib.pcap_set_promisc(h, 0)
        lib.pcap_set_timeout(h, 200)
        lib.pcap_set_buffer_size(h, 16 * 1024 * 1024)  # dünya boss'unda paket kaybı olmasın
        try:
            lib.pcap_set_immediate_mode(h, 1)
        except Exception:
            pass
        rc = lib.pcap_activate(h)
        if rc < 0:
            msg = (lib.pcap_geterr(h) or b"").decode(errors="replace") or f"hata {rc}"
            lib.pcap_close(h)
            return msg
        if not self._set_filter(lib, h, BROAD):
            lib.pcap_close(h)
            return "filtre kurulamadı"
        return h

    @staticmethod
    def _set_filter(lib, h, flt):
        prog = _Bpf()
        if lib.pcap_compile(h, ctypes.byref(prog), flt.encode(), 1, 0xFFFFFFFF) != 0:
            return False
        ok = lib.pcap_setfilter(h, ctypes.byref(prog)) == 0
        lib.pcap_freecode(ctypes.byref(prog))
        return ok

    # ------------------------------------------------------------ okuma
    def _loop(self, lib, h, name):
        dlt = lib.pcap_datalink(h)
        hdr = ctypes.POINTER(_Hdr)()
        data = ctypes.POINTER(ctypes.c_ubyte)()
        cur_filter = BROAD
        while self.running:
            want = self.want_filter
            if want != cur_filter:
                if self._set_filter(lib, h, want):
                    cur_filter = want
            rc = lib.pcap_next_ex(h, ctypes.byref(hdr), ctypes.byref(data))
            if rc == 0:
                self._housekeeping()
                continue
            if rc < 0:
                if self.running:
                    self.log(f"{name}: okuma bitti ({rc})")
                break
            hd = hdr.contents
            raw = ctypes.string_at(data, hd.caplen)
            r = parse_frame(dlt, raw)
            if r is None:
                continue
            src, sport, dst, dport, seq, syn, fin, payload = r
            t = hd.sec * 1000 + hd.usec // 1000
            with self.lock:
                self.packets += 1
                self.pipeline.on_segment(t, (src, sport, dst, dport), seq, syn, fin, payload)
            self._housekeeping()

    def _housekeeping(self):
        """Oyun akışı bulunduysa filtreyi o sunucuya daralt; susarsa geniş dinlemeye dön."""
        p = self.pipeline
        now = int(time.time() * 1000)
        servers = p.game_servers()
        if servers and now - p.last_game_ms < self.QUIET_MS:
            parts = sorted({f"(src host {ip} and src port {port})" for ip, port in servers if ":" not in ip})
            want = BROAD + " and (" + " or ".join(parts) + ")" if parts else BROAD
        else:
            want = BROAD
        self.want_filter = want

    # ------------------------------------------------------------ durum
    def status(self):
        p = self.pipeline
        now = int(time.time() * 1000)
        servers = p.game_servers()
        if not self.running:
            state = "stopped"
        elif servers and now - p.last_game_ms < self.QUIET_MS:
            state = "capturing"
        elif servers:
            state = "quiet"
        else:
            state = "waiting"
        return {"state": state, "server": f"{servers[0][0]}:{servers[0][1]}" if servers else "",
                "packets": self.packets, "gameBytes": p.game_bytes, "gaps": p.gaps,
                "damageRecords": p.parser.damage_ok, "devices": self.devices, "error": self.error}
