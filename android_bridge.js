// ---------- Android köprüsü: masaüstündeki window.pywebview.api'nin aynısı ----------
(function () {
  if (!window.AndroidApi) return;
  let seq = 0;
  const wait = {};
  window.__andRes = (id, res) => { const f = wait[id]; if (f) { delete wait[id]; f(res); } };
  const call = (m, ...args) => new Promise(res => { const id = "c" + (++seq); wait[id] = res; window.AndroidApi.call(id, m, JSON.stringify(args)); });
  const BASE = "https://metabot.gg";

  // MetaBot sayfasını metin satırlarına çevir (masaüstündeki html_lines ile aynı mantık)
  function htmlLines(html) {
    const doc = new DOMParser().parseFromString(html, "text/html"), out = [], SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, SVG: 1, TEMPLATE: 1 };
    let cur = [];
    const flush = () => { const t = cur.join("").split(/\s+/).filter(Boolean).join(" "); if (t) out.push(t); cur = []; };
    (function walk(n) {
      for (let c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) cur.push(c.nodeValue);
        else if (c.nodeType === 1) { flush(); if (!SKIP[c.nodeName.toUpperCase()]) walk(c); flush(); }
      }
    })(doc.documentElement);
    flush();
    return out;
  }
  const num = s => parseInt(String(s || "").replace(/[^\d]/g, "")) || 0;
  const title = s => s.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
  const unesc = s => { const t = document.createElement("textarea"); t.innerHTML = s; return t.value; };

  function parseProfile(lines, raw) {
    const low = lines.map(l => l.toLowerCase());
    const out = { actives: [], passives: [], stigmas: [], equipment: [], primary: {}, deity: {}, daevanion: {} };
    const after = (label, n = 1) => { const i = low.indexOf(label); return i >= 0 && i + n < lines.length ? lines[i + n] : ""; };
    out.combatPower = num(after("combat power"));
    out.itemLevel = num(after("item level"));
    out.level = num(lines.find(l => /^Lv\. \d+$/.test(l)) || "");
    const leg = lines.find(l => l.toLowerCase().startsWith("legion:"));
    out.legion = leg ? leg.split(":").slice(1).join(":").trim() : "";
    const idx = l => low.indexOf(l);
    const ia = idx("active skills"), ip = idx("passive skills"), ist = idx("stigmas"), idv = idx("daevanion");
    const lvre = /^Lv\. (\d+)( · equipped)?$/;
    const skills = (a, b, key) => { let i = a + 1; while (i > 0 && i < b - 1) { const m = lvre.exec(lines[i + 1]); if (m) { const d = { name: lines[i], level: +m[1] }; if (key === "stigmas") d.equipped = !!m[2]; out[key].push(d); i += 2; } else i++; } };
    if (Math.min(ia, ip, ist, idv) >= 0) { skills(ia, ip, "actives"); skills(ip, ist, "passives"); skills(ist, idv, "stigmas"); }
    if (idv >= 0) for (let i = idv; i < Math.min(idv + 60, lines.length - 1); i++)
      if (["Nezekan", "Zikel", "Vaizel", "Triniel", "Ariel", "Azphel"].includes(lines[i]) && /^\d+\/\d+$/.test(lines[i + 1])) {
        const [a, b] = lines[i + 1].split("/"); const k = lines[i].toLowerCase(); if (!out.daevanion[k]) out.daevanion[k] = { open: +a, total: +b };
      }
    const prim = ["might", "dexterity", "intelligence", "constitution", "precision", "willpower"];
    low.forEach((l, i) => {
      if (prim.includes(l) && /^\d+$/.test(lines[i + 1] || "")) { const k = title(lines[i]); if (!(k in out.primary)) out.primary[k] = +lines[i + 1]; }
      const m = /^([a-z]+) \[([a-z]+)\]$/.exec(l);
      if (m && /^\d+$/.test(lines[i + 1] || "")) {
        const eff = lines[i + 2] && !/^\d+$/.test(lines[i + 2]) ? lines[i + 2] : "", k = `${title(m[1])} [${title(m[2])}]`;
        if (!out.deity[k]) out.deity[k] = { value: +lines[i + 1], effect: eff };
      }
    });
    const re = /aria-label="([^":]{2,20}): ([^"]+?)(?: \+(\d+))? — details"/g;
    let m;
    while ((m = re.exec(raw))) out.equipment.push({ slot: unesc(m[1]), item: unesc(m[2]), enchant: m[3] ? +m[3] : 0, icon: "", rarity: "", label: unesc(m[0].slice(12, -1)) });
    return out;
  }
  function choose(rows, name, server, cls) {
    const srv = (server || "").trim().toLowerCase();
    let cand = rows.filter(r => (r.name || "").toLowerCase() === name.toLowerCase());
    if (srv) cand = cand.filter(r => [(r.serverName || "").toLowerCase(), (r.serverSlug || "").toLowerCase()].includes(srv));
    if (cls) { const c2 = cand.filter(r => (r.classKey || "").toLowerCase() === cls.toLowerCase()); cand = c2.length ? c2 : cand; }
    if (!cand.length) return { ok: false, code: 404, error: "Karakter bulunamadı", matches: rows.slice(0, 15) };
    if (cand.length > 1) return { ok: false, code: 300, error: "Birden fazla eşleşme var, sunucuyu seç", matches: cand.slice(0, 15) };
    return { ok: true, row: cand[0] };
  }
  // Profil sayfasının içinde çalışır: eşya ikonlarını aynı siteden indirip gömülü resme çevirir
  const ICON_JS = `(function(){var out=[];document.querySelectorAll('[aria-label$="\\u2014 details"]').forEach(function(b){
var im=b.querySelector('img'),r=(b.getAttribute('style')||'').match(/--rarity:\\s*(#[0-9a-fA-F]{3,8})/),d='';
if(im){try{var u=new URL(im.getAttribute('src'),location.href),x=new XMLHttpRequest();x.open('GET',u.href,false);
x.overrideMimeType('text/plain; charset=x-user-defined');x.send();if(x.status==200){var s=x.responseText,bin='';
for(var i=0;i<s.length;i++)bin+=String.fromCharCode(s.charCodeAt(i)&255);
d='data:'+((x.getResponseHeader('content-type')||'image/webp').split(';')[0])+';base64,'+btoa(bin);}}catch(e){}}
out.push({label:b.getAttribute('aria-label'),icon:d,rarity:r?r[1]:''});});return JSON.stringify(out);})()`;
  function mergeIcons(prof, raw) {
    let items = []; try { items = JSON.parse(raw || "[]"); } catch (e) { return; }
    const by = {};
    for (const it of items) { const m = /^([^:]{2,20}): (.+?)(?: \+(\d+))? — details$/.exec(it.label || ""); if (m) (by[m[1] + "|" + m[2]] = by[m[1] + "|" + m[2]] || []).push(it); }
    for (const e of prof.equipment) { const l = by[e.slot + "|" + e.item]; if (l && l.length) { const it = l.shift(); if (it.icon) e.icon = it.icon; if (it.rarity) e.rarity = it.rarity; } }
  }

  // Eşya penceresi: gizli MetaBot sayfasında düğmeye tıkla, açılan detayı oku
  const itemClickJs = label => `(function(){var L=${JSON.stringify(label)};var d=document.querySelector('[role=dialog]');if(d){var c=d.querySelector('button');c&&c.click();}var b=[].slice.call(document.querySelectorAll('[aria-label]')).filter(function(x){return x.getAttribute('aria-label')===L;})[0];if(!b)return 'OK0';b.click();return 'OK';})()`.replace("'OK0'", "'NOBTN'");
  const ITEM_READ = "(function(){var d=document.querySelector('[role=dialog]');return d?d.innerText:'';})()";
  const ITEM_CLOSE = "(function(){var d=document.querySelector('[role=dialog]');if(d){var c=d.querySelector('button');c&&c.click();}})()";
  const itemDetail = (url, label) => url && url.startsWith(BASE) ? call("metabot_item", url, itemClickJs(label), ITEM_READ, ITEM_CLOSE, "") : Promise.resolve({ ok: false, error: "Geçersiz adres" });

  const CACHE = {};
  async function lookup(name, region, server, cls) {
    const key = [name.toLowerCase(), region, (server || "").toLowerCase(), (cls || "").toLowerCase()].join("|");
    if (CACHE[key] && Date.now() - CACHE[key][0] < 600000) return CACHE[key][1];
    const q = new URLSearchParams({ q: name, region, mode: "nc" }).toString();
    const g = await call("metabot_get", "/api/aion-2/armory/search?" + q);
    if (!g || g.s !== 200) return { ok: false, code: g && g.s > 0 ? g.s : -2, error: g && g.s > 0 ? `Arama başarısız (HTTP ${g.s})` : "Arama başarısız", detail: String((g && g.t) || "").slice(0, 300) };
    let rows; try { rows = JSON.parse(g.t).rows || []; } catch (e) { return { ok: false, code: -2, error: "Arama cevabı okunamadı" }; }
    const pick = choose(rows, name, server, cls);
    if (!pick.ok) return pick;
    const r = pick.row, url = `${BASE}/en${r.path}`;
    const pg = await call("metabot_page", url, ICON_JS);
    if (!pg || !pg.ok) return { ok: false, code: -2, error: (pg && pg.error) || "Profil sayfası açılamadı" };
    const prof = parseProfile(htmlLines(pg.html), pg.html);
    mergeIcons(prof, pg.extra);
    Object.assign(prof, { ok: true, name: r.name, server: r.serverName, region, classKey: r.classKey, url, via: "android" });
    CACHE[key] = [Date.now(), prof];
    return prof;
  }

  window.pywebview = {
    api: {
      has_key: () => call("has_key"),
      save_key: k => call("save_key", k),
      delete_key: () => call("delete_key"),
      list_models: () => call("list_models"),
      ask_gemini: (m, p, s) => call("ask_gemini", m, p, s !== false),
      open_url: u => call("open_url", u),
      lookup_character: (n, r, s, c) => lookup(n, r, s || "", c || ""),
      item_detail: (u, l) => itemDetail(u, l),
      check_update: () => call("check_update"),
    },
  };
  document.addEventListener("click", e => { const a = e.target.closest('a[target="_blank"]'); if (a) { e.preventDefault(); call("open_url", a.href); } });
  setTimeout(() => window.dispatchEvent(new Event("pywebviewready")), 0);
  // Başlıkta sürüm numarası (güncellemenin geldiğini görmek için)
  call("app_version").then(v => {
    const t = document.getElementById("apptitle"); if (!t || !v || !v.code) return;
    const b = document.createElement("span"); b.textContent = "v1.0." + v.code;
    b.style.cssText = "font-size:11px;font-weight:600;margin-left:8px;padding:2px 6px;border-radius:6px;background:#2e3542;color:#cfd6e0;vertical-align:middle";
    t.appendChild(b);
  });
})();
