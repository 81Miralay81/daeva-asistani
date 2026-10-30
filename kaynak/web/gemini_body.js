// ---------- Gemini yapay zeka (sadece masaüstü sürümünde) ----------
// Anahtar kullanıcının kendi Google AI Studio anahtarıdır; bilgisayarında saklanır, sayfaya gömülmez.
let GEM_READY = false, GEM_HAS_KEY = false, GEM_BUSY = false, GEM_OUT = null;
const gemApi = () => (window.pywebview && window.pywebview.api) || null;
window.addEventListener("pywebviewready", async () => {
  GEM_READY = true;
  try { GEM_HAS_KEY = !!(await gemApi().has_key()); } catch (e) { GEM_HAS_KEY = false; }
  if (TAB === "ai") render(); else document.getElementById("tabs").innerHTML = tabButtons();
  // günde bir kez güncelleme kontrolü
  if (GEM_HAS_KEY && S.gemAuto && (!S.gemLast || Date.now() - S.gemLast > 24 * 3600 * 1000)) gemUpdateCheck(true);
});
function tabButtons() { return TABS.map(([k, t]) => `<button data-t="${k}" class="${TAB === k ? "on" : ""}">${t}${k === "ai" && S.gemNew ? " •" : ""}</button>`).join(""); }

function gemContext() {
  const t = T();
  const act = ACTIVES.map(a => ({ ad: a.ad, temel: S.lv[a.id][0], bonus: S.lv[a.id][1], toplam: tot(a.id), acikYuva: slots(tot(a.id)),
    secenekler: Object.fromEntries(Object.keys(a.opts).map(k => [RENK[k], (a.optsEn ? a.optsEn[k] + " / " : "") + a.opts[k]])), uygulamaOnerisi: picks(a).chosen.map(k => RENK[k]) }));
  const pas = PASSIVES.map(p => ({ ad: p.ad, temel: S.lv[p.id][0], bonus: S.lv[p.id][1], etki: p.en || p.etki }));
  const stg = STIGMAS.map(s => ({ ad: s.ad, seviye: S.st[s.id], acik: s.en || s.acik, kilitler: s.svEn || s.sv }));
  return JSON.stringify({ sinif: CLASS_NAME[CLS], mod: MODES[S.mode].ad, yuvaSeviyeleri: t, toplamYetenekPuani_aktifPasifOrtak_sifirdanDagitilir: S.freeSkills || 0, bostaStigmaPuan: S.freeStigma || 0,
    maliyet: "Yetenek: 2-4. sv 1, 5-7. sv 2, 8-10. sv 4 puan (temel en fazla 10). Stigma: 2-5. sv 1, 6-10. sv 2 puan.", stigmaYuvasi: 4,
    uygulamaStigmaOnerisi: STIGMA_SET[S.mode].set.map(id => ALL[id].ad), aktifler: act, pasifler: pas, stigmalar: stg });
}
// Tek istek gönderir; model kapalıysa (404) ya da kotası dolduysa (429) kendiliğinden sıradaki uygun modele geçip bir kez daha dener.
async function gemAsk(prompt, search = true) {
  const api = gemApi(); if (!api) throw new Error("Masaüstü sürümü gerekli");
  S.gemCool = S.gemCool || {}; S.gemBad = S.gemBad || {};
  const tried = [], start = S.gemModel || "";
  let lastErr = null, firstErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const model = S.gemModel || "";
    tried.push(model);
    const r = await api.ask_gemini(model, prompt, search);
    if (r && r.ok) {
      if (r.model && r.model !== S.gemModel) { S.gemModel = r.model; save(); }
      if (attempt > 0) r.switched = { from: start || tried[0], to: r.model || model, why: firstErr && firstErr.code === 404 ? "kapalı" : zeroQuota(firstErr) ? "ücretsiz kotada kapalı" : "kotası dolu" };
      return r;
    }
    const er = normErr(r && r.error), used = (r && r.model) || model;
    lastErr = er; if (!firstErr) firstErr = er;
    if (er.code !== 404 && er.code !== 429) throw { gem: true, err: er, model: used };
    if (er.code === 429 && search && searchQuota(er) && !zeroQuota(er)) { // sadece arama kotası: aynı modelle aramasız dene
      const r2 = await api.ask_gemini(used, prompt, false);
      if (r2 && r2.ok) { r2.noSearch = true; if (attempt > 0) r2.switched = { from: start || tried[0], to: r2.model || used, why: firstErr && firstErr.code === 404 ? "kapalı" : zeroQuota(firstErr) ? "ücretsiz kotada kapalı" : "kotası dolu" }; return r2; }
    }
    if (er.code === 429 && !zeroQuota(er)) S.gemCool[used] = dayQuota(er) ? nextQuotaReset() : Date.now() + (er.retry || 60) * 1000; else S.gemBad[used] = { at: Date.now(), why: er.code === 404 ? "404" : "kota 0" };
    // sıradaki model: önce Google'ın önerdiği, sonra listedeki ilk uygun olan
    if (!(S.gemModels && S.gemModels.length)) { try { const l = await api.list_models(); if (l && l.ok) S.gemModels = l.models; } catch (e) {} }
    const sug = (/use (?:models\/)?([a-z0-9.\-]+)/i.exec(er.message || "") || [])[1];
    const ok = m => m && !S.gemBad[m] && !coolLeft(m) && !tried.includes(m);
    const next = [sug, ...(S.gemModels || [])].find(ok);
    save();
    if (!next) throw { gem: true, err: er, model: used };
    S.gemModel = next; save();
  }
  throw { gem: true, err: lastErr || normErr(null), model: S.gemModel };
}
async function gemRun(kind, extra) {
  if (GEM_BUSY) return;
  const cd = coolLeft(S.gemModel);
  if (cd > 0) { GEM_OUT = { kind, err: { code: 429, status: "COOLDOWN", message: "", retry: cd }, model: S.gemModel }; render(); return; } GEM_BUSY = true; GEM_OUT = { loading: true, kind }; render();
  const base = `Sen Aion 2 (global sürüm) için uzman bir oyun danışmanısın. Cevabı TÜRKÇE yaz, kısa ve uygulanabilir olsun. Google aramasıyla GÜNCEL bilgileri (yama notları, güncel buildler, meta) kontrol et; emin olmadığın yeri belirt.
OYUNCUNUN HEDEFİ: ${modeGoal()} Bütün önerilerini bu hedefe göre ver.`;
  let prompt;
  if (kind === "plan") prompt = `${base}
Aşağıda oyuncunun sınıfı, modu, yetenek/pasif/stigma seviyeleri, specialty seçenekleri ve boştaki puanları var.
1) Her aktif yetenek için açık yuva sayısına göre hangi specialty'leri takmalı (renk + kısa ad), uygulamanın önerisinden farklıysa nedenini söyle.
2) TOPLAM yetenek puanını (aktif+pasif ortak havuz; mevcut temel seviyeleri yok say, hepsi 1'den başlar, bonusları say) ve boştaki STİGMA puanlarını maliyet kurallarına göre nasıl dağıtmalı (yetenek: eski → yeni seviye, toplam puanı kontrol et).
3) ${MODES[S.mode].ad} için takılacak 4 stigma.
4) Makro sırası (üstteki öncelikli, cooldown'suz spam en sonda, şarjlı yetenekler ve kalkanlar hariç).
${extra ? "Oyuncunun ek notu: " + extra + "\n" : ""}VERİ: ${gemContext()}`;
  else if (kind === "update") prompt = `${base}
Aion 2 GLOBAL sürümünde son yamalarda ${CLASS_NAME[CLS]} sınıfı ve genel sistemlerde neler değişti? Özellikle: yetenek specialty yuvalarının açıldığı seviyeler (oyuncu şu an ${T().join("/")} kullanıyor), stigma kilit seviyeleri, puan maliyetleri, Daevanion ve ${CLASS_NAME[CLS]} yeteneklerindeki değişiklikler.
Madde madde, tarihleriyle yaz. Uygulamadaki ayarların değişmesi gerekiyorsa açıkça söyle. En sona, bulduysan specialty yuva seviyelerini tam şu biçimde tek satır yaz: YUVALAR=a,b,c (bulamadıysan bu satırı yazma).`;
  else if (kind === "char") prompt = `${base}
Aşağıda oyuncunun MetaBot.GG Armory'den okunan GÜNCEL karakter verisi var (ekipman, statlar, yetenek ve stigma seviyeleri, Daevanion).
1) Güçlü ve zayıf yönlerini kısaca özetle.
2) Hedefe göre EN ÖNEMLİ 5 eksik (ekipman güçlendirme, stigma seçimi/seviyesi, yetenek yuvası, Daevanion tahtası, tanrı statları) ve her biri için somut adım.
3) Hangi aktif yeteneklerin yeni specialty yuvasına yakın olduğu (yuvalar: ${T().join("/")}) ve ne takmalı.
4) Bu modda takılması gereken 4 stigma ve makro sırası.
KARAKTER: ${JSON.stringify(CH ? { ad: CH.name, sunucu: CH.server, sinif: CH.classKey, seviye: CH.level, savasGucu: CH.combatPower, itemLevel: CH.itemLevel, ekipman: CH.equipment, anaStatlar: CH.primary, tanriStatlari: CH.deity, aktifler: CH.actives, pasifler: CH.passives, stigmalar: CH.stigmas, daevanion: CH.daevanion } : {})}
UYGULAMA VERİSİ (specialty seçenekleri vb.): ${gemContext()}`;
  else if (kind === "verify") prompt = `${base}
Aşağıda uygulamadaki ${CLASS_NAME[CLS]} yetenek, specialty ve stigma verileri var. İnternette GÜNCEL Aion 2 global verileriyle karşılaştır.
Sadece FARKLARI listele: adı değişen/eklenen/kaldırılan yetenek, değişen specialty seçenekleri ve açılma seviyeleri, değişen stigma kilit etkileri, değişen cooldown'lar. Fark yoksa "Fark bulunamadı" yaz. Kaynak göster.
En sona, bulduysan specialty yuva seviyelerini tek satır yaz: YUVALAR=a,b,c
VERİ: ${gemContext()}`;
  else prompt = `${base}\nOyuncunun sorusu: ${extra}\nOyuncunun verisi: ${gemContext()}`;
  try {
    const r = await gemAsk(prompt, true);
    GEM_OUT = { kind, text: r.text, sources: r.sources || [], model: r.model, at: Date.now() };
    if (kind === "update") { S.gemLast = Date.now(); S.gemUpdate = GEM_OUT; S.gemNew = true; save(); }
  } catch (e) {
    const er = e && e.gem ? e.err : normErr(String((e && e.message) || e)), model = (e && e.model) || S.gemModel;
    S.gemCool = S.gemCool || {}; S.gemBad = S.gemBad || {};
    gemMark(er, model);
    save(); GEM_OUT = { kind, err: er, model };
  }
  GEM_BUSY = false; render();
}
async function gemUpdateCheck(silent) { if (silent) { try { const old = TAB; await gemRun("update"); if (old !== "ai") document.getElementById("tabs").innerHTML = tabButtons(); } catch (e) {} } else gemRun("update"); }

