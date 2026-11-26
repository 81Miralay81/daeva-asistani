// ---------------- Zanaat (craft): tarif seç → kaç tane → malzeme ağacı, ham malzeme listesi, adım adım yapım sırası
// Tarif verisi: SkeeveAN/Aion-DPS-Meter (MIT). Simge ve "nereden" bilgisi NCSOFT'un resmi eşya sayfasından.
let CR = null, CRB = false, CRP = "Alchemy", CRQ = "", CRSEL = null, CRN = 1, CRX = {}, CRM = null, CRMAP = null;
const CR_MES = [["Alchemy", "⚗️ Simya"], ["Cooking", "🍲 Aşçılık"], ["Blacksmithing", "⚔️ Demircilik"], ["Tailoring", "🛡️ Terzilik"], ["Jewelcrafting", "💍 Kuyumculuk"]];
const CR_MES_TR = Object.fromEntries(CR_MES.map(([k, v]) => [k, v.split(" ").slice(1).join(" ")]));
function crRace() { return /asmo/i.test((S.prof && S.prof.race) || "") ? "D" : "L"; }
function crHave() { S.crHave = S.crHave || {}; return S.crHave; }
function crName(id) { return (CR.names[id] || (CR.info[id] && CR.info[id].name) || `Eşya #${id}`); }
function crIcon(id, sz) { const i = CR.info[id]; return i && i.icon ? `<img src="${esc(i.icon)}" style="width:${sz || 24}px;height:${sz || 24}px;vertical-align:middle;border-radius:4px;margin-right:6px">` : `<span style="display:inline-block;width:${sz || 24}px;height:${sz || 24}px;margin-right:6px;vertical-align:middle;border-radius:4px;background:#2a3140"></span>`; }
function crSrc(id) { const i = CR.info[id]; if (!i || !i.sources) return ""; return i.sources.map(s => (typeof SRC_TR !== "undefined" && SRC_TR[s]) || s).join(", "); }
function crByProduct() { if (!CR._bp) { CR._bp = {}; for (const r of CR.recipes) if (r.race === crRace() && !CR._bp[r.p]) CR._bp[r.p] = r; } return CR._bp; }
function crRecipe(id) { return CR.recipes.find(r => r.id === id); }

async function crLoad() { const a = DAPI(); if (!a || !a.craft_data || CRB) return; CRB = true; try { CR = await a.craft_data(); } catch (e) { CR = null; } CRB = false; if (TAB === "zan") render(); }
let CR_ASK = new Set(), CR_T = null;
function crWant(ids) { // görünen eşyaların simge/kaynak bilgisini arka planda çek
  if (!CR) return; ids.forEach(i => { if (!CR.info[i]) CR_ASK.add(String(i)); });
  if (!CR_ASK.size || CR_T) return;
  CR_T = setTimeout(async () => { const want = [...CR_ASK].slice(0, 40); want.forEach(i => CR_ASK.delete(i)); CR_T = null;
    try { const r = await DAPI().craft_items(want, (S.prof && S.prof.region) || "eu"); Object.assign(CR.info, r); } catch (e) { want.forEach(i => CR.info[i] = { err: 1 }); }
    if (TAB === "zan") { const y = window.scrollY; render(); window.scrollTo(0, y); } }, 150);
}

// Hesap: kaç kere üretilecek, ham malzemeler, yapım sırası. Elindekiler önce düşülür.
function crPlan(rid, qty) {
  const bp = crByProduct(), have = Object.assign({}, crHave()), raw = {}, steps = {}, order = [];
  function need(id, q, depth) {
    const h = Math.min(have[id] || 0, q); if (h) { have[id] -= h; q -= h; } if (q <= 0) return;
    const r = bp[id];
    if (!r || depth > 8) { raw[id] = (raw[id] || 0) + q; return; }
    const times = Math.ceil(q / (r.n || 1));
    for (const [mid, mq] of r.k) need(mid, mq * times, depth + 1);
    if (!steps[r.id]) { steps[r.id] = 0; order.push(r.id); } steps[r.id] += times;
  }
  const r = crRecipe(rid); const times = Math.ceil(qty / (r.n || 1));
  for (const [mid, mq] of r.k) need(mid, mq * times, 1);
  steps[r.id] = (steps[r.id] || 0) + times; if (!order.includes(r.id)) order.push(r.id);
  return { raw, steps, order };
}

