"""Arayüzü derler: kaynak/web → web/templar-tank.html (Android) ve kaynak/masaustu/app/index.html (exe)."""
import pathlib, subprocess, sys
K = pathlib.Path(__file__).parent
W = K / "web"
g = (W / "gemini_body.js").read_text(encoding="utf-8").replace("/*MD*/", (W / "md.js").read_text(encoding="utf-8"))
(W / "gemini.js").write_text(g, encoding="utf-8")
subprocess.check_call([sys.executable, "build_art.py"], cwd=W)
html = (W / "templar-tank.html").read_text(encoding="utf-8")
# Kanatix markası: üstte banner (uygulama renkleriyle) + sekme başlığı
import base64
_b64 = base64.b64encode((W / "kanatix_banner.webp").read_bytes()).decode()
html = html.replace("<title>Daeva Asistanı</title>", "<title>Kanatix Daeva Asistanı</title>", 1)
html = html.replace("header{position:sticky", ".kbanner{background:linear-gradient(135deg,#1B2232,#0B0F16);border-bottom:2px solid #E8B94A}.kbanner img{display:block;width:100%;max-width:620px;height:auto}\nheader{position:sticky", 1)
html = html.replace("<header>", '<div class="kbanner"><img alt="Kanatix Daeva Asistanı" src="data:image/webp;base64,' + _b64 + '"></div>\n<header>', 1)
(K.parent / "web" / "templar-tank.html").write_text(html, encoding="utf-8")
desk = ('<!doctype html>\n<html lang="tr">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n'
        '<style>:root{color-scheme:light}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>\n</head>\n<body>\n'
        + html + '\n<script>document.addEventListener("click", e => { const a = e.target.closest(\'a[target="_blank"]\'); if (a && window.pywebview && window.pywebview.api) { e.preventDefault(); window.pywebview.api.open_url(a.href); } });</script>\n</body>\n</html>')
(K / "masaustu" / "app" / "index.html").write_text(desk, encoding="utf-8")
print("tamam", len(html) // 1024, "KB")
