// ---------- Karakter sorgulama (MetaBot.GG Armory, sadece masaüstü) ----------
const CLASS_KEY = { templar: "Templar", gladiator: "Gladiator", assassin: "Assassin", ranger: "Ranger", sorcerer: "Sorcerer", spiritmaster: "Elementalist", cleric: "Cleric", chanter: "Chanter" };
const KEY_CLASS = Object.fromEntries(Object.entries(CLASS_KEY).map(([k, v]) => [v.toLowerCase(), k]));
const CLS_ROLE = { templar: "tank", gladiator: "bruiser", assassin: "dps", ranger: "dps", sorcerer: "dps", spiritmaster: "dps", cleric: "healer", chanter: "support" };
// MetaBot'taki Aion 2 sunucuları (bölgeler aynı adları kullanıyor)
const AION_SERVERS = ["Agnita", "Ariel", "Atiel", "Azphel", "Baba", "Bakarma", "Beritra", "Daminu", "Ereshkigal", "Fafnir", "Fregion", "Gauss", "Hadala", "Hithanya", "Indnath", "Ishtar", "Israphel", "Kaisinel", "Kasaka", "Kochi", "Kromede", "Lamuatan", "Ludra", "Lumiel", "Luteros", "Marchutan", "Meslamtaeda", "Munin", "Nania", "Nathara", "Nemon", "Nezekan", "Odar", "Phernos", "Quai", "Siel", "Tahavatha", "Tassin", "Tiamat", "Triniel", "Tsenka", "Ulgorn", "Vaizel", "Yustiel", "Zemurru", "Zikel"];
function chErrHtml(er) {
  if (typeof er === "string") return `<p class="bad small">⚠ ${esc(er)}</p>`;
  const raw = String(er.error || ""), code = er.code || +((/HTTP (\d+)/.exec(raw) || [])[1]) || 0;
  const tr = code === 403 ? ["Erişim reddedildi (HTTP 403 – Yasak)", "MetaBot, tarayıcı olmayan programlardan gelen istekleri bot sanıp engelliyor. Uygulama bu yüzden sorguyu gizli bir tarayıcı penceresiyle tekrar dener.", "Birkaç saniye sonra tekrar dene. Sürerse sitenin kendisi de geçici olarak engelliyor olabilir; 'MetaBot'ta aç' bağlantısıyla elle bakabilirsin."]
    : code === 404 ? ["Karakter bulunamadı (HTTP 404)", "Bu bölge/sunucuda bu isimde karakter yok ya da MetaBot henüz kaydetmemiş.", "Nick'i oyundaki gibi (büyük-küçük harf dahil) yaz, bölgeyi ve sunucuyu kontrol et."]
    : code === 300 ? ["Birden fazla eşleşme var", "Bu isimde birden fazla karakter bulundu.", "Aşağıdan doğru sunucu/sınıfı seç."]
    : code === 429 ? ["Çok fazla sorgu (HTTP 429)", "Kısa sürede çok sorgu yapıldığı için site bekletiyor.", "1–2 dakika bekleyip tekrar dene."]
    : code >= 500 ? [`MetaBot tarafında sorun (HTTP ${code})`, "Site şu an cevap veremiyor; senin ayarlarınla ilgili değil.", "Biraz sonra tekrar dene."]
    : (code === 0 && /urlopen|timed out|getaddrinfo|Name or service|No route|refused/i.test(raw + (er.detail || ""))) ? ["İnternet bağlantısı kurulamadı", "Uygulama MetaBot'a hiç ulaşamadı (internet kesik, zaman aşımı ya da güvenlik duvarı).", "İnternetini kontrol edip tekrar dene."]
    : ["MetaBot sayfası okunamadı", "İnternetin çalışıyor; sorun MetaBot tarafında. Site otomatik sorguları engellemek için bir güvenlik kontrolü (Cloudflare) kullanıyor. Uygulama bunu gizli bir tarayıcı penceresiyle geçmeye çalıştı ama bu sefer olmadı.", "1–2 dakika sonra tekrar dene. Olmazsa aşağıdaki 'MetaBot Armory'yi aç' düğmesiyle kendin bak."];
  return `<div class="errcard small"><p class="bad"><b>⚠ ${tr[0]}</b></p><p><b>Neden:</b> ${tr[1]}</p><p><b>Ne yapmalı:</b> ${tr[2]}</p>
    <details class="mut"><summary>Orijinal mesaj</summary>${esc(raw)}${er.detail ? `<br>${esc(er.detail)}` : ""}</details></div>`;
}
let CH = null, CH_BUSY = false, CH_ERR = null, CH_MATCH = null;

function modeGoal(mode = S.mode, cls = CLS) {
  const r = CLS_ROLE[cls];
  if (mode === "zindan") return {
    tank: "Zindan (tank): partiyi koru ve aggro'yu asla kaçırma. Taunt/enmity, hasar azaltma, grup kalkanları, kontrol kırma ve boss mekaniklerinde hayatta kalma öncelikli.",
    healer: "Zindan (healer): partiyi ayakta tut. Grup ve tek hedef iyileştirme, debuff temizleme, kalkanlar, mana yönetimi ve diriltme öncelikli.",
    support: "Zindan (destek): parti buff'ları, grup kalkanı ve iyileştirme ile birlikte sürekli hasar.",
    bruiser: "Zindan (yakın dövüş hasar): boss'a sürekli yüksek hasar, aggro çekmeden; mekaniklerden kaçabilecek hareketlilik ve kendi kendini iyileştirme.",
    dps: "Zindan (hasar): boss'a maksimum sürekli tek hedef hasarı, aggro çekmeden; mekaniklerden kaçabilme ve hayatta kalma.",
  }[r];
  if (mode === "kasma") return "Kasma / solo: maksimum hasar ve hızlı mob temizleme (alan hasarı, mob toplama, kısa cooldown), kendi kendini iyileştirme ve mana sürdürülebilirliği. Parti desteği önemsiz.";
  return "PvP: oyunculara karşı kontrol (stun, root, seal, korku), patlama hasarı, kontrol kırma, iyileşme kesme ve hayatta kalma.";
}