function crTree(rid, mult, depth) {
  const r = crRecipe(rid), bp = crByProduct();
  return r.k.map(([mid, mq, alt]) => {
    const sub = bp[mid], key = rid + ":" + mid, open = CRX[key];
    const tot = mq * mult;
    return `<div style="margin-left:${depth * 18}px;padding:4px 0;border-bottom:1px solid #1f2633">
      ${sub ? `<button class="btn" data-crx="${key}" style="padding:0 6px;margin-right:4px">${open ? "▾" : "▸"}</button>` : `<span style="display:inline-block;width:26px"></span>`}
      <span data-crm="t${key}" style="cursor:pointer">${crIcon(mid, 22)}<b>${tot}×</b> <u>${esc(crName(mid))}</u></span>
      ${sub ? `<span class="mut small"> · üretilir (${esc(CR_MES_TR[sub.cat] || sub.cat)} Sv ${sub.lv})</span>` : `<span class="mut small"> · ${esc(crSrc(mid) || "ham malzeme")}</span>`}
      ${alt ? `<span class="mut small"> · yerine: ${alt.map(a => esc(crName(a[0]))).join(", ")}</span>` : ""}
    </div>${CRM === "t" + key ? crSources(mid, depth + 1) : ""}${sub && open ? crTree(sub.id, Math.ceil(tot / (sub.n || 1)), depth + 1) : ""}`;
  }).join("");
}

