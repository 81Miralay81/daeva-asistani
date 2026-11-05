"""Oyunun üstünde sol üstte duran yarı saydam küçük DPS penceresi (tkinter).

Pencere fareyi oyuna geçirir (tıklanamaz), odağı çalmaz, görev çubuğunda görünmez. Taşımak için uygulamadan
"Overlay kilidini aç" seçilir; o sırada sürüklenebilir, kilitleyince konum kaydedilir.
Oyun 'Pencereli tam ekran' / 'Çerçevesiz' modda olmalı: özel tam ekranda Windows hiçbir pencereyi oyunun üstüne koymaz.
"""
import sys
import threading

CLASS_COLOR = {"gladiator": "#e0a050", "templar": "#6fa8dc", "assassin": "#b48ae6", "ranger": "#8fce6a",
               "sorcerer": "#e06666", "spiritmaster": "#d58adb", "cleric": "#f1e3a0", "chanter": "#76d7c4",
               "brawler": "#f6b26b", "": "#9aa3b2"}
BG = "#0b0f16"
FG = "#e8ecf3"
MUT = "#93a0b4"
ACC = "#e8b94a"


def fmt(n):
    n = float(n or 0)
    if n >= 1e9:
        return f"{n / 1e9:.2f}B"
    if n >= 1e6:
        return f"{n / 1e6:.2f}M"
    if n >= 1e3:
        return f"{n / 1e3:.1f}K"
    return f"{n:.0f}"


def _dim(col, k=0.55):
    """Sınıf rengini koyulaştır (beyaz yazı okunsun)."""
    r, g, b = int(col[1:3], 16), int(col[3:5], 16), int(col[5:7], 16)
    return f"#{int(r * k):02x}{int(g * k):02x}{int(b * k):02x}"


def _mmss(s):
    s = int(s or 0)
    return f"{s // 60:02d}:{s % 60:02d}"


