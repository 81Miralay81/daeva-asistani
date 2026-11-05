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
    <li>Pencereyi başlığından tutup sürükleyebilirsin. [–] küçültür, [×] kapatır; ikisi de kapanınca kalan küçük <b>D</b> düğmesi geri açar.</li></ol>
    Oyun Steam'den değil PURPLE'dan açılıyorsa: oyunu kendin aç, burada <b>Sadece ölç</b>'e bas.</details>`;
  if (s && s.status && s.status.error) h += `<div class="errcard small"><p class="bad"><b>⚠ ${esc(s.status.error)}</b></p></div>`;
  if (!s || !s.game) h += noGame("DPS ve parti bilgileri");
  const f = s && s.fight;
  if (s && s.history && s.history.length) h += `<div class="chips" style="margin-bottom:8px"><button class="chip ${!DFIGHT ? "pick" : ""}" data-dfight="">Canlı</button>${s.history.slice(0, 12).map(x => `<button class="chip ${DFIGHT === x.id ? "pick" : ""}" data-dfight="${x.id}"><b>${hhmm(x.start / 1000)}</b>${esc(x.boss || x.zone || "Savaş")} · ${nfmt(x.total)}</button>`).join("")}</div>`;
  if (!f) return h + `<div class="card"><p class="mut">Henüz savaş yok. ${run ? "Bir yaratığa vurunca burada belirir." : "<b>Başlat</b>'a bas; meteri zindana girmeden önce başlat ki parti üyelerinin adları gelsin."}</p></div>`;
  const b = f.boss;
  h += `<div class="card"><div class="dhead"><div><div class="nm">${esc((b && b.name) || f.zone || "Savaş")}</div>${f.members.some(m => m.name.startsWith("#")) ? `<div class="note small">#numara görünen oyuncuların adı henüz gelmedi: oyun adları yükleme ekranında gönderir. Ölçeri zindana girmeden önce başlat ya da bir kez ışınlan.</div>` : ""}<div class="mut small">${leftStr(f.dur)} · Toplam ${nfmt(f.total)} · Parti DPS ${nfmt(f.dps)}/s${f.hidden ? ` · ${f.hidden} parti dışı oyuncu gizli` : ""}</div></div></div>
    ${b && b.pct != null ? `<div class="bar" style="height:7px"><i style="width:${b.pct}%;background:var(--bad)"></i></div>` : ""}</div>`;
  for (const m of f.members) {
    const open = DOPEN[m.id] !== false, col = CLSCOL[m.cls] || "var(--mut)";
    h += `<div class="card" style="${m.self ? "border-color:var(--acc)" : ""}">
      <div class="dhead" data-dmem="${m.id}" style="cursor:pointer"><div><span class="nm" style="color:${col}">${esc(m.name)}</span> <span class="mut small">${esc(m.clsName || "")}${m.gear ? ` · GS ${m.gear}` : ""}${m.cp ? ` · CP ${nfmt(m.cp)}` : ""}</span></div>
      <div><b>${nfmt(m.dmg)}</b> <span class="mut small">· ${nfmt(m.dps)}/s · %${m.share} · kritik %${m.crit} · en büyük ${nfmt(m.max)}</span> ${open ? "▾" : "▸"}</div></div>
      <div class="bar"><i style="width:${m.share}%;background:${col}"></i></div>
      ${open ? `<div class="dskills">${m.skills.map(k => `<div class="dsk" title="${esc(k.name)}\n${k.hits} vuruş · kritik %${k.crit} · ort ${nfmt(k.avg)} · en büyük ${nfmt(k.max)}${k.dot ? " · DoT" : ""}">
        ${k.icon ? `<img src="${esc(k.icon)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'dsk-n',textContent:'✦'}))">` : '<span class="dsk-n">✦</span>'}
        <div class="dsk-name">${esc(k.name)}</div><div class="dsk-d">${nfmt(k.dmg)}</div><div class="dsk-p">%${k.share} · ${k.hits}×</div></div>`).join("")}</div>` : ""}
    </div>`;
  }
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
  const now = Date.now() / 1000 | 0, hid = new Set(S.hiddenTimers || []);
  let list = localTimers();
  if (TSRV && TSRV.timers) { const extra = TSRV.timers.filter(t => /^(fb|k)\d/.test(t.id)); list = list.concat(extra); }
  list.forEach(t => t.left = t.active ? 0 : t.at - now); list.sort((a, b) => (b.active - a.active) || a.at - b.at);
  const row = t => `<tr class="${hid.has(t.id) ? "dim" : ""}"><td><b class="${t.active ? "ok" : t.left < 600 ? "warn" : ""}">${t.active ? "ŞİMDİ" : leftStr(t.left)}</b></td>
    <td>${esc(t.name)}<div class="mut small">${esc(t.kind)}${t.note ? " · " + esc(t.note) : ""}${t.src === "oyun" ? " · oyundan" : t.src === "ölçer" ? " · ölçer gördü" : ""}</div></td>
    <td class="nowrap">${dayOf(t.at)} ${hhmm(t.at)}</td>
    <td><button class="spec-tog ${hid.has(t.id) ? "" : "on"}" data-thide="${t.id}" title="Oyun üstünde göster/gizle">${hid.has(t.id) ? "gizli" : "üstte"}</button>${t.id[0] === "c" && t.src === "sen" ? ` <button class="spec-tog" data-tdel="${t.id.slice(1)}">sil</button>` : ""}</td></tr>`;
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
      <button class="btn pri" id="tcadd">Ekle</button></div><p class="mut small">Gün seçmezsen her gün tekrar eder. Bu sayaçlar oyun üstündeki pencerede de görünür.</p></div>`;
}
function pushTimers() { const a = DAPI(); if (a && a.dps_settings) a.dps_settings({ customTimers: S.customTimers || [], hiddenTimers: S.hiddenTimers || [] }); }
document.addEventListener("click", e => {
  const hb = e.target.closest("[data-thide]"), db = e.target.closest("[data-tdel]");
  if (hb) { const s = new Set(S.hiddenTimers || []), k = hb.dataset.thide; s.has(k) ? s.delete(k) : s.add(k); S.hiddenTimers = [...s]; save(); pushTimers(); timerPoll(); }
  else if (db) { S.customTimers.splice(+db.dataset.tdel, 1); save(); pushTimers(); timerPoll(); }
  else if (e.target.id === "tcadd") { const n = document.getElementById("tcn").value.trim(); if (!n) return;
    S.customTimers = S.customTimers || []; S.customTimers.push({ name: n, time: document.getElementById("tct").value || "21:00", dur: +document.getElementById("tcd").value || 0, days: [...document.querySelectorAll(".tcday:checked")].map(x => +x.value) });
    save(); pushTimers(); timerPoll(); }
});