const CR_MAPTR = { World_L_A: "Elyos dünyası", World_D_A: "Asmodian dünyası", Abyss_Reshanta_A: "Abyss (Reshanta)" };
function crSources(id, depth) {
  id = String(id); const g = CR.gather && CR.gather[id], dr = (CR.drops && CR.drops[id]) || [], r = crByProduct()[id], inf = CR.info[id] || {};
  const rows = [];
  if (g && Object.keys(g.pts).length) {
    const mine = crRace() === "L" ? "World_L_A" : "World_D_A";
    const maps = Object.keys(g.pts).sort((a, b) => (b === mine) - (a === mine));
    rows.push(["#27ae60", "🌿 Toplama", "Kolay · ücretsiz", `${esc(g.kind)}: <b>${esc(g.node)}</b> toplama noktalarından (Öz Çıkarma ile) toplanır.${g.kind.startsWith("Odyle") ? " Yerde değil, havada süzülür; kanatla toplanır." : ""}<br>${maps.map(m => `<button class="btn" data-crmap="${id}|${m}" style="margin:4px 4px 0 0">🗺 ${esc(CR_MAPTR[m] || m)} — ${g.pts[m].length} bölge (tam ekran harita)</button>`).join("")}`]);
  }
  if (r) rows.push(["#3498db", "🔨 Üretim", "Orta · ücretsiz", `${esc(CR_MES_TR[r.cat] || r.cat)} (Sv ${r.lv}) ile üretilir: ${r.k.map(k => `${k[1]}× ${esc(crName(k[0]))}`).join(", ")}. <button class="btn" data-crs="${r.id}">Tarife git</button>`]);
  if (dr.length) rows.push(["#e67e22", "⚔️ Boss / zindan", "Zor · şansa bağlı", dr.slice(0, 6).map(d => `${esc(d.boss)} <span class="mut">(${esc(d.dungeon)}, ${esc(d.mode)})</span> — ${d.chance >= 100 ? `ortalama ${(d.chance / 100).toFixed(1)} adet` : `%${d.chance}`}`).join("<br>")]);
  const ns = (inf.sources || []).filter(x => x !== "Crafting");
  if (ns.length) rows.push(["#9b59b6", "📜 Diğer yollar", "NCSOFT bilgisi", ns.map(x => esc((typeof SRC_TR !== "undefined" && SRC_TR[x]) || x)).join(", ")]);
  rows.push(["#c0392b", "💰 Pazar (Market)", "Kolay · ücretli (Kina)", /\(Bound\)/.test(crName(id)) ? "Bağlı (Bound) eşya: pazarda satılmaz; genelde NPC mağazasından Kina ile alınır." : "Diğer oyunculardan Kina karşılığında satın alınabilir."]);
  if (rows.length === 1 && !inf.name) crWant([id]);
  return `<div style="margin:6px 0 8px ${depth * 18}px;padding:8px;background:#151a24;border-radius:8px">
    <div class="nm small" style="margin:0 0 6px">📦 ${esc(crName(id))} — nereden bulunur? <span class="mut">(kolaydan zora)</span></div>
    ${rows.map(([c, t, z, d]) => `<div style="border-left:4px solid ${c};padding:4px 8px;margin-bottom:6px"><b style="color:${c}">${t}</b> <span class="mut small">· ${z}</span><div class="small">${d}</div></div>`).join("")}
    </div>`;
}
// ---- Tam ekran harita (oyun istemcisinin yüksek çözünürlüklü karoları; tekerlekle yakınlaş)
const CR_TILES = "https://raw.githubusercontent.com/81Miralay81/daeva-asistani/main/harita_hd/";  // oyun istemcisi karoları, maskesi uygulanmış (Aion-DPS-Meter, MIT)
const CR_MAPDIR = { World_L_A: ["verteron", 8], World_D_A: ["altgard", 8], Abyss_Reshanta_A: ["abyss", 4] };
let CRLM = null;
function crMapOpen(id, map) {
  crMapClose();
  const md = CR_MAPDIR[map], hm = HARITA.maps[map]; if (!md || !hm) return;
  const W = hm.w, Hh = hm.h, n = md[1], ts = W / n;
  const o = document.createElement("div"); o.id = "crmapov";
  o.style.cssText = "position:fixed;inset:0;z-index:9000;background:rgba(6,9,14,.92);display:flex;flex-direction:column;padding:14px";
  const pts = (CR.gather[id] || { pts: {} }).pts[map] || [];
  o.innerHTML = `<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;color:#e8edf5">
      ${crIcon(id, 34)}<div><div style="font-size:18px;font-weight:700">${esc(crName(id))}</div>
      <div class="small" style="color:#9fb0c8">${esc(CR_MAPTR[map] || map)} · ${pts.length} toplama bölgesi · tekerlekle yakınlaş, sürükleyerek gez</div></div>
      <div style="flex:1"></div>
      <label class="small" style="color:#cfd8e6"><input type="checkbox" id="crroad" checked> Yollar</label>
      <label class="small" style="color:#cfd8e6"><input type="checkbox" id="crlbl" checked> Yer adları</label>
      <button class="btn" id="crfit">⤢ Noktalara git</button>
      <button class="btn" id="crclose" style="font-size:16px">✕ Kapat</button></div>
    <div id="crmapfs" style="flex:1;border-radius:12px;overflow:hidden;border:1px solid #2b3a52;background:#1e272c"></div>
    <div class="small" style="color:#9fb0c8;margin-top:8px">🟠 toplama bölgesi · 🏠 köy · 🏰 karakol · ✦ ışınlanma taşı · Harita: oyun istemcisi karoları (Aion-DPS-Meter, MIT)</div>`;
  document.body.appendChild(o);
  const mp = CRLM = L.map("crmapfs", { crs: L.CRS.Simple, minZoom: -4, maxZoom: 3, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 70, attributionControl: false, zoomControl: true,
    maxBounds: [[-Hh * 0.15, -W * 0.15], [Hh * 1.15, W * 1.15]] });
  const blank = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
  const Base = L.TileLayer.extend({ getTileUrl(c) { const x = c.x, y = n + c.y; if (x < 0 || y < 0 || x >= n || y >= n) return blank; return `${CR_TILES}${md[0]}/${x}_${y}.${this.options.ext}`; } });
  new Base("", { ext: "webp", tileSize: ts, minZoom: -4, maxZoom: 3, minNativeZoom: 0, maxNativeZoom: 0, noWrap: true, bounds: [[0, 0], [Hh, W]], errorTileUrl: blank, keepBuffer: 6 }).addTo(mp);
  const roads = new Base("", { ext: "png", tileSize: ts, minZoom: -4, maxZoom: 3, minNativeZoom: 0, maxNativeZoom: 0, noWrap: true, bounds: [[0, 0], [Hh, W]], errorTileUrl: blank, opacity: .85 });
  roads.getTileUrl = function (c) { const x = c.x, y = n + c.y; if (x < 0 || y < 0 || x >= n || y >= n) return blank; return `${CR_TILES}${md[0]}/${x}_${y}_p.webp`; };
  roads.addTo(mp);
  // haritadaki yer adlarını bu karolara çevir (Daeva haritası verisiyle küçük ölçek farkı var)
  const f = (CR.fit && CR.fit[map]) || [1, 0, 1, 0], inv = (la, ln) => [(la - f[3]) / f[2], (ln - f[1]) / f[0]];
  const lbl = L.layerGroup().addTo(mp), ICO = { village: ["🏠", 15, 700], occupation: ["🏰", 13, 600], teleport: ["✦", 11, 500], battlefield: ["⚔", 11, 500] };
  function drawLabels() { lbl.clearLayers(); const z = mp.getZoom();
    (hm.markers || []).forEach(x => { const s = ICO[x[0]]; if (!s) return; if (x[0] === "teleport" && z < -1.5) return; if ((x[0] === "occupation" || x[0] === "battlefield") && z < -2.5) return;
      L.marker(inv(x[4], x[3]), { interactive: false, icon: L.divIcon({ className: "", iconSize: null, html: `<div style="transform:translate(-50%,-50%);white-space:nowrap;font:${s[2]} ${s[1]}px system-ui;color:#fff;text-shadow:0 0 3px #000,0 0 6px #000,0 1px 2px #000">${s[0]} ${esc(x[1])}</div>` }) }).addTo(lbl); }); }
  drawLabels(); mp.on("zoomend", drawLabels);
  const gl = L.layerGroup().addTo(mp);
  pts.forEach(p => { L.circle(p, { radius: 60, color: "#ffb347", weight: 2, fillColor: "#ff8c1a", fillOpacity: .18, interactive: false }).addTo(gl);
    L.circleMarker(p, { radius: 8, color: "#fff", weight: 2, fillColor: "#ff8c1a", fillOpacity: 1 }).bindTooltip(`<b>${esc(crName(id))}</b><br>${esc((CR.gather[id] || {}).kind || "")}`, { direction: "top" }).addTo(gl); });
  const fit = () => pts.length ? mp.fitBounds(L.latLngBounds(pts).pad(0.35), { maxZoom: 0 }) : mp.fitBounds([[0, 0], [Hh, W]]);
  fit();
  document.getElementById("crclose").onclick = crMapClose;
  document.getElementById("crfit").onclick = fit;
  document.getElementById("crroad").onchange = e => e.target.checked ? roads.addTo(mp) : mp.removeLayer(roads);
  document.getElementById("crlbl").onchange = e => e.target.checked ? lbl.addTo(mp) : mp.removeLayer(lbl);
}
function crMapClose() { if (CRLM) { CRLM.remove(); CRLM = null; } const o = document.getElementById("crmapov"); if (o) o.remove(); }
document.addEventListener("keydown", e => { if (e.key === "Escape") crMapClose(); });

