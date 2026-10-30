// ---------- Yapay zeka destekli dağıtım: yetenek (aktif+pasif), stigma, makro ----------
if (S.freeSkills === undefined) S.freeSkills = (S.freeActive || 0) + (S.freePassive || 0);
let AI_BUSY = null;
const AI_RES = {};
const aiGet = (cls = CLS, mode = S.mode) => ((S.ai || {})[cls] || {})[mode] || {};
function aiStore() { S.ai = S.ai || {}; const c = (S.ai[CLS] = S.ai[CLS] || {}); return (c[S.mode] = c[S.mode] || {}); }

// Yapay zekanın seçtiği stigma seti ve makro sırası, sınıf/mod bazında uygulamaya işlenir
function applyAiOverrides() {
  for (const m of Object.keys(MODES)) {
    const a = aiGet(CLS, m);
    if (STIGMA_SET[m]) {
      if (!STIGMA_SET[m]._orig) STIGMA_SET[m]._orig = STIGMA_SET[m].set.slice();
      STIGMA_SET[m].set = a.stg && a.stg.length && a.stg.every(id => ALL[id]) ? a.stg.slice() : STIGMA_SET[m]._orig.slice();
    }
    if (MACRO[m]) {
      MACRO._orig = MACRO._orig || {};
      if (!MACRO._orig[m]) MACRO._orig[m] = MACRO[m].slice();
      MACRO[m] = a.mac && a.mac.length && a.mac.every(id => ALL[id]) ? a.mac.slice() : MACRO._orig[m].slice();
    }
  }
}
const _applyClassAi = applyClass;
applyClass = function (c) { const r = _applyClassAi(c); applyAiOverrides(); return r; };

// Yapay zekanın specialty seçimi, açık yuva sayısı kadar öne alınır
const _picksBase = picks;
picks = function (sk) {
  const p = _picksBase(sk), o = (aiGet().spec || {})[sk.id];
  if (!o || !o.length || !p.n) return p;
  const t = tot(sk.id), pri = sk.pri[S.mode] || Object.keys(sk.opts);
  const ok = o.filter(k => sk.opts[k] && t >= reqOf(sk, k));
  const chosen = [...ok, ...p.chosen, ...pri.filter(k => t >= reqOf(sk, k))].filter((k, i, a) => a.indexOf(k) === i).slice(0, p.n);
  return { n: p.n, chosen, rest: pri.filter(k => !chosen.includes(k)), ai: true };
};

const aiState = () => (!GEM_READY ? "exe" : !GEM_HAS_KEY ? "key" : coolLeft(S.gemModel) ? "cool" : "ok");
function aiHint() {
  const st = aiState();
  if (st === "exe") return "Yapay zeka sadece masaüstü sürümünde (exe) çalışır; burada kural tabanlı dağıtılır.";
  if (st === "key") return "Yapay zeka için <b>🤖 Yapay Zeka</b> sekmesinden API anahtarını gir; o zamana kadar kural tabanlı dağıtılır.";
  if (st === "cool") return `Seçili model (${esc(S.gemModel)}) beklemede: <b class="warn" data-until="${S.gemCool[S.gemModel]}">${mmss(coolLeft(S.gemModel))}</b>. Bekle ya da Yapay Zeka sekmesinden başka model seç.`;
  return `<b>🤖 Dağıt</b>'a basınca yapay zeka (${esc(S.gemModel || "otomatik model")}) ${MODES[S.mode].ad} için güncel bilgileri araştırıp dağıtır.`;
}
function aiBtn(kind, label = "Dağıt") {
  const busy = AI_BUSY === kind;
  return `<button class="btn pri" data-aid="${kind}" ${AI_BUSY ? "disabled" : ""}>${busy ? "⏳ Çalışıyor…" : AI_BUSY ? "Bekle…" : (aiState() === "ok" ? "🤖 " : "") + label}</button>`;
}
function aiErrHtml(er, model) {
  const tr = er.status === "PARSE"
    ? { t: "Yapay zekanın cevabı okunamadı", w: "Model istenen biçimde (JSON) cevap vermedi.", d: "Tekrar dene ya da başka bir model seç." }
    : trGemErr(er, model);
  const cd = coolLeft(model);
  return `<div class="errcard small"><p class="bad"><b>⚠ ${tr.t}</b></p><p><b>Neden:</b> ${tr.w}</p><p><b>Ne yapmalı:</b> ${tr.d}</p>
    <p>Model: <b>${esc(model || "—")}</b>${cd ? ` · Bekleme: <b class="warn" data-until="${S.gemCool[model]}">${mmss(cd)}</b>` : ""}</p>
    ${er.message ? `<details class="mut" ${er.code === 429 ? "open" : ""}><summary>Orijinal mesaj</summary>${esc(er.message)}</details>` : ""}</div>`;
}
function gemMark(er, model) {
  S.gemCool = S.gemCool || {}; S.gemBad = S.gemBad || {};
  if (er.code === 429 && zeroQuota(er)) S.gemBad[model] = { at: Date.now(), why: "kota 0" };
  else if (er.code === 429) S.gemCool[model] = dayQuota(er) ? nextQuotaReset() : Date.now() + (er.retry || 60) * 1000;
  if (er.code === 404) S.gemBad[model] = { at: Date.now(), why: "404" };
}

