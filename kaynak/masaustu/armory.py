"""MetaBot.GG Armory karakter okuyucu (kişisel kullanım, kaynak bağlantısı gösterilir)."""
import html as _html
import json
import re
import urllib.parse
import urllib.request
from html.parser import HTMLParser

BASE = "https://metabot.gg"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 DaevaAsistani/1.1",
      "Accept": "text/html,application/json;q=0.9,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.9"}
SKIP = {"script", "style", "noscript", "svg", "template"}


class _Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.lines, self.cur, self.skip = [], [], 0

    def _flush(self):
        t = " ".join("".join(self.cur).split())
        if t:
            self.lines.append(t)
        self.cur = []

    def handle_starttag(self, tag, attrs):
        if tag in SKIP:
            self.skip += 1
        self._flush()

    def handle_endtag(self, tag):
        if tag in SKIP and self.skip:
            self.skip -= 1
        self._flush()

    def handle_data(self, d):
        if not self.skip:
            self.cur.append(d)


def html_lines(h):
    p = _Text()
    p.feed(h)
    p._flush()
    return p.lines


def _get(url, timeout=25):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def search(name, region):
    q = urllib.parse.urlencode({"q": name, "region": region, "mode": "nc"})
    return json.loads(_get(f"{BASE}/api/aion-2/armory/search?{q}")).get("rows", [])


def _num(s):
    return int(re.sub(r"[^\d]", "", s) or 0)


def parse_profile(lines, raw_html=""):
    low = [l.lower() for l in lines]
    out = {"actives": [], "passives": [], "stigmas": [], "equipment": [], "primary": {}, "deity": {}, "daevanion": {}}

    def after(label, n=1):
        for i, l in enumerate(low):
            if l == label:
                return lines[i + n] if i + n < len(lines) else ""
        return ""

    out["combatPower"] = _num(after("combat power"))
    out["itemLevel"] = _num(after("item level"))
    m = next((l for l in lines if re.match(r"^Lv\. \d+$", l)), "")
    out["level"] = _num(m)
    leg = next((l for l in lines if l.lower().startswith("legion:")), "")
    out["legion"] = leg.split(":", 1)[1].strip() if leg else ""

    # yetenekler / stigmalar
    def idx(label):
        return next((i for i, l in enumerate(low) if l == label), -1)

    ia, ip, ist, idv = idx("active skills"), idx("passive skills"), idx("stigmas"), idx("daevanion")
    lvre = re.compile(r"^Lv\. (\d+)( · equipped)?$")

    def skills(a, b, key):
        i = a + 1
        while 0 < i < b - 1:
            mm = lvre.match(lines[i + 1])
            if mm:
                d = {"name": lines[i], "level": int(mm.group(1))}
                if key == "stigmas":
                    d["equipped"] = bool(mm.group(2))
                out[key].append(d)
                i += 2
            else:
                i += 1

    # Bölüm başlıklarından biri eksik olabilir (ör. hiç stigması olmayan karakterde "Stigmas" yok)
    marks = sorted(i for i in (ia, ip, ist, idv) if i >= 0)

    def end_of(a):
        return next((m for m in marks if m > a), len(lines))

    if ia >= 0:
        skills(ia, end_of(ia), "actives")
    if ip >= 0:
        skills(ip, end_of(ip), "passives")
    if ist >= 0:
        skills(ist, end_of(ist), "stigmas")
    # daevanion
    if idv >= 0:
        for i in range(idv, min(idv + 60, len(lines) - 1)):
            if lines[i] in ("Nezekan", "Zikel", "Vaizel", "Triniel", "Ariel", "Azphel") and re.match(r"^\d+/\d+$", lines[i + 1]):
                a, b = lines[i + 1].split("/")
                out["daevanion"].setdefault(lines[i].lower(), {"open": int(a), "total": int(b)})
    # statlar
    prim = ["might", "dexterity", "intelligence", "constitution", "precision", "willpower"]
    for i, l in enumerate(low):
        if l in prim and i + 1 < len(lines) and re.match(r"^\d+$", lines[i + 1]):
            out["primary"].setdefault(lines[i].title(), int(lines[i + 1]))
        mm = re.match(r"^([a-z]+) \[([a-z]+)\]$", l)
        if mm and i + 1 < len(lines) and re.match(r"^\d+$", lines[i + 1]):
            eff = lines[i + 2] if i + 2 < len(lines) and not re.match(r"^\d+$", lines[i + 2]) else ""
            out["deity"].setdefault(f"{mm.group(1).title()} [{mm.group(2).title()}]", {"value": int(lines[i + 1]), "effect": eff})
    # ekipman: düğmelerin aria-label'ından ("Chest: Bakarma Breastplate +10 — details")
    if raw_html:
        for m in re.finditer(r'aria-label="([^":]{2,20}): ([^"]+?)(?: \+(\d+))? \u2014 details"', raw_html):
            slot, item, enc = _html.unescape(m.group(1)), _html.unescape(m.group(2)), m.group(3)
            # düğmenin içindeki eşya resmi
            end = raw_html.find("</button>", m.end())
            seg = raw_html[m.end(): end if 0 < end - m.end() < 6000 else m.end() + 3000]
            im = re.search(r'<img[^>]*?\ssrc="([^"]+)"', seg)
            icon = _html.unescape(im.group(1)) if im else ""
            # /api/image?src=<gerçek adres> → doğrudan oyun ikonu adresi
            q = urllib.parse.urlparse(icon)
            real = urllib.parse.parse_qs(q.query).get("src", [""])[0] if q.path.endswith("/api/image") else ""
            icon = real or icon
            if icon.startswith("//"):
                icon = "https:" + icon
            elif icon.startswith("/"):
                icon = BASE + icon
            if icon and not icon.startswith("http"):
                icon = ""
            # düğmenin oyun içi nadirlik rengi (style="--rarity:#FFD02B")
            start = raw_html.rfind("<button", 0, m.start())
            rm = re.search(r"--rarity:\s*(#[0-9a-fA-F]{3,8})", raw_html[start:m.start()] if start >= 0 else "")
            out["equipment"].append({"slot": slot, "item": item, "enchant": int(enc) if enc else 0, "icon": icon,
                                     "rarity": rm.group(1) if rm else "", "label": _html.unescape(m.group(0)[12:-1])})
    return out