// ---------------- Harita
let HMAP = null, HQ = "", HTYPE = "", HSEL = -1;
function rHar() {
  const race = (S.prof && S.prof.race) || "Elyos", maps = Object.entries(HARITA.maps || {}).filter(([, m]) => m.markers.length);
  if (!HMAP || !HARITA.maps[HMAP]) HMAP = (maps.find(([, m]) => m.race === race) || maps[0] || [""])[0];
  const m = HARITA.maps[HMAP]; if (!m) return `<div class="card">Harita verisi yok.</div>`;
  const q = HQ.toLowerCase(), hits = m.markers.map((x, i) => [x, i]).filter(([x]) => (!HTYPE || x[0] === HTYPE) && (!q || (x[1] + " " + x[2]).toLowerCase().includes(q)));
  const types = [...new Set(m.markers.map(x => x[0]))];
  const tr = t => (HARITA.types || {})[t] || t, raceTr = { Elyos: "Elyos", Asmodian: "Asmodian", Abyss: "Abyss (Reshanta)" };
  let h = `<div class="card"><div class="chform">
    <label>Harita<select id="hmap">${maps.map(([k, x]) => `<option value="${k}" ${k === HMAP ? "selected" : ""}>${raceTr[x.race]} · ${k.replace(/_/g, " ")} (${x.markers.length})</option>`).join("")}</select></label>
    <label>Tür<select id="htype"><option value="">Hepsi</option>${types.map(t => `<option value="${t}" ${t === HTYPE ? "selected" : ""}>${esc(tr(t))}</option>`).join("")}</select></label>
    <label>Ara<input id="hq" value="${esc(HQ)}" placeholder="bölge ya da yer adı"></label></div>
    <canvas id="hcv" width="640" height="640" style="width:100%;max-width:640px;background:var(--hdr);border:1px solid var(--line);border-radius:10px"></canvas>
    <p class="mut small">${hits.length} işaret. Noktaya dokununca adı yazılır. Kaynak: ${esc(HARITA.source || "")}. Bu veride yaratık/boss konumu yok; saha bossları için Geri sayım sekmesine bak.</p>
    <table>${hits.slice(0, 80).map(([x, i]) => `<tr class="clk ${i === HSEL ? "dim" : ""}" data-hsel="${i}"><td>${esc(tr(x[0]))}</td><td>${esc(x[1])}</td><td class="mut small">${esc(x[2])}</td></tr>`).join("")}</table></div>`;
  setTimeout(() => drawMap(m, hits), 0);
  return h;
}
const HCOL = { teleport: "#4fc3f7", hiddenCube: "#e8b94a", monolithMaterial: "#9aa3b2", seal: "#c58cf5", battlefield: "#ef6b62", occupation: "#ff8a3c", village: "#5fd38a" };
function drawMap(m, hits) {
  const c = document.getElementById("hcv"); if (!c) return; const g = c.getContext("2d"), W = c.width, sx = W / m.w, sy = c.height / m.h;
  g.clearRect(0, 0, W, c.height);
  for (const [x, i] of hits) { g.fillStyle = HCOL[x[0]] || "#ccc"; const r = i === HSEL ? 7 : 2.5; g.beginPath(); g.arc(x[3] * sx, x[4] * sy, r, 0, 7); g.fill(); if (i === HSEL) { g.fillStyle = "#fff"; g.font = "13px sans-serif"; g.fillText(x[1], x[3] * sx + 9, x[4] * sy + 4); } }
  c.onclick = ev => { const b = c.getBoundingClientRect(), px = (ev.clientX - b.left) * W / b.width, py = (ev.clientY - b.top) * c.height / b.height;
    let best = -1, bd = 1e9; for (const [x, i] of hits) { const d = (x[3] * sx - px) ** 2 + (x[4] * sy - py) ** 2; if (d < bd) { bd = d; best = i; } } if (bd < 400) { HSEL = best; render(); } };
}
document.addEventListener("change", e => { if (e.target.id === "hmap") { HMAP = e.target.value; HSEL = -1; render(); } if (e.target.id === "htype") { HTYPE = e.target.value; render(); } });
document.addEventListener("input", e => { if (e.target.id === "hq") { HQ = e.target.value; clearTimeout(window._hq); window._hq = setTimeout(() => { render(); const i = document.getElementById("hq"); if (i) { i.focus(); i.setSelectionRange(HQ.length, HQ.length); } }, 300); } });
document.addEventListener("click", e => { const r = e.target.closest("[data-hsel]"); if (r) { HSEL = +r.dataset.hsel; render(); } });

