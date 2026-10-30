// ---------- Daevanion ağacı (tıklanabilir) ----------
const BOARDS = [
  { id: "nezekan", ad: "Nezekan", acilis: "12. sv", para: "normal", one: "Combat Speed, cooldown azaltma" },
  { id: "zikel", ad: "Zikel", acilis: "20. sv", para: "normal", one: "Damage Boost, Damage Tolerance" },
  { id: "vaizel", ad: "Vaizel", acilis: "30. sv", para: "normal", one: "Kritik hasar / kritik direnç" },
  { id: "triniel", ad: "Triniel", acilis: "40. sv", para: "normal", one: "Multi-Hit şansı / direnci" },
  { id: "ariel", ad: "Ariel", acilis: "—", para: "ariel", one: "Sadece PvE (boss hasarı vb.)" },
  { id: "azphel", ad: "Azphel", acilis: "45. sv", para: "azphel", one: "Sadece PvP" },
];
const PARA = { normal: "Daevanion Kristali", ariel: "Ariel Kristali", azphel: "Azphel Kristali" };
const NCOST = { S: 1, A: 1, P: 2, X: 3, O: 4 };
function ntype(t, board) {
  const special = board === "ariel" || board === "azphel";
  return { S: "Stat", A: "Stat (parlak mavi)", P: special ? "Nadir stat" : "Pasif yetenek +1", X: special ? "Epik stat" : "Aktif yetenek +1", O: "Büyük bonus (köşe)", C: "Başlangıç" }[t];
}
let DB = "nezekan", DSEL = null, DCLICK = "plan";
function dstate(b) {
  S.dae = S.dae || {};
  if (!S.dae[b]) {
    const own = []; DAE_GRID[b].forEach((row, r) => [...row].forEach((ch, c) => { if (ch !== "." && ch !== "C" && ch === ch.toUpperCase()) own.push(r * row.length + c); }));
    S.dae[b] = { own, plan: [], note: {} };
  }
  return S.dae[b];
}
function cellAt(b, i) { const g = DAE_GRID[b], n = g.length; return g[Math.floor(i / n)][i % n]; }
function reach(b) { // merkezden sahip + plan üzerinden ulaşılabilenler
  const g = DAE_GRID[b], n = g.length, st = dstate(b), on = new Set([...st.own, ...st.plan]), c0 = Math.floor(n / 2) * n + Math.floor(n / 2);
  const seen = new Set([c0]), q = [c0];
  while (q.length) { const i = q.pop(), r = Math.floor(i / n), c = i % n;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue; const j = rr * n + cc;
      if (!seen.has(j) && on.has(j)) { seen.add(j); q.push(j); } } }
  return seen;
}
function canTake(b, i) { // komşusu sahip/plan/merkez mi
  const g = DAE_GRID[b], n = g.length, st = dstate(b), on = new Set([...st.own, ...st.plan]), r = Math.floor(i / n), c = i % n, c0 = Math.floor(n / 2) * n + Math.floor(n / 2);
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => { const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= n || cc >= n) return false; const j = rr * n + cc; return j === c0 || on.has(j); });
}
function bsum(b) {
  const st = dstate(b), g = DAE_GRID[b]; let tot = 0, own = 0, plan = 0, cnt = 0;
  g.forEach((row, r) => [...row].forEach((ch, c) => { const t = ch.toUpperCase(); if (!NCOST[t]) return; const i = r * row.length + c; tot += NCOST[t]; cnt++; if (st.own.includes(i)) own += NCOST[t]; if (st.plan.includes(i)) plan += NCOST[t]; }));
  return { tot, own, plan, cnt };
}
function rDae() {
  const g = DAE_GRID[DB], n = g.length, st = dstate(DB), rc = reach(DB), bd = BOARDS.find(x => x.id === DB);
  const special = DB === "ariel" || DB === "azphel";
  let h = `<div class="dtabs">${BOARDS.map(x => { const s = bsum(x.id); return `<button data-db="${x.id}" class="${x.id === DB ? "on" : ""}">${x.ad}<span>${s.own}/${s.tot}</span></button>`; }).join("")}</div>`;
  const s = bsum(DB);
  h += `<div class="dwrap"><div class="dboard-col">
    <div class="dhead"><div><b>${bd.ad}</b> <span class="mut small">· açılış ${bd.acilis} · ${bd.one} · ${PARA[bd.para]}</span></div>
    <div class="dmode"><button data-dc="plan" class="${DCLICK === "plan" ? "on" : ""}">Planla</button><button data-dc="own" class="${DCLICK === "own" ? "on" : ""}">Sahip olduklarımı düzelt</button></div></div>
    <div class="dboard" style="grid-template-columns:repeat(${n},1fr)">`;
  g.forEach((row, r) => [...row].forEach((ch, c) => {
    const i = r * n + c;
    if (ch === ".") { h += `<div class="dn empty"></div>`; return; }
    if (ch === "C") { h += `<div class="dn start" title="Başlangıç">★</div>`; return; }
    const t = ch.toUpperCase(), own = st.own.includes(i), pl = st.plan.includes(i), bad = pl && !rc.has(i), note = st.note[i];
    h += `<button class="dn t${t} ${own ? "own" : ""} ${pl ? "plan" : ""} ${bad ? "bad" : ""} ${DSEL === i ? "sel" : ""} ${note ? "noted" : ""}" data-dn="${i}" title="${esc(ntype(t, DB))} · ${NCOST[t]} puan${note ? " · " + esc(note) : ""}">${{ S: "", A: "◆", P: special ? "◈" : "II", X: special ? "✦" : "Σ", O: "★" }[t]}</button>`;
  }));
  h += `</div><div class="legend">
    <span><i class="dn tS own"></i>Stat · 1</span><span><i class="dn tA own"></i>Stat (parlak) · 1</span>
    <span><i class="dn tP own"></i>${special ? "Nadir stat" : "Pasif +1"} · 2</span><span><i class="dn tX own"></i>${special ? "Epik stat" : "Aktif +1"} · 3</span>
    <span><i class="dn tO own"></i>Büyük bonus · 4</span><span><i class="dn tS"></i>Alınmamış</span><span><i class="dn tS plan"></i>Planlanan</span><span><i class="dn tS plan bad"></i>Bağlantısız</span></div>
  </div><div class="dside">`;
  if (DSEL != null && cellAt(DB, DSEL) !== "." && cellAt(DB, DSEL) !== "C") {
    const t = cellAt(DB, DSEL).toUpperCase(), own = st.own.includes(DSEL), pl = st.plan.includes(DSEL);
    h += `<div class="card"><div class="nm">${ntype(t, DB)}</div><div class="mut small">Satır ${Math.floor(DSEL / n) + 1}, sütun ${DSEL % n + 1} · <b>${NCOST[t]}</b> ${PARA[bd.para]}</div>
      <div class="small" style="margin:6px 0">Durum: <b>${own ? "Alınmış ✅" : pl ? (rc.has(DSEL) ? "Planlandı" : "Planlandı ⚠ bağlantısız") : "Alınmamış"}</b></div>
      <label class="small mut" for="dnote">Not (oyunda üzerine gelince yazan, ör. "Guarding Seal +1")</label>
      <input id="dnote" class="dnote" value="${esc(st.note[DSEL] || "")}" placeholder="Düğümün etkisi">
      <div class="small mut" style="margin-top:6px">${t === "P" && !special ? "Yeşil düğüm bir pasif yeteneğe +1 seviye verir." : t === "X" && !special ? "Σ düğüm bir aktif yeteneğe +1 seviye verir." : t === "O" ? "Köşe düğümü: büyük yüzde bonusu." : "Stat düğümü."}</div></div>`;
  } else h += `<div class="card small mut">Bir kutuya tıkla: <b>Planla</b> modunda plana ekler/çıkarır, <b>Düzelt</b> modunda "alınmış" işaretini değiştirir. Seçtiğin kutunun türü ve maliyeti burada görünür.</div>`;
  h += `<div class="card"><div class="sec" style="margin-top:0">${bd.ad} özeti</div><table>
    <tr><td>Toplam</td><td><b>${s.tot}</b> puan · ${s.cnt} düğüm</td></tr>
    <tr><td>Alınmış</td><td><b class="ok">${s.own}</b> puan</td></tr>
    <tr><td>Kalan</td><td>${s.tot - s.own} puan</td></tr>
    <tr><td>Plandaki</td><td><b style="color:var(--acc)">${s.plan}</b> puan</td></tr></table>
    <div class="lv" style="margin-top:8px"><button class="btn" id="dclear">Planı temizle</button><button class="btn pri" id="dapply">Planı alındı yap</button></div></div>`;
  // para birimi toplamı
  const sums = {}; for (const x of BOARDS) { const q = bsum(x.id); sums[x.para] = sums[x.para] || { plan: 0, kalan: 0 }; sums[x.para].plan += q.plan; sums[x.para].kalan += q.tot - q.own; }
  S.daeHave = S.daeHave || { normal: 0, ariel: 0, azphel: 0 };
  h += `<div class="card"><div class="sec" style="margin-top:0">Malzeme (kristal) hesabı</div><table><tr><th>Para</th><th>Plan</th><th>Elimde</th><th>Fark</th></tr>
    ${Object.keys(PARA).map(k => { const have = S.daeHave[k] || 0, d = have - sums[k].plan; return `<tr><td>${PARA[k]}<div class="mut small">tamamı için ${sums[k].kalan}</div></td><td>${sums[k].plan}</td><td><input type="number" min="0" class="dhave" data-para="${k}" value="${have}"></td><td class="${d < 0 ? "bad" : "ok"}">${d < 0 ? d + " eksik" : "+" + d}</td></tr>`; }).join("")}</table>
    <div class="small mut">Normal tahtalar (Nezekan, Zikel, Vaizel, Triniel) aynı Daevanion kristalini kullanır. Düğüm geri almak 500 Kina.</div></div>`;
  h += `</div></div>`;
  return h + rDaeSkills();
}
function rDaeSkills() {
  const rows = [...ACTIVES, ...PASSIVES].map(x => { const b = S.lv[x.id][1];
    const d = b < 4 ? `<span class="bad">${4 - b} düğüm eksik olabilir</span>` : b > 4 ? `<span class="ok">Tam (+${b - 4} ekipman/Arcana)</span>` : `<span class="ok">Tam</span>`;
    return `<tr><td>${icon(x.id)}</td><td>${x.ad}</td><td>+${b}</td><td>${d}</td></tr>`; }).join("");
  return `<div class="sec">Bonus seviyelerine göre eksik yetenek düğümleri</div><div class="note">Her yetenek 4 normal tahtanın her birinde 1 düğümle en fazla <b>+4</b> alır (aktifler Σ, pasifler yeşil). 16. seviye için gereken ek +2 ekipman veya Arcana'dan gelir. Eksik düğümü bulunca not alanına adını yaz, ağaçta işaretli kalır.</div><div class="card"><table><tr><th></th><th>Yetenek</th><th>Bonus</th><th>Durum</th></tr>${rows}</table></div>`;
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-db]"), dc = e.target.closest("[data-dc]"), dn = e.target.closest("[data-dn]");
  if (b) { DB = b.dataset.db; DSEL = null; render(); }
  else if (dc) { DCLICK = dc.dataset.dc; render(); }
  else if (dn) {
    const i = +dn.dataset.dn, st = dstate(DB); DSEL = i;
    if (DCLICK === "own") { const k = st.own.indexOf(i); if (k >= 0) st.own.splice(k, 1); else { st.own.push(i); const p = st.plan.indexOf(i); if (p >= 0) st.plan.splice(p, 1); } }
    else if (!st.own.includes(i)) { const k = st.plan.indexOf(i); if (k >= 0) st.plan.splice(k, 1); else st.plan.push(i); }
    save(); const y = window.scrollY; render(); window.scrollTo(0, y);
  }
  else if (e.target.id === "dclear") { dstate(DB).plan = []; save(); render(); }
  else if (e.target.id === "dapply") { const st = dstate(DB), rc = reach(DB); st.plan.filter(i => rc.has(i)).forEach(i => st.own.push(i)); st.plan = st.plan.filter(i => !rc.has(i)); save(); render(); }
});
document.addEventListener("input", e => {
  if (e.target.id === "dnote" && DSEL != null) { const st = dstate(DB); const v = e.target.value.trim(); if (v) st.note[DSEL] = v; else delete st.note[DSEL]; save(); const el = document.querySelector(`[data-dn="${DSEL}"]`); if (el) el.classList.toggle("noted", !!v); }
});
document.addEventListener("change", e => {
  if (e.target.classList.contains("dhave")) { S.daeHave = S.daeHave || {}; S.daeHave[e.target.dataset.para] = Math.max(0, parseInt(e.target.value) || 0); save(); const y = window.scrollY; render(); window.scrollTo(0, y); }
});