function rZan() {
  if (!DESK()) return `<div class="card">Zanaat sadece bilgisayar uygulamasında var.</div>`;
  if (!CR) { crLoad(); return `<div class="card">Tarifler yükleniyor…</div>`; }
  const race = crRace();
  const q = CRQ.trim().toLowerCase();
  let list = CR.recipes.filter(r => r.race === race && (q ? crName(r.p).toLowerCase().includes(q) || r.k.some(k => crName(k[0]).toLowerCase().includes(q)) : r.cat === CRP));
  list.sort((a, b) => a.lv - b.lv || crName(a.p).localeCompare(crName(b.p)));
  crWant(list.slice(0, 60).map(r => r.p));
  let h = `<div class="card"><div class="nm">🔨 Zanaat <span class="mut small">(${race === "L" ? "Elyos" : "Asmodian"} tarifleri)</span></div>
    <p class="mut small">1) Mesleği seç ya da ara · 2) Tarife tıkla · 3) Kaç tane istediğini yaz → neyin ne kadar gerektiğini, ham malzeme listesini ve sırayla ne üreteceğini görürsün. Elindekileri yazarsan hesaptan düşülür.</p>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin:6px 0">${CR_MES.map(([k, t]) => `<button class="${!q && CRP === k ? "on" : ""}" data-crp="${k}">${t}</button>`).join("")}</div>
    <input id="crq" value="${esc(CRQ)}" placeholder="Eşya ya da malzeme ara (örn. Orichalcum, Potion, Sword)" style="width:100%;max-width:420px"></div>`;
  h += `<div style="display:grid;grid-template-columns:minmax(260px,1fr) 2fr;gap:12px;align-items:start">`;
  h += `<div class="card" style="max-height:75vh;overflow:auto">${list.length ? list.slice(0, 300).map(r => `<div data-crs="${r.id}" style="cursor:pointer;padding:5px;border-radius:6px;${CRSEL === r.id ? "background:#2a3550" : ""}">${crIcon(r.p, 22)}${esc(crName(r.p))}${r.n > 1 ? ` <span class="mut">×${r.n}</span>` : ""}<span class="mut small" style="float:right">Sv ${r.lv}${r.learn !== "Auto" ? " · 📜" : ""}</span></div>`).join("") : '<div class="mut">Bulunamadı.</div>'}
    <p class="mut small">📜 = tarif kitabıyla öğrenilir.</p></div>`;
  h += `<div>${CRSEL ? crDetail() : '<div class="card mut">Soldan bir tarif seç.</div>'}</div></div>`;
  h += `<p class="mut small">Tarif verisi: Aion-DPS-Meter projesi (MIT lisansı); simgeler ve "nereden" bilgisi NCSOFT'un resmi eşya sayfasından.</p>`;
  return h;
}

