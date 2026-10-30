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