function rKar2() {
  const desk = !!gemApi();
  const reg = S.chRegion || S.region || "eu";
  let h = `<div class="card"><div class="nm">Karakterimi sorgula</div>
    <p class="mut small">Nick, bölge ve sınıfını gir; güncel ekipman, statlar, yetenek ve stigma seviyeleri ile Daevanion ilerlemen gelir. Veriler <a href="https://metabot.gg/en/aion-2/armory" target="_blank" rel="noopener">MetaBot.GG</a>'nin resmi karakter verisinden okunur.</p>
    <div class="chform">
      <label>Nick<input id="chname" value="${esc(S.chName || "")}" placeholder="Miralay"></label>
      <label>Bölge<select id="chreg">${REGIONS.map(([k, a]) => `<option value="${k}" ${reg === k ? "selected" : ""}>${a}</option>`).join("")}</select></label>
      <label>Sunucu<select id="chsrv"><option value="">Tümü</option>${AION_SERVERS.map(n => `<option ${S.chServer === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label>Sınıf<select id="chcls">${CLASSES.map(([k, a]) => `<option value="${k}" ${(S.chCls || CLS) === k ? "selected" : ""}>${a}</option>`).join("")}</select></label>
      <button class="btn pri" id="chgo" ${desk && !CH_BUSY ? "" : "disabled"}>${CH_BUSY ? "Sorgulanıyor…" : "Sorgula"}</button>
    </div>
    ${desk ? "" : `<p class="note small">Sorgulama <b>masaüstü sürümünde (DaevaAsistani.exe)</b> çalışır. Bu sayfa dış sitelere bağlanamaz; aşağıdaki bağlantılardan elle bakabilirsin.</p>`}
    ${CH_ERR ? chErrHtml(CH_ERR) : ""}
    ${CH_MATCH ? `<div class="chips">${CH_MATCH.map((m, i) => `<button class="chip" data-chm="${i}"><b>${esc(m.serverName)}</b>${esc(m.classKey)} · Lv. ${m.level}</button>`).join("")}</div>` : ""}</div>`;
  if (CH) h += rChar();
  return h + rKar();
}
// İsimden ikon: önce karakterin kendi sınıfı, sonra bütün sınıflar (kesme işaretli adlar dahil)
const nslug = n => String(n).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
function nameIcon(name, cls) {
  const s1 = nslug(name), s2 = nslug(String(name).replace(/['’]/g, ""));
  const keys = [s1, "st_" + s1, s2, "st_" + s2];
  const fromCls = c => { const d = CLASS_ICONS[c]; if (!d) return null; for (const k of keys) if (d[k]) return d[k]; return null; };
  const tp = [...TEMPLAR.ACTIVES, ...TEMPLAR.PASSIVES, ...TEMPLAR.STIGMAS].find(x => x.ad.toLowerCase() === String(name).toLowerCase());
  if (cls === "templar" && tp && ICONS[tp.id]) return ICONS[tp.id];
  return fromCls(cls) || (tp && ICONS[tp.id]) || Object.keys(CLASS_ICONS).map(fromCls).find(Boolean) || null;
}
const chImg = (src, alt) => src ? `<img class="chic" src="${src}" alt="${esc(alt || "")}" loading="lazy">` : `<span class="chic none">✦</span>`;
const SLOT_TR = { helmet: "Kask", shoulders: "Omuzluk", chest: "Göğüslük", legs: "Bacaklık", gloves: "Eldiven", boots: "Bot", cape: "Pelerin", "main hand": "Ana el", "off-hand": "Yan el", necklace: "Kolye", earring: "Küpe", ring: "Yüzük", bracelet: "Bilezik", belt: "Kemer", amulet: "Muska", rune: "Rün", arcana: "Arcana", feather: "Tüy", wings: "Kanat" };
const SLOT_EMO_UNUSED = { helmet: "🪖", shoulders: "🛡", chest: "🥋", legs: "👖", gloves: "🧤", boots: "🥾", cape: "🧣", "main hand": "⚔", "off-hand": "🛡", necklace: "📿", earring: "💎", ring: "💍", bracelet: "⭕", belt: "🎗", amulet: "🔮", rune: "🔷", arcana: "🃏", feather: "🪶", wings: "🪽" };
function rChar() {
  const c = CH, cls = KEY_CLASS[(c.classKey || "").toLowerCase()] || CLS;
  const sameCls = cls === CLS;
  const stEq = c.stigmas.filter(s => s.equipped).map(s => s.name);
  const nameToId = n => Object.values(ALL).find(x => x.ad.toLowerCase() === n.toLowerCase());
  const T3 = T();
  const specSum = a => { const ca = clsActive(cls, a.name); if (!ca) return ""; const mine = specMine(a.name), rec = specRec(ca, a.level), ks = mine && mine.length ? mine : rec;
    const ok = !mine || !mine.length || rec.every(k => mine.includes(k));
    return ks.length ? `<div class="spec-sum">${ks.map(k => `<span class="chip c-${k} small" title="${esc(ca.opts[k])}"><b>${RENK[k]}</b></span>`).join("")}<span class="mut small">${mine && mine.length ? (ok ? " takılı ✅" : " takılı ⚠") : " önerilen ⭐"}</span></div>` : ""; };
  const actRows = c.actives.map((a, i) => { const n = slots(a.level), nx = T3.find(v => v > a.level);
    return `<tr class="clk" data-chsk="actives:${i}" title="Özellikleri gör"><td>${chImg(nameIcon(a.name, cls), a.name)}</td><td>${esc(a.name)}${specSum(a)}</td><td><b>${a.level}</b></td><td class="nowrap">${n}/3 yuva${nx ? `<div class="mut small">+${nx - a.level} → ${nx}</div>` : " ✅"}</td></tr>`; }).join("");
  const pasRows = c.passives.map((a, i) => { return `<tr class="clk" data-chsk="passives:${i}" title="Özellikleri gör"><td>${chImg(nameIcon(a.name, cls), a.name)}</td><td>${esc(a.name)}</td><td><b>${a.level}</b></td></tr>`; }).join("");
  const stRows = c.stigmas.map((s, i) => `<tr class="clk ${s.equipped ? "" : "dim"}" data-chsk="stigmas:${i}" title="Özellikleri gör"><td>${chImg(nameIcon(s.name, cls), s.name)}</td><td>${esc(s.name)}</td><td><b>${s.level}</b></td><td>${s.equipped ? '<span class="chip c-y small">takılı</span>' : '<span class="mut small">takılı değil</span>'}</td></tr>`).join("");
  const eqRows = c.equipment.map((e, ei) => { const k = String(e.slot).toLowerCase(), q = e.enchant >= 10 ? "ok" : e.enchant ? "warn" : "bad";
    const rc = /^#[0-9a-f]{3,8}$/i.test(e.rarity || "") ? e.rarity : "#39404d";
    const pic = e.icon ? `<span class="eqic" style="--rc:${rc}"><img src="${esc(e.icon)}" alt="" loading="lazy" onerror="this.parentNode.classList.add('noimg');this.remove()"><b class="eqen">${e.enchant ? "+" + e.enchant : ""}</b></span>`
      : `<span class="eqic noimg" style="--rc:${rc}"><b class="eqen">${e.enchant ? "+" + e.enchant : ""}</b></span>`;
    return `<tr class="clk" data-cheq="${ei}" title="Özellikleri gör"><td>${pic}</td><td><div>${esc(e.item)}</div><div class="mut small">${esc(SLOT_TR[k] || e.slot)}</div></td><td class="${q}"><b>${e.enchant ? "+" + e.enchant : "—"}</b></td></tr>`; }).join("");
  const dvRows = Object.entries(c.daevanion).map(([b, d]) => `<tr><td>${b[0].toUpperCase() + b.slice(1)}</td><td><div class="bar"><i style="width:${Math.round(d.open / d.total * 100)}%"></i></div></td><td>${d.open}/${d.total}</td></tr>`).join("");
  const deity = Object.entries(c.deity).map(([k, v]) => `<tr><td>${esc(k)}</td><td><b>${v.value}</b></td><td class="mut small">${esc(v.effect)}</td></tr>`).join("");
  const prim = Object.entries(c.primary).map(([k, v]) => `<span class="lvl on"><b>${v}</b> ${esc(k)}</span>`).join("");
  return `<div class="card chhead"><div><div class="nm" style="font-size:18px">${esc(c.name)} <span class="mut">· ${esc(c.server)} · ${esc(c.classKey)} · Lv. ${c.level}${c.legion ? " · " + esc(c.legion) : ""}</span></div>
      <div class="lvlrow"><span class="lvl on"><b>${c.combatPower.toLocaleString("tr-TR")}</b> Savaş gücü</span><span class="lvl on"><b>${c.itemLevel.toLocaleString("tr-TR")}</b> Item level</span></div>
      <p class="small">Veri: <a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.name)} — MetaBot.GG Armory</a> · ${new Date(c.at).toLocaleString("tr-TR")}</p></div>
      <div class="lv"><button class="btn pri" id="chapply">Seviyeleri uygulamaya aktar</button><button class="btn" id="chai" ${gemApi() && GEM_HAS_KEY ? "" : "disabled"} title="Yapay Zeka sekmesinde API anahtarı gerekli">Yapay zeka ile değerlendir</button></div></div>
    <div class="card"><div class="sec" style="margin-top:0">Eksikler ve öneriler — ${MODES[S.mode].ad}</div><ul class="gaps">${charGaps(c, cls).map(g => `<li>${g}</li>`).join("")}</ul></div>
    <div class="grid2">
      <div class="card"><div class="sec" style="margin-top:0">Aktif yetenekler</div><table>${actRows}</table></div>
      <div class="card"><div class="sec" style="margin-top:0">Pasifler</div><table>${pasRows}</table>
        <div class="sec">Stigmalar</div><table>${stRows}</table></div>
      <div class="card"><div class="sec" style="margin-top:0">Ekipman</div><table>${eqRows}</table></div>
      <div class="card"><div class="sec" style="margin-top:0">Statlar</div><div class="lvlrow">${prim}</div><table style="margin-top:8px">${deity}</table>
        <div class="sec">Daevanion</div><table>${dvRows}</table></div>
    </div>`;
}
function charGaps(c, cls) {
  // Veri eksik geldiyse yanlış öneri verme
  if (!c.actives.length || !c.equipment.length) return [`⚠ MetaBot sayfası tam okunamadı (${!c.actives.length ? "yetenekler" : ""}${!c.actives.length && !c.equipment.length ? " ve " : ""}${!c.equipment.length ? "ekipman" : ""} boş geldi), bu yüzden öneri vermiyorum. Birkaç saniye sonra <b>Sorgula</b>'ya tekrar bas.${c.diag ? ` <span class="mut small">(${esc(c.diag)})</span>` : ""}`];
  const g = [], t = T(), role = CLS_ROLE[cls];
  // yetenek yuvaları
  const near = c.actives.filter(a => { const nx = t.find(v => v > a.level); return nx && nx - a.level <= 2; });
  if (near.length) g.push(`🔓 Yeni specialty yuvasına yakın: ${near.map(a => `<b>${esc(a.name)}</b> ${a.level} → ${t.find(v => v > a.level)}`).join(", ")}. Daevanion düğümü, ekipman ya da Arcana ile +1/+2 bonus yeter.`);
  const low = c.passives.filter(p => p.level < 10);
  if (low.length) g.push(`📉 Düşük pasifler: ${low.map(p => `${esc(p.name)} (${p.level})`).join(", ")}. Pasif puanlarını Pasifler sekmesindeki kutuya girersen dağılımı veririm.`);
  // stigma
  if (cls === CLS) {
    const rec = STIGMA_SET[S.mode].set.map(id => ALL[id].ad);
    const eq = c.stigmas.filter(s => s.equipped && s.level > 0).map(s => s.name);
    const missing = rec.filter(n => !eq.some(e => e.toLowerCase() === n.toLowerCase()));
    if (missing.length) g.push(`🔁 ${MODES[S.mode].ad} için önerilen stigmalar: <b>${rec.join(", ")}</b>. Takılı olmayan: ${missing.join(", ")}.`);
    const lowSt = c.stigmas.filter(s => rec.some(r => r.toLowerCase() === s.name.toLowerCase()) && s.level < 10);
    if (lowSt.length) g.push(`⬆ Önerilen stigmalardan yükseltilecek: ${lowSt.map(s => `${esc(s.name)} ${s.level} → 10`).join(", ")}.`);
  }
  // ekipman
  const noEnc = c.equipment.filter(e => !/rune|arcana|amulet/i.test(e.slot) && e.enchant < 10);
  if (noEnc.length) g.push(`🔨 +10'a çıkmamış ekipman: ${noEnc.map(e => `${esc(e.slot)} (${e.enchant ? "+" + e.enchant : "+0"})`).join(", ")}. +10'a kadar güçlendirme garantili.`);
  const arc = c.equipment.filter(e => /arcana/i.test(e.slot));
  if (arc.length < 5) g.push(`🃏 Arcana yuvası boş: ${5 - arc.length} adet. Transcendence zindanlarından Arcana topla.`);
  // daevanion
  const dv = c.daevanion;
  if (dv.ariel && dv.ariel.open === 0 && S.mode !== "pvp") g.push(`🌳 <b>Ariel tahtası boş</b> (0/${dv.ariel.total}). Sadece PvE'de işler; zindan için büyük güç (Ascension Trial'dan Ariel parçası).`);
  if (dv.azphel && S.mode === "pvp" && dv.azphel.open / dv.azphel.total < 0.3) g.push(`🌳 Azphel (PvP tahtası) ${dv.azphel.open}/${dv.azphel.total}. PvP için savaş alanı kazanıp Azphel parçası topla.`);
  const norm = ["nezekan", "zikel", "vaizel", "triniel"].filter(b => dv[b] && dv[b].open < dv[b].total);
  if (norm.length) g.push(`🌳 Eksik normal tahtalar: ${norm.map(b => `${b[0].toUpperCase() + b.slice(1)} ${dv[b].open}/${dv[b].total}`).join(", ")}. Yetenek düğümleri (Σ ve yeşil) öncelikli.`);
  // deity statları
  const want = { tank: ["Space [Israphel]", "Justice [Nezekan]", "Life [Yustiel]"], healer: ["Life [Yustiel]", "Wisdom [Lumiel]", "Time [Siel]"], support: ["Time [Siel]", "Life [Yustiel]", "Destruction [Zikel]"], bruiser: ["Destruction [Zikel]", "Death [Triniel]", "Time [Siel]"], dps: ["Destruction [Zikel]", "Death [Triniel]", "Time [Siel]"] }[role];
  const pvpWant = ["Freedom [Vaizel]", "Illusion [Kaisinel]", "Space [Israphel]"];
  const ws = S.mode === "pvp" ? pvpWant : want;
  const lowD = ws.filter(k => c.deity[k] && c.deity[k].value < 30);
  if (lowD.length) g.push(`✨ ${MODES[S.mode].ad} için önemli tanrı statları düşük: ${lowD.map(k => `${k} ${c.deity[k].value}`).join(", ")}. Pantheon heykelleri/tabloları, bilezik ve Arcana bu statları verir.`);
  if (!g.length) g.push("Belirgin bir eksik bulunamadı 👍");
  return g;
}
function applyChar() {
  const c = CH, cls = KEY_CLASS[(c.classKey || "").toLowerCase()];
  if (cls && cls !== CLS) applyClass(cls);
  const find = n => Object.values(ALL).find(x => x.ad.toLowerCase() === n.toLowerCase());
  let n = 0;
  for (const a of [...c.actives, ...c.passives]) { const x = find(a.name); if (!x || !S.lv[x.id]) continue;
    const lvl = a.level; let base = S.lv[x.id][0], bon = S.lv[x.id][1];
    if (lvl - bon >= 1 && lvl - bon <= 10) base = lvl - bon; else { base = Math.min(10, lvl); bon = lvl - base; }
    S.lv[x.id] = [base, Math.max(0, bon)]; n++; }
  for (const s of c.stigmas) { const x = find(s.name); if (x && S.st[x.id] != null && s.level > 0) { S.st[x.id] = s.level; n++; } }
  S.chApplied = Date.now(); save(); return n;
}
async function charLookup(pick) {
  const api = gemApi(); if (!api) return;
  S.chName = (document.getElementById("chname") || {}).value?.trim() || S.chName; S.chRegion = (document.getElementById("chreg") || {}).value || S.chRegion;
  S.chServer = (document.getElementById("chsrv") || {}).value ?? S.chServer; if (S.chServer && !AION_SERVERS.includes(S.chServer)) S.chServer = AION_SERVERS.find(n => n.toLowerCase() === S.chServer.toLowerCase()) || ""; S.chCls = (document.getElementById("chcls") || {}).value || S.chCls; save();
  if (!S.chName) { CH_ERR = "Nick gir"; render(); return; }
  CH_BUSY = true; CH_ERR = null; render();
  try {
    const r = await api.lookup_character(S.chName, S.chRegion || "eu", pick ? pick.serverName : (S.chServer || ""), CLASS_KEY[S.chCls] || "");
    if (r && r.ok) { CH = Object.assign(r, { at: Date.now() }); CH_MATCH = null; S.chLast = CH; save(); }
    else { CH_ERR = { code: r && r.code, error: (r && r.error) || "Sorgu başarısız", detail: r && r.detail }; CH_MATCH = r && r.matches && r.matches.length ? r.matches : null; }
  } catch (e) { CH_ERR = { code: 0, error: String(e.message || e) }; }
  CH_BUSY = false; render();
}
R.kar = rKar2;
if (S.chLast) CH = S.chLast;
document.addEventListener("click", e => {
  const id = e.target.id, m = e.target.closest("[data-chm]");
  if (id === "chgo") charLookup();
  else if (m) { const pick = CH_MATCH[+m.dataset.chm]; S.chServer = pick.serverName; charLookup(pick); }
  else if (id === "chapply") { const n = applyChar(); CH_ERR = null; render(); const b = document.getElementById("chapply"); if (b) b.textContent = `✓ ${n} seviye aktarıldı`; }
  else if (id === "chai") { TAB = "ai"; gemRun("char"); window.scrollTo(0, 0); }
});

