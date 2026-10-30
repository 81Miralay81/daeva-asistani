// ---------- MetaBot top oyuncu dizilimi: Sıfırla / En iyi dizilim (yapay zeka yok) ----------
// Kaynak: metabot.gg/en/aion-2/classes/<sınıf>/build — Endgame PvE (Zindan, Kasma) ve PvP kartları + en çok kullanılan Daevanion dizilimi
const MB_META = /*MBMETA*/;
let MB_DATE = "/*MBDATE*/";
// Güncel veri: GitHub'daki depo her gün MetaBot'tan kendiliğinden yenilenir; uygulama açılışta oradan çeker (olmazsa gömülü veri)
const MB_REMOTE = "https://raw.githubusercontent.com/81Miralay81/daeva-asistani/main/meta/mb_meta.json";
let MB_LIVE = false;
const mbDateTr = d => { const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(d || ""); return m ? `${m[3]}.${m[2]}.${m[1]}` : d; };
function mbUse(j) {
  if (!j || !j.cls || !j.date || j.date < MB_DATE) return false;
  for (const k in j.cls) if (j.cls[k] && j.cls[k].pve && j.cls[k].pvp) MB_META[k] = j.cls[k];
  MB_DATE = j.date; return true;
}
try { mbUse(JSON.parse(localStorage.getItem("mbMetaCache") || "null")); } catch (e) {}
(async () => {
  try {
    const r = await fetch(MB_REMOTE + "?t=" + Math.floor(Date.now() / 3600000), { cache: "no-store" }); if (!r.ok) return;
    const j = await r.json();
    if (mbUse(j)) { MB_LIVE = true; try { localStorage.setItem("mbMetaCache", JSON.stringify(j)); } catch (e) {} if (["akt", "pas", "stg", "mak", "dae"].includes(TAB)) { const y = window.scrollY; render(); window.scrollTo(0, y); } }
  } catch (e) {}
})();
const mbKey = () => (S.mode === "pvp" ? "pvp" : "pve");
const mbNorm = s => String(s || "").toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, " ").trim();
function mbId(name) { const n = mbNorm(name); for (const id in ALL) if (mbNorm(ALL[id].ad) === n) return id; return null; }
function mbGet() { const m = MB_META[CLS]; return m && m[mbKey()] ? m[mbKey()] : null; }
const mbUrl = () => `https://metabot.gg/en/aion-2/classes/${CLS}/build`;
let MB_MSG = {}, MB_UNDO = null;
const mbSnap = tab => ({ tab, cls: CLS, mode: S.mode, s: JSON.parse(JSON.stringify({ lv: S.lv, st: S.st, ai: S.ai || {}, dae: S.dae || {}, dvBest: S.dvBest || {} })) });
function mbUndo() {
  const u = MB_UNDO; if (!u || u.cls !== CLS) return;
  Object.assign(S, u.s); MB_UNDO = null; MB_MSG[u.tab] = null; if (typeof DAE_RES !== "undefined") DAE_RES = {};
  applyAiOverrides(); save(); render();
}
const mbRows = (rows, unit) => rows.length ? `<table>${rows.map(x => `<tr><td>${icon(x.id)}</td><td>${esc(ALL[x.id].ad)}</td><td>${x.from} → <b class="${x.to < x.from ? "warn" : "ok"}">${x.to}</b></td></tr>`).join("")}</table>` : `<p class="small mut">Değişiklik yok; zaten bu dizilimdesin.</p>`;