// ---- yapay zekaya giden veri ve görevler ----
function aiList() {
  const set = STIGMA_SET[S.mode].set;
  return {
    aktifler: ACTIVES.map(a => ({ id: a.id, ad: a.ad, cd: a.cd, temel: S.lv[a.id][0], bonus: S.lv[a.id][1], toplam: tot(a.id), acikYuva: slots(tot(a.id)), aciklama: a.acik,
      secenekler: Object.fromEntries(Object.keys(a.opts).map(k => [k, `${RENK[k]} (${reqOf(a, k)}. sv): ${a.optsEn && a.optsEn[k] ? a.optsEn[k] + " / " : ""}${a.opts[k]}`])), suankiSecim: picks(a).chosen })),
    pasifler: PASSIVES.map(p => ({ id: p.id, ad: p.ad, temel: S.lv[p.id][0], bonus: S.lv[p.id][1], etki: p.en || p.etki })),
    stigmalar: STIGMAS.map(s => ({ id: s.id, ad: s.ad, cd: s.cd, seviye: S.st[s.id], aciklama: s.en || s.acik, kilitler: s.svEn || s.sv, takili: set.includes(s.id) })),
  };
}
function aiPrompt(kind) {
  const base = `Sen Aion 2 (global sürüm) için uzman bir oyun danışmanısın. Google aramasıyla GÜNCEL ${CLASS_NAME[CLS]} buildlerini, rehberlerini ve yama notlarını araştır.
Sınıf: ${CLASS_NAME[CLS]}. Mod: ${MODES[S.mode].ad}. OYUNCUNUN HEDEFİ: ${modeGoal()} Kararlarını bu hedefe göre ver.`;
  const json = s => `Cevabının EN SONUNA sadece şu JSON'u \`\`\`json bloğu içinde yaz (id ve kodları aşağıdaki veriden AYNEN kullan, Türkçe gerekçe):\n${s}`;
  let L = aiList();
  if (kind === "skill") L = { aktifler: L.aktifler.map(({ temel, toplam, acikYuva, suankiSecim, ...x }) => x), pasifler: L.pasifler.map(({ temel, ...x }) => x) };
  const data = `VERİ: ${JSON.stringify(L)}`;
  if (kind === "skill") return `${base}
GÖREV: Oyuncunun TOPLAM ${S.freeSkills || 0} yetenek puanı var (AKTİF ve PASİF yeteneklerin ORTAK havuzu). Puanları SIFIRDAN dağıt: bütün yeteneklerin temel seviyesi 1'den başlıyor; şu anki seviyeleri yok say. Sadece bonus (+) seviyeleri hesaba kat (Daevanion/ekipman/Arcana'dan gelir, değişmez).
Maliyet her seviye için ayrı: temel seviye 2–4'e çıkmak 1, 5–7'ye 2, 8–10'a 4 puan (1'den 10'a toplam 27 puan). Temel en fazla 10. Toplam maliyet ${S.freeSkills || 0}'ı GEÇMESİN. Puan verilmeyen yetenek 1'de kalır.
Aktiflerde specialty yuvaları TOPLAM (yeni temel + bonus) seviye ${T().join(" / ")} olunca açılır; yeni yuva açtıran yükseltmeler değerlidir.
Ayrıca her aktif yetenek için, YENİ toplam seviyedeki açık yuva sayısı kadar takılacak specialty kodlarını öncelik sırasıyla seç (kilitli olanı seçme).
${json(`{"seviyeler":{"<yetenek id>":<yeni temel seviye>},"yuvalar":{"<aktif id>":["<kod>","<kod>"]},"gerekce":"2-4 cümle"}`)}
${data}`;
  if (kind === "stigma") return `${base}
GÖREV: Oyuncu aynı anda 4 stigma takabilir ve boşta ${S.freeStigma || 0} stigma puanı var. Hedefe göre takılacak 4 stigmayı seç ve puanı dağıt.
Maliyet her seviye için ayrı: 2–5. seviye 1, 6–10. seviye 2 puan${S.stCost11 > 0 ? `, 11–20. seviye ${S.stCost11} puan` : "; 10'un üstüne ÇIKARMA (maliyet bilinmiyor)"}. Kilit etkileri 5 / 10 / 15 / 20. seviyede açılır; kilide yakın olanlar değerlidir. Toplam maliyet puanı GEÇMESİN.
${json(`{"takili":["<id>","<id>","<id>","<id>"],"seviyeler":{"<stigma id>":<yeni seviye>},"gerekce":"2-4 cümle"}`)}
${data}`;
  return `${base}
GÖREV: Oyuncu sağ tık makro tuşunu basılı tutarak oynuyor. Makro listeyi YUKARIDAN AŞAĞI öncelikle dener, cooldown'daki ya da şartı tutmayan yeteneği atlar.
Hedefe göre en iyi makro sırasını çıkar: ${S.mode === "kasma" ? "solo kasmada maksimum hasar ve hızlı temizleme" : S.mode === "pvp" ? "PvP'de kontrol (stun/kök/sessizlik) ve patlama hasarı" : "zindanda aggro'yu tutma ve partiyi koruma"}.
Sadece aktif yetenekleri ve TAKILI stigmaları kullan; takılı specialty seçimlerini (suankiSecim) ve seviyeleri dikkate al. Normal saldırıyı koyma. Cooldown'suz spam yetenek en sonda olsun.
Acil durum kalkanları, şarjlı/uzun bekleme süreli ve zamanlaması önemli yetenekleri makroya KOYMA; bunları nedeniyle "disarida" listesine yaz.
${json(`{"makro":["<id>","<id>"],"disarida":[{"id":"<id>","neden":"kısa"}],"gerekce":"2-4 cümle"}`)}
${data}`;
}
function aiJson(text) {
  const blocks = [...String(text).matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  const s = blocks.length ? blocks[blocks.length - 1][1] : String(text);
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("Cevapta JSON bulunamadı");
  return JSON.parse(s.slice(a, b + 1));
}
function aiId(x, pool) {
  if (x == null) return null; x = String(x).trim();
  if (pool.includes(x)) return x;
  const n = x.toLowerCase();
  return pool.find(id => id.toLowerCase() === n || (ALL[id].ad || "").toLowerCase() === n || (ALL[id].en || "").toLowerCase() === n) || null;
}
function fitLevels(target, pool, cur, costFn, budget, max) {
  const lv = {}; let left = budget;
  for (const [k, want] of Object.entries(target || {})) {
    const id = aiId(k, pool); if (!id) continue;
    let l = cur(id); const w = Math.min(max, Math.max(l, Math.round(+want || 0)));
    while (l < w) { const c = costFn(l + 1); if (!c || c > left) break; left -= c; l++; }
    if (l > cur(id)) lv[id] = l;
  }
  return { lv, left };
}
// Toplam puan sıfırdan dağıtılır: bütün yetenekler 1. seviyeden başlar, sadece bonus (+) dikkate alınır
const skillIds = () => [...ACTIVES, ...PASSIVES].map(x => x.id);
const freshCost = l => { let c = 0; for (let i = 2; i <= l; i++) c += skillCost(i); return c; };
function planFresh(budget, start) {
  const ids = skillIds(), pri = [...SKILL_PRI[S.mode].filter(id => ids.includes(id)), ...ids.filter(id => !SKILL_PRI[S.mode].includes(id))];
  const n = pri.length, lv = Object.fromEntries(ids.map(id => [id, (start && start[id]) || 1]));
  const boost = id => { if (!ACTIVES.some(a => a.id === id)) return 1; const t = lv[id] + S.lv[id][1], nx = T().find(x => x > t); return nx && nx - t <= 10 - lv[id] ? 1.6 : 1; };
  for (;;) {
    let best = null;
    pri.forEach((id, r) => { if (lv[id] >= 10) return; const c = skillCost(lv[id] + 1); if (c > budget) return;
      const sc = c / ((n - r) * boost(id)); if (!best || sc < best.sc) best = { id, c, sc }; });
    if (!best) break; budget -= best.c; lv[best.id]++;
  }
  return { lv, left: budget };
}
function freshRes(lv, left) {
  const full = Object.fromEntries(skillIds().map(id => [id, lv[id] || 1]));
  return { full, left, rows: skillIds().filter(id => full[id] !== S.lv[id][0]).map(id => ({ id, from: S.lv[id][0], to: full[id] })) };
}
function skillUnlock(id, a, b) {
  if (!ACTIVES.some(x => x.id === id)) return "";
  const bon = S.lv[id][1], hit = T().filter(x => x > a + bon && x <= b + bon);
  return hit.length ? `🔓 ${hit.join(", ")}. sv yuvası açılır` : "";
}
function stgUnlock(id, a, b) { const hit = [5, 10, 15, 20].filter(x => x > a && x <= b); return hit.length ? `🔓 ${hit.map(x => `${x}: ${ALL[id].sv[x]}`).join(" · ")}` : ""; }
const toRows = (lv, cur) => Object.entries(lv).filter(([id, v]) => v !== cur(id)).map(([id, to]) => ({ id, from: cur(id), to }));

function aiParse(kind, j) {
  if (kind === "skill") {
    const f = fitLevels(j.seviyeler || j.levels, skillIds(), () => 1, skillCost, S.freeSkills || 0, 10);
    const spec = {};
    for (const [k, arr] of Object.entries(j.yuvalar || {})) {
      const id = aiId(k, ACTIVES.map(a => a.id)); if (!id || !Array.isArray(arr)) continue;
      const keys = arr.map(x => String(x).trim()).map(x => ALL[id].opts[x] ? x : Object.keys(RENK).find(r => RENK[r].toLowerCase() === x.toLowerCase())).filter(x => x && ALL[id].opts[x]);
      if (keys.length) spec[id] = keys;
    }
    const top = f.left > 0 ? planFresh(f.left, f.lv) : { lv: f.lv, left: 0 };
    return Object.assign(freshRes(top.lv, top.left), { spec, why: j.gerekce, topUp: f.left - top.left });
  }
  if (kind === "stigma") {
    const pool = STIGMAS.map(s => s.id), cur = id => S.st[id];
    let set = (j.takili || []).map(x => aiId(x, pool)).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).slice(0, 4);
    if (set.length < 4) set = [...set, ...STIGMA_SET[S.mode].set.filter(x => !set.includes(x))].slice(0, 4);
    const f = fitLevels(j.seviyeler || j.levels, pool, cur, stCost, S.freeStigma || 0, 20);
    return { rows: toRows(f.lv, cur), left: f.left, set, why: j.gerekce };
  }
  const set = STIGMA_SET[S.mode].set, pool = [...ACTIVES.map(a => a.id), ...set];
  const mac = (j.makro || []).map(x => aiId(x, pool)).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i);
  if (!mac.length) throw new Error("Yapay zeka geçerli bir makro listesi vermedi");
  const out = (j.disarida || []).map(o => ({ id: aiId(o && o.id, [...pool, ...STIGMAS.map(s => s.id)]), neden: o && o.neden })).filter(o => o.id);
  return { mac, out, why: j.gerekce };
}
function aiLocal(kind) {
  if (kind === "skill") { const p = planFresh(S.freeSkills || 0); return freshRes(p.lv, p.left); }
  if (kind === "stigma") { const p = planStigma(S.freeStigma || 0); return { rows: toRows(p.lv, id => S.st[id]), left: p.left }; }
  return { mac: null, out: [] };
}
function aiApply(kind, r) {
  const st = aiStore();
  if (kind === "skill") { Object.entries(r.full).forEach(([id, v]) => (S.lv[id][0] = v)); if (r.ai && Object.keys(r.spec || {}).length) st.spec = r.spec; }
  else if (kind === "stigma") { r.rows.forEach(x => (S.st[x.id] = x.to)); S.freeStigma = r.left; if (r.ai) st.stg = r.set; }
  else if (r.ai) { st.mac = r.mac; st.macOut = r.out; st.macWhy = r.why; }
  else { delete st.mac; delete st.macOut; delete st.macWhy; }
  applyAiOverrides();
}
// İlerleme çubuğu: tek tıkla başlar, bitene kadar bütün Dağıt düğmeleri kilitli
let AI_PROG = null;
const aiSleep = ms => new Promise(r => setTimeout(r, ms));
function progText(p) {
  const e = (Date.now() - p.t0) / 1000;
  if (p.phase === "net") return e < 2 ? "Yapay zekaya bağlanılıyor…" : `Google'da güncel ${CLASS_NAME[CLS]} ${MODES[S.mode].ad} bilgileri taranıyor… (adım 1/3)`;
  if (p.kind === "dae") return p.phase === "calc" ? "Ağaçta en iyi yol hesaplanıyor… (adım 2/3)" : "Plan ağaca işleniyor… (adım 3/3)";
  if (p.phase === "calc") return p.kind === "macro" ? "Makro sırası hazırlanıyor… (adım 2/3)" : "Dağıtım hesaplanıyor… (adım 2/3)";
  return p.kind === "macro" ? "Makro listeye işleniyor… (adım 3/3)" : "Seviyeler kutulara işleniyor… (adım 3/3)";
}
function progWidth(p) {
  if (p.phase === "net") return 5 + 80 * (1 - Math.exp(-(Date.now() - p.t0) / 20000));
  return p.phase === "calc" ? 92 : 100;
}
function progressHtml() {
  const p = AI_PROG; if (!p) return "";
  return `<div class="prog"><div class="small"><b>⏳ Lütfen bekleyin</b> · <span data-progtxt>${progText(p)}</span> <span class="mut" data-progsec>${Math.floor((Date.now() - p.t0) / 1000)} sn</span></div>
    <div class="prog-bar"><i data-progbar style="width:${progWidth(p)}%"></i></div>
    <p class="small mut">${p.ai ? `Model: ${esc(p.model || "otomatik seçim")} · Yapay zeka araştırması 10–60 sn sürebilir; tekrar basmana gerek yok.` : "Kural tabanlı dağıtım yapılıyor."}</p></div>`;
}
function updProg() {
  const p = AI_PROG; if (!p) return;
  document.querySelectorAll("[data-progbar]").forEach(el => (el.style.width = progWidth(p) + "%"));
  document.querySelectorAll("[data-progtxt]").forEach(el => (el.textContent = progText(p)));
  document.querySelectorAll("[data-progsec]").forEach(el => (el.textContent = Math.floor((Date.now() - p.t0) / 1000) + " sn"));
}
setInterval(updProg, 250);
async function aiDist(kind) {
  if (AI_BUSY) return;
  const snap = { kind, cls: CLS, mode: S.mode, lv: JSON.parse(JSON.stringify(S.lv)), st: Object.assign({}, S.st), freeSkills: S.freeSkills, freeStigma: S.freeStigma, ai: JSON.parse(JSON.stringify(aiGet())) };
  let res = null, err = null, model = S.gemModel, state = aiState();
  AI_BUSY = kind; AI_PROG = { kind, t0: Date.now(), phase: state === "ok" ? "net" : "calc", ai: state === "ok", model };
  render();
  if (state === "ok") {
    try {
      const r = await gemAsk(aiPrompt(kind), true); model = r.model || model;
      AI_PROG.phase = "calc"; updProg();
      res = aiParse(kind, aiJson(r.text)); res.ai = true; res.sources = r.sources || []; res.switched = r.switched; res.noSearch = r.noSearch;
    } catch (e) {
      if (e && e.gem) { err = e.err; model = e.model || model; gemMark(err, model); }
      else err = { code: -1, status: "PARSE", message: String((e && e.message) || e) };
    }
  } else if (state === "cool") err = { code: 429, status: "COOLDOWN", message: "", retry: coolLeft(model) };
  AI_PROG.phase = "calc"; updProg(); await aiSleep(400);
  if (CLS !== snap.cls || S.mode !== snap.mode) { AI_BUSY = null; AI_PROG = null; render(); return; }
  if (!res) res = aiLocal(kind);
  AI_PROG.phase = "apply"; updProg(); await aiSleep(400);
  Object.assign(res, { err, model, mode: S.mode, cls: CLS, state, at: Date.now(), dur: Math.max(1, Math.round((Date.now() - AI_PROG.t0) / 1000)) });
  aiApply(kind, res); S.aiUndo = snap; AI_RES[kind] = res;
  AI_BUSY = null; AI_PROG = null; save(); render();
}
function doneBar(r) {
  return `<div class="donebar">✅ <b>İşlem tamamlandı</b>${r.dur ? ` · ${r.dur} sn` : ""}${r.err ? " · yapay zeka cevap veremedi, kural tabanlı yapıldı" : r.ai ? " · yapay zeka araştırmasıyla" : ""}${r.switched ? `<div class="small">ℹ ${esc(r.switched.from)} ${r.switched.why} olduğu için <b>${esc(r.switched.to)}</b> modeline geçildi; bundan sonra o kullanılacak.</div>` : ""}${r.noSearch ? `<div class="small">ℹ Google araması kotası dolu olduğu için bu cevap <b>aramasız</b> (modelin kendi bilgisiyle) verildi.</div>` : ""}</div>`;
}
function aiUndo(kind) {
  const u = S.aiUndo; if (!u || u.kind !== kind || u.cls !== CLS || u.mode !== S.mode) return;
  S.lv = u.lv; S.st = u.st; S.freeSkills = u.freeSkills; S.freeStigma = u.freeStigma;
  const c = ((S.ai = S.ai || {})[CLS] = S.ai[CLS] || {}); c[S.mode] = u.ai;
  S.aiUndo = null; AI_RES[kind] = null; applyAiOverrides(); save(); render();
}

