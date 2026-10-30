// ---------- v2: 3 mod, ayarlanabilir yuva seviyeleri, ayrı puan havuzları ----------
// Modlar: Zindan (eski PvE + Zor Zindan/Boss birleşti), Kasma, PvP
for (const k of Object.keys(MODES)) delete MODES[k];
Object.assign(MODES, { zindan: { ad: "Zindan", kisa: "Zindan" }, kasma: { ad: "Kasma (solo)", kisa: "Kasma" }, pvp: { ad: "PvP", kisa: "PvP" } });
W.zindan = { surv: 2.5, heal: 2, dmg: 3, cd: 2.5, mp: 1.2, cc: 0, aoe: 1, single: 1.5, mob: 1.2, pvp: -1, pve: 2, rng: 0.3 };
const toZindan = o => { if (o && o.boss !== undefined) { o.zindan = o.boss; delete o.boss; delete o.pve; } };
TEMPLAR.ACTIVES.forEach(a => toZindan(a.pri));
[TEMPLAR.STIGMA_SET, TEMPLAR.MACRO, TEMPLAR.SKILL_PRI, TEMPLAR.SKILL_KAYNAK].forEach(toZindan);
RENK.s16 = "Özel";

const T = () => (S.slotLv && S.slotLv.length === 3 ? S.slotLv : [8, 12, 20]);
// Oyuncunun bildirdiği doğru eşikler: 1. yuva 8, 2. yuva 12, 3. yuva 20 (eski varsayılan 10/15/20 ise düzelt)
if (!S.slotMig2 && (!S.slotLv || S.slotLv.join(",") === "10,15,20")) { S.slotLv = [8, 12, 20]; S.slotMig2 = true; }
function reqOf(sk, k) { const t = T(); return k === "s16" ? t[2] : k === "o" ? t[1] : t[0]; }
function slots(v) { return T().filter(x => v >= x).length; }
function stCost(lv) { if (lv <= 10) return stigmaCost(lv); return S.stCost11 > 0 ? S.stCost11 : null; }

