// ---------- Daevanion v2: MetaBot'un gerçek tahta verisi, oyundakine yakın görünüm, karakter dizilimi ----------
const DV_ORDER = ["nezekan", "zikel", "vaizel", "triniel", "ariel", "azphel"];
const DV_N = Object.fromEntries(DV_ORDER.map(b => [b, DV_BOARDS[b].split("/").length]));
// DV_P[b][i] = { t: "S|P|X|O|C", li: etiket no } ya da null
const DV_P = Object.fromEntries(DV_ORDER.map(b => {
  const rows = DV_BOARDS[b].split("/"), n = rows.length, out = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const code = rows[r].substr(c * 3, 3);
    out.push(code === "..." ? null : code[0] === "?" ? { t: "C", li: parseInt(code.slice(1), 36) } : { t: code[0], li: parseInt(code.slice(1), 36) });
  }
  return [b, out];
}));
// Eski tahtaların yerine gerçek yapı (küçük harf = varsayılan olarak alınmamış)
const DV_OLD_N = Object.fromEntries(DV_ORDER.map(b => [b, (DAE_GRID[b] || []).length]));
for (const b of DV_ORDER) {
  const n = DV_N[b];
  DAE_GRID[b] = Array.from({ length: n }, (_, r) => DV_P[b].slice(r * n, r * n + n).map(x => !x ? "." : x.t === "C" ? "C" : x.t.toLowerCase()).join(""));
}
if (!S.daeV2) {
  S.dae = S.dae || {};
  for (const b of DV_ORDER) {
    const st = S.dae[b]; if (!st) continue;
    if (DV_OLD_N[b] !== DV_N[b]) { S.dae[b] = { own: [], plan: [], note: {} }; continue; }
    const ok = i => DV_P[b][i] && DV_P[b][i].t !== "C";
    st.own = (st.own || []).filter(ok); st.plan = (st.plan || []).filter(ok);
  }
  S.daeV2 = 1; save();
}
const dvClsKey = () => (DV_CLASS[CLS] ? CLS : "templar");
function dvLabel(b, i) { const x = DV_P[b][i]; if (!x) return ""; return x.li < 33 ? DV_CLASS[dvClsKey()][x.li] : DV_SHARED[x.li - 33]; }
const DV_SPECIAL = b => b === "ariel" || b === "azphel";

// ---- Türkçe etiket ----
const DVT = { "combat speed": "Savaş hızı", "attack bonus": "Saldırı bonusu", "critical hit resist": "Kritik vuruş direnci", "critical hit": "Kritik vuruş", "cooldown reduction": "Bekleme süresi azaltma",
  mp: "MP", hp: "HP", "defense bonus": "Savunma bonusu", "damage tolerance": "Hasar toleransı", "damage boost": "Hasar artışı", "critical damage boost": "Kritik hasar artışı",
  "critical damage tolerance": "Kritik hasar toleransı", "multi-hit resist": "Çoklu vuruş direnci", "multi-hit chance": "Çoklu vuruş şansı", "status effect chance": "Durum etkisi şansı",
  "status effect resist": "Durum etkisi direnci", attack: "Saldırı", defense: "Savunma", accuracy: "İsabet", evasion: "Kaçınma" };
const DV_PRE = { pve: "PvE ", pvp: "PvP ", boss: "Boss'a karşı " };
function dvParts(lbl) {
  return String(lbl).split(/,\s*/).map(p => {
    const m = /^(.*?)\s*([+\-][\d.]+%?)$/.exec(p.trim()); if (!m) return { name: p.trim(), val: "", pre: "", key: p.trim().toLowerCase() };
    let name = m[1], pre = "";
    const pm = /^(PvE|PvP|Boss)\s+(.*)$/.exec(name); if (pm) { pre = pm[1].toLowerCase(); name = pm[2]; }
    return { name, val: m[2], pre, key: name.toLowerCase() };
  });
}
function dvTr(lbl) {
  return dvParts(lbl).map(p => DVT[p.key] ? `${DV_PRE[p.pre] || ""}${DVT[p.key]} ${p.val}` : p.val === "+1" ? `${p.name} seviyesi +1` : `${p.name} ${p.val}`).join(", ");
}
const dvIsSkill = lbl => dvParts(lbl).every(p => !DVT[p.key] && p.val === "+1");

