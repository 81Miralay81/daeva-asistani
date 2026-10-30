// ---------- Bulut kaydı (db) ----------
let DOC = null;
(async () => {
  try {
    const [db, user] = await Promise.all([claude.use("db"), claude.use("user")]);
    if (!db || !user) return;
    const id = await user.id(); if (!id) return;
    DOC = db.collection("data/users/" + id).doc("durum");
    const snap = await DOC.get();
    if (snap.exists) { const d = snap.data(); if (d && d.json) { S = merge(JSON.parse(d.json)); try { localStorage.setItem("templarTank", JSON.stringify(S)); } catch (e) {} if (TAB !== "ask") render(); } }
    setSaveState("Kayıt: hesabında");
  } catch (e) { DOC = null; }
})();
let saveTimer = null;
function cloudSave() {
  if (!DOC) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { DOC.set({ json: JSON.stringify(S) }).then(() => setSaveState("Kaydedildi")).catch(() => setSaveState("Bu tarayıcıda kayıtlı")); }, 800);
}
function setSaveState(t) { const el = document.getElementById("savest"); if (el) el.textContent = t; }

// ---------- Asistan (sample) ----------
let SAMPLE_READY = false, SAMPLE = null, CAN_IMG = false, CAN_TOOLS = false, CTL = null, BUSY = false, PENDING_IMG = null;
let CHAT = [];
try { CHAT = JSON.parse(localStorage.getItem("templarChat") || "[]"); } catch (e) { CHAT = []; }
function saveChat() { try { localStorage.setItem("templarChat", JSON.stringify(CHAT.slice(-40))); } catch (e) {} }
(async () => {
  try {
    SAMPLE = await claude.use("sample");
    if (SAMPLE) { const lim = await SAMPLE.limits().catch(() => null); CAN_IMG = !!(lim && lim.images); CAN_TOOLS = !!(lim && lim.tools); }
  } catch (e) { SAMPLE = null; }
  SAMPLE_READY = true;
  if (TAB === "ask") mountChat();
})();

const KNOWLEDGE = `
- Karakter: Templar (tank), seviye 45 (son seviye). Kullanıcı Türkçe konuşur, oyunu İngilizce arayüzle oynar.
- Yetenek seviyesi: Temel en fazla 10 (skill puanıyla). Üstü sadece bonusla: Daevanion (her yetenek için en fazla +4, 4 normal tahtada 1'er düğüm), ekipman (Soul Binding) ve Arcana kartları.
- Aktif specialty yuvaları TOPLAM seviyeye göre: 8 → 1 yuva, 12 → 2 yuva, 16 → 3 yuva. "16. sv" seçeneği 16'da açılır. Defiance'ın turuncusu 12 ister. Pasiflerde specialty yok.
- Skill puanı maliyeti (seviye başına): 2–4 → 1, 5–7 → 2, 8–10 → 4 (1→10 = 21). Sıfırlama ücretsiz, bonuslar yerinde kalır.
- Stigma: aynı anda sadece 4 stigma takılır, istediği zaman değiştirebilir (hepsi açık). Kilitler 5/10/15/20'de otomatik. Maliyet: 2–5 → 1, 6–10 → 2 (1→10 = 14). 10 üstü maliyeti bilinmiyor. Takılan stigma skill barına sürüklenmeli.
- Makro: tuşu sağ tık, basılı tutunca listeyi dener, cooldown'daki/şartı tutmayanı atlar. Cooldown'suz spam yeteneği en sona (filler). Şarjlı Punishment makroya konmaz. Delay 10 ms (kaçırıyorsa 40–50). Yön (üst mü alt mı öncelikli) oyunda test edilmeli: kuklada basılı tut, sadece filler basılıyorsa yön ters.
- Kalkan kullanımı: Shield of Protection → tek sert vuruştan hemen önce; Second Skin → enrage/seri saldırı/can hızla düşerken; Nezekan's Shield → grubu vuran alan saldırısından hemen önce (süre kısa); Defiance → CC yediysen/acil durum.
- Daevanion: Nezekan(12, combat speed/cooldown), Zikel(20, damage boost/tolerance), Vaizel(30, kritik), Triniel(40, multi-hit), Ariel(sadece PvE; Ascension Trial parçaları), Azphel(sadece PvP). Düğüm: gri 1 puan stat, yeşil 2 puan pasif +1, mavi yuvarlak 3 puan aktif +1, turuncu köşe 4 puan büyük bonus. Merkezden komşu düğümle ilerlenir, geri almak 500 Kina. Kullanıcının durumu: Nezekan/Zikel/Vaizel neredeyse tam, Triniel'de çok boş düğüm ve 4 turuncu eksik, Ariel tamamen boş, Azphel az.
- Arcana: Transcendence zindanlarından düşer (~1.600–1.700 item level). Kullanıcının hiç Arcana kartı yok, 4 altın + 1 mavi "Training Arcana" (geliştirme malzemesi) var. Arcana kartları belirli yeteneklere seviye ekler.
- İlerleme: item level ~1.532. 1.400–1.600: Vakron's Air Island, nightmare bossları, Ascension Ritual (1.500'de Normal açılır). 1.600+: Transcendence, Arcana.
- Silentium: Abyss Supply Request'e ver (Esc menüsü → Abyss Supply Request, Emergency/Weekly sekmeleri), satma.
- Rotasyon önemli bağlantılar: Shield Rush (20 stagger) ve Empyrean (150 stagger) Flash Rampage'i (%5 HP) açar. Shield Smite stun → Annihilate. Blok → Warding Shield heal, Fury grup buff'ı, Debilitating Smash.`;

