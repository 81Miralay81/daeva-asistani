// ---------------- Sohbet (Firebase): Sohbet 1-2-3 + Admin odası, kullanıcı adı/şifre, susturma/atma, admin katıldı bildirimi
const SB_CFG = /*SOHBETCFG*/{};
const SB_ROOMS = [["sohbet1", "💬 Sohbet 1"], ["sohbet2", "💬 Sohbet 2"], ["sohbet3", "💬 Sohbet 3"], ["admin", "🛡 Admin odası"]];
let SB = { ready: false, user: null, me: null, room: "sohbet1", msgs: {}, unsub: null, err: "", busy: false, users: {}, dev: null, char: null, banned: false, panel: false };
function sbDB() { return firebase.firestore(); }
function sbRender() { // yazılan mesaj ve imleç yenilemede kaybolmasın
  const a = document.activeElement, id = a && a.id, v = a && a.value, ss = a && a.selectionStart;
  render();
  if (id) { const n = document.getElementById(id); if (n && v != null) { n.value = v; n.focus(); try { n.setSelectionRange(ss, ss); } catch (e) {} } }
}
function sbIsMod() { return SB.me && (SB.me.admin || SB.me.mod); }
function sbInit() {
  if (SB.ready || typeof firebase === "undefined" || !SB_CFG.apiKey) return;
  try { firebase.initializeApp(SB_CFG); } catch (e) {}
  SB.ready = true;
  firebase.auth().onAuthStateChanged(async u => {
    SB.user = u; SB.me = null;
    if (u) await sbAfterLogin(); else { if (SB.unsub) SB.unsub(); SB.unsub = null; }
    if (TAB === "soh") render();
  });
  // admin katıldı bildirimi (herkese)
  const since = Date.now() - 15000;
  sbDB().collection("events").where("ts", ">", since).onSnapshot(s => s.docChanges().forEach(c => { if (c.type === "added") { const d = c.doc.data(); if (d.type === "admin") sbToast(`🛡 Admin uygulamaya katıldı${d.name ? ": " + d.name : ""}`); } }), () => {});
}
async function sbAfterLogin() {
  const a = DAPI();
  try { SB.dev = a && a.chat_device ? await a.chat_device() : { device: "web", mac: "" }; } catch (e) { SB.dev = { device: "?", mac: "" }; }
  try { SB.char = a && a.chat_me ? await a.chat_me() : {}; } catch (e) { SB.char = {}; }
  const ref = sbDB().collection("users").doc(SB.user.uid);
  const ban = await sbDB().collection("bans").doc(SB.dev.device).get().catch(() => null);
  if (ban && ban.exists) { SB.banned = true; SB.err = "Bu cihaz sohbetten atıldı."; await firebase.auth().signOut(); return; }
  const snap = await ref.get();
  const base = { device: SB.dev.device, mac: SB.dev.mac, char: SB.char.name || "", server: SB.char.server || "", race: SB.char.race || "", seen: Date.now() };
  if (!snap.exists) await ref.set(Object.assign({ name: (SB.user.email || "").split("@")[0], admin: false, mod: false, banned: false, muteUntil: 0 }, base));
  else await ref.update(base);
  ref.onSnapshot(d => { SB.me = d.data(); if (SB.me && SB.me.banned) { SB.err = "Sohbetten atıldın."; firebase.auth().signOut(); } if (TAB === "soh") sbRender(); });
  sbDB().collection("users").onSnapshot(s => { s.forEach(d => SB.users[d.id] = d.data()); if (TAB === "soh") sbRender(); }, () => {});
  const me = (await ref.get()).data();
  if (me && me.admin && !sessionStorage.getItem("sbAdminSaid")) { sessionStorage.setItem("sbAdminSaid", "1"); sbDB().collection("events").add({ type: "admin", name: me.name, ts: Date.now() }).catch(() => {}); }
  sbListen();
  clearInterval(SB.hb); SB.hb = setInterval(() => { if (SB.user) ref.update({ seen: Date.now() }).catch(() => {}); }, 60000);  // çevrimiçi göstergesi
}
function sbListen() {
  if (SB.unsub) SB.unsub();
  if (SB.room === "admin" && !sbIsMod()) { SB.msgs[SB.room] = []; return; }
  SB.unsub = sbDB().collection("rooms").doc(SB.room).collection("messages").orderBy("ts", "desc").limit(300).onSnapshot(s => {
    SB.msgs[SB.room] = s.docs.map(d => Object.assign({ id: d.id }, d.data())).reverse();
    if (TAB === "soh") { const box = document.getElementById("sbmsgs"), atEnd = !box || box.scrollHeight - box.scrollTop - box.clientHeight < 60; sbRender(); const b = document.getElementById("sbmsgs"); if (b && atEnd) b.scrollTop = b.scrollHeight; }
  }, e => { SB.err = "Mesajlar okunamadı: " + e.message; if (TAB === "soh") render(); });
}
function sbToast(t) {
  let el = document.getElementById("sbtoast"); if (!el) { el = document.createElement("div"); el.id = "sbtoast"; document.body.appendChild(el); }
  el.style.cssText = "position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:9500;background:linear-gradient(90deg,#3a2a0a,#6b4b10,#3a2a0a);color:#ffd77a;padding:10px 26px;border-radius:0 0 12px 12px;font-weight:700;box-shadow:0 4px 18px #000a;transition:opacity .5s";
  el.textContent = t; el.style.opacity = 1; clearTimeout(el._t); el._t = setTimeout(() => el.style.opacity = 0, 6000);
  try { const c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator(), g = c.createGain(); o.type = "sine"; o.frequency.setValueAtTime(880, c.currentTime); o.frequency.setValueAtTime(1320, c.currentTime + 0.12); g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(0.15, c.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.45); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.5); } catch (e) {}
}
const sbMail = n => n.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "_") + "@kanatix-sohbet.app";
async function sbAuth(kind) {
  const n = (document.getElementById("sbn") || {}).value || "", p = (document.getElementById("sbp") || {}).value || "";
  if (n.trim().length < 3 || p.length < 6) { SB.err = "Kullanıcı adı en az 3, şifre en az 6 karakter olmalı."; render(); return; }
  SB.busy = true; SB.err = ""; render();
  try {
    if (kind === "new") await firebase.auth().createUserWithEmailAndPassword(sbMail(n), p);
    else await firebase.auth().signInWithEmailAndPassword(sbMail(n), p);
  } catch (e) { SB.err = /already-in-use/.test(e.code) ? "Bu kullanıcı adı alınmış." : /wrong-password|invalid-credential|user-not-found/.test(e.code) ? "Kullanıcı adı ya da şifre yanlış." : e.message; }
  SB.busy = false; render();
}
async function sbSend() {
  const i = document.getElementById("sbtxt"); const t = (i && i.value || "").trim(); if (!t) return;
  if (SB.me && SB.me.muteUntil > Date.now()) { SB.err = `Susturuldun (${new Date(SB.me.muteUntil).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}'e kadar).`; render(); return; }
  i.value = "";
  try { await sbDB().collection("rooms").doc(SB.room).collection("messages").add({ uid: SB.user.uid, name: SB.me.name, char: SB.me.char || "", server: SB.me.server || "", race: SB.me.race || "", admin: !!SB.me.admin, mod: !!SB.me.mod, text: t.slice(0, 500), ts: Date.now() }); }
  catch (e) { SB.err = "Gönderilemedi: " + e.message; render(); }
}
async function sbAct(kind, uid, mid) {
  const u = SB.users[uid] || {}, ref = sbDB().collection("users").doc(uid);
  try {
    if (kind === "mute") await ref.update({ muteUntil: Date.now() + 10 * 60000 });
    else if (kind === "unmute") await ref.update({ muteUntil: 0 });
    else if (kind === "ban") { if (!confirm(`${u.name || "Bu kişi"} sohbetten atılsın mı? Cihazı da yasaklanır.`)) return; await ref.update({ banned: true }); if (u.device) await sbDB().collection("bans").doc(u.device).set({ uid, name: u.name || "", by: SB.me.name, ts: Date.now() }); }
    else if (kind === "unban") { await ref.update({ banned: false }); if (u.device) await sbDB().collection("bans").doc(u.device).delete(); }
    else if (kind === "mod") await ref.update({ mod: !u.mod });
    else if (kind === "del") await sbDB().collection("rooms").doc(SB.room).collection("messages").doc(mid).delete();
  } catch (e) { SB.err = "Yetki yok ya da hata: " + e.message; }
  render();
}
function rSoh() {
  if (!SB_CFG.apiKey || typeof firebase === "undefined") return `<div class="card">Sohbet bu sürümde kullanılamıyor.</div>`;
  sbInit();
  const err = SB.err ? `<div class="card" style="border-color:var(--bad)">${esc(SB.err)}</div>` : "";
  if (!SB.user) return err + `<div class="card" style="max-width:420px;margin:30px auto"><div class="nm">💬 Kanatix Sohbet</div>
    <p class="mut small">İlk kez geliyorsan bir kullanıcı adı ve şifre belirle; bilgisayarda ve telefonda aynısıyla girersin. Oyundaki karakter adın, sunucun ve ırkın kendiliğinden eklenir.</p>
    <input id="sbn" placeholder="Kullanıcı adı" style="width:100%;margin:4px 0"><input id="sbp" type="password" placeholder="Şifre (en az 6)" style="width:100%;margin:4px 0">
    <div style="display:flex;gap:8px;margin-top:8px"><button class="btn" id="sbin" ${SB.busy ? "disabled" : ""}>Giriş yap</button><button class="btn" id="sbnew" ${SB.busy ? "disabled" : ""}>Yeni hesap aç</button></div></div>`;
  const me = SB.me || {};
  const rooms = SB_ROOMS.filter(([k]) => k !== "admin" || sbIsMod());
  const ms = SB.msgs[SB.room] || [];
  const tag = m => m.admin ? '<span style="color:#ffcf4a">🛡 Admin</span> ' : m.mod ? '<span style="color:#7fd1ff">⭐ Yetkili</span> ' : "";
  const list = ms.map(m => `<div style="padding:5px 8px;border-radius:8px;${m.uid === SB.user.uid ? "background:#1d2a3d" : ""}">
      <div class="small">${tag(m)}<b>${esc(m.name)}</b>${m.char ? ` <span class="mut">· ${esc(m.char)}${m.server ? " (" + esc(m.server) + ")" : ""}${m.race ? " · " + esc(m.race) : ""}</span>` : ""}
      <span class="mut" style="float:right">${new Date(m.ts).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
      ${sbIsMod() && m.uid !== SB.user.uid ? ` <a href="#" data-sba="mute|${m.uid}" title="10 dk sustur">🔇</a> <a href="#" data-sba="ban|${m.uid}" title="At">⛔</a>` : ""}${sbIsMod() ? ` <a href="#" data-sba="del|${m.uid}|${m.id}" title="Mesajı sil">🗑</a>` : ""}</span></div>
      <div style="white-space:pre-wrap;word-break:break-word">${esc(m.text)}</div></div>`).join("") || '<div class="mut">Henüz mesaj yok.</div>';
  let h = err + `<div class="card"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
    ${rooms.map(([k, t]) => `<button class="${SB.room === k ? "on" : ""}" data-sbr="${k}">${t}</button>`).join("")}
    <span style="flex:1"></span><span class="small">${tag(me)}<b>${esc(me.name || "")}</b>${me.char ? ` · ${esc(me.char)}` : ""}</span>
    ${sbIsMod() ? `<button class="btn" id="sbpanel">${SB.panel ? "Sohbete dön" : "👥 Kullanıcılar"}</button>` : ""}<button class="btn" id="sbout">Çıkış</button></div></div>`;
  if (SB.panel && sbIsMod()) {
    const us = Object.entries(SB.users).sort((a, b) => (b[1].seen || 0) - (a[1].seen || 0));
    h += `<div class="card"><div class="nm">👥 Kullanıcılar (${us.length})</div><table class="small" style="width:100%">${us.map(([id, u]) => `<tr><td>${u.admin ? "🛡 " : u.mod ? "⭐ " : ""}<b>${esc(u.name || "")}</b> <span class="mut">${esc(u.char || "")} ${esc(u.server || "")}</span></td>
      <td class="mut">${u.seen ? new Date(u.seen).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}</td>
      <td>${u.banned ? '<b style="color:var(--bad)">atıldı</b>' : u.muteUntil > Date.now() ? '<span class="warn">susturuldu</span>' : ""}</td>
      <td style="white-space:nowrap">${id === SB.user.uid || u.admin ? "" : `${u.muteUntil > Date.now() ? `<button class="btn" data-sba="unmute|${id}">Sesi aç</button>` : `<button class="btn" data-sba="mute|${id}">10 dk sustur</button>`}
        ${u.banned ? `<button class="btn" data-sba="unban|${id}">Yasağı kaldır</button>` : `<button class="btn" data-sba="ban|${id}">At</button>`}
        ${me.admin ? `<button class="btn" data-sba="mod|${id}">${u.mod ? "Yetkiyi al" : "Yetki ver"}</button>` : ""}`}</td></tr>`).join("")}</table>
      <p class="mut small">"Yetki ver": Admin odasını görür, susturur ve atabilir. Sadece admin yetki verir. Atılan kişinin cihazı yasaklanır.</p></div>`;
    return h;
  }
  const on = Object.values(SB.users).filter(u => !u.banned && Date.now() - (u.seen || 0) < 150000).sort((a, b) => (b.admin - a.admin) || (b.mod - a.mod) || String(a.name).localeCompare(b.name));
  const side = `<div class="card" style="margin:0;max-height:66vh;overflow-y:auto"><div class="nm small">🟢 Çevrimiçi (${on.length})</div>${on.map(u => `<div class="small" style="padding:3px 0">${u.admin ? "🛡 " : u.mod ? "⭐ " : "• "}<b style="color:${u.admin ? "#ffcf4a" : u.mod ? "#7fd1ff" : "inherit"}">${esc(u.name || "")}</b>${u.char ? `<div class="mut" style="margin-left:14px">${esc(u.char)}${u.server ? " · " + esc(u.server) : ""}${u.race ? " · " + esc(u.race) : ""}</div>` : ""}</div>`).join("") || '<div class="mut small">Kimse yok</div>'}</div>`;
  h += `<div style="display:grid;grid-template-columns:1fr 220px;gap:10px;align-items:start"><div>`;
  h += `<div class="card" style="padding:0;margin:0"><div id="sbmsgs" style="height:58vh;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:4px">${list}</div>
    <div style="display:flex;gap:6px;padding:8px;border-top:1px solid var(--line)"><input id="sbtxt" maxlength="500" placeholder="${me.muteUntil > Date.now() ? "Susturuldun" : "Mesaj yaz, Enter ile gönder"}" style="flex:1"><button class="btn" id="sbsend">Gönder</button></div></div>`;
  h += `</div>${side}</div>`;
  return h;
}
document.addEventListener("click", e => {
  const t = e.target; const a = t.closest && t.closest("[data-sba],[data-sbr]");
  if (t.id === "sbin") sbAuth("in"); else if (t.id === "sbnew") sbAuth("new");
  else if (t.id === "sbout") { firebase.auth().signOut(); SB.panel = false; }
  else if (t.id === "sbsend") sbSend();
  else if (t.id === "sbpanel") { SB.panel = !SB.panel; render(); }
  else if (a && a.dataset.sbr) { SB.room = a.dataset.sbr; SB.panel = false; SB.err = ""; sbListen(); render(); }
  else if (a && a.dataset.sba) { e.preventDefault(); const [k, u, m] = a.dataset.sba.split("|"); sbAct(k, u, m); }
});
document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "sbtxt") sbSend(); if (e.key === "Enter" && (e.target.id === "sbp")) sbAuth("in"); });
R.soh = rSoh;
TABS.splice(TABS.findIndex(t => t[0] === "zan") + 1, 0, ["soh", "💬 Sohbet"]);
window.addEventListener("pywebviewready", () => setTimeout(sbInit, 500));