// ---------- Sınıflar ----------
const CLASSES = [
  ["templar", "Templar"], ["gladiator", "Gladiator"], ["assassin", "Assassin"], ["ranger", "Ranger"],
  ["sorcerer", "Sorcerer"], ["spiritmaster", "Spiritmaster"], ["cleric", "Cleric"], ["chanter", "Chanter"],
];
let CLS = "templar";
function clsSelect() { return `<select id="clssel" aria-label="Sınıf">${CLASSES.map(([k, a]) => `<option value="${k}" ${CLS === k ? "selected" : ""}>${a}</option>`).join("")}</select>`; }
function rNoClass() {
  const a = CLASSES.find(c => c[0] === CLS)[1];
  return `<div class="card"><div class="nm">${a} verileri henüz eklenmedi</div><p class="mut">Bu sınıfın yetenek, specialty ve stigma verileri hazırlanınca asistan, öneriler ve makro bu sınıf için de çalışacak. <b>Daevanion ağacı</b> bütün sınıflarda aynı düzende olduğu için şimdiden kullanılabilir.</p><button class="btn pri" data-t="dae">Daevanion ağacına git</button></div>`;
}
document.addEventListener("change", e => { if (e.target.id === "clssel") { applyClass(e.target.value); save(); render(); } });

// ---------- Karakter (dış bağlantılar) ----------
const GW_CLASS = { spiritmaster: "elementalist" };
const REGIONS = [["eu", "Avrupa"], ["nae", "Kuzey Amerika (Doğu)"], ["naw", "Kuzey Amerika (Batı)"], ["as", "Asya"], ["la", "Latin Amerika"]];
function rKar() {
  S.region = S.region || "eu";
  const gw = GW_CLASS[CLS] || CLS;
  return `<div class="grid2">
  <div class="card"><div class="nm">Karakterimin canlı bilgileri</div>
    <p class="mut small">Ekipman, statlar, yetenek seviyeleri, stigmalar ve Daevanion ilerlemesi oyundan canlı çekilip MetaBot Armory'de gösteriliyor. Bu sayfa güvenlik nedeniyle başka sitelerden veri okuyamaz; bağlantı yeni sekmede açılır.</p>
    <ol class="small"><li>Aşağıdaki bağlantıyı aç</li><li>Bölgeni seç (Türkiye sunucuları genelde <b>Avrupa</b>)</li><li>Karakter adını yazıp Enter'a bas</li><li>Yetenek seviyelerini oradan okuyup bu sayfadaki kutulara gir</li></ol>
    <a class="btn pri" href="https://metabot.gg/en/aion-2/armory" target="_blank" rel="noopener">MetaBot Armory'yi aç ↗</a></div>
  <div class="card"><div class="nm">${CLASS_NAME[CLS]} için oyuncu istatistikleri</div>
    <p class="mut small">Bölgendeki en güçlü ${CLASS_NAME[CLS]} oyuncularının stat ve ekipman dağılımı. Kendi değerlerinle karşılaştırmak için.</p>
    <div class="lv"><label for="regsel">Bölge</label><select id="regsel">${REGIONS.map(([k, a]) => `<option value="${k}" ${S.region === k ? "selected" : ""}>${a}</option>`).join("")}</select></div>
    <a class="btn" href="https://gamewith.ai/aion2/en/build-stats/${S.region}/${gw}" target="_blank" rel="noopener">GameWith build istatistikleri ↗</a>
    <a class="btn" href="https://metabot.gg/en/aion-2/builds/${gw === "elementalist" ? "spiritmaster" : CLS}" target="_blank" rel="noopener">MetaBot topluluk buildleri ↗</a></div>
  <div class="card"><div class="nm">Yetenek veritabanı</div>
    <p class="mut small">Bütün yeteneklerin her seviyedeki tooltip'leri ve specialty ayrıntıları.</p>
    <a class="btn" href="https://metabot.gg/en/aion-2/skills#${CLS}" target="_blank" rel="noopener">${CLASS_NAME[CLS]} yetenekleri ↗</a>
    <a class="btn" href="https://metabot.gg/en/aion-2/daevanion/${CLS}" target="_blank" rel="noopener">Daevanion planner ↗</a></div>
  </div>`;
}
document.addEventListener("change", e => { if (e.target.id === "regsel") { S.region = e.target.value; save(); render(); } });