// ---- Düğüm değeri (sınıf + mod): 0 = verimsiz, 1 = idare, 2 = iyi, 3 = çok iyi ----
const DV_W = {
  tank: { hp: 3, "defense bonus": 3, defense: 3, "damage tolerance": 3, "critical hit resist": 3, "critical damage tolerance": 3, "multi-hit resist": 2, "status effect resist": 2, "combat speed": 2, "cooldown reduction": 3, mp: 1, "attack bonus": 1, attack: 1, "critical hit": 1, "damage boost": 1, "critical damage boost": 0, "multi-hit chance": 0, accuracy: 2, evasion: 1, "status effect chance": 1 },
  dps: { "attack bonus": 3, attack: 3, "critical hit": 3, "critical damage boost": 3, "damage boost": 3, "multi-hit chance": 3, "combat speed": 3, "cooldown reduction": 2, accuracy: 3, "status effect chance": 2, hp: 1, "defense bonus": 1, defense: 1, "damage tolerance": 1, "critical hit resist": 1, "critical damage tolerance": 1, "multi-hit resist": 1, mp: 1, evasion: 1, "status effect resist": 1 },
  healer: { "cooldown reduction": 3, "combat speed": 3, mp: 3, hp: 2, "defense bonus": 2, defense: 2, "damage tolerance": 2, "critical hit resist": 2, "critical damage tolerance": 2, "status effect resist": 2, "multi-hit resist": 1, "attack bonus": 1, attack: 1, "critical hit": 1, "damage boost": 1, "critical damage boost": 0, "multi-hit chance": 0, accuracy: 1, evasion: 1, "status effect chance": 1 },
  support: { "combat speed": 3, "cooldown reduction": 3, "attack bonus": 2, attack: 2, "critical hit": 2, "damage boost": 2, mp: 2, hp: 2, "defense bonus": 2, defense: 2, "damage tolerance": 2, "critical hit resist": 2, accuracy: 2, "critical damage boost": 1, "critical damage tolerance": 1, "multi-hit chance": 1, "multi-hit resist": 1, evasion: 1, "status effect chance": 1, "status effect resist": 1 },
};
const dvRole = cls => ({ templar: "tank", cleric: "healer", chanter: "support" })[cls] || "dps";
function dvScore(b, i, mode = S.mode, cls = dvClsKey()) {
  const lbl = dvLabel(b, i); if (!lbl || DV_P[b][i].t === "C") return null;
  if (dvIsSkill(lbl)) {
    const name = lbl.replace(/\s*\+1$/, "").toLowerCase();
    const x = cls === CLS ? Object.values(ALL).find(y => (y.ad || "").toLowerCase() === name) : null;
    const pri = x && SKILL_PRI[mode] ? SKILL_PRI[mode] : null, r = pri ? pri.indexOf(x.id) : -1;
    if (r < 0) return 2;
    const q = r / pri.length; return q < 0.5 ? 3 : q < 0.8 ? 2 : 1;
  }
  const W = DV_W[dvRole(cls)];
  let best = 0;
  for (const p of dvParts(lbl)) {
    let w = W[p.key] != null ? W[p.key] : 1;
    if (p.pre === "pvp" && mode !== "pvp") w = Math.min(w, 1);
    if ((p.pre === "pve" || p.pre === "boss") && mode === "pvp") w = Math.min(w, 1);
    best = Math.max(best, w);
  }
  return best;
}
// kural tabanlı planlayıcı (dae_ai) için değer
function dvNodeVal(b, i) { const x = DV_P[b][i]; if (!x) return 0; const base = { S: 1, P: 2.3, X: 4.2, O: 5 }[x.t] || 1, s = dvScore(b, i); return base * (0.35 + 0.35 * (s == null ? 1 : s)); }
// Alınmış düğüm, kaldırılınca başka alınmış düğümleri kopuyorsa "geçiş" düğümüdür
function dvBridge(b, i) {
  const n = DV_N[b], st = dstate(b), c0 = Math.floor(n / 2) * n + Math.floor(n / 2), own = new Set(st.own); own.delete(i);
  const seen = new Set([c0]), q = [c0];
  while (q.length) { const k = q.pop(), r = Math.floor(k / n), c = k % n;
    for (const [a, d] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const rr = r + a, cc = c + d; if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue; const j = rr * n + cc; if (!seen.has(j) && own.has(j)) { seen.add(j); q.push(j); } } }
  return [...own].some(j => !seen.has(j));
}
// ✕: ya bu sınıf/mod için verimsiz stat, ya da "En iyi dizilim"de olmayan alınmış düğüm
const dvBestOf = b => { const x = (S.dvBest || {})[b]; return x && (x.mode === S.mode || x.mode === "*") && x.cls === CLS ? x.nodes : null; };
function dvWrong(b, i) { const best = dvBestOf(b); if (best) return !best.includes(i); return dvScore(b, i) === 0 && !dvBridge(b, i); }

