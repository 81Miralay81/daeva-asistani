import base64, json, pathlib
p = pathlib.Path('.')
icons = {f.stem: 'data:image/png;base64,' + base64.b64encode(f.read_bytes()).decode() for f in sorted((p/'icons').glob('*.png'))}
html = (p/'app.html').read_text(encoding='utf-8')
html = html.replace('/*DATA*/', (p/'data.js').read_text(encoding='utf-8')).replace('/*ICONS*/', json.dumps(icons))
(p/'TemplarTankAsistani.html').write_text(html, encoding='utf-8')
print(len(html)//1024, 'KB')