class Overlay:
    W = 290
    ROW = 22

    def __init__(self, provider, settings, on_moved=None):
        """provider() -> tracker.fight_dict benzeri sözlük ya da None. settings: dict(x, y, alpha, rows, locked)."""
        self.provider = provider
        self.s = settings
        self.on_moved = on_moved or (lambda x, y: None)
        self.root = None
        self.thread = None
        self.alive = False
        self._locked_applied = None
        self._drag = None

    # ------------------------------------------------------------ yaşam döngüsü
    def start(self):
        if self.alive:
            return True
        try:
            import tkinter  # noqa: F401
        except ImportError:
            return False
        self.alive = True
        self.thread = threading.Thread(target=self._run, daemon=True, name="overlay")
        self.thread.start()
        return True

    def stop(self):
        self.alive = False
        r = self.root
        if r is not None:
            try:
                r.after(0, r.destroy)
            except Exception:
                pass

    def update_settings(self, s):
        self.s.update(s)

    # ------------------------------------------------------------ pencere
    def _run(self):
        import tkinter as tk
        try:
            root = tk.Tk()
        except Exception:
            self.alive = False
            return
        self.root = root
        root.title("Daeva DPS")
        root.overrideredirect(True)
        root.configure(bg=BG)
        root.attributes("-topmost", True)
        try:
            root.attributes("-alpha", float(self.s.get("alpha", 0.72)))
        except Exception:
            pass
        root.geometry(f"{self.W}x60+{int(self.s.get('x', 12))}+{int(self.s.get('y', 12))}")
        self.cv = tk.Canvas(root, width=self.W, height=60, bg=BG, highlightthickness=0, bd=0)
        self.cv.pack(fill="both", expand=True)
        self.cv.bind("<ButtonPress-1>", self._press)
        self.cv.bind("<B1-Motion>", self._motion)
        self.cv.bind("<ButtonRelease-1>", self._release)
        root.after(50, self._apply_style)
        root.after(100, self._tick)
        try:
            root.mainloop()
        finally:
            self.root = None
            self.alive = False

    def _hwnd(self):
        import ctypes
        try:
            return ctypes.windll.user32.GetParent(self.root.winfo_id()) or self.root.winfo_id()
        except Exception:
            return None

    def _apply_style(self):
        """Windows: tıklama geçiren (kilitliyken), odak almayan, görev çubuğunda görünmeyen pencere."""
        locked = bool(self.s.get("locked", True))
        if locked == self._locked_applied:
            return
        self._locked_applied = locked
        if sys.platform != "win32":
            return
        import ctypes
        h = self._hwnd()
        if not h:
            return
        GWL_EXSTYLE = -20
        WS_EX_LAYERED, WS_EX_TRANSPARENT, WS_EX_TOOLWINDOW, WS_EX_NOACTIVATE, WS_EX_TOPMOST = 0x80000, 0x20, 0x80, 0x8000000, 0x8
        u = ctypes.windll.user32
        get = getattr(u, "GetWindowLongPtrW", u.GetWindowLongW)
        set_ = getattr(u, "SetWindowLongPtrW", u.SetWindowLongW)
        st = get(h, GWL_EXSTYLE) | WS_EX_LAYERED | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TOPMOST
        st = st | WS_EX_TRANSPARENT if locked else st & ~WS_EX_TRANSPARENT
        set_(h, GWL_EXSTYLE, st)
        # SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE|SWP_FRAMECHANGED, HWND_TOPMOST
        u.SetWindowPos(h, -1, 0, 0, 0, 0, 0x1 | 0x2 | 0x10 | 0x20)

    def _press(self, e):
        if not self.s.get("locked", True):
            self._drag = (e.x_root - self.root.winfo_x(), e.y_root - self.root.winfo_y())

    def _motion(self, e):
        if self._drag:
            x, y = e.x_root - self._drag[0], e.y_root - self._drag[1]
            self.root.geometry(f"+{x}+{y}")

    def _release(self, e):
        if self._drag:
            self._drag = None
            x, y = self.root.winfo_x(), self.root.winfo_y()
            self.s["x"], self.s["y"] = x, y
            self.on_moved(x, y)

    def _tick(self):
        if not self.alive:
            try:
                self.root.destroy()
            except Exception:
                pass
            return
        try:
            self._apply_style()
            a = float(self.s.get("alpha", 0.72))
            if abs(float(self.root.attributes("-alpha")) - a) > 0.01:
                self.root.attributes("-alpha", a)
            if self.s.get("hidden"):
                self.root.withdraw()
            else:
                self.root.deiconify()
                self.root.attributes("-topmost", True)
                self._draw(self.provider())
        except Exception:
            pass
        self.root.after(400, self._tick)

    def _draw(self, f):
        cv, W, R = self.cv, self.W, self.ROW
        cv.delete("all")
        maxrows = int(self.s.get("rows", 8))
        rows = (f or {}).get("members", [])[:maxrows]
        unlocked = not self.s.get("locked", True)
        h = 24 + max(1, len(rows)) * R + (14 if f and f.get("boss") else 0) + 4
        self.root.geometry(f"{W}x{h}")
        cv.config(width=W, height=h)
        if unlocked:
            cv.create_rectangle(1, 1, W - 2, h - 2, outline=ACC, dash=(3, 2))
        title = "Daeva DPS"
        right = ""
        if f:
            b = f.get("boss")
            title = (b and b.get("name")) or (f.get("zone") or "Savaş")
            right = f"{_mmss(f.get('dur'))}  {fmt(f.get('dps'))}/s"
        cv.create_text(8, 12, text=("⠿ " if unlocked else "") + title[:26], fill=ACC, anchor="w", font=("Segoe UI", 9, "bold"))
        cv.create_text(W - 8, 12, text=right, fill=MUT, anchor="e", font=("Segoe UI", 8))
        y = 24
        if f and f.get("boss"):
            b = f["boss"]
            pct = b.get("pct")
            cv.create_rectangle(8, y + 2, W - 8, y + 9, fill="#1a1f2a", outline="")
            if pct is not None:
                cv.create_rectangle(8, y + 2, 8 + (W - 16) * max(0, min(100, pct)) / 100, y + 9, fill="#c0504d", outline="")
                cv.create_text(W - 10, y + 5, text=f"{pct:.0f}%", fill=FG, anchor="e", font=("Segoe UI", 6))
            y += 14
        if not rows:
            cv.create_text(8, y + R / 2, text="Savaş bekleniyor…" if f is None else "Partiden hasar yok", fill=MUT,
                           anchor="w", font=("Segoe UI", 9))
            return
        top = max(r["dmg"] for r in rows) or 1
        for i, r in enumerate(rows):
            col = CLASS_COLOR.get(r.get("cls", ""), CLASS_COLOR[""])
            x1 = 6 + (W - 12) * r["dmg"] / top
            cv.create_rectangle(6, y + 2, W - 6, y + R - 2, fill="#141a24", outline="")
            cv.create_rectangle(6, y + 2, x1, y + R - 2, fill=_dim(col), outline="")
            cv.create_rectangle(6, y + 2, 9, y + R - 2, fill=col, outline="")
            if r.get("self"):
                cv.create_rectangle(6, y + 2, W - 6, y + R - 2, outline=ACC)
            cv.create_text(12, y + R / 2, text=f"{i + 1}. {r['name'][:14]}", fill="#ffffff", anchor="w",
                           font=("Segoe UI", 9, "bold" if r.get("self") else "normal"))
            cv.create_text(W - 12, y + R / 2, text=f"{fmt(r['dmg'])}  {fmt(r['dps'])}/s  {r['share']:.0f}%",
                           fill="#ffffff", anchor="e", font=("Segoe UI", 8))
            y += R
