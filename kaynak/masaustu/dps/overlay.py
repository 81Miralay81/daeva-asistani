"""Oyunun üstünde duran yarı saydam küçük pencere (tkinter): DPS + geri sayımlar.

Pencere odağı oyundan almaz (tıklasan da oyun klavyeyi kaybetmez), görev çubuğunda görünmez.
Başlıktaki düğmeler: [–] bölümü küçült, [×] bölümü kapat; sayaç satırındaki × o sayacı gizler.
İki bölüm de kapanırsa küçük bir "D" düğmesi kalır, ona basınca geri gelir. Başlıktan tutup sürükleyebilirsin.
Oyun 'Pencereli tam ekran' / 'Çerçevesiz' modda olmalı: özel tam ekranda Windows hiçbir pencereyi oyunun üstüne koymaz.
"""
import sys
import threading
import time

CLASS_COLOR = {"gladiator": "#e0a050", "templar": "#6fa8dc", "assassin": "#b48ae6", "ranger": "#8fce6a",
               "sorcerer": "#e06666", "spiritmaster": "#d58adb", "cleric": "#f1e3a0", "chanter": "#76d7c4",
               "brawler": "#f6b26b", "": "#9aa3b2"}
BG, FG, MUT, ACC, WARN = "#0b0f16", "#e8ecf3", "#93a0b4", "#e8b94a", "#f2c94c"
F = "Segoe UI"


def fmt(n):
    n = float(n or 0)
    for d, s in ((1e9, "B"), (1e6, "M"), (1e3, "K")):
        if n >= d:
            return f"{n / d:.2f}{s}" if s != "K" else f"{n / d:.1f}K"
    return f"{n:.0f}"


def left_str(s):
    s = int(s)
    h, m, sec = s // 3600, s % 3600 // 60, s % 60
    return f"{h}s {m:02d}dk" if h else f"{m:02d}:{sec:02d}"


def _dim(col, k=0.55):
    r, g, b = int(col[1:3], 16), int(col[3:5], 16), int(col[5:7], 16)
    return f"#{int(r * k):02x}{int(g * k):02x}{int(b * k):02x}"