function crDetail() {
  const r = crRecipe(CRSEL); if (!r) return "";
  const p = crPlan(r.id, CRN), times = Math.ceil(CRN / (r.n || 1));
  const rawIds = Object.keys(p.raw);
  crWant([r.p, ...r.k.map(k => k[0]), ...rawIds, ...p.order.map(id => crRecipe(id).p)]);
  const have = crHave();
  let h = `<div class="card"><div style="display:flex;align-items:center;gap:10px">${crIcon(r.p, 44)}<div><div class="nm" style="margin:0">${esc(crName(r.p))}</div>
    <div class="mut small">${esc(CR_MES_TR[r.cat] || r.cat)} · Ustalık Sv ${r.lv} · bir üretim ${r.n} adet verir${r.learn !== "Auto" ? " · tarif kitabı gerekir" : ""}${r.combo ? " · kombo şansı var" : ""}</div></div></div>
    <div style="margin:10px 0"><label>Kaç tane istiyorsun? <input id="crn" type="number" min="1" value="${CRN}" style="width:80px"></label> <span class="mut small">→ ${times} kez üretilecek</span></div>
    <div class="nm small" style="margin-top:8px">Malzemeler <span class="mut">(▸ ile alt tarifi aç)</span></div>${crTree(r.id, times, 0)}</div>`;
  h += `<div class="card"><div class="nm">🧺 Toplanacak / alınacak ham malzemeler</div>
    <p class="mut small">👉 Bir malzemenin adına tıkla: nereden bulunacağı (kolaydan zora) ve haritadaki yeri açılır. Alt tarifler dahil her şey açıldı. "Elimde" kutusuna sahip olduğun miktarı yaz, kalan otomatik hesaplanır.</p>
    <table>${rawIds.length ? rawIds.sort((a, b) => p.raw[b] - p.raw[a]).map(id => `<tr><td data-crm="r${id}" style="cursor:pointer">${crIcon(id, 22)}<u>${esc(crName(id))}</u></td><td><b>${p.raw[id]}</b> gerekli</td>
      <td class="small">elimde <input data-crh="${id}" type="number" min="0" value="${have[id] || 0}" style="width:64px"></td><td class="mut small">${esc(crSrc(id))}</td></tr>${CRM === "r" + id ? `<tr><td colspan="4">${crSources(id, 0)}</td></tr>` : ""}`).join("") : '<tr><td class="ok">Hepsi elinde var ✓</td></tr>'}</table></div>`;
  h += `<div class="card"><div class="nm">🪜 Adım adım yapım sırası</div><ol style="margin:6px 0;padding-left:20px">${p.order.map(id => { const s = crRecipe(id); return `<li style="margin:4px 0">${crIcon(s.p, 20)}<b>${p.steps[id]}×</b> üret: ${esc(crName(s.p))} <span class="mut small">(${esc(CR_MES_TR[s.cat] || s.cat)} Sv ${s.lv}${s.n > 1 ? `, her seferde ${s.n} adet` : ""})</span></li>`; }).join("")}</ol>
    <p class="mut small">Önce üstteki ara malzemeleri üret, en son asıl eşyayı. Başarısız üretim ve kombo bonusları hesaba katılmaz.</p></div>`;
  return h;
}

