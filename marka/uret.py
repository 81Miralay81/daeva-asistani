"""Kanatix varlık üretici: uygulama başına simge (rozetli), banner (uygulama renkleriyle), ico ve Android mipmap'leri."""
import io, os, sys, cairosvg
from PIL import Image

WING = ("M-6,-10 C-28,-70 -88,-132 -182,-164 Q-156,-132 -142,-122 Q-162,-112 -170,-100 "
        "Q-140,-100 -118,-96 Q-136,-82 -144,-70 Q-114,-72 -92,-70 Q-106,-56 -112,-44 "
        "Q-86,-48 -64,-46 Q-72,-34 -74,-24 Q-40,-24 -10,-6 Z")

DEFS = f'''
<linearGradient id="wA" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="-175" y2="-158"><stop offset="0" stop-color="#FF5A1F"/><stop offset="1" stop-color="#FFC24D"/></linearGradient>
<linearGradient id="wB" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="-175" y2="-158"><stop offset="0" stop-color="#FF8A2E"/><stop offset="1" stop-color="#FFE3A0"/></linearGradient>
<path id="wing" d="{WING}"/>
<g id="mark">
 <use href="#wing" fill="url(#wB)" transform="scale(-1,1)"/><use href="#wing" fill="url(#wB)" transform="scale(1,-1)"/>
 <use href="#wing" fill="url(#wA)"/><use href="#wing" fill="url(#wA)" transform="scale(-1,-1)"/>
 <circle r="22" fill="#0E1C33"/><path d="M0,-15 L15,0 L0,15 L-15,0 Z" fill="#FFFFFF"/><path d="M0,-15 L15,0 L0,0 Z" fill="#D6E2F3"/>
</g>'''

# Rozet simgeleri (rozet merkezi 0,0; yarıçap ~70)
GLYPH = {
    "kılıç": '<g fill="#FFFFFF"><path d="M-7,-46 L0,-58 L7,-46 L7,14 L-7,14 Z"/><rect x="-26" y="14" width="52" height="10" rx="4"/><rect x="-5" y="24" width="10" height="22" rx="3"/><circle cy="50" r="7"/></g>',
    "wifi": '<g fill="none" stroke="#FFFFFF" stroke-width="11" stroke-linecap="round"><path d="M-44,-8 Q0,-48 44,-8"/><path d="M-26,12 Q0,-12 26,12"/></g><circle cy="34" r="9" fill="#FFFFFF"/>',
    "oynat": '<path d="M-18,-32 L36,0 L-18,32 Z" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="8" stroke-linejoin="round"/>',
}


def icon_svg(bg1, bg2, rozet=None, rozet_renk=None):
    badge = ""
    if rozet:
        badge = (f'<g transform="translate(404,404)"><circle r="82" fill="{bg2}"/><circle r="70" fill="{rozet_renk}"/>'
                 f'{GLYPH[rozet]}</g>')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs>{DEFS}
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{bg1}"/><stop offset="1" stop-color="{bg2}"/></linearGradient></defs>
<rect width="512" height="512" rx="112" fill="url(#bg)"/>
<rect x="5" y="5" width="502" height="502" rx="107" fill="none" stroke="#FFFFFF" stroke-opacity="0.10" stroke-width="2"/>
<g transform="translate({236 if rozet else 256},{236 if rozet else 256}) scale({0.92 if rozet else 1})"><use href="#mark"/></g>{badge}</svg>'''


def banner_svg(bg1, bg2, vurgu, uygulama, w=1200, h=280):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><defs>{DEFS}
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{bg1}"/><stop offset="1" stop-color="{bg2}"/></linearGradient></defs>
<rect width="{w}" height="{h}" fill="url(#bg)"/>
<g transform="translate({w-150},{h/2}) scale(1.7)" opacity="0.06" fill="#FFFFFF">
 <use href="#wing"/><use href="#wing" transform="scale(-1,1)"/><use href="#wing" transform="scale(1,-1)"/><use href="#wing" transform="scale(-1,-1)"/></g>
<rect x="0" y="{h-4}" width="{w}" height="4" fill="{vurgu}" opacity="0.85"/>
<g transform="translate(160,{h/2}) scale(0.58)"><use href="#mark"/></g>
<text x="300" y="{h/2+14}" font-family="Inter Display" font-weight="700" font-size="92" letter-spacing="9" fill="#FFFFFF">KANATIX</text>
<rect x="304" y="{h/2+40}" width="56" height="4" rx="2" fill="#FF7A2F"/>
<text x="374" y="{h/2+49}" font-family="Inter Display" font-weight="600" font-size="24" letter-spacing="5" fill="{vurgu}">{uygulama}</text></svg>'''


def png(svg, size, path=None, w=None):
    data = cairosvg.svg2png(bytestring=svg.encode(), output_width=w or size)
    if path:
        open(path, "wb").write(data)
    return Image.open(io.BytesIO(data)).convert("RGBA")


def ico(svg, path):
    sizes = [16, 24, 32, 48, 64, 128, 256]
    imgs = [png(svg, s) for s in sizes]
    imgs[-1].save(path, format="ICO", sizes=[(s, s) for s in sizes], append_images=imgs[:-1])


MIP = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}


def mipmaps(svg, resdir, names=("ic_launcher.png",)):
    for d, s in MIP.items():
        os.makedirs(f"{resdir}/mipmap-{d}", exist_ok=True)
        for n in names:
            png(svg, s, f"{resdir}/mipmap-{d}/{n}")


UYG = {
    "daeva": dict(bg1="#1B2232", bg2="#0B0F16", vurgu="#E8B94A", ad="DAEVA ASİSTANI", rozet="kılıç", rozet_renk="#C9962E"),
    "home": dict(bg1="#17233A", bg2="#0E1420", vurgu="#3DA5F4", ad="HOME · AĞ KONTROL", rozet="wifi", rozet_renk="#2E8BD8"),
    "video": dict(bg1="#151C2E", bg2="#0B0F1A", vurgu="#D9B04A", ad="VIDEO İNDİR", rozet="oynat", rozet_renk="#2F7BFF"),
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "cikti"
    os.makedirs(out, exist_ok=True)
    for k, u in UYG.items():
        isvg = icon_svg(u["bg1"], u["bg2"], u["rozet"], u["rozet_renk"])
        open(f"{out}/{k}-icon.svg", "w").write(isvg)
        png(isvg, 512, f"{out}/{k}-icon.png")
        ico(isvg, f"{out}/{k}.ico")
        bsvg = banner_svg(u["bg1"], u["bg2"], u["vurgu"], u["ad"])
        open(f"{out}/{k}-banner.svg", "w").write(bsvg)
        png(bsvg, 0, f"{out}/{k}-banner.png", w=1200)
    print("tamam")
