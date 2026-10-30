import base64, json, pathlib, re
p = pathlib.Path('.')
s = (p/'app.html').read_text(encoding='utf-8')
# skeleton
s = s.replace('<!doctype html>\n<html lang="tr">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Templar Tank Asistanı</title>',
 '<title>Templar Tank Asistanı</title>\n<meta name="claude:viewport-fit-sides" content="cover">')
s = s.replace('</style>\n</head>\n<body>', '</style>').replace('</body>\n</html>', '')
# css
s = s.replace(':root{--bg', ':root{color-scheme:dark;--bg')
s = s.replace('--s16:#c58cf5;--bad:#ef6b62}', '--s16:#c58cf5;--bad:#ef6b62;--ink:#0d1119;--hdr:#0b0f16;--notebg:#22201a;--noteln:#4a4128;--notetx:#efe2bf;--onacc:#1a1405;--dS:#7d7563;--dA:#2f6ea6;--dP:#4f8a4a;--dX:#3e5f86;--dO:#c4651f;--plan:#3a3220}')
s = s.replace('header{position:sticky;top:0;z-index:5;background:#0b0f16ee;border-bottom:1px solid var(--line);padding:10px 16px;',
 'body::before{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);z-index:10;background:var(--hdr)}\nheader{position:sticky;top:env(safe-area-inset-top,0px);z-index:5;background:var(--hdr);border-bottom:1px solid var(--line);padding-block:10px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));')
s = s.replace('.tabs{display:flex;gap:6px;flex-wrap:wrap;padding:10px 16px;', '.tabs{display:flex;gap:6px;flex-wrap:wrap;padding-block:10px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));')
s = s.replace('main{padding:14px 16px 60px;', 'main{padding-block:14px 60px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));')
s = s.replace('@media (max-width:600px){main{padding:10px}.grid2{grid-template-columns:1fr}}', '@media (max-width:600px){.grid2{grid-template-columns:1fr}}')
s = s.replace('background:#0d1119', 'background:var(--ink)').replace('color:#1a1405', 'color:var(--onacc)')
s = s.replace('.note{background:#22201a;border:1px solid #4a4128;border-radius:10px;padding:10px 12px;margin:8px 0;color:#efe2bf}',
 '.note{background:var(--notebg);border:1px solid var(--noteln);border-radius:10px;padding:10px 12px;margin:8px 0;color:var(--notetx)}')
