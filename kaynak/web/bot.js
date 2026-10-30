// ---------- Bulut kaydı (db, ücretsiz) ----------
let DOC = null;
(async () => {
  try {
    const [db, user] = await Promise.all([claude.use("db"), claude.use("user")]);
    if (!db || !user) return;
    const id = await user.id(); if (!id) return;
    DOC = db.collection("data/users/" + id).doc("durum");
    const snap = await DOC.get();
    if (snap.exists) { const d = snap.data(); if (d && d.json) { S = merge(JSON.parse(d.json)); const c = S.cls || "templar"; S.cls = null; applyClass(c); try { localStorage.setItem("templarTank", JSON.stringify(S)); } catch (e) {} render(); } }
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

// ---------- Kural tabanlı asistan (Claude kullanmaz) ----------
let CHAT = [];
try { CHAT = JSON.parse(localStorage.getItem("templarBot") || "[]"); } catch (e) { CHAT = []; }
function saveChat() { try { localStorage.setItem("templarBot", JSON.stringify(CHAT.slice(-30))); } catch (e) {} }

const norm = s => String(s).toLocaleLowerCase("tr").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c").replace(/İ/g, "i");

// Takma adlar (uzun olanlar önce eşleşir)
const TEMPLAR_ALIAS = [
  ["shield of protection","st_shield_of_protection"],["protection","st_shield_of_protection"],
  ["nezekan","st_nezekan_shield"],["empyrean","st_empyrean"],["armor of balance","st_armor_of_balance"],["balance","st_armor_of_balance"],
  ["second skin","st_second_skin"],["ikinci deri","st_second_skin"],["doom shield","st_doom_shield"],["doom","st_doom_shield"],
  ["noble armor","st_noble_armor"],["noble","st_noble_armor"],["executing blade","st_executing_blade"],["executing","st_executing_blade"],
  ["comrade in arms","st_comrade_in_arms"],["comrade","st_comrade_in_arms"],["grapple","st_grapple"],
  ["assault fury","st_assault_fury"],["assault","st_assault_fury"],["battlefield banner","st_battlefield_banner"],["banner","st_battlefield_banner"],
  ["taunt","st_taunt"],
  ["warding strike","warding_strike"],["warding shield","warding_shield"],["vicious strike","vicious_strike"],["vicious","vicious_strike"],
  ["pummel","pummel"],["poach","poach"],["shield smite","shield_smite"],["smite","shield_smite"],["judgment","judgment"],["judgement","judgment"],
  ["flash rampage","flash_rampage"],["rampage","flash_rampage"],["flash","flash_rampage"],["debilitating smash","debilitating_smash"],["debilitating","debilitating_smash"],["debil","debilitating_smash"],
  ["shield rush","shield_rush"],["rush","shield_rush"],["annihilate","annihilate"],["punishment","punishment"],["defiance","defiance"],
  ["enhance health","enhance_health"],["punishing benediction","punishing_benediction"],["benediction","punishing_benediction"],
  ["ironclad defense","ironclad_defense"],["ironclad","ironclad_defense"],["guarding seal","guarding_seal"],["impact hit","impact_hit"],
  ["insulting roar","insulting_roar"],["roar","insulting_roar"],["survival willpower","survival_willpower"],["survival","survival_willpower"],["willpower","survival_willpower"],
  ["block pain","block_pain"],["fury","fury"],["warding","warding_strike"],
];
let ALIAS = [];
function buildAlias() {
  if (CLS === "templar") { ALIAS = [...TEMPLAR_ALIAS].sort((a, b) => b[0].length - a[0].length); return; }
  const list = [], cnt = {};
  const items = [...ACTIVES, ...PASSIVES, ...STIGMAS].map(x => ({ id: x.id, n: norm(x.ad).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim() }));
  items.forEach(x => x.n.split(" ").filter(w => w.length >= 5).forEach(w => cnt[w] = (cnt[w] || 0) + 1));
  items.forEach(x => { list.push([x.n, x.id]); x.n.split(" ").filter(w => w.length >= 5 && cnt[w] === 1 && !/summon|strike|spirit|blade|arrow|shot/.test(w)).forEach(w => list.push([w, x.id])); });
  ALIAS = list.sort((a, b) => b[0].length - a[0].length);
}

function findSkills(t) {
  let rest = " " + t + " "; const found = [];
  for (const [a, id] of ALIAS) {
    const re = new RegExp("(^|[^a-z])" + a.replace(/ /g, "\\s+") + "(?=[^a-z]|$)", "g"); let m;
    while ((m = re.exec(rest))) { const pos = m.index + m[1].length; found.push({ id, pos, end: pos + m[0].length - m[1].length }); rest = rest.slice(0, pos) + "#".repeat(m[0].length - m[1].length) + rest.slice(pos + m[0].length - m[1].length); }
  }
  if (found.length) return found.sort((a, b) => a.pos - b.pos);
  // yazım hatası toleransı: tam yetenek adlarını kelime kelime benzerlikle eşle (ör. "judgmend" → Judgment, "second skn" → Second Skin)
  const words = [...t.matchAll(/[a-z']{3,}/g)];
  const tol = n => n >= 7 ? 2 : n >= 4 ? 1 : 0;
  const names = [...ACTIVES, ...PASSIVES, ...STIGMAS].map(x => ({ id: x.id, parts: norm(x.ad).replace(/[^a-z ]/g, " ").split(/\s+/).filter(p => p.length >= 3) }));
  let best = null;
  for (const n of names) {
    if (!n.parts.length) continue;
    let sum = 0, pos = 1e9, ok = true;
    for (const part of n.parts) { const m = words.map(w => ({ w, d: lev(w[0], part) })).filter(x => x.d <= tol(part.length)).sort((a, b) => a.d - b.d)[0];
      if (!m) { ok = false; break; } sum += m.d; pos = Math.min(pos, m.w.index); }
    if (ok && (!best || n.parts.length > best.len || (n.parts.length === best.len && sum < best.sum))) best = { id: n.id, sum, len: n.parts.length, pos };
  }
  if (best) found.push({ id: best.id, pos: best.pos, end: best.pos + 1, fuzzy: true });
  return found.sort((a, b) => a.pos - b.pos);
}
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
  { d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); }
  return d[a.length][b.length];
}
// yazılan yetenek başka bir sınıfa aitse o sınıfı bul
function otherClassSkill(t) {
  const words = [...t.matchAll(/[a-z']{3,}/g)].map(m => m[0]);
  const lists = { templar: [...TEMPLAR.ACTIVES, ...TEMPLAR.PASSIVES, ...TEMPLAR.STIGMAS].map(x => x.ad) };
  for (const c of Object.keys(CLASS_RAW)) lists[c] = [...CLASS_RAW[c].actives, ...CLASS_RAW[c].passives, ...CLASS_RAW[c].stigmas].map(x => x.name);
  for (const [c, names] of Object.entries(lists)) { if (c === CLS) continue;
    for (const n of names) { const nn = norm(n).replace(/[^a-z ]/g, " ").split(/\s+/).filter(x => x.length >= 3);
      if (nn.length && nn.every(part => words.some(w => lev(w, part) <= (part.length >= 7 ? 2 : part.length >= 4 ? 1 : 0)))) return { cls: c, name: n }; } }
  return null;
}
function findMode(t) {
  if (/\bpvp\b|oyuncu|savas alani|battleground|abyss pvp/.test(t)) return "pvp";
  if (/kasma|kasiyorum|farm|solo|mob kes|grind/.test(t)) return "kasma";
  if (/\bboss|zindan|zor\b|raid|nightmare|transcendence|pve|dungeon|expedition|trash/.test(t)) return "zindan";
  return null;
}
const isStig = id => id.startsWith("st_");
const nm = id => ALL[id].ad;
const ic = id => `<img class="bi" data-ic="${id}" alt="">`;
const C = { g: "🟢", b: "🔵", y: "🟡", o: "🟠", s16: "🟣" };
function optLine(sk, k) { return `${C[k]} <b>${RENK[k]}</b> – ${esc(sk.opts[k])}`; }

// ----- Cevap üreticileri -----
function aSpecialty(id) {
  const sk = ACTIVES.find(a => a.id === id); const t = tot(id); const p = picks(sk);
  let h = `<p>${ic(id)} <b>${sk.ad}</b> · toplam <b>${t}</b> (temel ${S.lv[id][0]} + ${S.lv[id][1]}) · açık yuva <b>${p.n}/3</b></p>`;
  if (!p.n) return h + `<p>Henüz specialty yuvası yok (8. seviyede açılır).</p>`;
  h += `<p><b>Tak:</b></p><ul>${p.chosen.map(k => `<li>${optLine(sk, k)}${sk.not && sk.not[k] ? ` <span class="mut">— ${esc(sk.not[k])}</span>` : ""}</li>`).join("")}</ul>`;
  const alt = p.rest.filter(k => t >= reqOf(sk, k)).slice(0, 2);
  if (alt.length) h += `<p><b>Olasılıklar:</b></p><ul>${alt.map(k => `<li>${optLine(sk, k)}${sk.not && sk.not[k] ? ` <span class="mut">— ${esc(sk.not[k])}</span>` : ""}</li>`).join("")}</ul>`;
  const locked = sk.pri[S.mode].filter(k => t < reqOf(sk, k));
  if (locked.length) h += `<p class="mut">🔒 ${locked.map(k => `${RENK[k]} ${reqOf(sk, k)}. sv'de açılır (+${reqOf(sk, k) - t})`).join(" · ")}</p>`;
  return h;
}
function aAllSpecialty() {
  let h = `<p><b>${MODES[S.mode].ad}</b> için specialty seçimlerin:</p><div class="tw"><table><tr><th>Yetenek</th><th>Sv</th><th>Tak</th></tr>`;
  for (const sk of ACTIVES) { const p = picks(sk); h += `<tr><td>${ic(sk.id)} ${sk.ad}</td><td>${tot(sk.id)}</td><td>${p.chosen.map(k => `${C[k]} ${esc(sk.opts[k])}`).join("<br>") || "—"}</td></tr>`; }
  return h + `</table></div><p class="mut">Bir yeteneğin adını yazarsan alternatiflerini de söylerim.</p>`;
}
function aStigma() {
  const st = STIGMA_SET[S.mode];
  let h = `<p><b>${MODES[S.mode].ad}</b> için 4 stigma:</p><ul>${st.set.map(id => `<li>${ic(id)} <b>${nm(id)}</b> <span class="mut">(Sv. ${S.st[id]})</span> — ${esc(ALL[id].acik)}</li>`).join("")}</ul>`;
  h += `<p><b>Olasılıklar:</b></p><ul>${st.alt.map(([id, w]) => `<li>${ic(id)} <b>${nm(id)}</b> — ${esc(w)}</li>`).join("")}</ul>`;
  return h + `<p class="mut">Taktıktan sonra skill barına sürüklemeyi unutma.</p>`;
}
function aStigmaOne(id) {
  const s = ALL[id], l = S.st[id], inSet = STIGMA_SET[S.mode].set.includes(id), alt = STIGMA_SET[S.mode].alt.find(a => a[0] === id);
  let h = `<p>${ic(id)} <b>${s.ad}</b> · Sv. <b>${l}</b> · ${s.cd}</p><p>${esc(s.acik)}</p>`;
  h += `<p>${inSet ? `✅ <b>${MODES[S.mode].ad}</b> dizilimine giriyor, takılı olsun.` : alt ? `🔁 Duruma göre: ${esc(alt[1])}.` : `➖ ${MODES[S.mode].ad} için 4'lüye girmiyor.`}</p>`;
  h += `<ul>${[5, 10, 15, 20].map(v => `<li>${l >= v ? "✅" : "🔒"} <b>${v}</b>: ${esc(s.sv[v])}</li>`).join("")}</ul>`;
  const nx = [5, 10, 15, 20].find(v => v > l);
  if (nx && nx <= 10) { let c = 0; for (let x = l + 1; x <= nx; x++) c += stigmaCost(x); h += `<p class="mut">Sonraki kilit (${nx}) için ${c} stigma puanı lazım.</p>`; }
  return h;
}
function aMacro() {
  const set = STIGMA_SET[S.mode].set, list = MACRO[S.mode].filter(id => !isStig(id) || set.includes(id));
  return `<p><b>${MODES[S.mode].ad}</b> makro sırası (üstteki öncelikli):</p><ol>${list.map((id, i) => `<li>${ic(id)} ${nm(id)}${i === list.length - 1 ? ' <span class="mut">(filler, en sonda)</span>' : ""}</li>`).join("")}</ol>
  <p><b>Makroya koyma:</b> ${MACRO_DISI.filter(([id]) => !isStig(id) || set.includes(id)).map(([id]) => nm(id)).join(", ")}.</p>
  <p class="mut">Delay 10 ms. Kuklada 5–6 sn basılı tut: sadece filler basılıyorsa yön ters, listeyi ters çevir.</p>`;
}
function aPoints(kind, n) {
  if (kind === "stigma") {
    S.freeStigma = n; save(); const pt = planStigma(n);
    const rows = Object.entries(pt.lv).filter(([id, v]) => v !== S.st[id]);
    return `<p><b>${n}</b> stigma puanı, <b>${MODES[S.mode].ad}</b> için:</p>${rows.length ? `<ul>${rows.map(([id, v]) => `<li>${ic(id)} ${nm(id)}: ${S.st[id]} → <b>${v}</b></li>`).join("")}</ul>` : "<p>Harcanacak uygun yer yok.</p>"}<p class="mut">Artan: ${pt.left}.</p>`;
  }
  const pool = kind === "passive" ? "passive" : "active";
  if (pool === "passive") S.freePassive = n; else S.freeActive = n; save();
  const ps = planSkills(n, pool);
  const rows = Object.entries(ps.lv).filter(([id, v]) => v !== S.lv[id][0]);
  return `<p><b>${n}</b> ${pool === "passive" ? "pasif" : "aktif"} yetenek puanı, <b>${MODES[S.mode].ad}</b> için:</p>${rows.length ? `<ul>${rows.map(([id, v]) => `<li>${ic(id)} ${nm(id)}: ${S.lv[id][0]} → <b>${v}</b></li>`).join("")}</ul>` : "<p>Harcanacak uygun yer yok.</p>"}<p class="mut">Artan: ${ps.left}. Maliyet: 2–4 → 1, 5–7 → 2, 8–10 → 4.</p>`;
}
function aSixteen() {
  if (CLS !== "templar") { const W16 = ACTIVES.map(a => ({ a, v: kscore(a.optsEn ? a.optsEn.s16 : a.opts.s16, S.mode, ROLE[CLS]) })).sort((x, y) => y.v - x.v).slice(0, 6);
    return `<p>Son yuva <b>${T()[2]}. seviyede</b> açılır; temel en fazla 10, üstü Daevanion (+4), ekipman ve Arcana bonusuyla gelir. <b>${MODES[S.mode].ad}</b> için Özel seçeneği en değerli olanlar:</p><ol>${W16.map(({ a }) => { const t = tot(a.id), L = T()[2]; return `<li>${ic(a.id)} <b>${a.ad}</b> (şimdi ${t}${t < L ? `, +${L - t} lazım` : " ✅"}) — ${esc(a.opts.s16)}</li>`; }).join("")}</ol>`; }
  const order = ["defiance", "judgment", "flash_rampage", "warding_strike", "shield_smite", "vicious_strike", "annihilate"];
  return `<p>Son yuva <b>${T()[2]}. seviyede</b> açılır; temel en fazla 10, üstü Daevanion (en fazla +4), ekipman ve Arcana bonusuyla gelir. Öncelik:</p><ol>${order.map(id => { const sk = ACTIVES.find(a => a.id === id); const t = tot(id), L = T()[2]; return `<li>${ic(id)} <b>${sk.ad}</b> (şimdi ${t}${t < L ? `, +${L - t} lazım` : " ✅"}) — ${esc(sk.opts.s16)}</li>`; }).join("")}</ol><p class="mut">Arcana kartı bulduğunda Quick Equip'te bu yetenekleri işaretle.</p>`;
}
function aShields() {
  if (CLS !== "templar") { const set = STIGMA_SET[S.mode].set; const def = [...set.map(id => ALL[id]), ALL.defiance].filter(x => x && /tolerance|shield|immunity|invulner|evasion|block|parry|heal|tenacity|crowd control/i.test(x.en || x.acik));
    return `<p><b>${MODES[S.mode].ad}</b> için savunma / acil durum yeteneklerin:</p><ul>${def.map(x => `<li>${ic(x.id)} <b>${x.ad}</b> (${x.cd}) — ${esc(x.acik)}</li>`).join("")}</ul><p class="mut">Kalkan ve hasar azaltmaları sert saldırıdan hemen önce bas, hepsini aynı anda harcama. Defiance'ı kontrol etkisi yediğinde kullan.</p>`; }
  return `<ul><li>${ic("st_shield_of_protection")} <b>Shield of Protection</b> (20 sn): boss'un <b>tek sert vuruşundan hemen önce</b>. En sık kullanacağın kalkan.</li>
  <li>${ic("st_second_skin")} <b>Second Skin</b> (1 dk 30 sn): enrage, seri saldırı ya da canın hızla düşerken. Tek vuruş için harcama.</li>
  <li>${ic("st_nezekan_shield")} <b>Nezekan's Shield</b> (1 dk): <b>grubu vuran alan saldırısından hemen önce</b>. Süresi kısa, erken basma.</li>
  <li>${ic("defiance")} <b>Defiance</b>: stun/knockdown yediysen ya da acil durumda; %20 HP verir.</li>
  <li>${ic("guarding_seal")} <b>Guarding Seal</b>: HP %50 altında kendiliğinden devreye girer.</li></ul>
  <p class="mut">Hepsini aynı anda basma; sırayla kullan ki her an bir koruman açık olsun.</p>`;
}
function aDaevanion() {
  const miss = [...ACTIVES, ...PASSIVES].filter(x => S.lv[x.id][1] < 4);
  return `<p>Her yetenek 4 normal tahtada birer düğümle en fazla <b>+4</b> alır (aktifler Σ kare, pasifler yeşil). Bonusu 4'ün altında olanlar (eksik düğüm olabilir):</p>
  ${miss.length ? `<ul>${miss.map(x => `<li>${ic(x.id)} ${x.ad}: +${S.lv[x.id][1]} → <b>${4 - S.lv[x.id][1]}</b> düğüm eksik olabilir</li>`).join("")}</ul>` : "<p>Hepsi tam görünüyor ✅</p>"}
  <p><b>Tahta durumu:</b> Nezekan, Zikel ve Vaizel neredeyse tam. Triniel'de çok boş düğüm ve 4 turuncu köşe eksik. <b>Ariel tamamen boş</b> (sadece PvE'de işler, zor zindan için önemli; parçalar Ascension Trial'dan). Azphel PvP içindir.</p>
  <p class="mut">Düğüm: gri ve parlak mavi 1 puan stat, yeşil 2 puan pasif +1, Σ işaretli mavi kare 3 puan aktif +1, turuncu köşe 4 puan büyük bonus. Merkezden komşu düğümle ilerlenir. Ağacı Daevanion sekmesinde görüp plan yapabilirsin.</p>`;
}
function aArcana() {
  return `<p><b>Arcana</b> kartları belirli yeteneklere seviye ekler ve Transcendence zindanlarından (~1.600–1.700 item level) düşer.</p>
  <ul><li>Takmak için: Arcana penceresi → <b>Equip</b> sekmesi → kartı seç → <b>Equip (F)</b>. Ya da <b>Quick Equip</b>.</li>
  <li>Quick Equip listesinde öncelikle 16. seviyeye yaklaştırmak istediğin yetenekleri işaretle ("Hangi yetenek 16'ya çıkmalı?" sorusuna bak).</li>
  <li>Altın/mavi "Training Arcana" kartları takılmaz; <b>Enhance</b> ile geliştirme malzemesi olarak kullanılır. Satma.</li>
  <li>Equip'te kart görünmüyorsa sol alttaki <b>Set Filter</b> / <b>Effect Filter</b>'ı temizle.</li></ul>`;
}
function aProgress() {
  return `<ol><li><b>1.400–1.600:</b> Vakron's Air Island (exploration sandığını en sona sakla), her zindan sonunda nightmare boss, Ascension Ritual (1.500'de Normal açılır).</li>
  <li>Sealed dungeon ve garrison'ları bitir, tüyleri topla (Daevanion kristali, kemer, Revelation Amulet).</li>
  <li><b>1.600–1.700:</b> ilk Transcendence zindanı, Abyss monolitine tüy.</li>
  <li><b>1.700+:</b> 5 kişilik Transcendence ile Arcana kartları.</li>
  <li>Her gün 5 günlük görev, Shugo Festival, invasion.</li></ol>`;
}
function aSilentium() {
  return `<p><b>Silentium</b>'u satma, <b>Abyss Supply Request</b>'e ver (Abyss Puanı + Kina).</p><ol><li>Esc menüsü → <b>Abyss Supply Request</b></li><li><b>Emergency</b> ve <b>Weekly</b> sekmelerinde Silentium isteyen talebi bul</li><li>Miktarı en yükseğe al, teslim et</li></ol><p class="mut">Talep yoksa günlük/haftalık sıfırlamayı bekle. Kaynak: Conquest Expedition 7, Exploration 4, Transcendence 10.</p>`;
}
function aSkillInfo(id) {
  if (isStig(id)) return aStigmaOne(id);
  if (ACTIVES.some(a => a.id === id)) return aSpecialty(id);
  const p = PASSIVES.find(x => x.id === id), pri = SKILL_PRI[S.mode];
  const nx = S.lv[id][0] < 10 ? skillCost(S.lv[id][0] + 1) : null;
  return `<p>${ic(id)} <b>${p.ad}</b> · temel ${S.lv[id][0]} + ${S.lv[id][1]} = <b>${tot(id)}</b></p><p>${esc(p.etki)}</p><p>Pasiflerde specialty yok. <b>${MODES[S.mode].ad}</b> puan önceliğinde <b>${pri.indexOf(id) + 1}.</b> sırada.${nx ? ` Sonraki seviye ${nx} puan.` : " Temel seviye tam (10)."}</p>`;
}
function aModeSummary() {
  return `<p><b>${MODES[S.mode].ad}</b> için özet:</p>${aStigma()}<hr>${aAllSpecialty()}<hr>${aMacro()}`;
}
function aHelp() {
  return `<p>Şunları anlarım:</p><ul>
  <li><b>Yetenek adı</b> → ne takacağın: "judgment ne takayım", "second skin"</li>
  <li><b>Seviye güncelleme</b> → "judgment 16 oldu", "fury temel 7", "second skin 10 yaptım"</li>
  <li><b>Puan</b> → "10 aktif puanım var", "8 pasif puan", "6 stigma puanı"</li>
  <li><b>Konular</b> → stigma, makro, specialty, kalkan, 16. seviye, daevanion, arcana, item level, silentium</li>
  <li><b>Mod</b> → zindan, kasma, pvp (soruya eklersen o moda geçerim)</li></ul>`;
}

function setLevelFromText(t, sk) {
  // "judgment 16 oldu", "fury temel 7", "judgment bonus 6", "second skin 10 yaptim"
  const after = t.slice(sk.end, sk.end + 40);
  const m = after.match(/^\D{0,25}?(\d{1,2})/); if (!m) return null;
  if (!/oldu|yaptim|yaptin|cikti|cikardim|seviye|\bsv\b|\blv|lvl|temel|bonus|\+/.test(after) && !/oldu|yaptim|cikardim/.test(t)) return null;
  const n = parseInt(m[1]); const id = sk.id;
  if (isStig(id)) { if (n < 1 || n > 20) return null; S.st[id] = n; return `${nm(id)} seviyesi <b>${n}</b> olarak kaydedildi.`; }
  if (/temel/.test(after)) { S.lv[id][0] = Math.min(10, Math.max(1, n)); return `${nm(id)} temel seviyesi <b>${S.lv[id][0]}</b> (toplam ${tot(id)}).`; }
  if (/bonus|\+/.test(after)) { S.lv[id][1] = Math.min(15, n); return `${nm(id)} bonusu <b>+${S.lv[id][1]}</b> (toplam ${tot(id)}).`; }
  if (n > 10) { S.lv[id][1] = Math.max(0, n - S.lv[id][0]); return `${nm(id)} toplam <b>${n}</b> olarak kaydedildi (temel ${S.lv[id][0]} + bonus ${S.lv[id][1]}).`; }
  S.lv[id][0] = Math.max(1, n); return `${nm(id)} <b>temel</b> seviyesi ${n} olarak kaydedildi (toplam ${tot(id)}). Toplamı kastettiysen "bonus" ile yaz.`;
}

function answer(q) {
  const t = norm(q); const out = [];
  const mode = findMode(t);
  if (mode && mode !== S.mode) { S.mode = mode; save(); document.getElementById("modes").innerHTML = modeButtons(); out.push(`<p class="mut">Mod: <b>${MODES[mode].ad}</b></p>`); }
  const sks = findSkills(t);
  if (!sks.length) { const o = otherClassSkill(t); if (o) return out.join("") + `<p><b>${esc(o.name)}</b> bir <b>${CLASS_NAME[o.cls]}</b> yeteneği; şu an <b>${CLASS_NAME[CLS]}</b> seçili.</p><p><button class="btn pri" data-swcls="${o.cls}">${CLASS_NAME[o.cls]} sınıfına geç</button> sonra sorunu tekrar yaz.</p>`; }
  // seviye güncellemeleri
  const ups = []; for (const s of sks) { const r = setLevelFromText(t, s); if (r) ups.push([s.id, r]); }
  if (ups.length) { save(); out.push(`<p>✓ ${ups.map(u => u[1]).join("<br>✓ ")}</p>`); ups.forEach(([id]) => out.push(aSkillInfo(id))); return out.join(""); }
  // puan
  const pm = t.match(/(\d{1,3})\s*(tane\s*)?(bos\s*)?(skill|stigma|beceri|aktif|pasif)?\s*(yetenek\s*)?puan/) || (/(puan)/.test(t) && t.match(/(\d{1,3})/));
  const kindOf = () => /stigma/.test(t) ? "stigma" : /pasif|passive/.test(t) ? "passive" : "active";
  if (pm && /puan/.test(t)) { const n = parseInt(pm[1]); out.push(aPoints(kindOf(), n)); return out.join(""); }
  if (/puan|dagit|nereye ver/.test(t)) { const parts = [S.freeActive ? aPoints("active", S.freeActive) : "", S.freePassive ? aPoints("passive", S.freePassive) : "", S.freeStigma ? aPoints("stigma", S.freeStigma) : ""].join(""); out.push(parts || `<p>Kaç puanın var? Örn: "<b>10 aktif puanım var</b>", "<b>8 pasif puan</b>" ya da "<b>6 stigma puanı</b>" yaz.</p>`); return out.join(""); }
  // konu
  if (/silentium|supply|ikmal/.test(t)) return out.join("") + aSilentium();
  if (/arcana|arkana|kart/.test(t)) return out.join("") + aArcana();
  if (/daevanion|devanion|tahta|dugum|node/.test(t)) return out.join("") + aDaevanion();
  if (/item level|itemlevel|\bil\b|guc|gp|combat power|ilerle|gear|ekipman/.test(t)) return out.join("") + aProgress();
  if (/\b16\b|on alti/.test(t) && !sks.length) return out.join("") + aSixteen();
  if (/kalkan|ne zaman bas|ne zaman kullan|savunma sira/.test(t) && !sks.length) return out.join("") + aShields();
  if (sks.length) { const uniq = [...new Set(sks.map(s => s.id))]; return out.join("") + uniq.map(aSkillInfo).join("<hr>"); }
  if (/makro|macro|sag tik/.test(t)) return out.join("") + aMacro();
  if (/stigma/.test(t)) return out.join("") + aStigma();
  if (mode && !/specialty|spesiyal/.test(t)) return out.join("") + aModeSummary();
  if (/specialty|spesiyal|ne takay|hangisini sec|secim/.test(t)) return out.join("") + aAllSpecialty();
  if (mode || /ozet|hepsi|tum|ne yapay|ayar ver/.test(t)) return out.join("") + aModeSummary();
  if (/yardim|ne sorabilirim|nasil kullan/.test(t)) return aHelp();
  return out.join("") + `<p>Bunu tam anlayamadım.</p>` + aHelp();
}

const QUICK = [["Tüm specialty seçimlerim", "specialty"], ["Hangi 4 stigmayı takayım?", "stigma"], ["Makro sırası", "makro"], ["Kalkanları ne zaman kullanayım?", "kalkan ne zaman"], ["Hangi yetenek son yuvaya çıkmalı?", "16"], ["Boştaki puanlarımı dağıt", "puan dagit"], ["Daevanion'da neyim eksik?", "daevanion"], ["Item level nasıl artar?", "item level"], ["Arcana nasıl takılır?", "arcana"], ["Silentium ne işe yarar?", "silentium"], ["Neler sorabilirim?", "yardim"]];
function rAsk() {
  return `<div class="chat">
    <div class="note">Sorunu yaz ya da hazır sorulardan birine bas. Cevaplar <b>${CLASS_NAME[CLS]}</b> için kayıtlı seviyelerine ve seçili moda (<b id="curmode">${MODES[S.mode].ad}</b>) göre hazırlanır. Claude kullanmaz, kullanım hakkı harcamaz.</div>
    <div id="msgs" class="msgs" aria-live="polite"></div>
    <div class="quick">${QUICK.map(([l, q]) => `<button class="qbtn" type="button" data-q="${esc(q)}">${esc(l)}</button>`).join("")}</div>
    <form id="askf" class="askf">
      <textarea id="q" rows="2" placeholder="Örn: judgment 15 oldu ne takayım · pvp için stigma · 10 aktif puanım var"></textarea>
      <div class="askbar"><span class="spacer"></span><button class="btn" type="button" id="clr">Sohbeti temizle</button><button class="btn pri" type="submit" id="send">Sor</button></div>
    </form></div>`;
}
function drawMsgs() {
  const box = document.getElementById("msgs"); if (!box) return;
  if (!CHAT.length) { box.innerHTML = `<div class="msg assistant">${aHelp()}</div>`; }
  else
  box.innerHTML = CHAT.map(m => `<div class="msg ${m.role}">${m.role === "user" ? esc(m.content) : m.html}</div>`).join("");
  box.querySelectorAll('img[data-ic]').forEach(i => i.src = iconSrc(i.dataset.ic));
  box.scrollTop = box.scrollHeight;
}
function mountChat() {
  document.getElementById("main").innerHTML = rAsk(); drawMsgs();
  const f = document.getElementById("askf"), q = document.getElementById("q");
  f.onsubmit = e => { e.preventDefault(); ask(q.value); };
  q.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(q.value); } };
  document.querySelectorAll(".qbtn").forEach(b => b.onclick = () => ask(b.dataset.q, b.textContent));
  document.getElementById("clr").onclick = () => { CHAT = []; saveChat(); drawMsgs(); };
}
function ask(text, label) {
  text = (text || "").trim(); if (!text) return;
  CHAT.push({ role: "user", content: label || text });
  CHAT.push({ role: "assistant", html: answer(text) });
  saveChat(); const q = document.getElementById("q"); if (q) q.value = "";
  const cm = document.getElementById("curmode"); if (cm) cm.textContent = MODES[S.mode].ad;
  drawMsgs();
}

document.addEventListener("click", e => { const b = e.target.closest("[data-swcls]"); if (b) { applyClass(b.dataset.swcls); save(); render(); } });