// ---------- Karakter: yeteneğe / eşyaya tıklayınca özellik penceresi ----------
let CH_POP = null; // {kind, i, html}
const ITEM_CACHE = {};
const ITEM_TR = { "enhancement": "Güçlendirme", "amplified enhancement": "Ek güçlendirme", "item level": "Eşya seviyesi", "soul bind rate": "Ruh bağlama oranı",
  "main stats": "Ana statlar", "bonus stats": "Ek statlar", "defense": "Savunma", "attack": "Saldırı", "hp": "HP", "mp": "MP", "critical hit resist": "Kritik vuruş direnci",
  "critical damage defense": "Kritik hasar savunması", "natural mp regen": "Doğal MP yenilenmesi", "natural hp regen": "Doğal HP yenilenmesi", "accuracy bonus": "İsabet bonusu", "accuracy": "İsabet",
  "critical hit": "Kritik vuruş", "critical damage": "Kritik hasar", "evasion": "Kaçınma", "block": "Blok", "parry": "Savuşturma", "magic boost": "Büyü gücü", "magic resist": "Büyü direnci",
  "attack speed": "Saldırı hızı", "casting speed": "Büyü hızı", "movement speed": "Hareket hızı", "combat speed": "Savaş hızı", "damage boost": "Hasar artışı", "damage tolerance": "Hasar toleransı",
  "pve damage boost": "PvE hasar artışı", "pvp damage boost": "PvP hasar artışı", "pve damage tolerance": "PvE hasar toleransı", "pvp damage tolerance": "PvP hasar toleransı",
  "cooldown reduction": "Cooldown azaltma", "healing boost": "İyileştirme artışı", "multi-hit chance": "Çoklu vuruş şansı", "set bonus": "Set bonusu", "set effects": "Set etkileri",
  "dexterity": "Çeviklik", "might": "Güç", "intelligence": "Zeka", "constitution": "Dayanıklılık", "precision": "Hassasiyet", "willpower": "İrade",
  "weapon damage tolerance": "Silah hasarı toleransı", "weapon damage boost": "Silah hasarı artışı", "manastones": "Manataşları", "physical defense": "Fiziksel savunma", "magic defense": "Büyü savunması",
  "item skills": "Eşya yetenekleri", "evasion bonus": "Kaçınma bonusu", "magic accuracy": "Büyü isabeti", "set effect": "Set etkisi",
  "unique": "Eşsiz", "legendary": "Efsanevi", "epic": "Destansı", "rare": "Nadir", "common": "Sıradan", "heroic": "Kahramanlık", "mythic": "Mitik" };