s = s.replace('.grid2{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:10px}', '.grid2{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(330px,100%),1fr));gap:10px}\n.grid2>*,.row>*{min-width:0}\nbutton:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:2px solid var(--acc);outline-offset:2px}')
s = s.replace('.card{', '.card table{display:block;overflow-x:auto}\n.card{')
s += ''
chatcss = '''
.chat{max-width:860px;margin:0 auto;display:flex;flex-direction:column;gap:10px}
.msgs{display:flex;flex-direction:column;gap:10px;max-height:62vh;overflow-y:auto;padding:4px 2px}
.msg{max-width:92%;border-radius:12px;padding:10px 12px;border:1px solid var(--line);line-height:1.55;min-width:0;overflow-wrap:anywhere}
.msg.user{align-self:flex-end;background:var(--panel2);border-color:var(--acc)}
.msg.assistant{align-self:flex-start;background:var(--panel)}
.msg p{margin:0 0 6px}.msg p.h{color:var(--acc);font-weight:600;margin-top:6px}.msg ul,.msg ol{margin:4px 0 8px;padding-left:20px}.msg li{margin:2px 0}
.msg code{background:var(--ink);border-radius:4px;padding:0 4px}
.tw{overflow-x:auto;margin:6px 0}.tw table{width:auto;min-width:60%}
.empty{padding:18px;text-align:center}
.quick{display:flex;flex-wrap:wrap;gap:6px}
.qbtn{background:var(--ink);color:var(--tx);border:1px dashed var(--line);border-radius:999px;padding:5px 12px;cursor:pointer;font:inherit;font-size:13px}
.qbtn:hover{border-color:var(--acc);color:var(--acc)}
.askf{display:flex;flex-direction:column;gap:8px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px}
.askf textarea{width:100%;resize:vertical;background:var(--ink);color:var(--tx);border:1px solid var(--line);border-radius:8px;padding:8px 10px;font:inherit}
.askbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.btn.pri{background:var(--acc);color:var(--onacc);border-color:var(--acc);font-weight:600}
.btn:disabled{opacity:.5;cursor:default}

.dtabs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.dtabs button{background:var(--panel2);color:var(--tx);border:1px solid var(--line);border-radius:8px;padding:6px 12px;cursor:pointer;font:inherit;display:flex;gap:8px;align-items:baseline}
.dtabs button span{font-size:12px;color:var(--mut);font-variant-numeric:tabular-nums}
.dtabs button.on{border-color:var(--acc);color:var(--acc)}
.dwrap{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:14px;align-items:start}
@media (max-width:860px){.dwrap{grid-template-columns:1fr}}
.dhead{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;align-items:center;margin-bottom:8px}
.dmode{display:flex;gap:4px}.dmode button{background:var(--ink);color:var(--mut);border:1px solid var(--line);border-radius:7px;padding:4px 10px;cursor:pointer;font:inherit;font-size:12.5px}
.dmode button.on{color:var(--onacc);background:var(--acc);border-color:var(--acc)}
.dboard{display:grid;gap:4px;max-width:660px;background:var(--hdr);border:1px solid var(--line);border-radius:12px;padding:8px}
.dn{aspect-ratio:1;border-radius:5px;border:1px solid var(--line);background:var(--ink);color:var(--tx);font:600 11px/1 "Segoe UI",system-ui,sans-serif;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;opacity:.45;position:relative;min-width:0}
.dn.empty{background:none;border:0;cursor:default}
.dn.start{opacity:1;background:var(--acc);color:var(--onacc);border-color:var(--acc);cursor:default;font-size:14px}
.dn.tS{border-color:var(--dS)}.dn.tA{border-color:var(--dA)}.dn.tP{border-color:var(--dP)}.dn.tX{border-color:var(--dX)}.dn.tO{border-color:var(--dO)}
.dn.own{opacity:1}.dn.own.tS{background:var(--dS)}.dn.own.tA{background:var(--dA)}.dn.own.tP{background:var(--dP)}.dn.own.tX{background:var(--dX)}.dn.own.tO{background:var(--dO)}
.dn.plan{opacity:1;outline:2px solid var(--acc);outline-offset:-1px;background:var(--plan)}
.dn.plan.bad{outline-color:var(--bad)}
.dn.sel{box-shadow:0 0 0 2px var(--tx)}
.dn.noted::after{content:"";position:absolute;top:2px;right:2px;width:5px;height:5px;border-radius:50%;background:var(--acc)}
.legend{display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:8px;font-size:12px;color:var(--mut)}
.legend span{display:flex;align-items:center;gap:5px}.legend i.dn{width:14px;height:14px;display:inline-block;cursor:default}
.dside{display:flex;flex-direction:column;gap:10px;min-width:0}
.dnote,.dhave{width:100%;background:var(--ink);color:var(--tx);border:1px solid var(--line);border-radius:6px;padding:6px 8px;font:inherit}
.dhave{width:70px}
#clssel{font-weight:600}
.pcard{border-color:var(--acc)}.pc-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:6px}
.pc-head input,.slotset input,#stc,#gemkey,#gemnote{width:72px;background:var(--ink);color:var(--tx);border:1px solid var(--line);border-radius:6px;padding:5px 8px;font:inherit}
#gemkey{width:auto}#gemnote{width:100%;resize:vertical}.slotset{display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap;margin-left:6px}.slotset input{width:58px}
.gemout a{color:var(--acc)}.card a{color:var(--acc)}
.chform{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin:8px 0}.chform label{display:flex;flex-direction:column;gap:4px;font-size:12.5px;color:var(--mut)}
.chform input,.chform select{background:var(--ink);color:var(--tx);border:1px solid var(--line);border-radius:6px;padding:6px 8px;font:inherit;min-width:140px}
.chhead{display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;align-items:center;border-color:var(--acc)}
.bar{height:8px;background:var(--ink);border-radius:4px;overflow:hidden;min-width:90px}.bar i{display:block;height:100%;background:var(--acc)}
.gaps{margin:0;padding-left:18px}.gaps li{margin:6px 0}
a.btn{display:inline-block;text-decoration:none;margin:6px 6px 0 0;white-space:nowrap}

.msg img.bi{width:26px;height:26px;border-radius:5px;vertical-align:middle;margin-right:4px}
.msg hr{border:0;border-top:1px dashed var(--line);margin:10px 0}
.msg td,.msg th{padding:4px 8px}
#savest{font-size:12.5px;color:var(--mut)}
'''
s = s.replace('</style>', chatcss + '</style>', 1)
# header buttons -> save status
s = s.replace('  <button class="btn" id="exp">Yedek al</button>\n  <button class="btn" id="imp">Yedek yükle</button>\n  <input type="file" id="impf" accept=".json" hidden>', '  <span id="clsbox"></span>\n  <span id="savest">Kayıt: bu tarayıcı</span>')
s = re.sub(r'document\.getElementById\("exp"\)\.onclick.*?\n', '', s)
s = re.sub(r'document\.getElementById\("imp"\)\.onclick.*?\n', '', s)
s = re.sub(r'document\.getElementById\("impf"\)\.onchange.*?\n', '', s)
# tabs + default
s = s.replace('const TABS = [["akt"', 'const TABS = [["ask","💬 Asistan"],["ai","🤖 Yapay Zeka"],["kar","👤 Karakter"],["akt"').replace('let S = load(); let TAB = "akt";', 'let S = load(); let TAB = "ask";')
s = s.replace('function save(){ try{ localStorage.setItem("templarTank", JSON.stringify(S)); }catch(e){} }', 'function save(){ try{ localStorage.setItem("templarTank", JSON.stringify(S)); }catch(e){} if(typeof cloudSave==="function") cloudSave(); }')
s = s.replace('const R = { akt:rAkt,', 'const R = { ask:()=>"", kar:()=>rKar(), akt:rAkt,')
s = s.replace('  document.getElementById("modes").innerHTML = Object.entries(MODES).map(([k,m])=>`<button data-m="${k}" class="${S.mode===k?"on":""}">${m.ad}</button>`).join("");',
 '  document.getElementById("modes").innerHTML = modeButtons();')