// ---- görünüm ----
const curRes = kind => { const r = AI_RES[kind]; return r && r.mode === S.mode && r.cls === CLS ? r : null; };
function srcLine(r) {
  return r.ai ? `🤖 <b>Yapay zeka</b> (${esc(r.model || "")}) · ${MODES[r.mode].ad}` : `<b>Kural tabanlı</b> · ${MODES[r.mode].ad}${r.err ? "" : ` <span class="mut">(${aiState() === "exe" ? "yapay zeka sadece exe'de" : aiState() === "key" ? "API anahtarı girilmemiş" : "yapay zeka kullanılmadı"})</span>`}`;
}
function rowsTable(rows, unlock) {
  if (!rows.length) return `<p class="small mut">Seviye değişikliği yok; şu anki seviyelerin bu dağıtımla aynı.</p>`;
  return `<table>${rows.map(x => `<tr><td>${icon(x.id)}</td><td>${ALL[x.id].ad}</td><td>${x.from} → <b class="${x.to < x.from ? "warn" : "ok"}">${x.to}</b></td><td class="small mut">${unlock(x.id, x.from, x.to)}</td></tr>`).join("")}</table>`;
}
function srcLinks(r) { return r.sources && r.sources.length ? `<p class="small mut">Kaynaklar: ${r.sources.slice(0, 5).map(s => `<a href="${esc(s.uri)}" target="_blank" rel="noopener">${esc(s.title || s.uri)}</a>`).join(" · ")}</p>` : ""; }
function resultHtml(kind, r) {
  const isS = kind === "skill";
  return `${r.err ? aiErrHtml(r.err, r.model) + `<p class="small">Yapay zeka cevap veremediği için <b>kural tabanlı</b> dağıtım yapıldı.</p>` : ""}
    <div class="small">${srcLine(r)} · ${isS ? `toplam ${S.freeSkills || 0} puanın ${(S.freeSkills || 0) - r.left}'i kullanıldı, ` : ""}artan puan: <b>${r.left}</b></div>
    ${r.why ? `<p class="small">${esc(r.why)}</p>` : ""}
    ${r.topUp ? `<p class="small mut">Yapay zekanın harcamadığı ${r.topUp} puan kural tabanlı olarak dağıtıldı.</p>` : ""}
    ${rowsTable(r.rows, isS ? skillUnlock : stgUnlock)}
    ${!isS && r.set ? `<div class="small" style="margin-top:6px">Takılacak 4 stigma:</div><div class="set">${r.set.map(id => `<div class="setitem">${icon(id)}<div class="nm small">${ALL[id].ad}</div></div>`).join("")}</div>` : ""}
    ${isS && r.ai && Object.keys(r.spec || {}).length ? `<p class="small">🤖 ${Object.keys(r.spec).length} aktif yetenek için specialty seçimi ${TAB === "akt" ? "aşağıdaki kartlara" : "Aktif Yetenekler sekmesine"} işlendi.</p>` : ""}
    ${srcLinks(r)}
    <p class="small mut">Yeni seviyeler ${isS ? "yetenek" : "stigma"} kutularına işlendi; oyunda da aynısını yap. <button class="btn" data-aiundo="${kind}">↶ Geri al</button></p>`;
}
pointCard = function (kind) {
  const isS = kind !== "stigma"; kind = isS ? "skill" : "stigma";
  const val = isS ? S.freeSkills || 0 : S.freeStigma || 0, r = curRes(kind);
  let body;
  if (AI_BUSY === kind) body = progressHtml();
  else if (r) body = doneBar(r) + resultHtml(kind, r);
  else {
    let rows, left;
    if (isS) { const f = planFresh(val), r2 = freshRes(f.lv, f.left); rows = r2.rows; left = r2.left; }
    else { const p = planStigma(val); rows = toRows(p.lv, id => S.st[id]); left = p.left; }
    body = `<p class="small mut">${aiHint()}</p>${isS ? `<p class="small mut">Toplam puanını yaz: mevcut temel seviyeler yok sayılır, hepsi 1'den başlayıp sıfırdan dağıtılır. Bonuslar (+) hesaba katılır. 1'den 10'a bir yetenek 27 puan.</p>` : ""}
      ${isS && !val ? "" : `<div class="small mut">Ön izleme (kural tabanlı):</div>${rowsTable(rows, isS ? skillUnlock : stgUnlock)}<div class="small mut">Artan puan: ${left}</div>`}`;
  }
  return `<div class="card pcard"><div class="pc-head"><label class="nm" for="${isS ? "fsk" : "ft"}">${isS ? "Toplam yetenek puanım <span class='mut small'>(aktif + pasif, sıfırdan)</span>" : "Stigma puanım"}</label><input type="number" min="0" id="${isS ? "fsk" : "ft"}" value="${val}" ${AI_BUSY ? "disabled" : ""}>${aiBtn(kind)}<span class="mut small">${MODES[S.mode].ad} için</span></div>${body}</div>`;
};
function macroAiCard() {
  const r = curRes("macro"), a = aiGet();
  let body = "";
  if (AI_BUSY === "macro") body = progressHtml();
  else if (r && r.err) body = aiErrHtml(r.err, r.model) + `<p class="small">Makro değiştirilmedi; aşağıdaki varsayılan sıra geçerli.</p>`;
  else if (r && !r.ai) body = `<p class="small">${aiHint()}</p>`;
  else if (a.mac) body = (r ? doneBar(r) : "") + `<p class="small">🤖 Aşağıdaki makro sırası yapay zekanın ${MODES[S.mode].ad} önerisi${r ? ` (${esc(r.model || "")})` : ""}.</p>${a.macWhy ? `<p class="small">${esc(a.macWhy)}</p>` : ""}
    ${r ? srcLinks(r) : ""}<p class="small mut"><button class="btn" data-aireset="macro">Varsayılan sıraya dön</button></p>`;
  else body = `<p class="small mut">${aiHint()} Takılı stigmalar, specialty seçimleri ve seviyeler dikkate alınır.</p>`;
  return `<div class="card pcard"><div class="pc-head"><span class="nm">Makro — ${MODES[S.mode].ad}</span>${aiBtn("macro", "Makro oluştur")}</div>${body}</div>`;
}
const _rMakBase = R.mak;
R.mak = () => {
  const a = aiGet(), keep = MACRO_DISI;
  if (a.mac) MACRO_DISI = (a.macOut || []).filter(o => ALL[o.id] && !a.mac.includes(o.id)).map(o => [o.id, o.neden || ""]);
  try { return macroAiCard() + _rMakBase() + skillBarHtml(); } finally { MACRO_DISI = keep; }
};
// Oyun içi yetenek çubuğu önerisi + makro tuşunun karar ağacı (makro ve dizilim değişince kendiliğinden güncellenir)
// ---- Oyun içi yetenek çubuğu (Aion 2 düzeni) ----
// Alt sıra tuşlu: 1–8, Q, E, Sol tık (normal saldırı), Sağ tık (ağır saldırı ya da makro); sağdaki ayrı yuva Boşluk (otomatik çıkan yetenek).
// Makro, çubuktaki SÜTUNLARDAN kurulur: makro penceresinde bir satır = bir sütun, o sütunda üst üste dizili bütün yetenekler (alttan üste).
const MACRO_KEYS = ["Sağ tık", "Orta tık (Mouse 3)", "Yan tuş (Mouse 4)", "Yan tuş (Mouse 5)"];
const SPACE_SKILL = { templar: "defiance" }; // oyunda Boşluk tuşunda kendiliğinden beliren yetenek
const BAR_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "Q", "E", "Sol", "Sağ"];
function basicAttacks() {
  const noCd = a => !/\d/.test(String(a.cd || "").replace(/\d+\s*MP/gi, ""));
  return ACTIVES.filter(noCd).slice(0, 2).map(a => a.id);
}
function barLayout() {
  const set = STIGMA_SET[S.mode].set, isSt = id => id.startsWith("st_");
  const mac = MACRO[S.mode].filter(id => ALL[id] && (!isSt(id) || set.includes(id)));
  const sp = SPACE_SKILL[CLS] && ALL[SPACE_SKILL[CLS]] ? SPACE_SKILL[CLS] : null;
  const man = MACRO_DISI.map(x => x[0]).filter(id => ALL[id] && id !== sp && !mac.includes(id) && (!isSt(id) || set.includes(id)));
  const grid = [0, 1, 2, 3].map(() => Array(12).fill(null)); // grid[satır][sütun], satır 0 = tuşlu alt sıra
  // Makro sütunları: Q ve E (gerekirse 8, 7…) — alt sıradan yukarı makro sırasıyla
  const macCols = [8, 9, 7, 6, 5, 4], mStack = mac.filter(id => !isSt(id) || true), used = new Set();
  const cols = [];
  mStack.forEach((id, k) => { const c = macCols[Math.floor(k / 4)]; if (c == null) return; grid[k % 4][c] = id; used.add(id); if (!cols.includes(c)) cols.push(c); });
  // Alt sıra 1–4: elle basılanlar, 5–8: takılı stigmalar (makro sütunu olmayan yuvalara)
  const BA = basicAttacks();
  const manA = man.filter(id => !isSt(id) && !used.has(id) && !BA.includes(id)), stg = set.filter(id => ALL[id] && !used.has(id));
  const free0 = c => grid[0][c] == null && !cols.includes(c);
  let q = [...manA];
  for (const c of [0, 1, 2, 3]) if (free0(c) && q.length) { grid[0][c] = q.shift(); }
  const qs = [...stg];
  for (const c of [4, 5, 6, 7]) if (free0(c) && qs.length) grid[0][c] = qs.shift();
  // Kalanlar (fazla elle basılanlar, sığmayan stigmalar, diğer aktifler) 1–8'in üst sıralarına
  const rest = [...q, ...qs, ...ACTIVES.map(x => x.id).filter(id => id !== sp && !used.has(id) && !man.includes(id) && !BA.includes(id))];
  for (let c = 0; c < 8; c++) if (free0(c) && rest.length) grid[0][c] = rest.shift();
  for (let r = 1; r <= 3; r++) for (let c = 0; c < 8; c++) if (grid[r][c] == null && !cols.includes(c) && rest.length) grid[r][c] = rest.shift();
  return { grid, mac, man, sp, cols, set, isSt };
}
function skillBarHtml() {
  const L = barLayout(), { grid, mac, man, sp, cols, isSt } = L, why = Object.fromEntries(MACRO_DISI), BA = basicAttacks();
  const mk = S.macroKey || "Sağ tık", onRight = mk === "Sağ tık";
  const lv = id => isSt(id) ? S.st[id] : tot(id);
  const cell = (id, key, r, c) => {
    if (!id) return `<div class="gs empty ${cols.includes(c) ? "mcol" : ""}">${key ? `<span class="gs-key">${esc(key)}</span>` : ""}</div>`;
    const tag = man.includes(id) ? "man" : isSt(id) ? "stg" : mac.includes(id) ? "mac" : "";
    const mi = mac.indexOf(id);
    return `<div class="gs ${tag} ${cols.includes(c) ? "mcol" : ""}" title="${esc(ALL[id].ad)}${why[id] ? " — " + esc(why[id]) : mi >= 0 ? ` — makroda ${mi + 1}. öncelik` : ""}">${icon(id)}${mi >= 0 ? `<i class="gs-ord">${mi + 1}</i>` : isSt(id) ? '<i class="gs-badge st"></i>' : ""}<span class="gs-lv">Lv. ${lv(id)}</span>${key ? `<span class="gs-key">${esc(key)}</span>` : ""}</div>`;
  };
  const txt = (label, key, cls, title) => `<div class="gs txt ${cls || ""}" title="${esc(title || label)}"><span class="gs-t">${label}</span><span class="gs-key">${esc(key)}</span></div>`;
  const row = r => {
    const g = [0, 4, 8].map(s => `<div class="gb-grp">${[0, 1, 2, 3].map(k => {
      const c = s + k;
      if (r === 0 && c === 10) return BA[0] ? `<div class="gs basic" title="Sol tık: ${esc(ALL[BA[0]].ad)} — sınıfın 1. temel saldırısı (oyunda sabit)">${icon(BA[0])}<span class="gs-key">🖱 Sol</span><span class="gs-lv">Lv. ${lv(BA[0])}</span></div>` : txt("Temel<br>saldırı", "🖱 Sol");
      if (r === 0 && c === 11) return onRight ? `<div class="gs macro" title="Sağ tık = makro tuşu. Ağır saldırı T tuşuna geçer.">${mac[0] ? icon(mac[0]) : ""}<span class="gs-mac">MAKRO</span><span class="gs-key">🖱 Sağ</span></div>` : (BA[1] ? `<div class="gs basic" title="Sağ tık: ${esc(ALL[BA[1]].ad)} — sınıfın 2. temel saldırısı (oyunda sabit)">${icon(BA[1])}<span class="gs-key">🖱 Sağ</span><span class="gs-lv">Lv. ${lv(BA[1])}</span></div>` : txt("Temel<br>saldırı", "🖱 Sağ"));
      if (c >= 10) return `<div class="gs empty"></div>`;
      return cell(grid[r][c], r === 0 ? BAR_KEYS[c] : "", r, c);
    }).join("")}</div>`).join("");
    const side = r === 0 ? (sp ? `<div class="gs auto" title="${esc(ALL[sp].ad)} — oyunda Boşluk tuşunda kendiliğinden belirir">${icon(sp)}<span class="gs-lv">Lv. ${lv(sp)}</span><span class="gs-key">Boşluk</span><i class="gs-ord oto">OTO</i></div>` : txt("Özel", "Boşluk", "", "Oyunda duruma göre kendiliğinden beliren yetenek")) : `<div class="gs empty"></div>`;
    return `<div class="gb-row">${g}<div class="gb-num">${r}</div></div>`;
  };
  const colKey = c => BAR_KEYS[c];
  return `<div class="card"><div class="sec" style="margin-top:0">Oyun içi yetenek çubuğu — ${MODES[S.mode].ad}</div>
    <div class="pc-head"><label for="mackey" class="small"><b>Makro tuşum</b></label><select id="mackey">${MACRO_KEYS.map(k => `<option ${k === mk ? "selected" : ""}>${k}</option>`).join("")}</select>
      <span class="small mut">${onRight ? `Sağ tık makro olunca oyundaki sağ tık saldırısı${BA[1] ? ` (<b>${esc(ALL[BA[1]].ad)}</b>)` : ""} <b>T</b> tuşuna geçer.` : `Sağ tık ${BA[1] ? `<b>${esc(ALL[BA[1]].ad)}</b>` : "temel saldırı"} olarak kalır; makro fare yan/orta tuşunda.`} Sol tık: <b>${BA[0] ? esc(ALL[BA[0]].ad) : "temel saldırı"}</b>. Oyunda: Ayarlar (Esc) → Tuş Ayarları → Genel → Oynanış → Makro.</span></div>
    <div class="gbar">${[3, 2, 1, 0].map(row).join("")}</div>
    <div class="sb-legend small"><span class="sb-dot man"></span> elle bas <span class="sb-dot stg"></span> stigma <span class="sb-dot mac"></span> makro sütunu (numara = öncelik)</div>
    <div class="sec">Makro penceresi (K → Makro) ve ağacı</div>
    <p class="small mut">Aion 2'de makro, çubuktaki <b>sütunlardan</b> kurulur: makroya bir satır eklerken bir sütun seçersin, o sütunda <b>üst üste dizili bütün yetenekler</b> makroya girer. Bu yüzden makro yeteneklerini ${cols.map(c => `<b>${colKey(c)}</b>`).join(" ve ")} sütun${cols.length > 1 ? "larına" : "una"} alttan yukarı dizdik. Basılı tutunca öncelikliden başlar; cooldown'daysa sıradakine geçer.</p>
    <div class="mtree"><div class="mt-root"><div class="gs macro">${mac[0] ? icon(mac[0]) : ""}<span class="gs-mac">MAKRO</span><span class="gs-key">${esc(mk.split(" ")[0] === "Sağ" ? "🖱 Sağ" : mk)}</span></div>
      <div><b>${esc(mk)}</b> · basılı tut</div></div>
      <ol class="mt-list">${cols.map((c, k) => `<li><div class="mt-node"><div class="gs txt small-gs"><span class="gs-t">${colKey(c)}<br>sütunu</span></div><div><b>Makro satırı ${k + 1}: ${colKey(c)} sütunu</b><div class="mt-stack">${[0, 1, 2, 3].map(r => grid[r][c]).filter(Boolean).map(id => `<span class="mt-chip">${icon(id)}<span>${mac.indexOf(id) + 1}. ${esc(ALL[id].ad)}${mac.indexOf(id) === mac.length - 1 ? " <i class='mut'>(filler)</i>" : ""}</span></span>`).join('<span class="mut">→</span>')}</div></div></div></li>`).join("")}</ol>
      ${man.length ? `<div class="small" style="margin-top:8px">Makroya koyma, elle bas: ${man.map(id => { let k = ""; grid.forEach((rw, r) => rw.forEach((x, c) => { if (x === id) k = r === 0 ? BAR_KEYS[c] : `${r}. sıra`; })); return `<span class="chip c-o">${esc(ALL[id].ad)} · ${esc(k || "—")}</span>`; }).join(" ")}${sp ? ` · <span class="chip">${esc(ALL[sp].ad)} · Boşluk (otomatik)</span>` : ""}</div>` : ""}
      <p class="small mut">Öncelik yönü: oyun sürümüne göre en alttaki ya da en üstteki önce denenebilir. Kuklada 5–6 sn basılı tut; sadece filler (Pummel gibi) basılıyorsa sırayı ters çevir.</p>
    </div>${stigmaUseHtml(L)}</div>`;
}
// Normal saldırı ikonu (sol tık) — özgün çizim, yetenek ikonu görünümünde
const ATK_ICON = `<svg viewBox="0 0 48 48" class="atk-svg"><defs><linearGradient id="atkbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a2a16"/><stop offset="1" stop-color="#1c0a06"/></linearGradient><linearGradient id="atkbl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6d8"/><stop offset="1" stop-color="#c9a24a"/></linearGradient></defs><rect width="48" height="48" fill="url(#atkbg)"/><circle cx="24" cy="24" r="17" fill="none" stroke="#ff9a3c" stroke-opacity=".35" stroke-width="6"/><path d="M12 36L32 16l4-6-6 4L10 34z" fill="url(#atkbl)" stroke="#3a1b08" stroke-width="1"/><path d="M36 36L16 16l-4-6 6 4 20 20z" fill="url(#atkbl)" stroke="#3a1b08" stroke-width="1" opacity=".85"/><path d="M9 33l6 6M33 39l6-6" stroke="#5a3a14" stroke-width="3" stroke-linecap="round"/></svg>`;
// Takılı stigmalar: makroda mı, değilse neden ve nerede/nasıl kullanılır
function stigmaUse(id) {
  const s = ALL[id] || {}, t = `${s.en || ""} ${s.acik || ""} ${Object.values(s.svEn || s.sv || {}).join(" ")}`.toLowerCase(), cd = parseInt(String(s.cd || "").replace(/[^\d]/g, "")) || 0;
  const has = re => re.test(t);
  if (has(/tolerance|shield|immun|invulner|barrier|damage reduction|reduces? damage|kalkan|hasar azalt|dokunulmaz/)) return { k: "def", why: "Savunma stigması. Makro onu hasar gelmeden, rastgele bir anda harcar; asıl gerektiği anda bekleme süresinde kalır.", how: "Boss'un büyük vuruşundan ya da alan saldırısından hemen önce elle bas. Birden fazla savunma stigman varsa üst üste değil, arka arkaya kullan; biri bitince öbürünü aç." };
  if (has(/heal|recover|restore|iyileş|can yeniler/)) return { k: "heal", why: "İyileştirme. Makro canı dolu olan birine de basar, boşa gider.", how: "Canı %50'nin altına düşen için elle bas. Zindanda boss'un ağır vuruşundan sonra kullan." };
  if (has(/taunt|provok|enmity|aggro|kışkırt/)) return { k: "taunt", why: "Aggro yeteneği. Makroda olursa zaten üzerinde olan aggroyu tekrar çeker, asıl lazım olduğu anda bekleme süresinde kalır.", how: "Boss başkasına döndüğünde ya da yeni grup çekerken elle bas." };
  if (has(/stun|root|silence|knock|pull|bind|sleep|fear|snare|stagger|sersem|kök|sessiz|çek/)) return { k: "cc", why: "Kontrol yeteneği. Makro rakip kontrol bağışıklığındayken de basar ve boşa harcar.", how: "PvP'de takımca saldırıyı başlatırken ya da kaçan rakibe; zindanda boss'un büyüsünü kesmek ya da yan canavarları toplamak için elle." };
  if (cd >= 60 && has(/increase|boost|enhance|artır|güçlen|bonus/)) return { k: "buff", why: `Uzun bekleme süreli (${s.cd}) güçlendirme. Makro onu ilk fırsatta harcar, patlama anına kalmaz.`, how: "Savaşın başında ya da boss sersemlediğinde/kırıldığında (patlama penceresi) elle aç." };
  if (has(/damage|hasar|strike|hit|vur/)) return cd && cd < 60 ? { k: "dmg", why: "Kısa bekleme süreli hasar stigması.", how: "Makroya eklenebilir; makroya koyduysan dokunma." } : { k: "burst", why: `Uzun bekleme süreli (${s.cd || "?"}) patlama hasarı. Makro onu yanlış anda harcar.`, how: "Boss sersemlediğinde ya da hasar artışı (buff) açıkken elle bas." };
  return { k: "other", why: "Duruma bağlı bir etki.", how: "Açıklamasına göre gerektiği anda elle kullan." };
}
function stigmaUseHtml(L) {
  const set = L.set.filter(id => ALL[id]); if (!set.length) return "";
  const keyOf = id => { let k = ""; L.grid.forEach((rw, r) => rw.forEach((x, c) => { if (x === id) k = r === 0 ? BAR_KEYS[c] : `${r}. sıra`; })); return k; };
  return `<div class="sec">Stigmalar ve makro</div>
    <p class="small mut">Takılı 4 stigmanın makroda olup olmadığı, olmayanların neden makroya konmadığı ve nerede, nasıl kullanılacağı:</p>
    <div class="stg-use">${set.map(id => { const inMac = L.mac.includes(id), u = stigmaUse(id), k = keyOf(id);
      return `<div class="stg-row ${inMac ? "in" : ""}">${icon(id)}<div><div><b>${esc(ALL[id].ad)}</b> <span class="mut small">· Lv. ${S.st[id] || "?"}${ALL[id].cd ? ` · ${esc(ALL[id].cd)}` : ""}${k ? ` · tuş: <b>${esc(k)}</b>` : ""}</span>
        ${inMac ? '<span class="chip c-b small">makroda ✓</span>' : '<span class="chip c-o small">makroda değil · elle</span>'}</div>
        <div class="small mut">${esc(ALL[id].acik || "")}</div>
        ${inMac ? `<div class="small"><b>Neden makroda:</b> ${u.k === "dmg" ? u.why + " Bekleme süresi bitince makro kendisi kullanır." : "Bu stigma makroda; yine de zamanlama gerektiriyorsa makrodan çıkarmayı düşün."}</div>`
          : `<div class="small"><b>Neden makroda değil:</b> ${u.why}</div><div class="small"><b>Nerede, nasıl:</b> ${u.how}</div>`}</div></div>`; }).join("")}</div>`;
}
document.addEventListener("change", e => {
  if (e.target.id !== "mackey") return;
  S.macroKey = e.target.value; save(); const y = window.scrollY; render(); window.scrollTo(0, y);
});
R.pln = () => `<div class="note">Puanlarını gir ve <b>Dağıt</b>'a bas: üstte seçili moda (${MODES[S.mode].ad}) göre dağıtılır, sonuç Aktif/Pasif/Stigma sekmelerine işlenir. Aynı kutular o sekmelerin en üstünde de var.</div><div class="grid2">${pointCard("skill")}${pointCard("stigma")}</div>${macroAiCard()}`;

document.addEventListener("click", e => {
  const b = e.target.closest("[data-aid],[data-aiundo],[data-aireset]"); if (!b) return;
  if (b.dataset.aid) { if (AI_BUSY || b.disabled) return; b.disabled = true; aiDist(b.dataset.aid); }
  else if (b.dataset.aiundo) aiUndo(b.dataset.aiundo);
  else if (b.dataset.aireset) { const st = aiStore(); delete st.mac; delete st.macOut; delete st.macWhy; AI_RES.macro = null; applyAiOverrides(); save(); render(); }
});
document.addEventListener("change", e => {
  if (e.target.id !== "fsk") return;
  S.freeSkills = Math.max(0, parseInt(e.target.value) || 0); AI_RES.skill = null; save();
  const y = window.scrollY; render(); window.scrollTo(0, y);
}, true);
document.addEventListener("change", e => { if (e.target.id === "ft" && AI_RES.stigma) { AI_RES.stigma = null; const y = window.scrollY; render(); window.scrollTo(0, y); } });
applyAiOverrides();