# Profil sayfasının içinde çalışır: eşya ikonlarını aynı siteden indirip gömülü (data:) resme çevirir.
# MetaBot resimleri başka sitelerde göstermeye izin vermediği için uygulamada ancak böyle görünür.
ICON_JS = r"""(function(){var out=[];document.querySelectorAll('[aria-label$="\u2014 details"]').forEach(function(b){
var im=b.querySelector('img'),r=(b.getAttribute('style')||'').match(/--rarity:\s*(#[0-9a-fA-F]{3,8})/),d='';
if(im){try{var u=new URL(im.getAttribute('src'),location.href),x=new XMLHttpRequest();x.open('GET',u.href,false);
x.overrideMimeType('text/plain; charset=x-user-defined');x.send();if(x.status==200){var s=x.responseText,bin='';
for(var i=0;i<s.length;i++)bin+=String.fromCharCode(s.charCodeAt(i)&255);
d='data:'+((x.getResponseHeader('content-type')||'image/webp').split(';')[0])+';base64,'+btoa(bin);}}catch(e){}}
out.push({label:b.getAttribute('aria-label'),icon:d,rarity:r?r[1]:''});});return JSON.stringify(out);})()"""


# Eşya düğmesine tıklayıp açılan pencerenin metnini okur (detaylar ayrıca yüklendiği için beklenir)
def item_click_js(label):
    return ("(function(){var L=" + json.dumps(label) + ";var d=document.querySelector('[role=dialog]');"
            "if(d){var c=d.querySelector('button');c&&c.click();}"
            "var b=[].slice.call(document.querySelectorAll('[aria-label]')).filter(function(x){return x.getAttribute('aria-label')===L;})[0];"
            "if(!b)return 'NOBTN';b.click();return 'OK';})()")


