// ---------- Diğer sınıflar: wiki verisinden otomatik öneri ----------
const CLASS_RAW = /*RAW*/;
const ROLE = { gladiator: "dps", assassin: "dps", ranger: "dps", sorcerer: "dps", spiritmaster: "dps", cleric: "healer", chanter: "support" };
const CLASS_NAME = { templar: "Templar", gladiator: "Gladiator", assassin: "Assassin", ranger: "Ranger", sorcerer: "Sorcerer", spiritmaster: "Spiritmaster", cleric: "Cleric", chanter: "Chanter" };
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const KW = {
  surv: /absorb|drain|heals? \d|restores? \d+% (max )?hp|hp restored|tolerance|shield|invulner|immunity|invincible/,
  heal: /heal|hp restored|debuff|incoming heal|restoration/,
  dmg: /damage|critical|multi-hit|attack|ignores block|double|perfect|extra|skill speed|combat speed|always critical/,
  cd: /cooldown|reset|-\d+\s?s\b|cut.*cooldown/,
  mp: /\bmp\b/,
  cc: /stun|root|seal|fear|knock|blind|slow|airborne|frost|freeze|polymorph/,
  aoe: /aoe|area|more targets|pull/,
  single: /fewer targets|immune targets|incapacitated|boss/,
  mob: /mobile|while moving/,
  pvp: /pvp|player|buffs?\b|breaks protective|removes protective|incoming healing|healing reduction|stamina|potion/,
  pve: /\bpve\b/,
  rng: /\brange\b|\d+m\b/,
};
const W = {
  pve:   { surv: 2, heal: 2, dmg: 2.5, cd: 2.5, mp: 1, cc: 0.3, aoe: 2, single: 0.5, mob: 0.8, pvp: -1, pve: 2, rng: 0.3 },
  boss:  { surv: 2.5, heal: 2, dmg: 3, cd: 2.5, mp: 1.2, cc: -0.5, aoe: 0, single: 2, mob: 1.5, pvp: -1, pve: 2, rng: 0.3 },
  kasma: { surv: 1.5, heal: 1, dmg: 3, cd: 2, mp: 1.5, cc: 0.8, aoe: 3, single: -0.5, mob: 1, pvp: -1, pve: 1, rng: 1 },
  pvp:   { surv: 2.5, heal: 2, dmg: 2.5, cd: 2, mp: 0.5, cc: 3.5, aoe: 0.5, single: 1, mob: 2, pvp: 3, pve: -1.5, rng: 1.5 },
};
function kscore(text, mode, role) {
  const t = text.toLowerCase(); let s = 0;
  for (const k in KW) if (KW[k].test(t)) {
    let w = W[mode][k];
    if (k === "heal" && role !== "dps") w += 2;
    if (k === "dmg" && role === "dps") w += 1;
    if (k === "surv" && role === "dps" && mode === "kasma") w -= 0.5;
    s += w;
  }
  return s;
}
const KEYS = ["g", "b", "y", "o", "s16"];
function buildClass(cls) {
  const raw = CLASS_RAW[cls], role = ROLE[cls];
  const actives = raw.actives.map(a => {
    const optsEn = {}, opts = {}; a.specs.forEach((s, i) => { optsEn[KEYS[i]] = s.replace(/^Lv\d+:\s*/, "").replace(/\.$/, ""); opts[KEYS[i]] = a.tr ? a.tr.s[i] : optsEn[KEYS[i]]; });
    const pri = {}; for (const m of Object.keys(MODES)) pri[m] = [...KEYS].sort((x, y) => kscore(optsEn[y], m, role) - kscore(optsEn[x], m, role));
    return { id: slug(a.name), ad: a.name, cd: a.cd || "yok", acik: a.tr ? a.tr.d : a.desc, en: a.desc, opts, optsEn, pri, req: {} };
  });
  const passives = raw.passives.map(p => ({ id: slug(p.name), ad: p.name, etki: p.tr ? p.tr.d : p.desc, en: p.desc }));
  const stigmas = raw.stigmas.map(s => ({ id: "st_" + slug(s.name), ad: s.name, cd: s.cd || "", acik: s.tr ? s.tr.d : s.desc, sv: s.tr ? s.tr.lv : s.lv, en: s.desc, svEn: s.lv }));
  const set = {}, macro = {}, pri = {}, kaynak = {};
  const defensive = s => /tolerance|shield|immunity|invulner|evade|evasion stance|block|parry|heal|revive|resurrect/i.test(s.en);
  for (const m of Object.keys(MODES)) {
    const sc = stigmas.map(s => ({ s, v: kscore(s.en + " " + Object.values(s.svEn).join(" "), m, role) + (m === "boss" && defensive(s) ? (role === "dps" ? 0.5 : 2) : 0) })).sort((a, b) => b.v - a.v);
    set[m] = { set: sc.slice(0, 4).map(x => x.s.id), alt: sc.slice(4, 6).map(x => [x.s.id, `Puanı yakın alternatif (${MODES[m].kisa}) — dizilimdeki en zayıfın yerine dene`]) };
    // makro
    const isHeal = a => /heals?\b/i.test(a.en) && role !== "dps";
    const charge = a => /charge/i.test(a.en);
    const cond = actives.filter(a => /staggered|afflicted with stagger/i.test(a.en) && !a.cd.match(/\d/));
    const cds = actives.filter(a => /\d/.test(a.cd) && a.id !== "defiance" && !charge(a) && !isHeal(a)).sort((a, b) => parseInt(b.cd) - parseInt(a.cd));
    const filler = actives.filter(a => !/\d/.test(a.cd) && !cond.includes(a) && /restores?.*mp|mp/i.test(a.en)).slice(0, 1);
    const stg = set[m].set.filter(id => { const s = stigmas.find(x => x.id === id); return !defensive(s) && /damage|strike|hit|shot|arrow|blade/i.test(s.en) && parseInt(s.cd) <= 60; });
    macro[m] = [...cond.map(a => a.id), ...stg.slice(0, 2), ...cds.map(a => a.id), ...filler.map(a => a.id)];
    // puan önceliği
    const all = [
      ...actives.map(a => ({ id: a.id, v: Math.max(...KEYS.map(k => kscore(a.optsEn[k], m, role))) + (a.id === "defiance" && m !== "kasma" ? 3 : 0) })),
      ...passives.map(p => ({ id: p.id, v: kscore(p.en, m, role) + 1 })),
    ].sort((a, b) => b.v - a.v);
    pri[m] = all.map(x => x.id);
    kaynak[m] = passives.map(p => ({ id: p.id, v: kscore(p.en, m, role) })).sort((a, b) => a.v - b.v).slice(0, 2).map(x => [x.id, `${MODES[m].kisa} için en az katkı veren pasif`]);
  }
  const disi = [["defiance", "Acil durum butonu, zamanlama ister."],
    ...actives.filter(a => /charge/i.test(a.en)).map(a => [a.id, "Şarjlı — makro yanlış seviyede bırakabilir."]),
    ...actives.filter(a => /heals?\b/i.test(a.en) && role !== "dps").map(a => [a.id, "İyileştirme — kimin canı düşerse ona elle."]),
    ...stigmas.filter(s => defensive(s)).map(s => [s.id, "Savunma / destek — zamanlama ister."])];
  const lv = {}, st = {};
  actives.forEach(a => lv[a.id] = [10, 4]); passives.forEach(p => lv[p.id] = [10, 4]); stigmas.forEach(s => st[s.id] = 10);
  return { ACTIVES: actives, PASSIVES: passives, STIGMAS: stigmas, STIGMA_SET: set, MACRO: macro, MACRO_DISI: disi, SKILL_PRI: pri, SKILL_KAYNAK: kaynak, lv, st };
}
const TEMPLAR = { ACTIVES, PASSIVES, STIGMAS, STIGMA_SET, MACRO, MACRO_DISI, SKILL_PRI, SKILL_KAYNAK };
function applyClass(cls) {
  // eski sınıfın seviyelerini sakla
  S.byCls = S.byCls || {};
  if (S.cls) S.byCls[S.cls] = { lv: S.lv, st: S.st, freeSkill: S.freeSkill, freeStigma: S.freeStigma };
  const d = cls === "templar" ? TEMPLAR : buildClass(cls);
  ({ ACTIVES, PASSIVES, STIGMAS, STIGMA_SET, MACRO, MACRO_DISI, SKILL_PRI, SKILL_KAYNAK } = d);
  const saved = S.byCls[cls];
  if (saved) { S.lv = saved.lv; S.st = saved.st; S.freeSkill = saved.freeSkill || 0; S.freeStigma = saved.freeStigma || 0; }
  else if (cls === "templar") { const t = JSON.parse(JSON.stringify(DEFAULT_STATE)); S.lv = t.lv; S.st = t.st; S.freeSkill = 0; S.freeStigma = 0; }
  else { S.lv = JSON.parse(JSON.stringify(d.lv)); S.st = JSON.parse(JSON.stringify(d.st)); S.freeSkill = 0; S.freeStigma = 0; }
  // eksik anahtarları tamamla
  [...ACTIVES, ...PASSIVES].forEach(x => { if (!S.lv[x.id]) S.lv[x.id] = [10, 4]; });
  STIGMAS.forEach(s => { if (S.st[s.id] == null) S.st[s.id] = 10; });
  S.cls = cls; CLS = cls;
  ALL = Object.fromEntries([...ACTIVES, ...PASSIVES, ...STIGMAS].map(x => [x.id, x]));
  if (typeof buildAlias === "function") buildAlias();
  document.title = CLASS_NAME[cls] + " · Daeva Asistanı";
  const h = document.getElementById("apptitle"); if (h) h.textContent = "⚔ " + CLASS_NAME[cls] + " Asistanı";
}
// ikonu olmayan yetenekler için harfli rozet
function fallbackIcon(id) {
  const nm = (ALL[id] && ALL[id].ad) || id; const ini = nm.replace(/^(Summon|Jointstrike|Enhance|Command|Curse):\s*/i, "").split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='10' fill='hsl(${h},45%,28%)'/><rect x='3' y='3' width='58' height='58' rx='8' fill='none' stroke='hsl(${h},60%,55%)' stroke-width='2'/><text x='32' y='41' font-family='Segoe UI,Arial' font-size='24' font-weight='700' fill='hsl(${h},80%,85%)' text-anchor='middle'>${ini}</text></svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}
const iconSrc = id => (CLS !== "templar" && CLASS_ICONS[CLS] && CLASS_ICONS[CLS][id]) || ICONS[id] || fallbackIcon(id);
