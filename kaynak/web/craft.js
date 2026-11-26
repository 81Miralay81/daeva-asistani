// ---------------- Zanaat (craft): tarif seç → kaç tane → malzeme ağacı, ham malzeme listesi, adım adım yapım sırası
// Tarif verisi: SkeeveAN/Aion-DPS-Meter (MIT). Simge ve "nereden" bilgisi NCSOFT'un resmi eşya sayfasından.
let CR = null, CRB = false, CRP = "Alchemy", CRQ = "", CRSEL = null, CRN = 1, CRX = {};
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
      ${crIcon(mid, 22)}<b>${tot}×</b> ${esc(crName(mid))}
      ${sub ? `<span class="mut small"> · üretilir (${esc(CR_MES_TR[sub.cat] || sub.cat)} Sv ${sub.lv})</span>` : `<span class="mut small"> · ${esc(crSrc(mid) || "ham malzeme")}</span>`}
      ${alt ? `<span class="mut small"> · yerine: ${alt.map(a => esc(crName(a[0]))).join(", ")}</span>` : ""}
    </div>${sub && open ? crTree(sub.id, Math.ceil(tot / (sub.n || 1)), depth + 1) : ""}`;
  }).join("");
}

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
    <p class="mut small">Alt tarifler dahil her şey açıldı. "Elimde" kutusuna sahip olduğun miktarı yaz, kalan otomatik hesaplanır.</p>
    <table>${rawIds.length ? rawIds.sort((a, b) => p.raw[b] - p.raw[a]).map(id => `<tr><td>${crIcon(id, 22)}${esc(crName(id))}</td><td><b>${p.raw[id]}</b> gerekli</td>
      <td class="small">elimde <input data-crh="${id}" type="number" min="0" value="${have[id] || 0}" style="width:64px"></td><td class="mut small">${esc(crSrc(id))}</td></tr>`).join("") : '<tr><td class="ok">Hepsi elinde var ✓</td></tr>'}</table></div>`;
  h += `<div class="card"><div class="nm">🪜 Adım adım yapım sırası</div><ol style="margin:6px 0;padding-left:20px">${p.order.map(id => { const s = crRecipe(id); return `<li style="margin:4px 0">${crIcon(s.p, 20)}<b>${p.steps[id]}×</b> üret: ${esc(crName(s.p))} <span class="mut small">(${esc(CR_MES_TR[s.cat] || s.cat)} Sv ${s.lv}${s.n > 1 ? `, her seferde ${s.n} adet` : ""})</span></li>`; }).join("")}</ol>
    <p class="mut small">Önce üstteki ara malzemeleri üret, en son asıl eşyayı. Başarısız üretim ve kombo bonusları hesaba katılmaz.</p></div>`;
  return h;
}

document.addEventListener("click", e => {
  const t = e.target.closest("[data-crp],[data-crs],[data-crx]"); if (!t) return;
  if (t.dataset.crp) { CRP = t.dataset.crp; CRQ = ""; render(); }
  else if (t.dataset.crs) { CRSEL = +t.dataset.crs; CRN = 1; CRX = {}; render(); }
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