ITEM_READ_JS = "(function(){var d=document.querySelector('[role=dialog]');return d?d.innerText:'';})()"
ITEM_CLOSE_JS = ("(function(){var d=document.querySelector('[role=dialog]');if(d){var c=d.querySelector('button');c&&c.click();}"
                 "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));})()")


# Karakterin Daevanion tahtalarında açık düğümleri: sayfadaki tahta numaralarını bulup MetaBot'un kendi
# adresinden tahta tahta okur. key = arama sonucundaki "bölge.sunucuNo.karakterId"
def dv_js(key):
    return ("(function(){var k=" + json.dumps(key or "") + ".split('.');if(k.length<3)return '{}';var reg=k[0],srv=k[1],id=k.slice(2).join('.');"
            "var s=[].map.call(document.scripts,function(x){return x.textContent}).join('\\n');"
            "var re=/\\\\?\"id\\\\?\":(\\d+),\\\\?\"name\\\\?\":\\\\?\"(Nezekan|Zikel|Vaizel|Triniel|Ariel|Azphel)\\\\?\"/g,m,ids={};"
            "while((m=re.exec(s)))ids[m[2].toLowerCase()]=+m[1];var out={};"
            "for(var b in ids){try{var x=new XMLHttpRequest();x.open('GET','/api/aion-2/armory/daevanion?'+new URLSearchParams({region:reg,server:srv,id:id,board:String(ids[b])}),false);x.send();"
            "if(x.status==200){var j=JSON.parse(x.responseText);out[b]={id:ids[b],open:j.openNodeIds||[],stats:j.statEffects||[]};}}catch(e){}}"
            "return JSON.stringify(out);})()")


def merge_icons(prof, raw):
    """ICON_JS sonucunu ekipman listesine işler (etiket sırasıyla eşleştirir)."""
    try:
        items = json.loads(raw) if isinstance(raw, str) else (raw or [])
    except Exception:
        return prof
    by = {}
    for it in items:
        m = re.match(r"^([^:]{2,20}): (.+?)(?: \+(\d+))? \u2014 details$", it.get("label") or "")
        if m:
            by.setdefault((m.group(1), m.group(2)), []).append(it)
    for e in prof.get("equipment", []):
        lst = by.get((e["slot"], e["item"]))
        if lst:
            it = lst.pop(0)
            if it.get("icon"):
                e["icon"] = it["icon"]
            if it.get("rarity"):
                e["rarity"] = it["rarity"]
    return prof


def choose(rows, name, server="", cls=""):
    srv = (server or "").strip().lower()
    cand = [r for r in rows if r.get("name", "").lower() == name.lower()]
    if srv:
        cand = [r for r in cand if srv in (r.get("serverName", "").lower(), r.get("serverSlug", "").lower())]
    if cls:
        c2 = [r for r in cand if r.get("classKey", "").lower() == cls.lower()]
        cand = c2 or cand
    if not cand:
        return {"ok": False, "code": 404, "error": "Karakter bulunamadı", "matches": rows[:15]}
    if len(cand) > 1:
        return {"ok": False, "code": 300, "error": "Birden fazla eşleşme var, sunucuyu seç", "matches": cand[:15]}
    return {"ok": True, "row": cand[0]}


def lookup(name, region, server="", cls=""):
    pick = choose(search(name, region), name, server, cls)
    if not pick.get("ok"):
        return pick
    r = pick["row"]
    url = f"{BASE}/en{r['path']}"
    raw = _get(url)
    prof = parse_profile(html_lines(raw), raw)
    prof.update({"ok": True, "name": r["name"], "server": r.get("serverName"), "region": region, "classKey": r.get("classKey"), "url": url})
    return prof