// ---------------- Eşya / pet arama
let ESQ = "", ESR = null, ESI = {}, ESB = false;
const SRC_TR = { Crafting: "Üretim (crafting)", Dungeon: "Zindan", Shop: "Mağaza", Quest: "Görev", FieldBoss: "Saha bossu", Field: "Açık dünya", Abyss: "Abyss", Event: "Etkinlik", Exchange: "Takas" };
function rEsy() {
  const a = DAPI(), ok = a && a.item_search;
  let h = `<div class="card"><div class="nm">🔎 Eşya / pet ara</div><div class="chform"><label>Ad (İngilizce, oyundaki gibi)<input id="esq" value="${esc(ESQ)}" placeholder="Kromede, Lugi, Ring…"></label><button class="btn pri" id="esgo" ${ok && !ESB ? "" : "disabled"}>${ESB ? "Aranıyor…" : "Ara"}</button></div>
    ${ok ? "" : `<p class="note small">Arama bilgisayar sürümünde çalışır.</p>`}
    <p class="mut small">Veri NCSOFT'un resmi eşya sözlüğünden. Bir eşyaya dokununca NC'nin söylediği <b>elde etme yolları</b> (üretim, zindan, mağaza…) gelir. NC hangi bossun düşürdüğünü her zaman ayrıntılı vermiyor.</p></div>`;
  if (ESR && ESR.error) h += `<div class="errcard small"><p class="bad">⚠ ${esc(ESR.error)}</p></div>`;
  if (ESR && ESR.items) h += `<div class="card"><table>${ESR.items.map(it => { const d = ESI[it.id];
    return `<tr class="clk" data-esi="${it.id}"><td><span class="eqic" style="--rc:${it.rarity || "#39404d"}">${it.icon ? `<img src="${esc(it.icon)}" alt="" loading="lazy">` : ""}</span></td>
      <td><div style="color:${it.rarity || "inherit"}">${esc(it.name)}</div><div class="mut small">${esc(it.category || "")} · ${esc(it.gradeTr || "")}${it.options && it.options.length ? " · " + esc(it.options.slice(0, 3).join(", ")) : ""}</div>
      ${d ? (d.ok ? `<div class="small"><b>Nereden:</b> ${d.sources.length ? d.sources.map(s => esc(SRC_TR[s] || s)).join(", ") : "NC bilgi vermiyor"}${d.level ? ` · Sv ${d.level}` : ""}${d.classes && d.classes.length ? ` · ${esc(d.classes.join(", "))}` : ""}</div>` : `<div class="bad small">${esc(d.error)}</div>`) : ""}</td></tr>`; }).join("") || "<tr><td>Bulunamadı</td></tr>"}</table></div>`;
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
  try { DSET = await a.dps_settings(S.prof ? { race: S.prof.race, region: S.prof.region, serverId: S.prof.serverId, serverName: S.prof.serverName, customTimers: S.customTimers || [], hiddenTimers: S.hiddenTimers || [] } : null); } catch (e) {}
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