// ---- Görünüm ----
const DV_G = {
  S: '<path d="M7 9l3.5 11 2.5-8 2.5 8L19 9"/><path d="M10 7c1.5 1 4.5 1 6 0"/>',
  P: '<path d="M10.5 6v15M15.5 6v15"/><path d="M8 6h10M10.5 21l2.5 2 2.5-2"/>',
  X: '<path d="M18 7H8l5.5 6.5L8 20h10"/>',
  O: '<path d="M13 5v14l5-4"/><path d="M9 9l4-4 4 4"/>',
  C: '<path d="M13 4l8 3v6c0 5-4 8-8 10-4-2-8-5-8-10V7z"/><path d="M13 9v8M10 12h6"/>',
};
const dvGlyph = t => `<svg viewBox="0 0 26 26" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${DV_G[t] || ""}</svg>`;
let DV_TIPS = {};
function dvTipHtml(b, i) {
  const x = DV_P[b][i]; if (!x) return "";
  const st = dstate(b), own = st.own.includes(i), pl = st.plan.includes(i), lbl = dvLabel(b, i), bd = BOARDS.find(z => z.id === b);
  if (x.t === "C") return `<b>Başlangıç</b><div class="mut">${bd.ad} · açılış ${bd.acilis}</div>`;
  const kind = { S: "Stat", P: DV_SPECIAL(b) ? "Nadir stat" : "Pasif yetenek", X: DV_SPECIAL(b) ? "Epik stat" : "Aktif yetenek", O: "Büyük bonus" }[x.t];
  const sc = dvScore(b, i), scTxt = sc == null ? "" : ["⚠ Bu mod/sınıf için verimsiz", "➖ İdare eder", "✅ İyi", "⭐ Çok iyi"][sc];
  const wrong = own && dvWrong(b, i), bridge = own && sc === 0 && dvBridge(b, i);
  return `<div class="dvtip-k t${x.t}">${kind} · ${NCOST[x.t]} ${PARA[bd.para].replace(" Kristali", "")}</div><b>${esc(lbl)}</b><div>${esc(dvTr(lbl))}</div>
    <div class="dvtip-s">${own ? "Alınmış" : pl ? "Planlandı" : "Alınmamış"}${scTxt ? ` · ${scTxt}` : ""}</div>
    ${wrong ? `<div class="bad">✕ ${dvBestOf(b) ? `${MODES[S.mode].ad} için en iyi dizilimde bu düğüm yok.` : `${CLASS_NAME[dvClsKey()]} ${MODES[S.mode].ad} için verimsiz bir seçim.`} Geri almak 500 Kina; o puanı sarı gösterilen düğümlere ver.</div>` : bridge ? `<div class="mut">Verimsiz ama başka düğümlere geçiş için gerekli; geri alma.</div>` : ""}
    ${st.note[i] ? `<div class="mut">Not: ${esc(st.note[i])}</div>` : ""}`;
}
function dvBoardHtml(b) {
  const n = DV_N[b], st = dstate(b), rc = reach(b); DV_TIPS = {};
  let h = `<div class="dvboard" style="grid-template-columns:repeat(${n},1fr)">`;
  DV_P[b].forEach((x, i) => {
    if (!x) { h += `<div class="dv empty"></div>`; return; }
    DV_TIPS[i] = dvTipHtml(b, i);
    if (x.t === "C") { h += `<div class="dv dvimg tC on" data-dvtip="${i}">${dvGlyph("C")}</div>`; return; }
    const own = st.own.includes(i), pl = st.plan.includes(i), bad = pl && !rc.has(i), wrong = own && dvWrong(b, i);
    h += `<button class="dv dvimg t${x.t} ${own ? "on" : ""} ${pl ? "plan" : ""} ${bad ? "bad" : ""} ${DSEL === i ? "sel" : ""} ${st.note[i] ? "noted" : ""}" data-dn="${i}" data-dvtip="${i}" aria-label="${esc(dvLabel(b, i))}">${dvGlyph(x.t)}${wrong ? '<i class="dv-x">✕</i>' : ""}</button>`;
  });
  return h + `</div>`;
}
function dvLegend(b) {
  const sp = DV_SPECIAL(b), st = dstate(b), wrong = st.own.filter(i => dvWrong(b, i)).length;
  return `<div class="legend dvlegend">
    <span><i class="dv dvimg mini tS on"></i>Stat · 1</span><span><i class="dv dvimg mini tP on"></i>${sp ? "Nadir stat" : "Pasif +1"} · 2</span>
    <span><i class="dv dvimg mini tX on"></i>${sp ? "Epik stat" : "Aktif +1"} · 3</span><span><i class="dv dvimg mini tO on"></i>Büyük bonus · 4</span>
    <span><i class="dv dvimg mini tS"></i>Alınmamış</span><span><i class="dv dvimg mini tS plan"></i>Planlanan</span>
    <span><i class="dv dvimg mini tS on"><i class="dv-x">✕</i></i>Verimsiz seçim${wrong ? ` (${wrong})` : ""}</span></div>
    <p class="small mut">Bir kutunun üzerine gel: oyundaki gibi etkisi, maliyeti ve ${CLASS_NAME[dvClsKey()]} ${MODES[S.mode].ad} için değeri yazar. ✕ = alınmış ama bu sınıf/mod için verimsiz düğüm.</p>`;
}
function dvCharBar() {
  const c = typeof CH !== "undefined" ? CH : null;
  if (!c || !c.dv || !Object.keys(c.dv).length) return `<div class="note small">Karakterinin gerçek dizilimini görmek için <b>Karakter</b> sekmesinden sorgula; sonra burada <b>Karakterden yükle</b> çıkar.</div>`;
  const loaded = S.daeFrom && S.daeFrom.name === c.name && S.daeFrom.at === c.at;
  return `<div class="note small dvchar">📥 <b>${esc(c.name)}</b> (${esc(c.classKey)}) Daevanion verisi hazır: ${DV_ORDER.map(b => `${BOARDS.find(z => z.id === b).ad} ${(c.dv[b] && c.dv[b].open.length) || 0}`).join(" · ")}
    <button class="btn ${loaded ? "" : "pri"}" id="dvload">${loaded ? "✓ Yüklendi (yeniden yükle)" : "Karakterden yükle"}</button></div>`;
}
function dvLoadChar() {
  const c = CH; if (!c || !c.dv) return 0;
  const cls = KEY_CLASS[(c.classKey || "").toLowerCase()]; if (cls && cls !== CLS) applyClass(cls);
  let k = 0;
  for (const b of DV_ORDER) {
    const d = c.dv[b]; if (!d) continue;
    const n = DV_N[b], off = (15 - n) / 2, own = [];
    for (const id of d.open) {
      const pos = id % 10000, R = Math.floor((pos - 1) / 15) + 1, C = ((pos - 1) % 15) + 1, r = R - off, cc = C - off;
      if (r < 1 || cc < 1 || r > n || cc > n) continue;
      const i = (r - 1) * n + (cc - 1); if (DV_P[b][i] && DV_P[b][i].t !== "C") own.push(i);
    }
    S.dae[b] = { own, plan: [], note: (S.dae[b] && S.dae[b].note) || {} }; k += own.length;
  }
  S.daeFrom = { name: c.name, at: c.at }; save(); return k;
}
const _rDaeOrig = R.dae;
R.dae = () => {
  const out = _rDaeOrig(), a = out.indexOf('<div class="dboard"'), z = out.indexOf('<div class="dside">');
  if (a < 0 || z < 0) return out;
  let h = out.slice(0, a) + dvBoardHtml(DB) + dvLegend(DB) + "</div>" + out.slice(z);
  // seçili kutunun kartına gerçek etkiyi ekle
  if (DSEL != null && DV_P[DB][DSEL]) h = h.replace('<div class="dside"><div class="card"><div class="nm">', `<div class="dside"><div class="card"><div class="dvsel">${DV_TIPS[DSEL] || ""}</div><div class="nm" style="display:none">`);
  return dvCharBar() + h;
};
// İpucu (oyundaki gibi üzerine gelince)
document.addEventListener("mouseover", e => {
  const el = e.target.closest("[data-dvtip]"); let tip = document.getElementById("dvtip");
  if (!el) { if (tip) tip.style.display = "none"; return; }
  if (!tip) { tip = document.createElement("div"); tip.id = "dvtip"; tip.className = "dvtip"; document.body.appendChild(tip); }
  tip.innerHTML = DV_TIPS[+el.dataset.dvtip] || ""; tip.style.display = "block";
  const r = el.getBoundingClientRect(), w = Math.min(300, window.innerWidth - 16);
  let x = r.right + 8, y = r.top; if (x + w > window.innerWidth) x = Math.max(8, r.left - w - 8);
  tip.style.left = x + "px"; tip.style.top = Math.max(8, Math.min(y, window.innerHeight - tip.offsetHeight - 8)) + "px";
});
document.addEventListener("click", e => { if (e.target.id === "dvload") { const k = dvLoadChar(); DSEL = null; render(); const b = document.getElementById("dvload"); if (b) b.textContent = `✓ ${k} düğüm yüklendi`; } });
// "Seviyeleri uygulamaya aktar" Daevanion'u da aktarsın
const _applyCharDv = applyChar;
applyChar = function () { const n = _applyCharDv(); return n + (CH && CH.dv ? dvLoadChar() : 0); };