s = s.replace('function render(){', 'function modeButtons(){ return Object.entries(MODES).map(([k,m])=>`<button data-m="${k}" class="${S.mode===k?"on":""}">${m.ad}</button>`).join(""); }\nfunction render(){')
s = s.replace('  document.getElementById("main").innerHTML = R[TAB]();', '  document.getElementById("clsbox").innerHTML = clsSelect();\n  if(TAB==="ask"){ mountChat(); return; }\n  document.getElementById("main").innerHTML = R[TAB]();')
s = s.replace('  if(m){ S.mode = m.dataset.m; save(); render(); }', '  if(m){ S.mode = m.dataset.m; save(); if(TAB==="ask"){ document.getElementById("modes").innerHTML = modeButtons(); const n=document.getElementById("curmode"); if(n) n.textContent=MODES[S.mode].ad; } else render(); }')
s = s.replace('  const el = e.target; const v = Math.max(0, parseInt(el.value)||0);', '  const el = e.target; if(el.id==="imgin") return; const v = Math.max(0, parseInt(el.value)||0);')
s = s.replace('d.freeStigma=s.freeStigma||0; return d; }', 'd.freeStigma=s.freeStigma||0; d.dae=s.dae||{}; d.daeHave=s.daeHave||{}; d.cls=s.cls||"templar"; return d; }')
s = s.replace('function reqOf(sk,k){ return k==="s16" ? 16 : (sk.req && sk.req[k]) || 8; }', 'function reqOf(sk,k){ return k==="s16" ? 16 : (sk.req && sk.req[k]) || (k==="o" ? 12 : 8); }')
s = s.replace("const ALL = Object.fromEntries","let ALL = Object.fromEntries")
s = s.replace('document.getElementById("tabs").innerHTML = TABS.map(([k,t])=>`<button data-t="${k}" class="${TAB===k?"on":""}">${t}</button>`).join("");','document.getElementById("tabs").innerHTML = tabButtons();')
s = s.replace('const icon = id => `<img src="${ICONS[id]||""}" alt="">`;','const icon = id => `<img src="${iconSrc(id)}" alt="">`;')
s = s.replace('<h1>⚔ Templar Tank Asistanı</h1>','<h1 id="apptitle">⚔ Templar Asistanı</h1>').replace('<title>Templar Tank Asistanı</title>','<title>Daeva Asistanı</title>')
s = s.replace('d.cls=s.cls||"templar"; return d; }','d.cls=s.cls||"templar"; d.byCls=s.byCls||{}; d.region=s.region||"eu"; for(const k of ["freeActive","freePassive","slotLv","stCost11","gemModel","gemModels","gemLast","gemUpdate","gemNew","chName","chRegion","chServer","chCls","chLast","chApplied","gemCool","gemBad","freeSkills","ai","aiUndo","daeBud","macroKey","barKeys","chSpec","gemAuto","daeV2","daeFrom","dvBest"]) if(s[k]!==undefined) d[k]=s[k]; return d; }')
# inject chat script before final render()
s = s.replace('render();\n</script>', '/*CHAT*/\n/*DAE*/\n/*CLS*/\n/*V2*/\n{ const c0 = S.cls || "templar"; S.cls = null; applyClass(c0); }\nrender();\n</script>')
icons = {f.stem: 'data:image/png;base64,' + base64.b64encode(f.read_bytes()).decode() for f in sorted((p/'icons').glob('*.png'))}
# Ekran görüntüsünden kesilen ikonlarda kilit/seviye yazısı olabiliyor: MetaBot'taki temiz sürüm varsa onu kullan
_mb = json.loads((p/'metabot_icons.json').read_text(encoding='utf-8'))
for _k in list(icons):
    _slug = (_k[3:] if _k.startswith('st_') else _k).replace('_', '-')
    _key = _slug if _slug in _mb else next((x for x in _mb if x.startswith(_slug)), None)
    if _key: icons[_k] = _mb[_key]