class Overlay:
    W = 300
    R = 21

    def __init__(self, provider, timers, status, settings, on_change=None):
        """provider() -> savaş sözlüğü; timers() -> sayaç listesi; status() -> {'game': bool};
        settings: x, y, alpha, rows, showDps, showTimers, dpsMin, timersMin, timerRows, hidden(list)."""
        self.provider, self.timers, self.status = provider, timers, status
        self.s = settings
        self.on_change = on_change or (lambda s: None)
        self.root = None
        self.alive = False
        self.hits = []  # (x1, y1, x2, y2, eylem)
        self._drag = None
        self._styled = False

    def start(self):
        if self.alive:
            return True
        try:
            import tkinter  # noqa: F401
        except ImportError:
            return False
        self.alive = True
        threading.Thread(target=self._run, daemon=True, name="overlay").start()
        return True

    def stop(self):
        self.alive = False

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
        root.title("Daeva Overlay")
        root.overrideredirect(True)
        root.configure(bg=BG)
        root.attributes("-topmost", True)
        root.attributes("-alpha", float(self.s.get("alpha", 0.75)))
        root.geometry(f"{self.W}x40+{int(self.s.get('x', 12))}+{int(self.s.get('y', 12))}")
        self.cv = tk.Canvas(root, width=self.W, height=40, bg=BG, highlightthickness=0, bd=0)
        self.cv.pack(fill="both", expand=True)
        self.cv.bind("<ButtonPress-1>", self._press)
        self.cv.bind("<B1-Motion>", self._motion)
        self.cv.bind("<ButtonRelease-1>", self._release)
        root.after(80, self._style)
        root.after(120, self._tick)
        try:
            root.mainloop()
        finally:
            self.root = None
            self.alive = False

    def _style(self):
        if sys.platform != "win32" or self._styled:
            return
        import ctypes
        u = ctypes.windll.user32
        h = u.GetParent(self.root.winfo_id()) or self.root.winfo_id()
        get = getattr(u, "GetWindowLongPtrW", u.GetWindowLongW)
        set_ = getattr(u, "SetWindowLongPtrW", u.SetWindowLongW)
        # WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TOPMOST: odak çalmaz, görev çubuğunda yok
        set_(h, -20, get(h, -20) | 0x80 | 0x8000000 | 0x8)
        u.SetWindowPos(h, -1, 0, 0, 0, 0, 0x1 | 0x2 | 0x10 | 0x20)
        self._styled = True

    def _press(self, e):
        for x1, y1, x2, y2, act in self.hits:
            if x1 <= e.x <= x2 and y1 <= e.y <= y2:
                self._act(act)
                return
        self._drag = (e.x_root - self.root.winfo_x(), e.y_root - self.root.winfo_y())

    def _motion(self, e):
        if self._drag:
            self.root.geometry(f"+{e.x_root - self._drag[0]}+{e.y_root - self._drag[1]}")

    def _release(self, e):
        if self._drag:
            self._drag = None
            self.s["x"], self.s["y"] = self.root.winfo_x(), self.root.winfo_y()
            self.on_change(self.s)

    def _act(self, act):
        k, _, arg = act.partition(":")
        if k == "toggle":
            self.s[arg] = not self.s.get(arg)
        elif k == "show":
            self.s["showDps"] = self.s["showTimers"] = True
        elif k == "hide":
            self.s["hidden"] = list(set(self.s.get("hidden") or []) | {arg})
        self.on_change(self.s)
        self._draw()

    def _tick(self):
        if not self.alive:
            try:
                self.root.destroy()
            except Exception:
                pass
            return
        try:
            self._style()
            a = float(self.s.get("alpha", 0.75))
            if abs(float(self.root.attributes("-alpha")) - a) > 0.01:
                self.root.attributes("-alpha", a)
            self._n = getattr(self, "_n", 0) + 1
            if self._n % 10 == 0:  # en üstte kalmayı arada bir tazele (her seferinde değil)
                self.root.attributes("-topmost", True)
            self._draw()
        except Exception:
            pass  # bir çizim hatası pencereyi durdurmasın
        self.root.after(500, self._tick)

    # ------------------------------------------------------------ çizim
    def _btn(self, x, y, txt, act):
        self.cv.create_text(x, y, text=txt, fill=MUT, font=(F, 10, "bold"))
        self.hits.append((x - 8, y - 8, x + 8, y + 8, act))

    def _head(self, y, title, right, key_min, key_show):
        cv, W = self.cv, self.W
        cv.create_rectangle(0, y, W, y + 20, fill="#121824", outline="")
        cv.create_text(8, y + 10, text=title, fill=ACC, anchor="w", font=(F, 9, "bold"))
        cv.create_text(W - 46, y + 10, text=right, fill=MUT, anchor="e", font=(F, 8))
        self._btn(W - 32, y + 10, "+" if self.s.get(key_min) else "–", "toggle:" + key_min)
        self._btn(W - 12, y + 10, "×", "toggle:" + key_show)
        return y + 22

    def _draw(self):
        cv, W, R = self.cv, self.W, self.R
        cv.delete("all")
        self.hits = []
        st = self.status() or {}
        game = st.get("game")
        if not self.s.get("showDps") and not self.s.get("showTimers"):
            self.root.geometry("26x26")
            cv.config(width=26, height=26)
            cv.create_rectangle(1, 1, 25, 25, fill="#121824", outline=ACC)
            cv.create_text(13, 13, text="D", fill=ACC, font=(F, 10, "bold"))
            self.hits.append((0, 0, 26, 26, "show:"))
            return
        y = 0
        if not game:
            cv.create_rectangle(0, 0, W, 18, fill="#3a3220", outline="")
            cv.create_text(8, 9, text="⚠ Oyun verisi yok — sayılar oyun açıkken gelir", fill=WARN, anchor="w", font=(F, 8))
            y = 20
        if self.s.get("showDps"):
            f = self.provider()
            right = f"{int((f or {}).get('dur', 0)) // 60:02d}:{int((f or {}).get('dur', 0)) % 60:02d}  {fmt((f or {}).get('dps'))}/s" if f else ""
            b = (f or {}).get("boss")
            y = self._head(y, ((b and b.get("name")) or (f and f.get("zone")) or "DPS")[:24], right, "dpsMin", "showDps")
            if not self.s.get("dpsMin"):
                if b and b.get("pct") is not None:
                    cv.create_rectangle(8, y, W - 8, y + 6, fill="#1a1f2a", outline="")
                    cv.create_rectangle(8, y, 8 + (W - 16) * max(0, min(100, b["pct"])) / 100, y + 6, fill="#c0504d", outline="")
                    y += 10
                rows = (f or {}).get("members", [])[:int(self.s.get("rows", 8))]
                if not rows:
                    cv.create_text(8, y + 10, text="Savaş bekleniyor…", fill=MUT, anchor="w", font=(F, 9))
                    y += R
                top = max([r["dmg"] for r in rows] or [1]) or 1
                for i, r in enumerate(rows):
                    col = CLASS_COLOR.get(r.get("cls", ""), CLASS_COLOR[""])
                    cv.create_rectangle(6, y + 1, W - 6, y + R - 1, fill="#141a24", outline=ACC if r.get("self") else "")
                    cv.create_rectangle(6, y + 1, 6 + (W - 12) * r["dmg"] / top, y + R - 1, fill=_dim(col), outline="")
                    cv.create_rectangle(6, y + 1, 9, y + R - 1, fill=col, outline="")
                    cv.create_text(13, y + R / 2, text=f"{i + 1}. {r['name'][:14]}", fill="#fff", anchor="w",
                                   font=(F, 9, "bold" if r.get("self") else "normal"))
                    cv.create_text(W - 10, y + R / 2, text=f"{fmt(r['dmg'])}  {fmt(r['dps'])}/s  {r['share']:.0f}%",
                                   fill="#fff", anchor="e", font=(F, 8))
                    y += R
            y += 4
        if self.s.get("showTimers"):
            try:
                tl = [t for t in (self.timers() or []) if not t.get("hidden")]
            except Exception:
                tl = []
            y = self._head(y, "Geri sayımlar", time.strftime("%H:%M"), "timersMin", "showTimers")
            if not self.s.get("timersMin"):
                for t in tl[:int(self.s.get("timerRows", 6))]:
                    soon = not t["active"] and t["left"] <= 600
                    col = "#5fd38a" if t["active"] else (WARN if soon else FG)
                    cv.create_text(8, y + 9, text=t["name"][:22], fill=col, anchor="w", font=(F, 9))
                    rt = "şimdi" if t["active"] else left_str(t["left"])
                    cv.create_text(W - 64, y + 9, text=rt, fill=col, anchor="e", font=(F, 9, "bold"))
                    cv.create_text(W - 26, y + 9, text=time.strftime("%H:%M", time.localtime(t["at"])), fill=MUT, anchor="e", font=(F, 8))
                    self._btn(W - 12, y + 9, "×", "hide:" + t["id"])
                    y += 18
                if not tl:
                    cv.create_text(8, y + 9, text="Gösterilecek sayaç yok", fill=MUT, anchor="w", font=(F, 9))
                    y += 18
        h = y + 4
        self.root.geometry(f"{W}x{h}")
        cv.config(width=W, height=h)
