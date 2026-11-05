// ---------- DPS Ölçer, Geri sayım, Harita, Eşya arama, Irk/Sunucu seçimi ----------
const DAPI = () => (window.pywebview && window.pywebview.api) || null;
const DESK = () => !!(DAPI() && DAPI().dps_snapshot);
const SERVERS = /*SERVERS*/{};
const HARITA = /*HARITA*/{ maps: {} };
const TRDAY = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const nfmt = n => { n = +n || 0; return n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(Math.round(n)); };
const hhmm = t => new Date(t * 1000).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
const dayOf = t => TRDAY[(new Date(t * 1000).toLocaleString("en-US", { weekday: "short", timeZone: "Europe/Istanbul" }) === "Sun" ? 6 : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(new Date(t * 1000).toLocaleString("en-US", { weekday: "short", timeZone: "Europe/Istanbul" })))];
const leftStr = s => { s = Math.max(0, s | 0); const h = s / 3600 | 0, m = (s % 3600) / 60 | 0, x = s % 60; return h >= 24 ? `${h / 24 | 0}g ${h % 24}s` : h ? `${h}s ${String(m).padStart(2, "0")}dk` : `${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}`; };
const CLSCOL = { gladiator: "#e0a050", templar: "#6fa8dc", assassin: "#b48ae6", ranger: "#8fce6a", sorcerer: "#e06666", spiritmaster: "#d58adb", cleric: "#f1e3a0", chanter: "#76d7c4", brawler: "#f6b26b" };
const noGame = (what) => `<div class="note small">⚠ <b>Oyun verisi yok.</b> ${what} oyun açıkken ve ölçer çalışırken gelir. Oyun kapalıyken gördüğün sayılar son kayıttır.</div>`;

// ---------------- Irk / sunucu (açılışta sorulur, sonra değiştirilebilir)
function profOk() { return S.prof && S.prof.race && S.prof.serverId; }
function profBox(first) {
  const p = S.prof || {}, race = p.race || "Elyos", reg = p.region || "eu";
  const list = Object.entries(SERVERS).map(([k, v]) => [+k, v]).filter(([k]) => (race === "Elyos" ? k < 2000 : k >= 2000) && String(k)[1] === ({ nae: "1", naw: "2", eu: "3", la: "4", as: "5" }[reg] || "3")).sort((a, b) => a[1].localeCompare(b[1]));
  return `<div class="pop-bg"></div><div class="pop-box" role="dialog" aria-modal="true">
    ${first ? "" : '<button class="pop-x" data-profclose="1" aria-label="Kapat">×</button>'}
    <div class="nm" style="font-size:17px">${first ? "Hoş geldin! Irkını ve sunucunu seç" : "Irk ve sunucu"}</div>
    <p class="mut small">Saha bossları, geri sayımlar ve harita buna göre yüklenir. Sonra üstteki ⚙ düğmesinden değiştirebilirsin.</p>
    <div class="chform">
      <label>Irk<select id="prace"><option ${race === "Elyos" ? "selected" : ""}>Elyos</option><option ${race === "Asmodian" ? "selected" : ""}>Asmodian</option></select></label>
      <label>Bölge<select id="preg">${REGIONS.map(([k, a]) => `<option value="${k}" ${reg === k ? "selected" : ""}>${a}</option>`).join("")}</select></label>
      <label>Sunucu<select id="psrv">${list.map(([k, v]) => `<option value="${k}" ${p.serverId == k ? "selected" : ""}>${esc(v)}</option>`).join("") || "<option value=''>—</option>"}</select></label>
    </div><button class="btn pri" id="psave">Kaydet</button></div>`;
}
function showProf(first) { let el = document.getElementById("profpop"); if (!el) { el = document.createElement("div"); el.id = "profpop"; document.body.appendChild(el); } el.innerHTML = profBox(first); }
document.addEventListener("change", e => {
  if (e.target.id === "prace" || e.target.id === "preg") { S.prof = Object.assign({}, S.prof, { race: document.getElementById("prace").value, region: document.getElementById("preg").value }); showProf(!profOk()); }
});
document.addEventListener("click", e => {
  if (e.target.id === "psave") {
    const sid = +document.getElementById("psrv").value; if (!sid) return;
    S.prof = { race: document.getElementById("prace").value, region: document.getElementById("preg").value, serverId: sid, serverName: SERVERS[sid] || "" };
    S.chRegion = S.prof.region; S.chServer = S.prof.serverName; save();
    const a = DAPI(); if (a && a.dps_settings) a.dps_settings({ race: S.prof.race, region: S.prof.region, serverId: sid, serverName: S.prof.serverName });
    document.getElementById("profpop").remove(); render();
  } else if (e.target.closest("[data-profclose]")) document.getElementById("profpop").remove();
  else if (e.target.id === "profbtn") showProf(false);
});

