"""Arayüzü (templar-tank.html) Android köprüsüyle birleştirip assets/index.html üretir."""
import pathlib
root = pathlib.Path(__file__).parent
src = (root / "web" / "templar-tank.html").read_text(encoding="utf-8")
bridge = (root / "android_bridge.js").read_text(encoding="utf-8")
html = ('<!doctype html><html lang="tr"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<style>:root{color-scheme:dark}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>'
        '</head><body>' + src + '<script>' + bridge + '</script></body></html>')
out = root / "android" / "app" / "src" / "main" / "assets" / "index.html"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(html, encoding="utf-8")
print("yazıldı:", out, len(html) // 1024, "KB")