function compactData() {
  const t = id => S.lv[id] ? S.lv[id][0] + S.lv[id][1] : null;
  return JSON.stringify({
    mod: S.mode, modlar: MODES,
    aktifler: ACTIVES.map(a => ({ id: a.id, ad: a.ad, cd: a.cd, acik: a.acik, specialty: a.opts, ozelGereksinim: a.req || {}, notlar: a.not || {}, oncelik: a.pri, temel: S.lv[a.id][0], bonus: S.lv[a.id][1], toplam: t(a.id) })),
    pasifler: PASSIVES.map(p => ({ id: p.id, ad: p.ad, etki: p.etki, temel: S.lv[p.id][0], bonus: S.lv[p.id][1], toplam: t(p.id) })),
    stigmalar: STIGMAS.map(s => ({ id: s.id, ad: s.ad, cd: s.cd, acik: s.acik, kilitler: s.sv, seviye: S.st[s.id] })),
    stigmaDizilim: STIGMA_SET, makro: MACRO, makroDisi: MACRO_DISI, puanOnceligi: SKILL_PRI, puanKaynagi: SKILL_KAYNAK,
    bostaSkillPuani: S.freeSkill, bostaStigmaPuani: S.freeStigma,
  });
}
function rules() {
  return `Sen Aion 2'de Templar (tank) oynayan bir oyuncunun kişisel danışmanısın. Türkçe, samimi ve net yaz.
Görevin: oyuncu durumunu anlatınca ya da bir şey sorunca "şunları kullan / şunu tak / şöyle dağıt" diye somut tavsiye vermek.
Kurallar:
- Önce ANA ÖNERİYİ ver (ne takacak/ne yapacak), sonra kısa nedenini, sonra varsa 1–2 OLASILIK/alternatif (hangi durumda o seçilir).
- Specialty önerirken rengini ve tam adını yaz (ör. "🟡 Sarı – Heal over Time"). Kilitliyse kaç seviye eksik olduğunu söyle.
- Puan dağıtırken maliyet tablosuna göre hesapla ve toplamı kontrol et.
- Seçili mod: ${MODES[S.mode].ad}. Oyuncu başka bir durum söylerse (PvP, kasma, boss...) ona göre cevap ver.
- Sadece aşağıdaki verilere ve bilgilere dayan. Bilmediğin bir şeyi uydurma; emin değilsen söyle ve oyundan hangi ekranın görüntüsünü göndermesi gerektiğini belirt.
- Oyuncu bir ekran görüntüsü eklediyse önce görüntüde ne gördüğünü kısaca söyle, sonra tavsiye ver.
${CAN_TOOLS ? "- Oyuncu yeni seviyeler söylerse (ör. \"Judgment 16 oldu\", \"Second Skin 10 yaptım\", \"boşta 8 puanım var\") önce ilgili aracı çağırarak kayıtlı durumu güncelle, sonra cevap ver. Mod değişikliği isterse set_mode kullan." : ""}
- Kısa tut: başlıklar yerine kalın yazı ve kısa listeler; gerekirse küçük bir tablo.

OYUN BİLGİLERİ:${KNOWLEDGE}

OYUNCUNUN VERİLERİ VE MEVCUT SEVİYELERİ (JSON, id'ler araç çağrılarında kullanılır):
${compactData()}`;
}
const TOOLS = () => [
  { name: "set_skill_levels", description: "Aktif veya pasif yeteneklerin kayıtlı seviyesini günceller. base = temel seviye (1-10), bonus = parantezdeki + değer. Sadece değişenleri gönder. Güncel değerleri döndürür.",
    inputSchema: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { id: { type: "string" }, base: { type: "number" }, bonus: { type: "number" } }, required: ["id"] } } }, required: ["items"] },
    execute(input) { const out = []; for (const it of (input.items || [])) { const id = String(it.id); if (!S.lv[id]) throw new Error("Bilinmeyen yetenek id: " + id);
      if (it.base != null) S.lv[id][0] = Math.min(10, Math.max(1, Math.round(Number(it.base))));
      if (it.bonus != null) S.lv[id][1] = Math.min(15, Math.max(0, Math.round(Number(it.bonus))));
      out.push({ id, temel: S.lv[id][0], bonus: S.lv[id][1], toplam: S.lv[id][0] + S.lv[id][1] }); } save(); noteTool("Seviyeler güncellendi"); return out; } },
  { name: "set_stigma_levels", description: "Stigma seviyelerini günceller (1-20). id'ler st_ ile başlar. Güncel değerleri döndürür.",
    inputSchema: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { id: { type: "string" }, level: { type: "number" } }, required: ["id", "level"] } } }, required: ["items"] },
    execute(input) { const out = []; for (const it of (input.items || [])) { const id = String(it.id); if (!(id in S.st)) throw new Error("Bilinmeyen stigma id: " + id);
      S.st[id] = Math.min(20, Math.max(1, Math.round(Number(it.level)))); out.push({ id, seviye: S.st[id] }); } save(); noteTool("Stigma seviyeleri güncellendi"); return out; } },
  { name: "set_free_points", description: "Boştaki skill ve/veya stigma puanını kaydeder.",
    inputSchema: { type: "object", properties: { skill: { type: "number" }, stigma: { type: "number" } } },
    execute(input) { if (input.skill != null) S.freeSkill = Math.max(0, Math.round(Number(input.skill))); if (input.stigma != null) S.freeStigma = Math.max(0, Math.round(Number(input.stigma))); save(); noteTool("Boş puanlar kaydedildi"); return { skill: S.freeSkill, stigma: S.freeStigma }; } },
  { name: "set_mode", description: "Uygulamanın seçili modunu değiştirir: pve, boss, kasma veya pvp.",
    inputSchema: { type: "object", properties: { mode: { type: "string", enum: ["pve", "boss", "kasma", "pvp"] } }, required: ["mode"] },
    execute(input) { const m = String(input.mode); if (!MODES[m]) throw new Error("Geçersiz mod"); S.mode = m; save(); document.getElementById("modes").innerHTML = modeButtons(); noteTool("Mod: " + MODES[m].ad); return { mode: m }; } },
];
function noteTool(t) { const el = document.getElementById("toolnote"); if (el) { el.textContent = "✓ " + t; el.hidden = false; } }