// ---- Bağlantısız kutuya tıklayınca oraya giden en ucuz yolu plana ekle (köşe kutuları ancak yol açılınca alınır) ----
function dvPathTo(b, target) {
  const n = DV_N[b], st = dstate(b), c0 = Math.floor(n / 2) * n + Math.floor(n / 2), have = new Set([...st.own, ...st.plan, c0]);
  const cost = i => (have.has(i) ? 0 : NCOST[(DV_P[b][i] || {}).t] || 99), dist = new Map(), prev = new Map(), Q = [...have].map(i => [0, i]);
  have.forEach(i => dist.set(i, 0));
  while (Q.length) {
    Q.sort((a, z) => a[0] - z[0]); const [d, k] = Q.shift(); if (k === target) break; if (d > dist.get(k)) continue;
    const r = Math.floor(k / n), c = k % n;
    for (const [a, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const rr = r + a, cc = c + z; if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue; const j = rr * n + cc;
      if (!DV_P[b][j] || DV_P[b][j].t === "C") continue; const nd = d + cost(j); if (!dist.has(j) || nd < dist.get(j)) { dist.set(j, nd); prev.set(j, k); Q.push([nd, j]); } }
  }
  if (!dist.has(target)) return null;
  const path = []; for (let k = target; k != null && !have.has(k); k = prev.get(k)) path.push(k);
  return path.reverse();
}
document.addEventListener("click", e => {
  const dn = e.target.closest("[data-dn]"); if (!dn || DCLICK !== "plan" || TAB !== "dae") return;
  const i = +dn.dataset.dn, st = dstate(DB);
  if (st.own.includes(i) || st.plan.includes(i) || canTake(DB, i)) return; // normal davranış
  e.stopImmediatePropagation(); e.preventDefault();
  const path = dvPathTo(DB, i); if (!path) return;
  st.plan.push(...path.filter(x => !st.plan.includes(x))); DSEL = i; save();
  const y = window.scrollY; render(); window.scrollTo(0, y);
  const tip = document.getElementById("dvtip"); if (tip) tip.style.display = "none";
  const note = document.createElement("div"); note.className = "dvtoast"; note.textContent = `Bu kutu tek başına alınamaz; oraya giden ${path.length} kutuluk en ucuz yol (${path.reduce((a, k) => a + NCOST[DV_P[DB][k].t], 0)} puan) plana eklendi.`;
  document.body.appendChild(note); setTimeout(() => note.remove(), 3500);
}, true);

// ---- Eksik kristal: nereden kazanılır ----
const DV_EARN = {
  normal: ["<b>Yan görevler</b> (side quests): dünyadaki isteğe bağlı görevler düzenli Daevanion puanı verir.", "<b>Mühürlü zindanlar</b> (Sealed Dungeons): Daevanion Kristali düşürür.", "<b>Başarımlar</b> (achievements) ve ana görevler: ödül olarak puan verir.", "<b>Shugo Festivali dükkânı</b>: tek seferlik en fazla 50 Daevanion Kristali satar.", "Nezekan, Zikel, Vaizel ve Triniel aynı kristali kullanır; önce açtığın tahtada en değerli kutulara harca."],
  ariel: ["<b>Ascension Trial</b>: haftalık PvE (Ariel) parçası verir.", "<b>Zor mod Krao Cave ve Draupnir</b>: Ariel parçası düşürür (her zindanın parçası kendine özel).", "<b>Substance Morph → Special → Daevanion</b>: parçaları Ariel kristaline çevir.", "<b>Günlük / haftalık görevler</b>: küçük miktarda parça.", "<b>Gece dükkânı</b> (Night Shop): tek seferlik en fazla 50 Ariel kristali.", "Fazla kristali Müzayede Evi'nde (Auction House) satabilir ya da alabilirsin."],
  azphel: ["<b>Haftalık savaş alanları</b> (Battlefields): haftada 3 kez PvP parçası — ana tekrar eden kaynak.", "<b>Abyss Monolith</b>: seviye atladıkça PvP kaynakları verir.", "<b>PvP / Abyss dükkânı</b>: Abyss Puanı karşılığı tek seferlik en fazla 50 Azphel kristali.", "<b>Substance Morph</b>: Azphel parçalarını kristale çevir.", "Fazla kristal Müzayede Evi'nde satılabilir."],
};
function dvEarnHtml(b) {
  const bd = BOARDS.find(x => x.id === b), s = bsum(b), have = (S.daeHave || {})[bd.para] || 0, need = Math.max(0, s.plan - have), rest = s.tot - s.own;
  return `<div class="card"><div class="sec" style="margin-top:0">${PARA[bd.para]} nasıl kazanılır?</div>
    <p class="small">${need ? `Planın için <b class="bad">${need}</b> kristal eksik.` : s.plan ? "Planın için kristalin yetiyor ✓" : ""} Tahtayı tamamlamak için kalan: <b>${rest}</b> puan.</p>
    <ul class="pop-list">${DV_EARN[bd.para].map(t => `<li>${t}</li>`).join("")}</ul>
    <p class="small mut">Maliyetler: stat 1 · pasif/nadir 2 · aktif/epik 3 · köşe 4 puan (oyundaki tahta toplamlarıyla birebir: 134 / 168 / 232). Kutu geri almak 500 Kina.</p></div>`;
}
const _rDaeV2 = R.dae;
R.dae = () => { const h = _rDaeV2(), k = h.lastIndexOf('<div class="sec">Bonus seviyelerine'); const earn = dvEarnHtml(DB); return k > 0 ? h.slice(0, k) + earn + h.slice(k) : h + earn; };