document.addEventListener("click", e => {
  const t = e.target.closest("[data-crp],[data-crs],[data-crx],[data-crm],[data-crmap]"); if (!t) return;
  if (t.dataset.crm) { CRM = CRM === t.dataset.crm ? null : t.dataset.crm; CRMAP = null; const y = window.scrollY; render(); window.scrollTo(0, y); return; }
  if (t.dataset.crmap) { const [id, map] = t.dataset.crmap.split("|"); crMapOpen(id, map); return; }
  if (t.dataset.crp) { CRP = t.dataset.crp; CRQ = ""; render(); }
  else if (t.dataset.crs) { CRSEL = +t.dataset.crs; CRN = 1; CRX = {}; CRM = null; CRMAP = null; render(); window.scrollTo(0, 0); }
  else if (t.dataset.crx) { CRX[t.dataset.crx] = !CRX[t.dataset.crx]; const y = window.scrollY; render(); window.scrollTo(0, y); }
});
document.addEventListener("change", e => {
  const t = e.target;
  if (t.id === "crn") { CRN = Math.max(1, Math.min(9999, +t.value || 1)); const y = window.scrollY; render(); window.scrollTo(0, y); }
  else if (t.dataset && t.dataset.crh) { const h = crHave(), v = Math.max(0, +t.value || 0); v ? h[t.dataset.crh] = v : delete h[t.dataset.crh]; save(); const y = window.scrollY; render(); window.scrollTo(0, y); }
});
let CRQT = null;
document.addEventListener("input", e => { if (e.target.id === "crq") { CRQ = e.target.value; clearTimeout(CRQT); CRQT = setTimeout(() => { render(); const i = document.getElementById("crq"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 300); } });
R.zan = rZan;
TABS.splice(TABS.findIndex(t => t[0] === "esy") + 1, 0, ["zan", "🔨 Zanaat"]);