function md(src) {
  const lines = esc(src).split("\n"); let out = "", list = null, tbl = [];
  const inline = s => s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>");
  const flushList = () => { if (list) { out += `</${list}>`; list = null; } };
  const flushTbl = () => { if (!tbl.length) return;
    const cells = r => r.replace(/^\||\|$/g, "").split("|").map(c => inline(c.trim()));
    const body = tbl.filter(r => !/^\s*\|?[\s:\-|]+\|?\s*$/.test(r));
    out += `<div class="tw"><table>${body.map((r, i) => `<tr>${cells(r).map(c => i ? `<td>${c}</td>` : `<th>${c}</th>`).join("")}</tr>`).join("")}</table></div>`; tbl = []; };
  for (const raw of lines) {
    const l = raw.trimEnd();
    if (/^\s*\|.*\|\s*$/.test(l)) { flushList(); tbl.push(l.trim()); continue; } else flushTbl();
    let m;
    if ((m = l.match(/^#{1,4}\s+(.*)/))) { flushList(); out += `<p class="h">${inline(m[1])}</p>`; }
    else if ((m = l.match(/^\s*[-*•]\s+(.*)/))) { if (list !== "ul") { flushList(); out += "<ul>"; list = "ul"; } out += `<li>${inline(m[1])}</li>`; }
    else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== "ol") { flushList(); out += "<ol>"; list = "ol"; } out += `<li>${inline(m[1])}</li>`; }
    else if (!l.trim()) { flushList(); }
    else { flushList(); out += `<p>${inline(l)}</p>`; }
  }
  flushList(); flushTbl(); return out;
}

const QUICK = ["Zor zindan için bütün specialty ve stigmalarımı söyle", "Boşta 10 skill puanım var, nereye vereyim?", "PvP için stigma, specialty ve makro ver", "Judgment 16 oldu, ne seçeyim?"];
function rAsk() {
  if (!SAMPLE_READY) return `<div class="card"><div class="nm">Asistan</div><p class="mut">Asistan hazırlanıyor…</p></div>`;
  if (!SAMPLE) return `<div class="card"><div class="nm">Asistan</div><p class="mut">Asistan bu görünümde kullanılamıyor. Sayfayı Claude içinde açtığından ve Claude kullanımına izin verdiğinden emin ol. Diğer sekmeler normal çalışır.</p></div>`;
  return `<div class="chat">
    <div class="note">Durumunu yaz, sana ne takacağını söyleyeyim. Seçili mod: <b>${MODES[S.mode].ad}</b>. Seviyelerin bu sayfadaki kayıtlardan okunur${CAN_TOOLS ? "; yeni seviye söylersen kaydı ben güncellerim" : ""}.${CAN_IMG ? " Oyundan ekran görüntüsü de ekleyebilirsin." : ""}</div>
    <div id="msgs" class="msgs" aria-live="polite"></div>
    <div id="toolnote" class="toolnote" hidden></div>
    <div class="quick">${QUICK.map(q => `<button class="qbtn" type="button">${esc(q)}</button>`).join("")}</div>
    <form id="askf" class="askf">
      <textarea id="q" rows="2" placeholder="Örn: Second Skin 10 oldu, zor zindanda ne değişir?"></textarea>
      <div class="askbar">
        ${CAN_IMG ? `<label class="btn" for="imgin">Resim ekle</label><input type="file" id="imgin" accept="image/png,image/jpeg,image/webp" hidden><span id="imgname" class="mut small"></span>` : ""}
        <span class="spacer"></span>
        <button class="btn" type="button" id="clr">Sohbeti temizle</button>
        <button class="btn" type="button" id="stop" hidden>Durdur</button>
        <button class="btn pri" type="submit" id="send">Gönder</button>
      </div>
    </form></div>`;
}
function drawMsgs() {
  const box = document.getElementById("msgs"); if (!box) return;
  if (!CHAT.length) { box.innerHTML = `<div class="mut small empty">Henüz mesaj yok. Aşağıdaki hazır sorulardan birine bas ya da kendi sorunu yaz.</div>`; return; }
  box.innerHTML = CHAT.map((m, i) => `<div class="msg ${m.role}">${m.role === "user" ? esc(m.content).replace(/\n/g, "<br>") + (m.img ? `<div class="mut small">📎 ${esc(m.img)}</div>` : "") : `<div id="b${i}">${md(m.content)}</div>`}</div>`).join("");
  box.scrollTop = box.scrollHeight;
}
function mountChat() {
  if (TAB !== "ask") return;
  document.getElementById("main").innerHTML = rAsk();
  if (!SAMPLE) return;
  drawMsgs();
  const f = document.getElementById("askf"), q = document.getElementById("q");
  f.onsubmit = e => { e.preventDefault(); ask(q.value); };
  q.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(q.value); } };
  document.querySelectorAll(".qbtn").forEach(b => b.onclick = () => ask(b.textContent));
  document.getElementById("clr").onclick = () => { if (BUSY) return; CHAT = []; saveChat(); drawMsgs(); };
  document.getElementById("stop").onclick = () => CTL && CTL.abort();
  const im = document.getElementById("imgin");
  if (im) im.onchange = () => { PENDING_IMG = im.files[0] || null; document.getElementById("imgname").textContent = PENDING_IMG ? PENDING_IMG.name : ""; };
  setBusy(BUSY);
}
function setBusy(b) {
  BUSY = b; const s = document.getElementById("send"), st = document.getElementById("stop");
  if (s) s.disabled = b; if (st) st.hidden = !b;
}
const ERR = { not_granted: "Claude kullanımına izin verilmedi. Asistanı kullanmak için sayfayı yeniden açıp izin ver.", sampling_disabled: "Claude bu hesapta kullanılamıyor.", rate_limited: "Çok fazla istek gitti ya da kullanım limitine ulaşıldı. Biraz sonra tekrar dene.", session_expired: "Oturum süresi doldu, Claude'a yeniden giriş yap.", image_rejected: "Resim kabul edilmedi. PNG/JPG/WebP ve daha küçük bir dosya dene.", prompt_too_large: "Sohbet çok uzadı. \"Sohbeti temizle\" ile yeniden başla.", refused: "Bu soru yanıtlanamadı, farklı sormayı dene.", empty_completion: "Boş cevap geldi, soruyu biraz değiştirip tekrar dene." };
async function ask(text) {
  text = (text || "").trim(); if (!text || BUSY || !SAMPLE) return;
  const img = PENDING_IMG; PENDING_IMG = null;
  CHAT.push({ role: "user", content: text, img: img ? img.name : undefined });
  CHAT.push({ role: "assistant", content: "Düşünüyor…", pending: true });
  saveChat(); const q = document.getElementById("q"); if (q) q.value = ""; const n = document.getElementById("imgname"); if (n) n.textContent = ""; const im = document.getElementById("imgin"); if (im) im.value = "";
  const tn = document.getElementById("toolnote"); if (tn) tn.hidden = true;
  drawMsgs(); setBusy(true);
  const idx = CHAT.length - 1;
  const history = CHAT.slice(0, -1).filter(m => !m.pending && !m.err).slice(-12).map(m => ({ role: m.role, content: m.img ? m.content + `\n[Bu mesaja bir ekran görüntüsü eklendi${m === CHAT[idx - 1] ? "" : " (artık görünmüyor)"}]` : m.content }));
  while (history.length && history[0].role !== "user") history.shift();
  const input = [{ role: "user", content: rules() }, ...history];
  CTL = new AbortController();
  const opts = { cache: false, signal: CTL.signal, onText: ({ text }) => { CHAT[idx].content = text; const el = document.getElementById("b" + idx); if (el) { el.innerHTML = md(text); const box = document.getElementById("msgs"); box.scrollTop = box.scrollHeight; } } };
  if (img && CAN_IMG) opts.images = [img];
  if (CAN_TOOLS) { opts.tools = TOOLS(); delete opts.cache; }
  try {
    const { text: ans, truncated } = await SAMPLE(input, opts);
    CHAT[idx] = { role: "assistant", content: ans + (truncated ? "\n\n(Cevap yarıda kesildi, daha kısa bir soru sor.)" : "") };
  } catch (e) {
    const keep = e && e.text; const msg = e && e.code === "cancelled" ? "" : (ERR[e && e.code] || "Bağlantı sorunu oldu. Tekrar dene.");
    CHAT[idx] = { role: "assistant", content: (keep || "") + (msg ? (keep ? "\n\n" : "") + "⚠ " + msg : ""), err: !keep };
    if (!CHAT[idx].content) CHAT.splice(idx, 1);
  } finally { CTL = null; saveChat(); drawMsgs(); setBusy(false); }
}