s = s.replace('/*DATA*/', re.sub(r'^const (ACTIVES|PASSIVES|STIGMAS|STIGMA_SET|MACRO|MACRO_DISI|SKILL_PRI|SKILL_KAYNAK) =', r'let \1 =', (p/'data.js').read_text(encoding='utf-8'), flags=re.M)).replace('/*ICONS*/', json.dumps(icons)).replace('/*CHAT*/', (p/'bot.js').read_text(encoding='utf-8')).replace('/*CLS*/', (p/'class_icons.js').read_text(encoding='utf-8') + (p/'classes.js').read_text(encoding='utf-8').replace('/*RAW*/', (p/'classes_full.json').read_text(encoding='utf-8'))).replace('/*V2*/', (p/'v2.js').read_text(encoding='utf-8') + (p/'gemini.js').read_text(encoding='utf-8') + (p/'char.js').read_text(encoding='utf-8') + (p/'ai_dist.js').read_text(encoding='utf-8') + (p/'dv_data.js').read_text(encoding='utf-8') + (p/'dv_v2.js').read_text(encoding='utf-8') + (p/'dae_ai.js').read_text(encoding='utf-8')).replace('/*DAE*/', (p/'dae_grid.js').read_text(encoding='utf-8') + (p/'dae.js').read_text(encoding='utf-8'))
(p/'templar-tank.html').write_text(s, encoding='utf-8')
for k in ['exp"','imp"','<!doctype','<body','/*CHAT*/','/*DATA*/']: print(k, k in s)
print(len(s)//1024,'KB')