const trItem = t => { const k = String(t).toLowerCase().replace(/\s*\d+\/\d+$/, ""); const m = /(\d+\/\d+)$/.exec(t); return (ITEM_TR[k] || t.replace(/\s*\d+\/\d+$/, "")) + (m ? " " + m[1] : ""); };
function skillInfo(name, cls) {
  const n = String(name).toLowerCase();
  if (cls === "templar") {
    const a = TEMPLAR.ACTIVES.find(x => x.ad.toLowerCase() === n), p = TEMPLAR.PASSIVES.find(x => x.ad.toLowerCase() === n), st = TEMPLAR.STIGMAS.find(x => x.ad.toLowerCase() === n);
    if (a) return { d: a.acik, cd: a.cd, specs: Object.keys(a.opts).map(k => ({ req: k === "s16" ? T()[2] : k === "o" ? T()[1] : T()[0], t: `${RENK[k]}: ${a.opts[k]}` })) };
    if (p) return { d: p.etki };
    if (st) return { d: st.acik, cd: st.cd, locks: st.sv };
  }
  const raw = CLASS_RAW[cls];
  const all = raw ? [...raw.actives, ...raw.passives, ...raw.stigmas] : Object.values(CLASS_RAW).flatMap(r => [...r.actives, ...r.passives, ...r.stigmas]);
  const x = all.find(y => y.name.toLowerCase() === n);
  if (!x) return null;
  const tr = x.tr || {};
  const lvMap = { 8: T()[0], 12: T()[1], 16: T()[2] };
  return { d: tr.d || x.desc, cd: x.cd, specs: (x.specs || []).map((sp, k) => { const m = /^Lv(\d+):\s*/.exec(sp); return { req: m ? (lvMap[+m[1]] || +m[1]) : 0, t: (tr.s && tr.s[k]) || sp.replace(/^Lv\d+:\s*/, "") }; }), locks: x.lv ? Object.fromEntries(Object.keys(x.lv).map(k => [k, (tr.lv && tr.lv[k]) || x.lv[k]])) : null };
}
const CLS_ACT_CACHE = {};
function clsActive(cls, name) {
  const list = cls === "templar" ? TEMPLAR.ACTIVES : cls === CLS ? ACTIVES : (CLS_ACT_CACHE[cls] = CLS_ACT_CACHE[cls] || (CLASS_RAW[cls] ? buildClass(cls).ACTIVES : []));
  return list.find(a => a.ad.toLowerCase() === String(name).toLowerCase());
}
function specMine(skName) { const m = ((S.chSpec || {})[CH.name] || {})[skName]; return Array.isArray(m) ? m : null; }
function specRec(a, lv) {
  const pri = (a.pri && (a.pri[S.mode] || a.pri.zindan)) || Object.keys(a.opts);
  return pri.filter(k => lv >= reqOf(a, k)).slice(0, slots(lv));
}
function specBlock(sk, cls, info) {
  const a = clsActive(cls, sk.name), lv = sk.level;
  if (!a) return info.specs && info.specs.length ? `<div class="sec">Specialty seçenekleri</div><ul class="pop-list">${info.specs.map(x => `<li class="${lv >= x.req ? "on" : "off"}">${lv >= x.req ? "✅" : "🔒"} <b>${x.req}. sv</b> ${esc(x.t)}</li>`).join("")}</ul>` : "";
  const rec = specRec(a, lv), mine = specMine(sk.name), n = slots(lv);
  let h = `<div class="sec">Specialty seçenekleri <span class="mut small">(açık yuva: ${n}/3 · ${MODES[S.mode].ad})</span></div>
    <p class="small mut">⭐ = bu mod için takılması gereken. Oyunda takılı olanlara dokunup <b>Takılı</b> işaretle; MetaBot bu bilgiyi vermiyor.</p><ul class="pop-list">`;
  for (const k of Object.keys(a.opts)) {
    const req = reqOf(a, k), open = lv >= req, isRec = rec.includes(k), isMine = mine && mine.includes(k);
    h += `<li class="${open ? "on" : "off"} spec-row ${isRec ? "rec" : ""} ${isMine ? "mine" : ""}">${open ? "" : "🔒 "}<b>${req}. sv</b> <span class="chip c-${k} small"><b>${RENK[k]}</b></span> ${esc(a.opts[k])}
      ${isRec ? '<span class="spec-tag rec">⭐ önerilen</span>' : ""}${open ? `<button class="spec-tog ${isMine ? "on" : ""}" data-chspec="${esc(sk.name)}|${k}">${isMine ? "✔ Takılı" : "Takılı mı?"}</button>` : ""}</li>`;
  }
  h += `</ul>`;
  if (mine && mine.length) {
    const miss = rec.filter(k => !mine.includes(k)), extra = mine.filter(k => !rec.includes(k));
    h += miss.length ? `<div class="note small">⚠ ${MODES[S.mode].ad} için önerilen: ${rec.map(k => `<b>${RENK[k]}</b>`).join(", ")}. Sende ${extra.length ? extra.map(k => `<b>${RENK[k]}</b>`).join(", ") + " takılı" : "eksik yuva var"} → ${miss.map(k => `<b>${RENK[k]}</b> (${esc(a.opts[k])})`).join(", ")} tak.</div>`
      : `<p class="small ok">✅ Takılı specialty'ler bu mod için doğru.</p>`;
  }
  return h;
}
function popSkill(kind, i) {
  const c = CH, cls = KEY_CLASS[(c.classKey || "").toLowerCase()] || CLS, sk = c[kind][i]; if (!sk) return "";
  const info = skillInfo(sk.name, cls), lv = sk.level, slug = String(sk.name).toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const kindTr = kind === "actives" ? "Aktif yetenek" : kind === "passives" ? "Pasif yetenek" : "Stigma";
  let h = `<div class="pop-head">${chImg(nameIcon(sk.name, cls), sk.name)}<div><div class="nm" style="font-size:17px">${esc(sk.name)}</div><div class="mut small">${kindTr} · <b>Lv. ${lv}</b>${info && info.cd ? ` · Cooldown ${esc(info.cd)}` : ""}${kind === "stigmas" ? (sk.equipped ? " · takılı" : " · takılı değil") : ""}</div></div></div>`;
  if (!info) h += `<p class="mut">Bu yeteneğin açıklaması uygulamada yok.</p>`;
  else {
    h += `<p>${esc(info.d || "")}</p>`;
    if (kind === "actives") h += specBlock(sk, cls, info);
    if (info.locks) h += `<div class="sec">Seviye kilitleri</div><ul class="pop-list">${[5, 10, 15, 20].filter(v => info.locks[v]).map(v => `<li class="${lv >= v ? "on" : "off"}">${lv >= v ? "✅" : "🔒"} <b>${v}. sv</b> ${esc(info.locks[v])}</li>`).join("")}</ul>`;
  }
  h += `<p class="small"><a href="https://metabot.gg/en/aion-2/skills/${slug}" target="_blank" rel="noopener">MetaBot'ta yetenek sayfası ↗</a></p>`;
  return h;
}
// ---- Eşya statı sınıfa/moda uygun mu? (genel öneri) ----
const STAT_ROLE = { templar: "tank", gladiator: "melee", assassin: "melee", ranger: "ranged", sorcerer: "magic", spiritmaster: "magic", cleric: "healer", chanter: "support" };
const ROLE_TR = { tank: "tank", melee: "yakın dövüş hasar", ranged: "uzak menzil hasar", magic: "büyü hasarı", healer: "iyileştirici", support: "destek" };
const DEF = ["hp", "defense", "damage tolerance", "critical hit resist", "critical damage defense", "magic resist", "natural hp regen", "constitution", "weapon damage tolerance"];
const OFF = ["attack", "accuracy", "critical hit", "critical damage", "attack speed", "combat speed", "damage boost", "weapon damage boost", "multi-hit chance", "might", "precision", "dexterity"];
const MAG = ["magic boost", "magic accuracy", "casting speed", "intelligence"];
const STAT_FIT = {
  tank: { good: [...DEF, "block", "parry", "pve damage tolerance", "pvp damage tolerance"], ok: ["accuracy", "attack", "evasion", "mp", "natural mp regen", "combat speed", "attack speed", "cooldown reduction", "might", "critical hit", "damage boost", "movement speed", "multi-hit chance", "weapon damage boost", "willpower", "dexterity", "precision"], bad: [...MAG, "healing boost", "critical damage"] },
  melee: { good: [...OFF, "pve damage boost", "pvp damage boost"], ok: [...DEF, "evasion", "parry", "mp", "natural mp regen", "cooldown reduction", "movement speed", "pve damage tolerance", "pvp damage tolerance"], bad: [...MAG, "healing boost", "block", "willpower"] },
  ranged: { good: [...OFF, "pve damage boost", "pvp damage boost"], ok: [...DEF, "evasion", "mp", "natural mp regen", "cooldown reduction", "movement speed", "pve damage tolerance", "pvp damage tolerance"], bad: [...MAG, "healing boost", "block", "parry", "willpower"] },
  magic: { good: [...MAG, "critical hit", "critical damage", "damage boost", "pve damage boost", "pvp damage boost", "mp", "combat speed", "cooldown reduction"], ok: [...DEF, "accuracy", "attack", "evasion", "natural mp regen", "willpower", "movement speed", "multi-hit chance", "pve damage tolerance", "pvp damage tolerance"], bad: ["block", "parry", "might", "healing boost", "weapon damage boost", "attack speed"] },
  healer: { good: ["healing boost", "mp", "natural mp regen", "casting speed", "cooldown reduction", "hp", "willpower", "magic resist", "damage tolerance", "critical hit resist", "critical damage defense", "combat speed", "pve damage tolerance", "pvp damage tolerance"], ok: ["magic boost", "magic accuracy", "accuracy", "defense", "evasion", "critical hit", "intelligence", "constitution", "movement speed", "attack", "natural hp regen"], bad: ["block", "parry", "weapon damage boost", "attack speed", "might", "critical damage", "multi-hit chance"] },
  support: { good: ["attack", "accuracy", "critical hit", "attack speed", "combat speed", "healing boost", "hp", "damage boost", "mp", "cooldown reduction", "pve damage boost", "pvp damage boost"], ok: [...DEF, "parry", "critical damage", "natural mp regen", "might", "willpower", "evasion", "movement speed", "multi-hit chance", "weapon damage boost", "pve damage tolerance", "pvp damage tolerance"], bad: [...MAG.filter(x => x !== "casting speed"), "block"] },
};
const statKey = n => String(n).toLowerCase().replace(/\s+bonus$/, "").trim();
function statFit(name, cls, mode) {
  const role = STAT_ROLE[cls]; if (!role) return null;
  const k = statKey(name), f = STAT_FIT[role];
  let v = f.good.includes(k) ? "good" : f.ok.includes(k) ? "ok" : f.bad.includes(k) ? "bad" : null;
  if (!v) return null;
  // PvP / PvE'ye özel statlar diğer modda zayıflar
  if (/^pvp /.test(k) && mode !== "pvp" && v === "good") v = "ok";
  if (/^pve /.test(k) && mode === "pvp" && v === "good") v = "ok";
  return v;
}
function bestStats(cls, mode, have) {
  const f = STAT_FIT[STAT_ROLE[cls]]; if (!f) return [];
  return f.good.filter(k => !(/^pvp /.test(k) && mode !== "pvp") && !(/^pve /.test(k) && mode === "pvp") && !/^(hp|defense|constitution|might|dexterity|intelligence|precision|willpower)$/.test(k) && !have.includes(k)).slice(0, 4);
}
// Manataşı olarak gelebilen statlar (MetaBot verisinde görülenler + yakın türler)
const MS_STATS = ["attack", "accuracy", "critical hit", "critical hit resist", "block", "evasion", "parry", "hp", "mp", "magic boost", "magic accuracy", "healing boost", "defense"];
const MS_PREF = {
  tank: ["block", "critical hit resist", "parry", "hp", "evasion", "defense"],
  melee: ["attack", "critical hit", "accuracy", "hp"],
  ranged: ["attack", "critical hit", "accuracy", "evasion"],
  magic: ["magic boost", "magic accuracy", "critical hit", "mp"],
  healer: ["healing boost", "mp", "hp", "critical hit resist"],
  support: ["attack", "accuracy", "critical hit", "healing boost"],
};
function msBest(cls, mode, have) {
  const pref = MS_PREF[STAT_ROLE[cls]] || [];
  // PvP'de kritik direnç tank dışı rollerde de değerli
  const list = mode === "pvp" && STAT_ROLE[cls] !== "tank" ? [...pref.slice(0, 2), "critical hit resist", ...pref.slice(2)] : pref;
  return list.filter((k, i, a) => a.indexOf(k) === i && !have.includes(k)).slice(0, 2);
}
// Oyundaki İngilizce adı (oyun İngilizce olduğu için önerinin yanına yazılır)
const EN_FIX = { hp: "HP", mp: "MP", pve: "PvE", pvp: "PvP" };
function enStat(k, ms) {
  if (ms && /^(accuracy|evasion)$/.test(k)) k += " bonus";
  return k.split(" ").map(w => EN_FIX[w] || (w === "of" ? w : w[0].toUpperCase() + w.slice(1))).join(" ").replace(/^Multi-hit/, "Multi-Hit");
}
const FIT_MARK = { good: '<span class="fit good" title="Sana uygun">✅</span>', ok: '<span class="fit ok" title="İdare eder">➖</span>', bad: '<span class="fit bad" title="Sana uygun değil">⚠</span>' };
function itemDetailHtml(e, lines) {
  // satırları başlık / ad-değer çiftlerine ayır
  const L = lines.slice(), out = [];
  let i = 0;
  while (i < L.length && !/^(enhancement|item level)$/i.test(L[i])) i++;
  let sec = null;
  for (; i < L.length; i++) {
    const l = L[i];
    if (/^view item page$/i.test(l) || /^rolled values/i.test(l)) continue;
    const v = L[i + 1], isVal = v != null && /^[+\-]?[\d.,]+%?( \/ \d+)?( [+\-][\d.,]+%?)?$/.test(v);
    if (!isVal && l === l.toUpperCase() && /[A-Z]/.test(l) && !/^[+\d]/.test(l)) { sec = { t: trItem(l), raw: l.toLowerCase(), rows: [] }; out.push(sec); continue; }
    if (isVal) { if (!sec) { sec = { t: "", raw: "", rows: [] }; out.push(sec); } sec.rows.push([trItem(l), v, l]); i++; }
    else if (sec) sec.rows.push([trItem(l), ""]);
  }
  const cls = KEY_CLASS[(CH.classKey || "").toLowerCase()] || CLS, mode = S.mode, judged = s => /^(bonus stats|manastones)/.test(s.raw || "");
  const tips = [];
  // güçlendirme sınırı
  const enh = (out[0] && out[0].rows.find(r => /^enhancement$/i.test(r[2] || ""))) || null, em = enh && /^\+?(\d+) \/ (\d+)$/.exec(enh[1]);
  if (em && +em[1] < +em[2]) tips.push(`🔨 Güçlendirme +${em[1]}/${em[2]}: <b>+${em[2]}</b>'e kadar yükseltebilirsin.`);
  const html = out.map(s => {
    const j = judged(s);
    const isMs = /^manastones/.test(s.raw || ""), have = s.rows.map(r => statKey(r[2]));
    const alts = !j ? [] : isMs ? msBest(cls, mode, have) : bestStats(cls, mode, have).slice(0, 2);
    const altTxt = alts.map(k => `<b>${esc(trItem(k))}</b> <span class="en-name">(${esc(enStat(k, isMs))})</span>`).join(" ya da ");
    const rows = s.rows.map(([a, b, en]) => {
      const f = j ? statFit(en, cls, mode) : null;
      const sug = f && f !== "good" && alts.length ? `<div class="fit-sug">→ ${isMs ? `yerine ${altTxt} manataşı tak` : `yeniden belirlemede ${altTxt} tercih et`}${f === "ok" ? " <span class='mut'>(şart değil, fırsat olunca)</span>" : ""}</div>` : "";
      return `<tr class="${f ? "fit-" + f : ""}"><td>${f ? FIT_MARK[f] + " " : ""}${esc(a)}${sug}</td><td><b>${esc(b)}</b></td></tr>`;
    }).join("");
    if (j && alts.length) {
      const bad = s.rows.filter(r => statFit(r[2], cls, mode) === "bad"), ok = s.rows.filter(r => statFit(r[2], cls, mode) === "ok");
      const name = CLASS_NAME[cls] || cls;
      if (bad.length) tips.push(isMs ? `💎 Önce değiştir: ${bad.map(r => esc(trItem(r[2]))).join(", ")} ${name} için uygun değil → yerine ${altTxt} manataşı tak.`
        : `🎲 Ek statlarda ${bad.map(r => esc(trItem(r[2]))).join(", ")} işine yaramıyor. Daha iyi ek statlı parça ya da yeniden belirlemede ${altTxt} tercih et.`);
      if (ok.length) tips.push(isMs ? `💎 Fırsat olunca: ${ok.map(r => esc(trItem(r[2]))).join(", ")} yerine ${altTxt} manataşı daha verimli (${MODES[mode].ad}).`
        : `🎲 Ek statlardaki ${ok.map(r => esc(trItem(r[2]))).join(", ")} idare eder; yeni parçada ${altTxt} daha iyi olur.`);
    }
    return `${s.t ? `<div class="sec">${esc(s.t)}</div>` : ""}<table class="pop-tab">${rows}</table>`;
  }).join("");
  const head = `<div class="note small">Değerlendirme: <b>${esc(CLASS_NAME[cls] || cls)}</b> (${ROLE_TR[STAT_ROLE[cls]] || ""}) · <b>${MODES[mode].ad}</b> için. ✅ uygun · ➖ idare eder · ⚠ uygun değil</div>`;
  return head + html + (tips.length ? `<div class="sec">Öneriler</div><ul class="pop-list">${tips.map(t => `<li>${t}</li>`).join("")}</ul>` : `<p class="small ok">✅ Bu eşyanın ek statları ve manataşları ${MODES[mode].ad} için uygun; değiştirmene gerek yok.</p>`) + `<p class="small mut">Genel öneri; üstteki moddan (Zindan / Kasma / PvP) değiştirebilirsin.</p>`;
}
function popItem(i) {
  const e = CH.equipment[i]; if (!e) return "";
  const k = String(e.slot).toLowerCase(), rc = /^#[0-9a-f]{3,8}$/i.test(e.rarity || "") ? e.rarity : "#39404d";
  let h = `<div class="pop-head"><span class="eqic" style="--rc:${rc}">${e.icon ? `<img src="${esc(e.icon)}" alt="">` : ""}<b class="eqen">${e.enchant ? "+" + e.enchant : ""}</b></span><div><div class="nm" style="font-size:17px;color:${rc}">${esc(e.item)}</div><div class="mut small">${esc(SLOT_TR[k] || e.slot)}${e.enchant ? ` · +${e.enchant}` : ""}</div></div></div>`;
  const key = CH.url + "|" + i, d = ITEM_CACHE[key];
  if (!d) h += `<div class="prog"><div class="small">⏳ Eşya detayları MetaBot'tan okunuyor…</div><div class="prog-bar"><i style="width:60%"></i></div></div>`;
  else if (!d.ok) h += `<p class="bad small">⚠ ${esc(d.error || "Detay okunamadı")}</p>`;
  else h += itemDetailHtml(e, d.lines) || `<pre class="small">${esc(d.lines.join("\n"))}</pre>`;
  h += `<p class="small mut">Değerler resmi karakter verisinden (MetaBot.GG).</p>`;
  return h;
}
async function loadItem(i) {
  const e = CH.equipment[i], key = CH.url + "|" + i, api = window.pywebview && window.pywebview.api;
  if (ITEM_CACHE[key]) return;
  if (!api || !api.item_detail) { ITEM_CACHE[key] = { ok: false, error: "Eşya detayları sadece uygulamada (bilgisayar/telefon) okunabilir." }; return; }
  const label = e.label || `${e.slot}: ${e.item}${e.enchant ? " +" + e.enchant : ""} — details`;
  try { ITEM_CACHE[key] = await api.item_detail(CH.url, label); } catch (x) { ITEM_CACHE[key] = { ok: false, error: String(x) }; }
}
function showPop() {
  let el = document.getElementById("chpop");
  if (!CH_POP) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement("div"); el.id = "chpop"; document.body.appendChild(el); }
  el.innerHTML = `<div class="pop-bg" data-popclose="1"></div><div class="pop-box" role="dialog" aria-modal="true"><button class="pop-x" data-popclose="1" aria-label="Kapat">×</button>${CH_POP.kind === "item" ? popItem(CH_POP.i) : popSkill(CH_POP.kind, CH_POP.i)}</div>`;
}
document.addEventListener("click", async e => {
  if (e.target.closest("[data-popclose]")) { CH_POP = null; showPop(); return; }
  const sk = e.target.closest("[data-chsk]"), eq = e.target.closest("[data-cheq]");
  if (sk && CH) { const [kind, i] = sk.dataset.chsk.split(":"); CH_POP = { kind, i: +i }; showPop(); }
  else if (eq && CH) { const i = +eq.dataset.cheq; CH_POP = { kind: "item", i }; showPop(); await loadItem(i); if (CH_POP && CH_POP.kind === "item" && CH_POP.i === i) showPop(); }
});
document.addEventListener("keydown", e => { if (e.key === "Escape" && CH_POP) { CH_POP = null; showPop(); } });
document.addEventListener("click", e => {
  const b = e.target.closest("[data-chspec]"); if (!b || !CH) return;
  const [name, k] = b.dataset.chspec.split("|"), c = CH.actives.find(x => x.name === name); if (!c) return;
  S.chSpec = S.chSpec || {}; const per = (S.chSpec[CH.name] = S.chSpec[CH.name] || {}), cur = per[name] || [];
  if (cur.includes(k)) per[name] = cur.filter(x => x !== k);
  else { per[name] = [...cur, k]; while (per[name].length > slots(c.level)) per[name].shift(); }
  save(); const box = document.querySelector(".pop-box"), y = box ? box.scrollTop : 0; showPop(); const nb = document.querySelector(".pop-box"); if (nb) nb.scrollTop = y;
  const row = document.querySelector(`[data-chsk="actives:${CH.actives.indexOf(c)}"]`); if (row) { const y2 = window.scrollY; render(); window.scrollTo(0, y2); }
});
