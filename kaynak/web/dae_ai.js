// ---------- Daevanion: yapay zeka ile planla ----------
let DAE_RES = {};
const DVAL = {
  zindan: { S: 1, A: 1.6, P: 2.6, X: 4.2, O: 5 },
  kasma: { S: 1, A: 1.6, P: 2.3, X: 4.6, O: 5.2 },
  pvp: { S: 1, A: 1.7, P: 2.4, X: 4.2, O: 5.5 },
};
function daeInfo(b) {
  const g = DAE_GRID[b], n = g.length, c0 = Math.floor(n / 2) * n + Math.floor(n / 2);
  const typ = i => { const ch = g[Math.floor(i / n)][i % n]; return ch === "." || ch === "C" ? null : ch.toUpperCase(); };
  const nb = i => { const r = Math.floor(i / n), c = i % n; return [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, d]) => [r + a, c + d]).filter(([x, y]) => x >= 0 && y >= 0 && x < n && y < n).map(([x, y]) => x * n + y); };
  return { g, n, c0, typ, nb };
}
// Yapay zekanın listesini kurallara uydur: sadece bağlı düğümler, bütçe içinde, verilen sırayla
function daeFit(b, cand, budget, fresh) {
  const { c0, typ, nb } = daeInfo(b), st = dstate(b), on = new Set(fresh ? [] : st.own), plan = [];
  let left = budget, pend = cand.filter((i, k, a) => typ(i) && !on.has(i) && a.indexOf(i) === k), moved = true;
  while (moved) {
    moved = false;
    for (const i of [...pend]) {
      const c = NCOST[typ(i)];
      if (c <= left && nb(i).some(j => j === c0 || on.has(j))) { on.add(i); plan.push(i); left -= c; pend.splice(pend.indexOf(i), 1); moved = true; }
    }
  }
  return { plan, left, dropped: pend.length };
}
// Kural tabanlı: sınırdaki düğümlerden değer/maliyet oranı en iyi olanı al (arkasındaki değerli düğümü de say)
function daeLocal(b, budget, start, fresh) {
  const { g, n, c0, typ, nb } = daeInfo(b), st = dstate(b), on = new Set([...(fresh ? [] : st.own), ...(start || [])]), plan = [...(start || [])];
  const W = DVAL[S.mode] || DVAL.zindan, val = i => (typeof dvNodeVal === "function" ? dvNodeVal(b, i) : W[typ(i)]) * (st.note[i] ? 1.2 : 1);
  let left = budget;
  for (;;) {
    let best = null;
    for (let i = 0; i < n * n; i++) {
      if (!typ(i) || on.has(i) || !nb(i).some(j => j === c0 || on.has(j))) continue;
      const c = NCOST[typ(i)]; if (c > left) continue;
      const ahead = Math.max(0, ...nb(i).filter(j => typ(j) && !on.has(j)).map(val));
      const sc = (val(i) + 0.6 * ahead) / c;
      if (!best || sc > best.sc) best = { i, c, sc };
    }
    if (!best) break; on.add(best.i); plan.push(best.i); left -= best.c;
  }
  return { plan, left };
}
function daeBudget(b) {
  const bd = BOARDS.find(x => x.id === b), s = bsum(b), have = (S.daeHave || {})[bd.para] || 0;
  const saved = (S.daeBud || {})[b];
  return saved != null ? saved : Math.min(s.tot - s.own, have > 0 ? have : s.tot - s.own);
}
function daePrompt(b, budget, fresh) {
  const { g, n } = daeInfo(b), st = dstate(b), bd = BOARDS.find(x => x.id === b), own = new Set(fresh ? [] : st.own);
  const rows = g.map((row, r) => [...row].map((ch, c) => (ch === "." || ch === "C" ? ch : own.has(r * n + c) ? "#" : ch.toUpperCase())).join(" "));
  const notes = Object.fromEntries(Object.entries(st.note).map(([i, v]) => [`${Math.floor(i / n) + 1},${(i % n) + 1}`, v]));
  const bon = [...ACTIVES, ...PASSIVES].map(x => `${x.ad} +${S.lv[x.id][1]}`).join(", ");
  const special = b === "ariel" || b === "azphel";
  return `Sen Aion 2 (global sürüm) için uzman bir oyun danışmanısın. Google aramasıyla GÜNCEL ${CLASS_NAME[CLS]} Daevanion rehberlerini araştır.
Sınıf: ${CLASS_NAME[CLS]}. Mod: ${MODES[S.mode].ad}. OYUNCUNUN HEDEFİ: ${modeGoal()}
GÖREV: "${bd.ad}" Daevanion tahtası (${bd.one}; para: ${PARA[bd.para]}) için ${budget} puanlık en iyi ${fresh ? "dizilimi SIFIRDAN kur: oyuncunun şu anki dizilimini yok say, bütün düğümler alınmamış kabul et" : "planı çıkar"}.
KURALLAR: Bir düğüm ancak yatay/dikey komşusu alınmışsa (#), planda ya da başlangıçsa (C) alınabilir; yol kopuk olamaz. Maliyet: S=1, A=1 (parlak stat), ${special ? "P=2 (nadir stat), X=3 (epik stat)" : "P=2 (pasif yetenek +1), X=3 (aktif yetenek +1)"}, O=4 (köşedeki büyük bonus). Toplam ${budget} puanı GEÇME.
${special ? "" : `Oyuncunun yetenek bonusları (her yetenek normal tahtalardan en fazla +4 alır, eksik olanlara giden düğümler değerlidir): ${bon}.`}
HARİTA (${n}x${n}, satır ve sütun 1'den başlar; '.' boş, 'C' başlangıç, '#' alınmış, harfler alınmamış düğüm türü):
${rows.map((r, k) => `${String(k + 1).padStart(2)}: ${r}`).join("\n")}
${Object.keys(notes).length ? `Oyuncunun düğüm notları (satır,sütun: etki): ${JSON.stringify(notes)}` : ""}
ALINMAMIŞ DÜĞÜMLERİN GERÇEK ETKİLERİ (satır,sütun: tür maliyet: etki): ${typeof dvLabel === "function" ? DAE_GRID[b].flatMap((row, r) => [...row].map((ch, c) => (ch !== "." && ch !== "C" && !own.has(r * n + c)) ? `${r + 1},${c + 1}: ${ch.toUpperCase()}${NCOST[ch.toUpperCase()]}: ${dvLabel(b, r * n + c)}` : null)).filter(Boolean).join("; ") : ""}
Alınmış ama bu sınıf/mod için verimsiz görünen düğümler varsa gerekçede kısaca belirt.
Cevabının EN SONUNA sadece şu JSON'u \`\`\`json bloğunda ver; düğümleri ALINMA SIRASIYLA (her biri bir öncekine ya da alınmışa bağlı olacak şekilde) yaz:
{"dugumler":[[satır,sütun],[satır,sütun]],"gerekce":"2-4 cümle Türkçe"}`;
}
async function daeAi(kind) {
  if (AI_BUSY) return;
  const fresh = kind === "best", b = DB, ownPts = bsum(DB).own, budget = fresh ? (ownPts || daeBudget(DB)) : daeBudget(DB), { n } = daeInfo(b), state = aiState(), st = dstate(b), oldPlan = st.plan.slice();
  let res = null, err = null, model = S.gemModel;
  AI_BUSY = "dae"; AI_PROG = { kind: "dae", t0: Date.now(), phase: state === "ok" ? "net" : "calc", ai: state === "ok", model };
  render();
  if (state === "ok") {
    try {
      const r = await gemAsk(daePrompt(b, budget, fresh), true); model = r.model || model;
      AI_PROG.phase = "calc"; updProg();
      const j = aiJson(r.text), cand = (j.dugumler || j.nodes || []).map(x => Array.isArray(x) ? (+x[0] - 1) * n + (+x[1] - 1) : -1).filter(i => i >= 0 && i < n * n);
      if (!cand.length) throw new Error("Yapay zeka düğüm listesi vermedi");
      const f = daeFit(b, cand, budget, fresh), top = f.left > 0 ? daeLocal(b, f.left, f.plan, fresh) : { plan: f.plan, left: 0 };
      res = { plan: top.plan, left: top.left, ai: true, why: j.gerekce, dropped: f.dropped, topUp: f.left - top.left, sources: r.sources || [], switched: r.switched };
    } catch (e) {
      if (e && e.gem) { err = e.err; model = e.model || model; gemMark(err, model); }
      else err = { code: -1, status: "PARSE", message: String((e && e.message) || e) };
    }
  } else if (state === "cool") err = { code: 429, status: "COOLDOWN", message: "", retry: coolLeft(model) };
  AI_PROG.phase = "calc"; updProg(); await aiSleep(400);
  if (!res) { const p = daeLocal(b, budget, null, fresh); res = { plan: p.plan, left: p.left }; }
  AI_PROG.phase = "apply"; updProg(); await aiSleep(400);
  if (fresh) {
    const best = res.plan.slice(); S.dvBest = S.dvBest || {}; S.dvBest[b] = { nodes: best, mode: S.mode, cls: CLS };
    res.best = true; res.wrongN = st.own.filter(i => !best.includes(i)).length; res.missN = best.filter(i => !st.own.includes(i)).length;
    st.plan = best.filter(i => !st.own.includes(i));
  } else st.plan = res.plan;
  DAE_RES[b] = Object.assign(res, { err, model, state, budget, oldPlan, mode: S.mode, dur: Math.max(1, Math.round((Date.now() - AI_PROG.t0) / 1000)), cost: budget - res.left });
  AI_BUSY = null; AI_PROG = null; save(); render();
}
function daePlanCard(b) {
  const s = bsum(b), st = dstate(b), r = DAE_RES[b], bd = BOARDS.find(x => x.id === b);
  let h = `<div class="pc-head" style="margin-top:8px"><label for="dbud" class="small">Plan bütçesi</label><input type="number" min="0" id="dbud" value="${daeBudget(b)}" ${AI_BUSY ? "disabled" : ""}><span class="mut small">puan (${PARA[bd.para]})</span></div>
    <div class="lv"><button class="btn pri" data-daeai="1" ${AI_BUSY ? "disabled" : ""}>${AI_BUSY === "dae" ? "⏳ Çalışıyor…" : AI_BUSY ? "Bekle…" : "Oto düzenle (bütçeye göre)"}</button>
    <button class="btn" id="dclear" ${st.plan.length && !AI_BUSY ? "" : "disabled"}>Planı temizle${st.plan.length ? ` (${s.plan} puan)` : ""}</button></div>
    <div class="lv"><button class="btn" data-dvreset="${b}" ${AI_BUSY ? "disabled" : ""}>🧹 ${bd.ad} tahtasını sıfırla</button><button class="btn" data-dvreset="all" ${AI_BUSY ? "disabled" : ""}>🧹 Tüm tahtaları sıfırla</button></div>`;
  if (AI_BUSY === "dae") h += progressHtml();
  else if (r && r.mode === S.mode) {
    h += doneBar(r) + (r.err ? aiErrHtml(r.err, r.model) : "") +
      `<div class="small">${r.meta ? "⭐ <b>MetaBot top oyuncu dizilimi</b>" : "<b>Kural tabanlı</b>"} · ${MODES[r.mode].ad} · ${r.plan.length} düğüm, ${r.cost} puan · artan ${r.left}</div>
      ${r.best ? `<div class="note small">⭐ <b>${CLASS_NAME[CLS]} ${MODES[r.mode].ad} için en iyi dizilim</b> (${r.meta ? "MetaBot'ta en çok kullanılan" : r.cost + " puanla, sıfırdan"}). Sende olup bu dizilimde olmayan <b>${r.wrongN}</b> düğüm <b style="color:#ff4d4d">✕</b> ile, eksik olan <b>${r.missN}</b> düğüm <b style="color:var(--acc)">sarı</b> gösterildi.</div>` : ""}
      ${r.why ? `<p class="small">${esc(r.why)}</p>` : ""}
      ${r.dropped ? `<p class="small mut">Yapay zekanın önerdiği ${r.dropped} düğüm bağlantısız ya da bütçe dışı olduğu için alınmadı.</p>` : ""}
      ${r.topUp ? `<p class="small mut">Kalan ${r.topUp} puan kural tabanlı tamamlandı.</p>` : ""}
      ${srcLinks(r)}<p class="small mut">Plan ağaçta <b style="color:var(--acc)">sarı</b> kutular olarak işaretlendi.</p>`;
  } else h += `<p class="small mut">${aiState() === "ok" ? `Bütçeyi yaz ve <b>🤖 Oto düzenle</b>'ye bas: ${MODES[S.mode].ad} hedefine göre en iyi yolu bulup ağaca sarı olarak işaretler.` : aiHint().replace("dağıt", "planla")}</p>`;
  if (st.plan.length && !AI_BUSY) h += `<div class="lv"><button class="btn" id="dapply" title="Oyunda bu düğümleri aldıysan planı alınmış (renkli) olarak işaretler">✓ Oyunda aldım, alınmış işaretle</button></div>`;
  h += `<p class="small mut"><b>Planı temizle</b>: sadece sarı (planlanan) kutuları siler, alınmışlara dokunmaz. Alınmış işaretini değiştirmek için üstteki <b>Sahip olduklarımı düzelt</b> modunu kullan.</p>`;
  return h;
}
const _rDaeBase = R.dae;
R.dae = () => {
  const h = _rDaeBase();
  return h.replace(`<div class="lv" style="margin-top:8px"><button class="btn" id="dclear">Planı temizle</button><button class="btn pri" id="dapply">Planı alındı yap</button></div></div>`, daePlanCard(DB) + `</div>`);
};
document.addEventListener("click", e => {
  const b = e.target.closest("[data-daeai],[data-daebest]"); if (!b || AI_BUSY || b.disabled) return;
  b.disabled = true; daeAi(b.dataset.daebest ? "best" : "plan");
});
// Sıfırlama: ilk tık onay ister, ikinci tık sıfırlar
document.addEventListener("click", e => {
  const b = e.target.closest("[data-dvreset]"); if (!b || AI_BUSY) return;
  if (!b.dataset.ok) { b.dataset.ok = "1"; b.textContent = "⚠ Emin misin? Tekrar bas"; b.classList.add("pri"); setTimeout(() => { if (b.isConnected) { delete b.dataset.ok; render(); } }, 4000); return; }
  const list = b.dataset.dvreset === "all" ? DV_ORDER : [b.dataset.dvreset];
  for (const x of list) { S.dae[x] = { own: [], plan: [], note: {} }; DAE_RES[x] = null; if (S.dvBest) delete S.dvBest[x]; }
  if (b.dataset.dvreset === "all") S.daeFrom = null;
  DSEL = null; save(); render();
});
document.addEventListener("click", e => { if (e.target.id === "dclear" || e.target.id === "dapply") DAE_RES[DB] = null; }, true);
document.addEventListener("change", e => {
  if (e.target.id !== "dbud") return;
  S.daeBud = S.daeBud || {}; S.daeBud[DB] = Math.max(0, parseInt(e.target.value) || 0); save();
});