// ---------------- DPS Ölçer sekmesi
let DSNAP = null, DSET = null, DFIGHT = null, DTIMER = null, DOPEN = {}, DUPD = null;
async function dpsPoll() {
  const a = DAPI(); if (!a || !a.dps_snapshot) return;
  try { DSNAP = await a.dps_snapshot(null, DFIGHT); } catch (e) { DSNAP = null; }
  if (TAB === "dps") { const m = document.getElementById("main"), y = window.scrollY; m.innerHTML = rDps(); window.scrollTo(0, y); }
}
function dpsStatus(s) {
  const st = (s && s.status) || {};
  return { stopped: ["⏹", "Durdu", "mut"], waiting: ["⏳", "Oyun trafiği bekleniyor — oyuna gir", "warn"], quiet: ["⏸", "Bağlı, oyundan veri gelmiyor (yükleme ekranı?)", "warn"], capturing: ["●", "Ölçülüyor · " + (st.server || ""), "ok"] }[st.state || "stopped"];
}
function rDps() {
  if (!DESK()) return `<div class="card"><div class="nm">📊 DPS Ölçer</div><p class="note small">DPS ölçer sadece <b>bilgisayar sürümünde (DaevaAsistani.exe)</b> çalışır: oyunun ağ trafiğini bilgisayarda okur. Telefonda çalışmaz.</p></div>`;
  const s = DSNAP, set = DSET || {}, [ic, txt, cls] = dpsStatus(s), run = s && s.running;
  let h = `<div class="card chhead"><div><div class="nm">📊 DPS Ölçer <span class="${cls} small">${ic} ${esc(txt)}</span></div>
    <div class="small mut">${set.npcap === false ? '<span class="bad">⚠ Npcap kurulu değil</span> (DPS ölçer için bir kerelik gerekli). <button class="btn pri" id="npcapgo">Npcap\'i indir ve kur</button>' : "Pasif ölçüm: oyuna dokunmaz, sadece gelen trafiği okur."}</div></div>
    <div class="lv">${run ? '<button class="btn" id="dstop">⏹ Durdur</button><button class="btn" id="dreset">↻ Sıfırla</button>' : '<button class="btn pri" id="dstart">▶ Başlat</button><button class="btn" id="dstart2">Sadece ölç</button>'}
    <label class="small"><input type="checkbox" id="dparty" ${set.partyOnly !== false ? "checked" : ""}> Sadece parti</label>
    <label class="small"><input type="checkbox" id="dov" ${set.overlay !== false ? "checked" : ""}> Oyun üstü pencere</label></div></div>`;
  h += `<details class="card small"><summary><b>Oyun üstü pencere nasıl açılır?</b></summary><ol style="margin:6px 0;padding-left:18px">
    <li>Oyunda <b>Ayarlar → Grafik → Ekran modu: Pencereli tam ekran</b> (ya da Çerçevesiz) seç. Özel tam ekranda Windows hiçbir pencereyi oyunun üstüne koymaz.</li>
    <li>Burada <b>"Oyun üstü pencere"</b> kutusunu işaretle (sayfanın üstünde).</li>
    <li><b>▶ Başlat</b>'a bas: ölçer başlar, pencere sol üstte belirir. Oyun kapalıysa açılır; <b>zaten açıksa kapatılmaz, yeniden açılmaz</b>, ölçer açık oyuna bağlanır.</li>
    <li>Pencerede sadece parti DPS görünür; son boss dövüşü bir sonraki bossa vurana kadar ekranda kalır. Başlığından tutup sürükleyebilirsin; [–] küçültür, [×] kapatır, kalan küçük <b>D</b> düğmesi geri açar.</li></ol>
    Oyun Steam'den değil PURPLE'dan açılıyorsa: oyunu kendin aç, burada <b>Sadece ölç</b>'e bas.</details>`;
  if (s && s.status && s.status.error) h += `<div class="errcard small"><p class="bad"><b>⚠ ${esc(s.status.error)}</b></p></div>`;
  if (!s || !s.game) h += noGame("DPS ve parti bilgileri");
  const f = s && s.fight;
  if (s && s.history && s.history.length) h += `<div class="chips" style="margin-bottom:8px"><button class="chip ${!DFIGHT ? "pick" : ""}" data-dfight="">Canlı</button>${s.history.slice(0, 12).map(x => `<button class="chip ${DFIGHT === x.id ? "pick" : ""}" data-dfight="${x.id}"><b>${hhmm(x.start / 1000)}</b>${esc(x.boss || x.zone || "Savaş")} · ${nfmt(x.total)}</button>`).join("")}</div>`;
  if (!f) return h + `<div class="card"><p class="mut">Henüz savaş yok. ${run ? "Bir yaratığa vurunca burada belirir." : "<b>Başlat</b>'a bas; meteri zindana girmeden önce başlat ki parti üyelerinin adları gelsin."}</p></div>`;
  const b = f.boss;
  h += `<div class="card"><div class="dhead"><div><div class="nm">${esc((b && b.name) || f.zone || "Savaş")}</div>${f.members.some(m => m.name.startsWith("#")) ? `<div class="note small">#numara görünen oyuncuların adı henüz gelmedi: oyun adları yükleme ekranında gönderir. Ölçeri zindana girmeden önce başlat ya da bir kez ışınlan.</div>` : ""}<div class="mut small">${leftStr(f.dur)} · Toplam ${nfmt(f.total)} · Parti DPS ${nfmt(f.dps)}/s${f.hidden ? ` · ${f.hidden} parti dışı oyuncu gizli` : ""}</div></div></div>
    ${b && b.pct != null ? `<div class="bar" style="height:7px"><i style="width:${b.pct}%;background:var(--bad)"></i></div>` : ""}</div>`;
  h += `<div class="dcols">`;
  for (const m of f.members) {
    const col = CLSCOL[m.cls] || "var(--mut)";
    h += `<div class="card dcol" style="${m.self ? "border-color:var(--acc)" : ""}">
      <div class="nm" style="color:${col}">${esc(m.name)}</div><div class="mut small">${esc(m.clsName || "")}${m.gear ? ` · GS ${m.gear}` : ""}</div>
      <div style="font-size:18px;font-weight:700;margin-top:4px">${nfmt(m.dmg)}</div>
      <div class="mut small">${nfmt(m.dps)}/s · %${m.share} · kritik %${m.crit}</div>
      <div class="bar" style="margin:6px 0"><i style="width:${m.share}%;background:${col}"></i></div>
      ${m.skills.map(k => `<div class="dsr" title="${esc(k.name)}\n${k.hits} vuruş · kritik %${k.crit} · ort ${nfmt(k.avg)} · en büyük ${nfmt(k.max)}${k.dot ? " · DoT" : ""}">
        ${k.icon ? `<img src="${esc(k.icon)}" alt="" loading="lazy" onerror="if(!this.dataset.f){this.dataset.f=1;this.src='https://assets.playnccdn.com/static-aion2-gamedata/resources/Icon_GodStone_001.png'}else{this.replaceWith(Object.assign(document.createElement('span'),{className:'dsk-n',textContent:'✦'}))}">` : '<span class="dsk-n">✦</span>'}
        <div class="dsr-t"><div class="dsr-n">${esc(k.name)}</div><div class="dsr-b"><i style="width:${k.share}%"></i></div></div><div class="dsr-v">${nfmt(k.dmg)}<div class="mut">%${k.share}</div></div></div>`).join("")}
    </div>`;
  }
  h += `</div>`;
  return h;
}
async function dpsAction(fn, ...a) { const api = DAPI(); if (!api) return; const r = await api[fn](...a); if (r && r.ok === false) alert(r.error || "Olmadı"); DSET = await api.dps_settings(); await dpsPoll(); return r; }
document.addEventListener("click", async e => {
  const id = e.target.id, fd = e.target.closest("[data-dfight]"), mem = e.target.closest("[data-dmem]");
  if (id === "dstart") { const r = await dpsAction("dps_start", true); if (r && r.game && r.game.ok === false) alert("Ölçer çalışıyor ama oyun açılamadı: " + r.game.error);
    else if (r && r.game && r.game.how === "already") alert("Oyun zaten açık: kapatılmadı, ölçer açık oyuna bağlandı.\n\nParti üyelerinin adları bir yükleme ekranında (ışınlanma / zindana giriş) gelir; o zamana kadar #numara görünebilir."); }
  else if (id === "npcapgo") { const b = e.target; b.disabled = true; b.textContent = "İndiriliyor…";
    const r = await DAPI().npcap_install();
    b.textContent = r.ok ? "Kurulum açıldı: Windows izin sorusuna Evet, sonra İleri → Kur. Bitince uygulamayı yeniden aç." : "Olmadı: " + (r.error || ""); if (!r.ok) b.disabled = false; }
  else if (id === "dstart2") dpsAction("dps_start", false);
  else if (id === "dstop") dpsAction("dps_stop");
  else if (id === "dreset") dpsAction("dps_reset");
  else if (fd) { DFIGHT = fd.dataset.dfight ? +fd.dataset.dfight : null; dpsPoll(); }
  else if (mem) { const k = mem.dataset.dmem; DOPEN[k] = DOPEN[k] === false; dpsPoll(); }
  else if (id === "dupd") { const b = document.getElementById("dupd"); b.textContent = "İndiriliyor…"; const r = await DAPI().dps_apply_update(); DUPD = r.ok ? { done: r.version } : { err: r.error }; updBanner(); }
  else if (id === "dupdx") { DUPD = null; updBanner(); }
  else if (id === "appupd") { const b = e.target; b.disabled = true; b.textContent = "İndiriliyor… uygulama kapanıp yeni sürümle açılacak"; const r = await DAPI().app_install(DUPD.app.url); if (!r.ok) { b.textContent = "Olmadı: " + (r.error || ""); b.disabled = false; } }
});
document.addEventListener("change", async e => {
  const a = DAPI(); if (!a || !a.dps_settings) return;
  if (e.target.id === "dparty") { DSET = await a.dps_settings({ partyOnly: e.target.checked }); dpsPoll(); }
  if (e.target.id === "dov") { DSET = await a.dps_settings({ overlay: e.target.checked }); }
});

// ---------------- Kaynak / sürüm güncellemesi (açılışta)
function updBanner() {
  let el = document.getElementById("updbar"); const d = DUPD;
  if (!d) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement("div"); el.id = "updbar"; el.className = "note small"; el.style.cssText = "margin:8px 16px"; document.querySelector("main").before(el); }
  el.innerHTML = d.done ? `✅ DPS kaynağı güncellendi (sürüm ${esc(d.done)}). <button class="btn" id="dupdx">Tamam</button>`
    : d.err ? `⚠ Güncelleme olmadı: ${esc(d.err)} <button class="btn" id="dupdx">Kapat</button>`
    : `${d.data ? `🔔 <b>Yeni DPS kaynağı var</b> (${esc(d.local)} → ${esc(d.remote)}). ${esc(d.notes || "")} <button class="btn pri" id="dupd">Güncelle</button> ` : ""}
       ${d.app && d.app.new ? `🔔 <b>Kanatix Daeva Asistanı ${esc(d.app.version)} çıktı</b> (sende ${esc(d.app.current)}). ${d.app.canAuto ? `<button class="btn pri" id="appupd">Güncelle ve yeniden aç</button>` : `<a class="btn pri" href="${esc(d.app.page)}" target="_blank" rel="noopener">İndir</a>`} ` : ""}<button class="btn" id="dupdx">Sonra</button>`;
}

// ---------------- Geri sayım (Türkiye saati)
const SCHED = [
  { id: "rift", name: "Spacetime Rift", kind: "olay", anchor: 0, every: 10800, dur: 600, note: "Portallar 10 dk açık" },
  { id: "kaira", name: "Watcher Kaira (Reshanta)", kind: "abyss", anchor: 57600, every: 10800, dur: 0, note: "Abyss dünya bossu" },
  { id: "daily", name: "Günlük sıfırlama", kind: "sıfırlama", anchor: 25200, every: 86400, dur: 0, note: "" },
  { id: "weekly", name: "Haftalık sıfırlama", kind: "sıfırlama", anchor: 25200 + 6 * 86400, every: 604800, dur: 0, note: "Çarşamba" },
];
function localTimers() {
  const now = Date.now() / 1000 | 0, out = [];
  for (const s of SCHED) { const k = Math.floor((now - s.anchor) / s.every), st = s.anchor + k * s.every, act = s.dur && now < st + s.dur;
    out.push({ id: s.id, name: s.name, kind: s.kind, note: s.note, at: act ? st : st + s.every, active: !!act, src: "program" }); }
  (S.customTimers || []).forEach((c, i) => { const [hh, mm] = (c.time || "20:00").split(":").map(Number);
    for (let d = 0; d < 8; d++) { const dt = new Date(); dt.setDate(dt.getDate() + d); dt.setHours(hh, mm, 0, 0); const t = dt.getTime() / 1000 | 0, wd = (dt.getDay() + 6) % 7;
      if ((!c.days || !c.days.length || c.days.includes(wd)) && (t > now || (c.dur && now < t + c.dur * 60))) { out.push({ id: "c" + i, name: c.name, kind: "özel", note: c.note || "", at: t, active: t <= now, src: "sen" }); break; } } });
  return out;
}
let TSRV = null;
async function timerPoll() {
  const a = DAPI(); if (a && a.timers) { try { TSRV = await a.timers(); } catch (e) {} }
  if (TAB === "zam") { const m = document.getElementById("main"), y = window.scrollY; m.innerHTML = rZam(); window.scrollTo(0, y); }
}
function rZam() {
  const now = Date.now() / 1000 | 0, shown = new Set(S.ovTimers || []), hid = { has: k => !shown.has(k) };
  let list = localTimers();
  if (TSRV && TSRV.timers) { const extra = TSRV.timers.filter(t => /^(fb|k)\d/.test(t.id)); list = list.concat(extra); }
  list.forEach(t => t.left = t.active ? 0 : t.at - now); list.sort((a, b) => (b.active - a.active) || a.at - b.at);
  const row = t => `<tr class="${hid.has(t.id) ? "dim" : ""}"><td><b class="${t.active ? "ok" : t.left < 600 ? "warn" : ""}">${t.active ? "ŞİMDİ" : leftStr(t.left)}</b></td>
    <td>${esc(t.name)}<div class="mut small">${esc(t.kind)}${t.note ? " · " + esc(t.note) : ""}${t.src === "oyun" ? " · oyundan" : t.src === "ölçer" ? " · ölçer gördü" : ""}</div></td>
    <td class="nowrap">${dayOf(t.at)} ${hhmm(t.at)}</td>
    <td><button class="spec-tog ${hid.has(t.id) ? "" : "on"}" data-thide="${t.id}" title="Oyun üstündeki pencerede göster/gizle">${hid.has(t.id) ? "üstte göster" : "✓ üstte"}</button>${t.id[0] === "c" && t.src === "sen" ? ` <button class="spec-tog" data-tdel="${t.id.slice(1)}">sil</button>` : ""}</td></tr>`;
  const fb = list.filter(t => t.kind === "saha bossu"), other = list.filter(t => t.kind !== "saha bossu");
  return `<div class="card chhead"><div><div class="nm">⏰ Geri sayımlar <span class="mut small">· Türkiye saati (${hhmm(now)})</span></div>
    <div class="small mut">${S.prof ? `${esc(S.prof.race)} · ${esc(S.prof.serverName)}` : ""} <button class="btn" id="profbtn">⚙ Irk/sunucu</button></div></div></div>
    ${!(TSRV && TSRV.game) ? noGame("Saha boss zamanları") : ""}
    <div class="card"><div class="sec" style="margin-top:0">Olaylar, Abyss ve sıfırlamalar</div><table>${other.map(row).join("")}</table></div>
    <div class="card"><div class="sec" style="margin-top:0">Saha bossları (${esc((S.prof && S.prof.race) || "")})</div>
      ${fb.length ? `<table>${fb.map(row).join("")}</table>` : `<p class="mut small">Oyun içinde <b>haritayı aç → saha boss listesine</b> bir kez bak: oyun her bossun geri gelme saatini gönderir, ölçer (çalışıyorsa) burayı kendisi doldurur. Boss öldüğünü görürse de 6/12 saatlik sayacı başlatır.</p>`}</div>
    <div class="card"><div class="sec" style="margin-top:0">Kendi geri sayımın (siege, Abyss savaşı, etkinlik…)</div>
      <div class="chform"><label>Ad<input id="tcn" placeholder="Siege"></label><label>Saat (TR)<input id="tct" type="time" value="21:00"></label>
      <label>Süre (dk)<input id="tcd" type="number" value="0" style="min-width:60px;width:70px"></label>
      <label>Günler<span style="display:flex;gap:8px;flex-wrap:wrap">${TRDAY.map((d, i) => `<label class="small" style="display:inline-flex;flex-direction:row;gap:3px;align-items:center"><input type="checkbox" class="tcday" value="${i}" style="min-width:0">${d}</label>`).join(" ")}</span></label>
      <button class="btn pri" id="tcadd">Ekle</button></div><p class="mut small">Gün seçmezsen her gün tekrar eder. Oyun üstündeki pencerede sadece "üstte göster" dediğin sayaçlar görünür (başta hepsi kapalı).</p></div>`;
}
function pushTimers() { const a = DAPI(); if (a && a.dps_settings) a.dps_settings({ customTimers: S.customTimers || [], ovTimers: S.ovTimers || [], showTimers: (S.ovTimers || []).length > 0 }); }
document.addEventListener("click", e => {
  const hb = e.target.closest("[data-thide]"), db = e.target.closest("[data-tdel]");
  if (hb) { const s = new Set(S.ovTimers || []), k = hb.dataset.thide; s.has(k) ? s.delete(k) : s.add(k); S.ovTimers = [...s]; save(); pushTimers(); timerPoll(); }
  else if (db) { S.customTimers.splice(+db.dataset.tdel, 1); save(); pushTimers(); timerPoll(); }
  else if (e.target.id === "tcadd") { const n = document.getElementById("tcn").value.trim(); if (!n) return;
    S.customTimers = S.customTimers || []; S.customTimers.push({ name: n, time: document.getElementById("tct").value || "21:00", dur: +document.getElementById("tcd").value || 0, days: [...document.querySelectorAll(".tcday:checked")].map(x => +x.value) });
    save(); pushTimers(); timerPoll(); }
});

// ---------------- Harita (Leaflet: oyunun harita karoları, akıcı yakınlaştırma, simgeli işaretler)
let HMAP = null, HQ = "", HOPEN = {}, HVIEW = {}, HL = null, HLG = null, HLIVE = false;
function hSel() { S.harSel = S.harSel || {}; return S.harSel; }
const htype = t => (HARITA.types || {})[t] || { name: t, cat: "location", icon: "" };
async function hLive() {  // güncel harita verisi (toplama noktaları dahil) GitHub'dan; olmazsa gömülü veri
  if (HLIVE) return; HLIVE = true;
  try { const r = await fetch("https://raw.githubusercontent.com/81Miralay81/daeva-asistani/main/kaynak/masaustu/harita/harita.json", { cache: "no-cache" });
    if (r.ok) { const j = await r.json(); if (j && j.maps) { Object.assign(HARITA, j); if (TAB === "har") hRerender(); } } } catch (e) {}
}
const HLIVEMAP = {};
async function hLiveMap(name) {  // bilgisayar sürümü: canlı veriyle toplama malzemelerini ekle
  const a = DAPI(); if (!a || !a.harita_live || HLIVEMAP[name]) return; HLIVEMAP[name] = 1;
  try { const r = await a.harita_live(name); const m = HARITA.maps[name];
    if (r && r.ok && m && r.markers.length > m.markers.length) {
      const ref = m.markers.filter(x => x[2]);
      r.markers.forEach(x => { if (!x[2] && ref.length) { let b = ref[0], bd = 1e18; for (const q of ref) { const d = (q[3] - x[3]) ** 2 + (q[4] - x[4]) ** 2; if (d < bd) { bd = d; b = q; } } x[2] = b[2]; } if (!x[1]) x[1] = x[2] || ((r.types[x[0]] || {}).name) || x[0]; });
      m.markers = r.markers; HARITA.types = Object.assign({}, r.types, HARITA.types); Object.keys(r.types).forEach(k => { if (!HARITA.types[k].icon) HARITA.types[k] = r.types[k]; });
      HARITA.cats = Object.assign({ gathering: "Toplama malzemeleri", creature: "Petler", quest: "Görevler" }, HARITA.cats || {});
      Object.keys(hSel()).filter(k => k.startsWith(name + ":")).forEach(k => delete hSel()[k]);
      if (TAB === "har" && HMAP === name) hRerender();
    } } catch (e) {}
}
function rHar() {
  hLive();
  const race = (S.prof && S.prof.race) || "Elyos", maps = Object.entries(HARITA.maps || {}).filter(([, m]) => m.visible !== false || m.markers.length);
  if (!HMAP || !HARITA.maps[HMAP]) HMAP = (maps.find(([, m]) => m.race === race && m.markers.length) || maps[0] || [""])[0];
  const m = HARITA.maps[HMAP]; if (!m) return `<div class="card">Harita verisi yok.</div>`;
  hLiveMap(HMAP);
  const sel = hSel(), q = HQ.toLowerCase(), raceTr = { Elyos: "Elyos", Asmodian: "Asmodian", Abyss: "Abyss (Reshanta)" };
  const bySub = {}; m.markers.forEach((x, i) => (bySub[x[0]] = bySub[x[0]] || []).push(i));
  const cats = {}; Object.keys(bySub).forEach(t => (cats[htype(t).cat] = cats[htype(t).cat] || []).push(t));
  const order = ["gathering", "location", "collection", "creature", "quest"];
  const side = Object.keys(cats).sort((a, b) => order.indexOf(a) - order.indexOf(b)).map(c => `<div class="hcat">${esc((HARITA.cats || {})[c] || c)}</div>` + cats[c].map(t => {
    const ty = htype(t), items = bySub[t].filter(i => !q || (m.markers[i][1] + " " + m.markers[i][2] + " " + ty.name).toLowerCase().includes(q));
    if (!items.length) return "";
    const on = items.filter(i => sel[HMAP + ":" + i]).length, open = HOPEN[t] || (!!q && items.length < 40);
    return `<div class="hgrp"><div class="hgh"><label><input type="checkbox" data-hall="${t}" ${on && on === items.length ? "checked" : ""}> ${ty.icon ? `<img src="${esc(ty.icon)}" alt="">` : ""} ${esc(ty.name)}</label>
      <span class="mut small" data-hcnt="${t}">${on}/${items.length}</span><button class="spec-tog" data-hopen="${t}">${open ? "▾" : "▸"}</button></div>
      ${open ? `<div class="hlist">${items.map(i => `<label class="hit"><input type="checkbox" data-hpt="${i}" ${sel[HMAP + ":" + i] ? "checked" : ""}> ${esc(m.markers[i][1])}</label>`).join("")}</div>` : ""}</div>`;
  }).join("")).join("");
  setTimeout(hInit, 0);
  return `<div class="card"><div class="chform">
    <label>Harita<select id="hmap">${maps.map(([k, x]) => `<option value="${k}" ${k === HMAP ? "selected" : ""}>${raceTr[x.race]} · ${k.replace(/_/g, " ")}${x.markers.length ? ` (${x.markers.length})` : ""}</option>`).join("")}</select></label>
    <label>Ara<input id="hq" value="${esc(HQ)}" placeholder="Orichalcum, Ruby, Odyle, bölge…"></label><button class="btn" id="hclr">Seçimi temizle</button></div>
    <div class="hwrap"><div id="hlf" class="hmapbox"></div><div class="hside">${side || '<p class="mut small">Bu haritada işaret yok.</p>'}</div></div>
    <p class="mut small">Tekerlekle yakınlaştır, sürükleyerek gez; işaretin üstüne gelince adı çıkar. Sağdan seçtiklerin görünür. Harita ve işaretler: ${esc(HARITA.source || "")}.</p></div>`;
}
function hInit() {
  const el = document.getElementById("hlf"), m = HARITA.maps[HMAP]; if (!el || !m || !window.L) return;
  if (HL) { try { HL.remove(); } catch (e) {} HL = null; }
  el.style.height = Math.min(820, Math.max(440, window.innerHeight - 250)) + "px";
  HL = L.map(el, { crs: L.CRS.Simple, minZoom: -5, maxZoom: 1, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 90, attributionControl: false, maxBounds: [[-m.h * 0.2, -m.w * 0.2], [m.h * 1.2, m.w * 1.2]] });
  const T = L.TileLayer.extend({ getTileUrl(c) { const x = c.x, y = m.ty + c.y; if (x < 0 || y < 0 || x >= m.tx || y >= m.ty) return "data:image/gif;base64,R0lGODlhAQABAAAAACw="; const p = n => String(n).padStart(2, "0"); return `${HARITA.tiles || ""}${HMAP}/Res/${HMAP}_${p(x)}_${p(y)}.webp`; } });
  new T("", { tileSize: m.ts || 1024, minZoom: -5, maxZoom: 1, minNativeZoom: 0, maxNativeZoom: 0, noWrap: true, bounds: [[0, 0], [m.h, m.w]], keepBuffer: 4 }).addTo(HL);
  const v = HVIEW[HMAP]; if (v) HL.setView(v.c, v.z, { animate: false }); else HL.fitBounds([[0, 0], [m.h, m.w]]);
  HL.on("moveend zoomend", () => { HVIEW[HMAP] = { c: HL.getCenter(), z: HL.getZoom() }; });
  HL.on("zoomend", () => hMarkers());
  HLG = L.layerGroup().addTo(HL); hMarkers();
}
function hMarkers() {
  if (!HL || !HLG) return; HLG.clearLayers(); const m = HARITA.maps[HMAP], sel = hSel(), ic = {}, z = HL.getZoom(), sz = z >= -1 ? 26 : z >= -2 ? 20 : z >= -3 ? 14 : 10;
  m.markers.forEach((x, i) => { if (!sel[HMAP + ":" + i]) return; const ty = htype(x[0]);
    const icon = ic[x[0]] = ic[x[0]] || (ty.icon ? L.icon({ iconUrl: ty.icon, iconSize: [sz, sz], className: "hmk" }) : L.divIcon({ className: "hdot", iconSize: [Math.max(8, sz / 2), Math.max(8, sz / 2)] }));
    L.marker([x[4], x[3]], { icon }).bindTooltip(`<b>${esc(x[1])}</b><br>${esc(ty.name)}${x[2] && x[2] !== x[1] ? " · " + esc(x[2]) : ""}`, { direction: "top", offset: [0, -10] }).addTo(HLG); });
}
function hCounts() { document.querySelectorAll("[data-hcnt]").forEach(sp => { const t = sp.dataset.hcnt, boxes = [...document.querySelectorAll(`[data-hpt]`)].filter(b => HARITA.maps[HMAP].markers[+b.dataset.hpt][0] === t);
  const m = HARITA.maps[HMAP], all = m.markers.map((x, i) => i).filter(i => m.markers[i][0] === t), on = all.filter(i => hSel()[HMAP + ":" + i]).length; sp.textContent = `${on}/${all.length}`; const a = document.querySelector(`[data-hall="${t}"]`); if (a) a.checked = on && on === all.length; }); }
function hRerender() { const sb = document.querySelector(".hside"), st = sb ? sb.scrollTop : 0, y = window.scrollY; render(); window.scrollTo(0, y); const n = document.querySelector(".hside"); if (n) n.scrollTop = st; }
document.addEventListener("change", e => {
  const t = e.target, sel = hSel(), m = HARITA.maps[HMAP];
  if (t.id === "hmap") { HMAP = t.value; render(); }
  else if (t.dataset.hpt != null) { const k = HMAP + ":" + t.dataset.hpt; t.checked ? sel[k] = 1 : delete sel[k]; save(); hMarkers(); hCounts(); }
  else if (t.dataset.hall) { const q = HQ.toLowerCase(); m.markers.forEach((x, i) => { if (x[0] === t.dataset.hall && (!q || (x[1] + " " + x[2] + " " + htype(x[0]).name).toLowerCase().includes(q))) { const k = HMAP + ":" + i; t.checked ? sel[k] = 1 : delete sel[k]; } });
    document.querySelectorAll("[data-hpt]").forEach(b => { if (m.markers[+b.dataset.hpt][0] === t.dataset.hall) b.checked = t.checked; }); save(); hMarkers(); hCounts(); }
});
document.addEventListener("input", e => { if (e.target.id === "hq") { HQ = e.target.value; clearTimeout(window._hq); window._hq = setTimeout(() => { hRerender(); const i = document.getElementById("hq"); if (i) { i.focus(); i.setSelectionRange(HQ.length, HQ.length); } }, 350); } });
document.addEventListener("click", e => { const o = e.target.closest("[data-hopen]");
  if (o) { HOPEN[o.dataset.hopen] = !HOPEN[o.dataset.hopen]; hRerender(); }
  else if (e.target.id === "hclr") { const sel = hSel(); Object.keys(sel).filter(k => k.startsWith(HMAP + ":")).forEach(k => delete sel[k]); save(); hRerender(); } });

// ---------------- Eşya / pet arama
let ESQ = "", ESR = null, ESI = {}, ESB = false;
const SRC_TR = { Crafting: "Üretim (crafting)", Dungeon: "Zindan", Shop: "Mağaza", Quest: "Görev", FieldBoss: "Saha bossu", Field: "Açık dünya", Abyss: "Abyss", Event: "Etkinlik", Exchange: "Takas" };
function rEsy() {
  const a = DAPI(), ok = a && a.item_search;
  let h = `<div class="card"><div class="nm">🔎 Eşya / pet ara</div><div class="chform"><label>Ad (İngilizce, oyundaki gibi)<input id="esq" value="${esc(ESQ)}" placeholder="Kromede, Lugi, Ring…"></label><button class="btn pri" id="esgo" ${ok && !ESB ? "" : "disabled"}>${ESB ? "Aranıyor…" : "Ara"}</button></div>
    ${ok ? "" : `<p class="note small">Arama bilgisayar sürümünde çalışır.</p>`}
    <p class="mut small">Veri NCSOFT'un resmi eşya sözlüğünden. Bir eşyaya dokununca NC'nin söylediği <b>elde etme yolları</b> (üretim, zindan, mağaza…) gelir. NC hangi bossun düşürdüğünü her zaman ayrıntılı vermiyor; o yüzden her eşyada web araması bağlantısı var (aion2hub, allthings.how gibi sitelerin düşme ve toplama haritaları çıkar).</p></div>`;
  if (ESR && ESR.error) h += `<div class="errcard small"><p class="bad">⚠ ${esc(ESR.error)}</p></div>`;
  if (ESR && ESR.items) h += `<div class="card"><table>${ESR.items.map(it => { const d = ESI[it.id];
    return `<tr class="clk" data-esi="${it.id}"><td><span class="eqic" style="--rc:${it.rarity || "#39404d"}">${it.icon ? `<img src="${esc(it.icon)}" alt="" loading="lazy">` : ""}</span></td>
      <td><div style="color:${it.rarity || "inherit"}">${esc(it.name)}</div><div class="mut small">${esc(it.category || "")} · ${esc(it.gradeTr || "")}${it.options && it.options.length ? " · " + esc(it.options.slice(0, 3).join(", ")) : ""}</div>
      ${d ? `<div class="small"><a href="https://www.google.com/search?q=${encodeURIComponent("aion 2 " + it.name + " drop location")}" target="_blank" rel="noopener">Nereden düşer? (web'de ara) ↗</a> · <a href="https://www.google.com/search?q=${encodeURIComponent("site:allthings.how aion 2 " + it.name)}" target="_blank" rel="noopener">Toplama yeri / harita ↗</a></div>` : ""}${d ? (d.ok ? `<div class="small"><b>Nereden:</b> ${d.sources.length ? d.sources.map(s => esc(SRC_TR[s] || s)).join(", ") : "NC bilgi vermiyor"}${d.level ? ` · Sv ${d.level}` : ""}${d.classes && d.classes.length ? ` · ${esc(d.classes.join(", "))}` : ""}</div>` : `<div class="mut small">${/404/.test(d.error || "") ? "NCSOFT Global'de bu eşyanın sayfası yok (çoğunlukla Kore/Tayvan'a özel ya da henüz gelmemiş eşya)." : esc(d.error)}</div>`) : ""}</td></tr>`; }).join("") || "<tr><td>Bulunamadı</td></tr>"}</table></div>`;
  return h;
}
async function esSearch() { const a = DAPI(); ESQ = (document.getElementById("esq") || {}).value || ESQ; if (!ESQ.trim() || !a) return; ESB = true; render(); ESR = await a.item_search(ESQ.trim()); ESB = false; render(); }
document.addEventListener("click", async e => { if (e.target.id === "esgo") esSearch(); const r = e.target.closest("[data-esi]"); if (r && DAPI()) { const id = +r.dataset.esi; if (!ESI[id]) { ESI[id] = await DAPI().item_info(id, (S.prof && S.prof.region) || "eu"); render(); } } });
document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "esq") esSearch(); });

// ---------------- Sekmeler ve açılış
R.dps = rDps; R.zam = rZam; R.har = rHar; R.esy = rEsy;
TABS.splice(2, 0, ["dps", "📊 DPS Ölçer"], ["zam", "⏰ Geri Sayım"], ["har", "🗺 Harita"], ["esy", "🔎 Eşya Ara"]);
setInterval(() => { if (TAB === "dps") dpsPoll(); if (TAB === "zam") timerPoll(); }, 1000);
window.addEventListener("pywebviewready", async () => {
  const a = DAPI(); if (!a || !a.dps_settings) return;
  try { DSET = await a.dps_settings(S.prof ? { race: S.prof.race, region: S.prof.region, serverId: S.prof.serverId, serverName: S.prof.serverName, customTimers: S.customTimers || [], ovTimers: S.ovTimers || [], showTimers: (S.ovTimers || []).length > 0 } : null); } catch (e) {}
  let u = {}; try { u = await a.dps_check_update() || {}; } catch (e) {}
  try { if (a.app_check) u.app = await a.app_check(); } catch (e) {}
  if (u.app && u.app.new && u.app.canAuto) { forceAppUpdate(u.app); return; }
  if ((u.ok && u.data) || (u.app && u.app.new)) { DUPD = u; updBanner(); }
  if (TAB === "dps") dpsPoll();
});
// Zorunlu güncelleme (exe): yeni sürüm varsa ekran kilitlenir, indirilir, uygulama kapanıp yeni sürümle açılır.
let FUPD_TRY = 0;
async function forceAppUpdate(app) {
  let o = document.getElementById("fupd");
  if (!o) {
    o = document.createElement("div"); o.id = "fupd";
    o.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(8,11,17,.94);display:flex;align-items:center;justify-content:center;padding:20px";
    document.body.appendChild(o);
  }
  FUPD_TRY++;
  o.innerHTML = `<div class="card" style="max-width:440px;text-align:center;border-color:var(--acc)"><div class="nm" style="color:var(--acc);font-size:17px">Güncelleme gerekli</div>
    <p>Kanatix Daeva Asistanı <b>${esc(app.version)}</b> indiriliyor (sende ${esc(app.current)}).<br>Bitince uygulama kapanıp yeni sürümle açılacak.</p><p class="mut small">Ayarların ve seviyelerin silinmez.</p></div>`;
  let r = {}; try { r = await DAPI().app_install(app.url); } catch (e) { r = { ok: false, error: String(e) }; }
  if (r.ok) return;
  o.innerHTML = `<div class="card" style="max-width:440px;text-align:center;border-color:var(--bad)"><div class="nm">Güncelleme indirilemedi</div>
    <p class="mut small">${esc(r.error || "")}</p><button class="btn pri" id="fupdre">Tekrar dene</button>
    ${FUPD_TRY >= 3 ? '<button class="btn" id="fupdgec" style="margin-left:6px">İnternet yok, şimdilik devam et</button>' : ""}</div>`;
  document.getElementById("fupdre").onclick = () => forceAppUpdate(app);
  const g = document.getElementById("fupdgec"); if (g) g.onclick = () => o.remove();
}
setTimeout(() => { if (!profOk()) showProf(true); }, 400);