function normErr(e) {
  if (!e) return { code: 0, status: "", message: "Bilinmeyen hata" };
  if (typeof e === "object") return e;
  const m = /HTTP (\d+)/.exec(e); return { code: m ? +m[1] : 0, status: "", message: String(e) };
}
const zeroQuota = e => /limit:\s*0\b/i.test(e.message || "");
const dayQuota = e => /PerDay/i.test(e.message || "");
const minQuota = e => /PerMinute/i.test(e.message || "");
// Google'ın günlük ücretsiz kotası Pasifik gece yarısı yenilenir (Türkiye saatiyle 10:00–11:00)
function nextQuotaReset() { const d = new Date(), r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 8, 0, 0)); if (r <= d) r.setUTCDate(r.getUTCDate() + 1); return r.getTime(); }
const searchQuota = e => /search|grounding/i.test(e.message || "");
function coolLeft(model) { const u = (S.gemCool || {})[model]; return u ? Math.max(0, Math.ceil((u - Date.now()) / 1000)) : 0; }
const mmss = sec => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
// Hataların Türkçe açıklaması
function trGemErr(e, model) {
  const msg = e.message || "", st = e.status || "";
  const sug = (/use (?:models\/)?([a-z0-9.\-]+)/i.exec(msg) || [])[1];
  if (st === "COOLDOWN") return { t: `${model} şu an beklemede`, w: "Bu model kısa süre önce kullanım sınırına takıldı. Sayaç bitmeden aynı modeli zorlamak işe yaramaz, sadece süreyi uzatabilir.", d: "Sayacın bitmesini bekle ya da aşağıdan başka bir model seç." };
  if (st === "NO_KEY") return { t: "API anahtarı yok", w: "Gemini'yi kullanmak için kendi anahtarın gerekiyor.", d: "Soldaki kutuya Google AI Studio'dan aldığın anahtarı yapıştırıp Kaydet'e bas." };
  if (st === "NETWORK" || e.code === 0) return { t: "İnternet bağlantısı kurulamadı", w: "İstek Google'a ulaşamadı (internet kesik, güvenlik duvarı ya da zaman aşımı).", d: "İnternetini kontrol edip tekrar dene." };
  if (e.code === 400 && /api key/i.test(msg)) return { t: "API anahtarı geçersiz (HTTP 400)", w: "Google bu anahtarı tanımadı; yanlış kopyalanmış ya da silinmiş olabilir.", d: "AI Studio'dan anahtarı yeniden kopyala, Sil'e basıp tekrar kaydet." };
  if (e.code === 400) return { t: "İstek kabul edilmedi (HTTP 400 – hatalı istek)", w: "Model bu isteği işleyemedi; seçili model Google aramasını ya da bu tür isteği desteklemiyor olabilir.", d: "Listeden başka bir model (tercihen 'flash') seç ve tekrar dene." };
  if (e.code === 401 || e.code === 403) return { t: `Yetki yok (HTTP ${e.code} – erişim reddedildi)`, w: "Anahtarın bu modeli ya da Gemini API'yi kullanma iznine sahip değil; anahtar kısıtlanmış ya da proje kapatılmış olabilir.", d: "AI Studio'da yeni bir anahtar oluşturup kaydet." };
  if (e.code === 404) return { t: `Model bulunamadı (HTTP 404 – bulunamadı)`, w: `${model} artık kullanılamıyor ya da yeni kullanıcılara kapatılmış.${sug ? ` Google bunun yerine <b>${esc(sug)}</b> modelini öneriyor.` : ""}`, d: "Başka bir model seç (önerilen modeller listenin başında).", sug };
  if (e.code === 429 && zeroQuota(e)) return { t: `Bu model senin anahtarında ücretsiz kullanılamıyor (kota: 0)`, w: `Google, ${model} için ücretsiz anahtarlara hiç hak vermiyor (hata 429 "kota doldu" olarak geliyor ama aslında limit sıfır). Hiç kullanmamış olsan da bu hatayı alırsın.`, d: "Beklemek işe yaramaz. Yapay Zeka sekmesinde <b>Modelleri test et</b>'e bas ve ✅ çıkan bir modeli seç (genelde flash)." };
  if (e.code === 429 && searchQuota(e)) return { t: "Google araması kotası doldu (HTTP 429)", w: "Uygulama her soruda Google'da güncel bilgi aratıyor; bu aramanın ücretsiz hakkı modelin kendi kotasından ayrı ve daha düşük.", d: "Uygulama aramasız tekrar dener. Sürerse başka bir model seç ya da yarın tekrar dene." };
  if (e.code === 429 && dayQuota(e)) return { t: "Günlük ücretsiz hak bitti (HTTP 429)", w: `${model} için bugünkü ücretsiz istek hakkın doldu. (Uygulamanın her Dağıt / Planla / soru isteği 1 hak harcar; açılıştaki günlük kontrol de 1 hak.)`, d: `Yarın Türkiye saatiyle 10:00–11:00 civarı yenilenir (${new Date(nextQuotaReset()).toLocaleString("tr-TR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}). O zamana kadar başka bir model seç; her modelin günlük hakkı ayrı.` };
  if (e.code === 429 && minQuota(e)) return { t: "Dakikalık sınır doldu (HTTP 429)", w: `${model} için bir dakikada izin verilen istek ya da metin miktarı aşıldı.`, d: "1 dakika bekleyip tekrar dene." };
  if (e.code === 429) return { t: "Kullanım sınırı doldu (HTTP 429 – çok fazla istek)", w: `Ücretsiz kotada ${model} için dakikalık ya da günlük istek sınırına ulaşıldı.`, d: `Sayaç bitene kadar bu modeli kullanma; istersen başka bir model seç (her modelin kotası ayrıdır).` };
  if (e.code === 500 || e.code === 503) return { t: `Google tarafında geçici sorun (HTTP ${e.code} – sunucu meşgul)`, w: "Model şu an aşırı yoğun ya da geçici olarak çalışmıyor; senin ayarlarınla ilgili değil.", d: "Biraz sonra tekrar dene ya da başka bir model seç." };
  if (e.code === 200 && st === "EMPTY") return { t: "Boş cevap geldi", w: "Model cevap üretmedi (güvenlik filtresi ya da çok uzun istek).", d: "Notunu kısaltıp tekrar dene ya da başka bir model seç." };
  return { t: `Beklenmeyen hata${e.code ? ` (HTTP ${e.code})` : ""}`, w: "Google beklenmedik bir cevap döndürdü.", d: "Biraz sonra tekrar dene; sürerse ekran görüntüsünü gönder." };
}
// Her model için karar: Tercih et / İşe yarar / Yedek / Bekle / Kullanma + açıklama
function modelInfo(m) {
  const bad = (S.gemBad || {})[m], cd = coolLeft(m);
  const best = (S.gemModels || []).find(x => !(S.gemBad || {})[x] && !coolLeft(x) && /flash/.test(x) && !/lite|preview|exp/.test(x));
  if (bad) return { v: "❌ Kullanma", c: "bad", t: bad.why === "zero" || bad.why === "kota 0" ? "Bu model senin anahtarında ücretsiz kullanılamıyor (kota 0). Beklemek işe yaramaz." : "Google bu modeli kapattı ya da yeni kullanıcılara açmıyor (HTTP 404). Seçsen de hata verir." };
  if (cd) return { v: `⏳ Bekle ${mmss(cd)}`, c: "warn", t: "Bu modelin ücretsiz kotası doldu. Sayaç bitmeden kullanma; bu sürede başka bir model seç (her modelin kotası ayrıdır)." };
  if (!/gemini/.test(m)) return { v: "🚫 Kullanma", c: "bad", t: "Gemini modeli değil; Google aramasını desteklemiyor, güncel bilgi getiremez." };
  if (/preview|exp/.test(m)) return { v: "⚠ Gerekmedikçe kullanma", c: "warn", t: "Deneme sürümü. Bazen daha yeni bilgi verir ama her an kaldırılabilir ya da hata verebilir. Diğerleri beklemedeyse dene." };
  if (m === best) return { v: "⭐ Tercih et", c: "ok", t: "Şu an kullanılabilir en iyi kararlı flash. Hızlı, Google araması destekli, ücretsiz kotası geniş. Dağıt, makro ve günlük sorular için bunu kullan." };
  if (/lite/.test(m)) return { v: "👍 Yedek", c: "", t: "En hızlı ve kotası en bol olanı ama cevapları daha yüzeysel. Flash beklemedeyken basit dağıtımlar için iyi." };
  if (/pro/.test(m)) return { v: "👍 İşe yarar · az kullan", c: "", t: "En akıllısı; karakter değerlendirmesi ve zor kararlar için. Ücretsiz kotası çok düşük, yavaş ve sık sınıra takılır. Her gün her şey için kullanma." };
  if (/flash/.test(m)) return { v: "👍 İşe yarar", c: "", t: "Eski ya da alternatif flash sürümü. Çalışır ama önerilenden daha eski bilgiyle cevap verebilir. Önerilen beklemedeyse kullan." };
  return { v: "❔ Bilinmiyor", c: "mut", t: "Tanınmayan model. Deneyebilirsin; hata verirse başka birini seç." };
}
// ---- Model testi: hangi model bu anahtarla gerçekten çalışıyor? ----
let GEM_TEST = null;
async function gemTest() {
  const api = gemApi(); if (!api || GEM_BUSY) return;
  if (!(S.gemModels && S.gemModels.length)) { const l = await api.list_models(); if (l && l.ok) S.gemModels = l.models; else { GEM_TEST = { err: normErr(l && l.error), rows: [] }; render(); return; } }
  const models = S.gemModels.slice(0, 8);
  GEM_TEST = { running: true, rows: models.map(m => ({ m, s: "…", g: "…" })) }; GEM_BUSY = true; render();
  const res = r => !r ? "?" : r.ok ? "ok" : normErr(r.error).code === 404 ? "404" : normErr(r.error).code === 429 ? (zeroQuota(normErr(r.error)) ? "zero" : "429") : "err";
  for (const row of GEM_TEST.rows) {
    const a = await api.ask_gemini(row.m, "Sadece OK yaz.", false); row.s = res(a); row.sm = a && !a.ok ? normErr(a.error).message : "";
    if (row.s === "ok") { const b = await api.ask_gemini(row.m, "Sadece OK yaz.", true); row.g = res(b); row.gm = b && !b.ok ? normErr(b.error).message : ""; } else row.g = "-";
    S.gemBad = S.gemBad || {}; S.gemCool = S.gemCool || {};
    if (row.s === "404" || row.s === "zero") S.gemBad[row.m] = { at: Date.now(), why: row.s }; else if (row.s === "ok") { delete S.gemBad[row.m]; delete S.gemCool[row.m]; }
    render();
  }
  const best = GEM_TEST.rows.find(r => r.s === "ok" && r.g === "ok") || GEM_TEST.rows.find(r => r.s === "ok");
  if (best) S.gemModel = best.m;
  GEM_TEST.running = false; GEM_TEST.best = best && best.m; GEM_BUSY = false; save(); render();
}
function gemTestHtml() {
  const T2 = GEM_TEST, lab = { ok: "✅ çalışıyor", "404": "❌ kapalı", zero: "❌ ücretsiz kota 0", "429": "⏳ kota dolu", err: "⚠ hata", "?": "?", "…": "⏳", "-": "—" };
  if (T2.err) return `<p class="bad small">⚠ ${esc(T2.err.message || "Modeller alınamadı")}</p>`;
  return `<div class="card" style="margin-top:8px"><div class="nm small">Model testi ${T2.running ? "(sürüyor…)" : ""}</div><table class="small"><tr><th>Model</th><th>Normal</th><th>Google aramalı</th></tr>
    ${T2.rows.map(r => `<tr title="${esc(r.sm || r.gm || "")}"><td>${esc(r.m)}${r.m === T2.best ? " ⭐" : ""}</td><td>${lab[r.s] || r.s}</td><td>${lab[r.g] || r.g}</td></tr>`).join("")}</table>
    ${T2.running ? "" : T2.best ? `<p class="small ok">⭐ <b>${esc(T2.best)}</b> seçildi.${T2.rows.find(r => r.m === T2.best).g !== "ok" ? " Bu modelde Google araması çalışmıyor; cevaplar aramasız verilecek." : ""}</p>` : `<p class="small bad">Hiçbir model çalışmadı. Anahtarı AI Studio'da kontrol et ya da yarın tekrar dene.</p>`}</div>`;
}
function modelTag(m) { return `${m} — ${modelInfo(m).v}`; }
function modelInfoBox(m) {
  if (!m) return `<p class="small mut">Önce "Modelleri yükle / test et" düğmesine bas.</p>`;
  const i = modelInfo(m);
  return `<div class="note small" style="margin:6px 0"><b class="${i.c}">${i.v}</b> — ${i.t}</div>`;
}
function modelGuide() {
  const ms = (S.gemModels || []).filter(Boolean);
  if (!ms.length) return `<p class="small mut">Modeller yüklenince hangisinin tercih edileceği burada tek tek yazar.</p>`;
  return `<table class="small">${ms.map(m => { const i = modelInfo(m); return `<tr title="${esc(i.t)}"><td><b>${esc(m)}</b></td><td class="${i.c}" style="white-space:nowrap">${i.v}</td><td class="mut">${i.t}</td></tr>`; }).join("")}</table>`;
}
setInterval(() => {
  document.querySelectorAll("[data-until]").forEach(el => { const left = Math.max(0, Math.ceil((+el.dataset.until - Date.now()) / 1000)); el.textContent = left ? mmss(left) : "hazır ✓"; });
  const sel = document.getElementById("gemmodel"); if (sel && TAB === "ai") {
    [...sel.options].forEach(o => { const t = modelTag(o.value); if (o.textContent !== t) o.textContent = t; const ti = modelInfo(o.value).t; if (o.title !== ti) o.title = ti; });
    const bx = document.getElementById("gemminfo"), h1 = modelInfoBox(S.gemModel); if (bx && bx.innerHTML !== h1) bx.innerHTML = h1;
    const gd = document.getElementById("gemguide"); if (gd && Object.keys(S.gemCool || {}).length) { const h2 = modelGuide(); if (gd.innerHTML !== h2) gd.innerHTML = h2; }
  }
  if (TAB === "ai") { const cd = coolLeft(S.gemModel), b = document.getElementById("gemplan"); if (b && !GEM_BUSY && GEM_HAS_KEY) ["gemplan", "gemupd", "gemq", "gemver"].forEach(id => { const x = document.getElementById(id); if (x) x.disabled = cd > 0; }); }
}, 1000);
function gemMd(src) {
/*MD*/
  return md(src);
}
function rAi() {
  if (!GEM_READY) return `<div class="card"><div class="nm">🤖 Gemini yapay zeka</div>
    <p class="mut">Bu özellik <b>masaüstü sürümünde (DaevaAsistani.exe)</b> çalışır. Tarayıcıda açılan bu sayfa güvenlik nedeniyle dış servislere bağlanamaz.</p>
    <p class="mut small">Masaüstü sürümünde: kendi Gemini API anahtarını girersin, uygulama Google'da güncel bilgileri arayıp seviyelerine ve puanlarına göre öneri verir, her gün yamaları kendisi kontrol eder.</p></div>`;
  let h = `<div class="grid2"><div class="card"><div class="nm">Gemini API anahtarı</div>
    <p class="mut small">Anahtarı <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a>'dan ücretsiz alırsın ("Create API key"). Anahtar sadece bu bilgisayarda saklanır; exe'yi paylaşsan da anahtarın gitmez. Kimseyle paylaşma.</p>
    <div class="lv"><input type="password" id="gemkey" placeholder="${GEM_HAS_KEY ? "Kayıtlı ✓ (değiştirmek için yeni anahtar yaz)" : "AIza..."}" style="flex:1;min-width:200px"><button class="btn pri" id="gemsave">Kaydet</button>${GEM_HAS_KEY ? '<button class="btn" id="gemdel">Sil</button>' : ""}</div>
    <div class="lv"><label for="gemmodel">Model</label><select id="gemmodel" style="max-width:100%">${(S.gemModels || [S.gemModel || ""]).filter(Boolean).map(m => `<option value="${m}" title="${esc(modelInfo(m).t)}" ${m === (S.gemModel || "") ? "selected" : ""}>${modelTag(m)}</option>`).join("") || '<option value="">Önce "Modelleri yükle"</option>'}</select><button class="btn" id="gemlist" ${GEM_HAS_KEY ? "" : "disabled"}>Modelleri yükle</button><button class="btn" id="gemtest" ${GEM_HAS_KEY && !GEM_BUSY ? "" : "disabled"} title="Her modele kısa bir deneme isteği gönderir (aramasız ve aramalı)">Modelleri test et</button></div>
    ${GEM_TEST ? gemTestHtml() : ""}
    <div id="gemminfo">${modelInfoBox(S.gemModel)}</div>
    <details class="small" ${S.gemModels && S.gemModels.length ? "open" : ""}><summary>Hangi modeli seçmeliyim? (modelin üstüne gelince açıklama çıkar)</summary><div id="gemguide">${modelGuide()}</div>
      <p class="mut">Her modelin kotası ayrıdır: biri ⏳ beklemedeyse başka birini seçebilirsin.</p></details></div>
  <div class="card"><div class="nm">Yapay zekaya sor</div>
    <p class="mut small">${CLASS_NAME[CLS]} · ${MODES[S.mode].ad} · toplam ${S.freeSkills || 0} yetenek puanı (aktif+pasif, sıfırdan dağıtılır), ${S.freeStigma || 0} stigma puanı. Tek tek dağıtım için Puan Planı sekmesindeki 🤖 Dağıt düğmelerini kullan.</p>
    <div class="lv" style="flex-direction:column;align-items:stretch"><textarea id="gemnote" rows="2" placeholder="İsteğe bağlı not: ör. healer'ım zayıf, daha çok hayatta kalma istiyorum"></textarea></div>
    <div class="lv"><button class="btn pri" id="gemplan" ${GEM_HAS_KEY && !GEM_BUSY ? "" : "disabled"}>Puanlarıma göre araştır ve öner</button><button class="btn" id="gemupd" ${GEM_HAS_KEY && !GEM_BUSY ? "" : "disabled"}>Güncellemeleri kontrol et</button><button class="btn" id="gemq" ${GEM_HAS_KEY && !GEM_BUSY ? "" : "disabled"}>Notu soru olarak sor</button><button class="btn" id="gemver" ${GEM_HAS_KEY && !GEM_BUSY ? "" : "disabled"}>Yetenek verilerini doğrula</button></div>
    <p class="small"><b>Hedef:</b> ${modeGoal()}</p>
    <p class="mut small">Son otomatik kontrol: ${S.gemLast ? new Date(S.gemLast).toLocaleString("tr-TR") : "henüz yok"} .</p>
    <label class="small"><input type="checkbox" id="gemauto" ${S.gemAuto ? "checked" : ""}> Açılışta günde bir kez güncellemeleri kendiliğinden kontrol et <span class="mut">(her gün 1 ücretsiz hak harcar)</span></label></div></div>`;
  const out = GEM_OUT || S.gemUpdate;
  if (out) {
    if (out.loading) h += `<div class="card"><p>⏳ Gemini Google'da araştırıyor… (10–60 sn sürebilir)</p></div>`;
    else if (out.err || out.error) {
      const er = out.err || normErr(out.error), tr = trGemErr(er, out.model || S.gemModel), cd = coolLeft(out.model || S.gemModel);
      h += `<div class="card errcard"><p class="bad"><b>⚠ ${tr.t}</b></p><p><b>Neden:</b> ${tr.w}</p><p><b>Ne yapmalı:</b> ${tr.d}</p>
        <p class="small">Kullanılan model: <b>${esc(out.model || S.gemModel || "—")}</b>${cd ? ` · Bekleme: <b class="warn" data-until="${(S.gemCool || {})[out.model || S.gemModel]}">${mmss(cd)}</b>` : ""}</p>
        ${tr.sug ? `<button class="btn pri" id="gemsug" data-gm="${esc(tr.sug)}">${esc(tr.sug)} modeline geç</button>` : ""}
        ${er.message ? `<details class="small mut"><summary>Google'ın orijinal mesajı</summary>${esc(er.message)}</details>` : ""}</div>`;
    }
    else {
      const m = /YUVALAR\s*=\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(out.text || "");
      h += `<div class="card gemout"><div class="nm">${out.kind === "update" ? "Güncelleme kontrolü" : out.kind === "plan" ? "Önerilen plan" : out.kind === "char" ? "Karakter değerlendirmesi" : out.kind === "verify" ? "Veri doğrulama" : "Cevap"} <span class="mut small">· ${out.model || ""} · ${out.at ? new Date(out.at).toLocaleString("tr-TR") : ""}</span></div>
        ${m && m.slice(1).join(",") !== T().join(",") ? `<div class="note">Yapay zeka yuva seviyelerini <b>${m.slice(1).join(" / ")}</b> olarak buldu (şu an ${T().join(" / ")}). <button class="btn pri" id="gemslots" data-v="${m.slice(1).join(",")}">Uygula</button></div>` : ""}
        <div class="msg assistant" style="max-width:100%">${gemMd(out.text || "")}</div>
        ${out.sources && out.sources.length ? `<p class="small mut">Kaynaklar: ${out.sources.slice(0, 8).map(s => `<a href="${esc(s.uri)}" target="_blank" rel="noopener">${esc(s.title || s.uri)}</a>`).join(" · ")}</p>` : ""}
        <p class="small mut">Yapay zeka hata yapabilir; oyundaki tooltip'lerle karşılaştır.</p></div>`;
    }
  }
  return h;
}
R.ai = rAi;
document.addEventListener("click", async e => {
  const id = e.target.id; const api = gemApi();
  if (id === "gemsave" && api) { const k = document.getElementById("gemkey").value.trim(); if (!k) return; const r = await api.save_key(k); GEM_HAS_KEY = !!(r && r.ok); render(); }
  else if (id === "gemdel" && api) { await api.delete_key(); GEM_HAS_KEY = false; render(); }
  else if (id === "gemtest" && api) { gemTest(); }
  else if (id === "gemlist" && api) { e.target.textContent = "Bağlanıyor…"; const r = await api.list_models(); if (r && r.ok) { const bad = S.gemBad || {}; S.gemModels = [...r.models.filter(m => !bad[m]), ...r.models.filter(m => bad[m])]; const ok = S.gemModels.find(m => !bad[m] && !coolLeft(m)); if (!r.models.includes(S.gemModel) || bad[S.gemModel] || coolLeft(S.gemModel)) S.gemModel = ok || S.gemModels[0]; save(); GEM_OUT = { kind: "q", text: `Bağlantı başarılı ✓ — ${r.models.length} model bulundu. Seçili: **${S.gemModel}**`, at: Date.now(), model: S.gemModel }; } else GEM_OUT = { err: normErr(r && r.error), model: S.gemModel }; render(); }
  else if (id === "gemsug") { S.gemModel = e.target.dataset.gm; S.gemModels = [S.gemModel, ...(S.gemModels || []).filter(x => x !== S.gemModel)]; save(); GEM_OUT = null; render(); }
  else if (id === "gemplan") gemRun("plan", (document.getElementById("gemnote") || {}).value);
  else if (id === "gemupd") { S.gemNew = false; gemRun("update"); }
  else if (id === "gemq") { const q = (document.getElementById("gemnote") || {}).value; if (q && q.trim()) gemRun("q", q.trim()); }
  else if (id === "gemver") gemRun("verify");
  else if (id === "gemslots") { S.slotLv = e.target.dataset.v.split(",").map(Number); save(); render(); }
});
document.addEventListener("change", e => { if (e.target.id === "gemauto") { S.gemAuto = e.target.checked; save(); } });
document.addEventListener("change", e => { if (e.target.id === "gemmodel") { S.gemModel = e.target.value; save(); const bx = document.getElementById("gemminfo"); if (bx) bx.innerHTML = modelInfoBox(S.gemModel); } });