// --- Aktif / Pasif: mevcut harcanmış puanla, MetaBot hedeflerine doğru dağıt ---
const mbSpent = lv => { let c = 0; for (let l = 2; l <= lv; l++) c += skillCost(l); return c; };
function mbSkills(pool, best) {
  const list = (pool === "active" ? ACTIVES : PASSIVES).map(x => x.id), m = mbGet(), want = {}, ad = pool === "active" ? "aktif" : "pasif";
  const rows = [], cur = Object.fromEntries(list.map(id => [id, S.lv[id][0]]));
  if (!best) { for (const id of list) { if (cur[id] !== 1) rows.push({ id, from: cur[id], to: 1 }); S.lv[id][0] = 1; }
    return `<p class="small">↺ Bütün ${ad} yeteneklerin temel seviyesi 1'e çekildi (${list.reduce((a, id) => a + mbSpent(cur[id]), 0)} puan boşa çıktı).</p>${mbRows(rows)}`; }
  // PvP kartı sadece öncelikli 11 yeteneği verir; kalanlar için Endgame PvE seviyeleri
  const srcs = m ? (mbKey() === "pvp" && MB_META[CLS].pve ? [MB_META[CLS].pve.sk, m.sk] : [m.sk]) : [];
  srcs.forEach(sk => sk.forEach(([nm, lv]) => { const id = mbId(nm); if (id && list.includes(id)) want[id] = lv; }));
  const order = [...(m ? m.sk : []).map(([nm]) => mbId(nm)), ...Object.keys(want)].filter((id, k, a) => id && want[id] && a.indexOf(id) === k);
  const budget = list.reduce((a, id) => a + mbSpent(cur[id]), 0), lv = Object.fromEntries(list.map(id => [id, 1]));
  let left = budget;
  // MetaBot sırasıyla, hepsini birer birer yükselterek (adil dağıtım) hedefe kadar
  for (let moved = true; moved;) { moved = false;
    for (const id of order) { if (lv[id] >= want[id]) continue; const c = skillCost(lv[id] + 1); if (c > left) continue; lv[id]++; left -= c; moved = true; } }
  // hepsi hedefe ulaştıysa artan puanı yine MetaBot sırasıyla 10'a doğru
  for (let moved = true; moved;) { moved = false;
    for (const id of [...order, ...list.filter(x => !order.includes(x))]) { if (lv[id] >= 10) continue; const c = skillCost(lv[id] + 1); if (c > left) continue; lv[id]++; left -= c; moved = true; } }
  for (const id of list) { if (cur[id] !== lv[id]) rows.push({ id, from: cur[id], to: lv[id] }); S.lv[id][0] = lv[id]; }
  const need = order.reduce((a, id) => a + mbSpent(want[id]), 0), reach = order.filter(id => lv[id] >= want[id]).length;
  return `<p class="small">⭐ ${CLASS_NAME[CLS]} · ${mbKey() === "pvp" ? "PvP" : "Endgame PvE"}: <b>mevcut ${budget} puanınla</b> top oyuncuların ${ad} dizilimine göre yeniden dağıtıldı. MetaBot dizilimi ${need} puan istiyor; ${reach}/${order.length} yetenek hedef seviyede${left ? `, artan ${left} puan` : ""}. Bonuslara (+) dokunulmadı.</p>
    <p class="small mut">Oyunda: yetenek penceresinde (K) sıfırlama yapıp aşağıdaki seviyelere getir.</p>${mbRows(rows)}`;
}
// --- Stigma ---
function mbStigma(best) {
  const st = aiStore(), m = mbGet(), rows = [];
  if (best && m) {
    const set = [];
    m.st.forEach(([nm, lv]) => { const id = mbId(nm); if (!id || !id.startsWith("st_")) return; set.push(id); if (S.st[id] !== lv) rows.push({ id, from: S.st[id], to: lv }); S.st[id] = lv; });
    if (set.length) st.stg = set;
    applyAiOverrides();
    return `<p class="small">⭐ Takılacak 4 stigma ve seviyeleri top oyunculardan (${mbKey() === "pvp" ? "PvP" : "Endgame PvE"}):</p><div class="set">${set.map(id => `<div class="setitem">${icon(id)}<div class="nm small">${esc(ALL[id].ad)} · Lv ${S.st[id]}</div></div>`).join("")}</div>${mbRows(rows)}`;
  }
  delete st.stg;
  STIGMAS.forEach(s => { if (S.st[s.id] !== 1) rows.push({ id: s.id, from: S.st[s.id], to: 1 }); S.st[s.id] = 1; });
  applyAiOverrides();
  return `<p class="small">↺ Bütün stigmalar 1. seviyeye çekildi, takılı set varsayılana döndü.</p>${mbRows(rows)}`;
}
// --- Makro ---
function mbMacro(best) {
  const st = aiStore(), m = mbGet();
  if (best && m) {
    const set = m.st.map(([nm]) => mbId(nm)).filter(id => id && id.startsWith("st_"));
    if (set.length) st.stg = set;
    const mac = m.rot.map(mbId).filter(Boolean).filter((id, i, a) => a.indexOf(id) === i);
    st.mac = mac; st.macWhy = "MetaBot top oyuncu rotasyonu";
    st.macOut = MACRO_DISI.filter(([id]) => ALL[id] && !mac.includes(id)).map(([id, neden]) => ({ id, neden }));
    applyAiOverrides();
    return `<p class="small">⭐ Makro sırası top oyuncuların ${mbKey() === "pvp" ? "PvP" : "Endgame PvE"} rotasyonundan alındı (${mac.length} yetenek). Rotasyondaki stigmalar için takılı set de buna göre ayarlandı.</p><div class="set">${mac.map((id, k) => `<div class="setitem">${icon(id)}<div class="nm small">${k + 1}. ${esc(ALL[id].ad)}</div></div>`).join("")}</div>`;
  }
  delete st.mac; delete st.macOut; delete st.macWhy;
  applyAiOverrides();
  return `<p class="small">↺ Makro sırası varsayılana döndü.</p>`;
}
// --- Daevanion: MetaBot hash'i → düğümler ---
function mbDvDecode(hash) {
  const out = {};
  for (const part of String(hash || "").split("_")) {
    const [bid, list] = part.split("-"); if (!bid || !list) continue;
    const b = DV_ORDER[(+bid % 10) - 1]; if (!b) continue;
    const cells = []; DV_P[b].forEach((x, i) => { if (x) cells.push(i); });
    out[b] = list.split(".").map(t => cells[parseInt(t, 36)]).filter(i => i != null && DV_P[b][i].t !== "C");
  }
  return out;
}
function mbDae(best) {
  if (!best) {
    for (const b of DV_ORDER) { S.dae[b] = { own: [], plan: [], note: {} }; DAE_RES[b] = null; if (S.dvBest) delete S.dvBest[b]; }
    S.daeFrom = null; DSEL = null;
    return `<p class="small">↺ Bütün Daevanion tahtaları sıfırlandı (alınmış ve planlanan düğümler silindi).</p>`;
  }
  const m = MB_META[CLS], dec = mbDvDecode(m && m.dv); S.dvBest = S.dvBest || {};
  let tot = 0, wr = 0, mi = 0;
  const lines = DV_ORDER.filter(b => dec[b]).map(b => {
    const all = dec[b], st = dstate(b), { typ, nb, c0 } = daeInfo(b), pc = i => NCOST[typ(i)] || 0, full = all.reduce((a, i) => a + pc(i), 0);
    const ownPts = st.own.reduce((a, i) => a + pc(i), 0), budget = ownPts || full;
    // başlangıçtan bağlı olarak (BFS), bütçe kadar meta düğümü seç; mevcut düğümlerin önce
    const set = new Set(all), pick = [], seen = new Set([c0]), q = [c0]; let left = budget;
    while (q.length) { const i = q.shift(); for (const j of nb(i).sort((x, y) => (st.own.includes(y) ? 1 : 0) - (st.own.includes(x) ? 1 : 0))) { if (!set.has(j) || seen.has(j)) continue; seen.add(j); if (pc(j) > left) continue; pick.push(j); left -= pc(j); q.push(j); } }
    for (const i of all) if (!seen.has(i) && pc(i) <= left) { pick.push(i); left -= pc(i); }
    S.dvBest[b] = { nodes: all, mode: "*", cls: CLS };
    const wrongN = st.own.filter(i => !set.has(i)).length, missN = pick.filter(i => !st.own.includes(i)).length;
    st.plan = pick.filter(i => !st.own.includes(i));
    const cost = budget - left;
    DAE_RES[b] = { plan: pick, cost, left, best: true, meta: true, wrongN, missN, mode: S.mode, dur: 0 };
    tot += cost; wr += wrongN; mi += missN;
    const bd = BOARDS.find(x => x.id === b);
    return `<tr><td>${esc(bd ? bd.ad : b)}</td><td>${ownPts ? `mevcut ${ownPts} puanla ${pick.length}/${all.length} düğüm` : `${all.length} düğüm · ${full} puan (sende alınmış yok, tamamı)`}</td><td class="small">${missN ? `<b style="color:var(--acc)">${missN} eksik</b>` : "tamam"}${wrongN ? ` · <b style="color:#ff4d4d">${wrongN} ✕</b>` : ""}</td></tr>`;
  });
  return `<p class="small">⭐ ${CLASS_NAME[CLS]} için MetaBot'ta en çok kullanılan Daevanion dizilimi <b>mevcut puanlarına göre</b> işlendi (her tahtada sende alınmış kadar puanla, başlangıçtan bağlı olarak). Eksik düğümler <b style="color:var(--acc)">sarı</b>, sende olup bu dizilimde olmayanlar <b style="color:#ff4d4d">✕</b> ile gösterildi. Tahta seçip kontrol et.</p><table>${lines.join("")}</table>`;
}
const MB_TAB = {
  akt: { t: "Aktif yetenekler", run: b => mbSkills("active", b), d: "Top oyuncuların aktif yetenek temel seviyeleri işlenir; bonuslar (+) korunur." },
  pas: { t: "Pasifler", run: b => mbSkills("passive", b), d: "Top oyuncuların pasif yetenek temel seviyeleri işlenir; bonuslar (+) korunur." },
  stg: { t: "Stigmalar", run: mbStigma, d: "Top oyuncuların taktığı 4 stigma ve seviyeleri işlenir." },
  mak: { t: "Makro", run: mbMacro, d: "Top oyuncuların rotasyonu makro sırası olarak işlenir; yetenek çubuğu da buna göre dizilir." },
  dae: { t: "Daevanion", run: mbDae, d: "MetaBot'ta en çok kullanılan Daevanion dizilimi bütün tahtalara işlenir (mod fark etmez)." },
};
function mbBar(tab) {
  const c = MB_TAB[tab], m = MB_META[CLS], msg = MB_MSG[tab], ok = msg && msg.cls === CLS && (tab === "dae" || msg.mode === S.mode);
  const mk = tab === "dae" ? "" : ` · ${MODES[S.mode].ad}${mbKey() === "pvp" ? "" : " (MetaBot: Endgame PvE)"}`;
  return `<div class="card pcard mbbar"><div class="pc-head"><span class="nm">⭐ En iyi dizilim · ${esc(c.t)}${mk}</span>
    <button class="btn" data-mbreset="${tab}">↺ Sıfırla</button>
    <button class="btn pri" data-mbbest="${tab}" ${m ? "" : "disabled"}>⭐ En iyi dizilimi göster</button></div>
    <p class="small mut">${c.d} Veri: <a href="${mbUrl()}" target="_blank" rel="noopener">MetaBot.gg</a> top oyuncu istatistikleri (${mbDateTr(MB_DATE)}${MB_LIVE ? ", güncel" : ""} · her gün kendiliğinden yenilenir). Yapay zeka kullanılmaz.</p>
    ${ok ? `<div class="donebar">✅ <b>İşlem tamamlandı</b></div>${msg.html}${MB_UNDO && MB_UNDO.tab === tab ? `<p class="small"><button class="btn" data-mbundo="1">↶ Geri al</button></p>` : ""}` : ""}</div>`;
}
macroAiCard = () => "";
for (const k of Object.keys(MB_TAB)) { const base = R[k]; R[k] = () => mbBar(k) + base(); }
gemUpdateCheck = async () => {};
document.addEventListener("click", e => {
  const u = e.target.closest("[data-mbundo]"); if (u) { mbUndo(); return; }
  const b = e.target.closest("[data-mbbest],[data-mbreset]"); if (!b || b.disabled) return;
  const best = !!b.dataset.mbbest, tab = best ? b.dataset.mbbest : b.dataset.mbreset;
  if (!best && !b.dataset.ok) { b.dataset.ok = "1"; b.textContent = "⚠ Emin misin? Tekrar bas"; b.classList.add("pri"); setTimeout(() => { if (b.isConnected) { delete b.dataset.ok; b.textContent = "↺ Sıfırla"; b.classList.remove("pri"); } }, 4000); return; }
  MB_UNDO = mbSnap(tab);
  MB_MSG[tab] = { html: MB_TAB[tab].run(best), cls: CLS, mode: S.mode };
  save(); const y = window.scrollY; render(); window.scrollTo(0, y);
});