// Puan planı: havuz = aktif / pasif
function planSkills(budget, pool) {
  const ids = pool === "passive" ? PASSIVES.map(p => p.id) : pool === "active" ? ACTIVES.map(a => a.id) : [...ACTIVES, ...PASSIVES].map(x => x.id);
  const pri = SKILL_PRI[S.mode].filter(id => ids.includes(id)), n = pri.length, lv = Object.fromEntries(pri.map(id => [id, S.lv[id][0]]));
  // bir sonraki yuva eşiğine yakın aktiflere bonus öncelik
  const slotBoost = id => { if (pool === "passive") return 1; const t = tot(id), nx = T().find(x => x > t); return nx && nx - t <= 10 - S.lv[id][0] ? 1.6 : 1; };
  for (;;) {
    let best = null;
    pri.forEach((id, r) => { if (lv[id] >= 10) return; const c = skillCost(lv[id] + 1); if (c > budget) return;
      const sc = c / ((n - r) * slotBoost(id)); if (!best || sc < best.sc) best = { id, c, sc }; });
    if (!best) break; budget -= best.c; lv[best.id]++;
  }
  return { lv, left: budget };
}
function planStigma(budget) {
  const st = STIGMA_SET[S.mode], order = [...st.set, ...st.alt.map(a => a[0])], n = order.length, lv = Object.fromEntries(order.map(id => [id, S.st[id]]));
  const nextLock = (id, l) => [5, 10, 15, 20].find(v => v > l);
  for (;;) {
    let best = null;
    order.forEach((id, r) => { if (lv[id] >= 20) return; const c = stCost(lv[id] + 1); if (!c || c > budget) return;
      const nl = nextLock(id, lv[id]), near = nl && nl - lv[id] <= 2 ? 1.5 : 1;
      const sc = c / ((n - r) * (r < 4 ? 2 : 1) * near); if (!best || sc < best.sc) best = { id, c, sc }; });
    if (!best) break; budget -= best.c; lv[best.id]++;
  }
  return { lv, left: budget };
}
function planTable(lv, cur, unlockFn) {
  const rows = Object.entries(lv).filter(([id, v]) => v !== cur(id));
  if (!rows.length) return `<p class="mut small">Puan girince dağılım burada çıkar.</p>`;
  return `<table>${rows.map(([id, v]) => `<tr><td>${icon(id)}</td><td>${ALL[id].ad}</td><td>${cur(id)} → <b class="ok">${v}</b></td><td class="small mut">${unlockFn ? unlockFn(id, cur(id), v) : ""}</td></tr>`).join("")}</table>`;
}
function pointCard(kind) {
  const conf = {
    active: { id: "fa", key: "freeActive", ad: "Aktif yetenek puanım", plan: () => planSkills(S.freeActive || 0, "active"), cur: id => S.lv[id][0],
      un: (id, a, b) => { const bon = S.lv[id][1], hit = T().filter(x => x > a + bon && x <= b + bon); return hit.length ? `🔓 ${hit.join(", ")}. sv yuvası açılır` : ""; } },
    passive: { id: "fp", key: "freePassive", ad: "Pasif yetenek puanım", plan: () => planSkills(S.freePassive || 0, "passive"), cur: id => S.lv[id][0], un: null },
    stigma: { id: "ft", key: "freeStigma", ad: "Stigma puanım", plan: () => planStigma(S.freeStigma || 0), cur: id => S.st[id],
      un: (id, a, b) => { const hit = [5, 10, 15, 20].filter(x => x > a && x <= b); return hit.length ? `🔓 ${hit.map(x => `${x}: ${ALL[id].sv[x]}`).join(" · ")}` : ""; } },
  }[kind];
  const p = conf.plan();
  const maxed = kind !== "stigma" && (kind === "active" ? ACTIVES : PASSIVES).every(x => S.lv[x.id][0] >= 10);
  return `<div class="card pcard"><div class="pc-head"><label class="nm" for="${conf.id}">${conf.ad}</label><input type="number" min="0" id="${conf.id}" value="${S[conf.key] || 0}"><span class="mut small">${MODES[S.mode].ad} için dağılım</span></div>
    ${maxed ? `<p class="small">Bütün ${kind === "active" ? "aktif" : "pasif"} yeteneklerin temel seviyesi 10'da, puan harcanacak yer yok. 10'un üstü sadece Daevanion, ekipman ve Arcana bonusuyla gelir.</p>` : planTable(p.lv, conf.cur, conf.un)}<div class="small mut">Artan puan: ${p.left}${kind === "stigma" && !(S.stCost11 > 0) ? " · 10. seviye üstü maliyeti girilmedi, plan 10'da durur (Stigmalar sekmesinin altından girebilirsin)" : ""}</div></div>`;
}
function slotNote() {
  const t = T();
  return `<div class="note">Specialty yuvaları toplam seviyeye göre açılır: <b>${t[0]}</b> → 1. yuva (Yeşil/Mavi/Sarı), <b>${t[1]}</b> → 2. yuva (+Turuncu), <b>${t[2]}</b> → 3. yuva (+Özel).
    <span class="slotset">Oyun güncellenirse değiştir: <input type="number" id="slt0" value="${t[0]}" min="1" max="40"> <input type="number" id="slt1" value="${t[1]}" min="1" max="40"> <input type="number" id="slt2" value="${t[2]}" min="1" max="40"></span></div>`;
}
function rAkt() {
  let h = pointCard("active") + slotNote() + `<div class="grid2">`;
  for (const sk of ACTIVES) {
    const p = picks(sk), t = tot(sk.id), next = T().find(v => v > t);
    h += `<div class="card"><div class="row">${icon(sk.id)}<div>
      <div class="nm">${sk.ad} <span class="mut small">· ${esc(sk.cd)}</span></div>
      <div class="mut small">${esc(sk.acik)}</div>${lvInputs(sk.id)}
      <div class="small">Açık yuva: <b>${p.n}/3</b>${next ? ` <span class="mut">· sonraki yuva ${next}. sv (+${next - t} lazım)</span>` : ""}</div>
      <div class="small" style="margin-top:6px">✅ Tak:</div><div class="chips">${p.chosen.map(k => chip(sk, k, "pick")).join("") || '<span class="mut small">Henüz yuva yok</span>'}</div>
      <div class="small" style="margin-top:6px">Diğer olasılıklar (sırayla):</div><div class="chips">${p.rest.map(k => chip(sk, k, "")).join("")}</div>
    </div></div></div>`;
  }
  return h + "</div>";
}
function rPas() {
  const pri = SKILL_PRI[S.mode].filter(id => PASSIVES.some(p => p.id === id));
  let h = pointCard("passive") + `<div class="note">Pasiflerde specialty yok. Sıra numarası <b>${MODES[S.mode].ad}</b> için puan önceliği. Maliyet: 2–4. sv 1, 5–7. sv 2, 8–10. sv 4 puan.</div><div class="grid2">`;
  for (const p of [...PASSIVES].sort((a, b) => pri.indexOf(a.id) - pri.indexOf(b.id)))
    h += `<div class="card"><div class="row">${icon(p.id)}<div><div class="nm"><span style="color:var(--acc)">#${pri.indexOf(p.id) + 1}</span> ${p.ad}</div><div class="mut small">${esc(p.etki)}</div>${lvInputs(p.id)}</div></div></div>`;
  return h + "</div>";
}
function rStg2() {
  return pointCard("stigma") + rStg() + `<div class="card small"><label for="stc">10. seviyeden sonra stigma seviye başına puan (oyunda görürsen gir):</label> <input type="number" id="stc" min="0" max="20" value="${S.stCost11 || ""}" style="width:70px"></div>`;
}
function rPln() {
  return `<div class="note">Puanlarını Aktif, Pasif ve Stigma sekmelerinin en üstündeki kutulara da girebilirsin. Hepsi burada bir arada.</div><div class="grid2">${pointCard("active")}${pointCard("passive")}${pointCard("stigma")}</div>`;
}
document.addEventListener("change", e => {
  const el = e.target, v = Math.max(0, parseInt(el.value) || 0);
  if (el.id === "fa") S.freeActive = v; else if (el.id === "fp") S.freePassive = v; else if (el.id === "ft") S.freeStigma = v;
  else if (/^slt[012]$/.test(el.id)) { const t = [...T()]; t[+el.id[3]] = Math.max(1, Math.min(40, v)); S.slotLv = t; }
  else if (el.id === "stc") S.stCost11 = v || 0; else return;
  save(); const y = window.scrollY; render(); window.scrollTo(0, y);
}, true);
R.stg = rStg2;
if (!MODES[S.mode]) S.mode = "zindan";
