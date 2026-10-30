# Daeva Asistanı — kaynak kod

Uygulamanın bütün kaynakları burada; bir sonraki değişiklikte buradan devam edilir.

## Yapı
- `web/` — arayüzün parçaları. `python3 build_art.py` hepsini birleştirip `templar-tank.html` üretir.
  - `app.html` temel sayfa + CSS, `data.js` Templar verisi, `classes.js` + `classes_full.json` diğer sınıflar
  - `v2.js` modlar/puan, `gemini_body.js` (+ `md.js` → `gemini.js`) yapay zeka, `char.js` karakter sorgusu,
    `ai_dist.js` dağıt / makro / yetenek çubuğu, `dv_data.js` + `dv_v2.js` Daevanion (MetaBot tahta verisi), `dae_ai.js` Daevanion planlayıcı,
    `mb_meta.js` + `mb_meta.json` (`mbmeta/<sınıf>.json`) MetaBot top oyuncu dizilimi: her sekmede **Sıfırla** / **En iyi dizilim**
  - `metabot_icons.json`, `icons/` yetenek ikonları; `dvdata/` Daevanion ham verisi
- `masaustu/` — Windows exe (pywebview). `app/index.html` = `templar-tank.html` + bağlantı yönlendirmesi. `build.bat` ile derlenir.
- Depo kökü — Android (WebView): `web/templar-tank.html` + `android_bridge.js` → `build_assets.py` → `android/app/src/main/assets/index.html`.
  `main` dalına gönderilince GitHub Actions APK'yı derler ve Releases'a yeni sürüm koyar; telefondaki uygulama açılışta kendini günceller.

## Yapay zeka
Yapay zeka sekmesi ve düğmeleri kaldırıldı (`aiState()` hep "off"). En iyi dizilim MetaBot verisinden gelir; veriyi yenilemek için
`metabot.gg/en/aion-2/classes/<sınıf>/build` sayfalarından Endgame PvE / PvP kartları ve "most common Daevanion build" hash'i `mbmeta/` altına yazılır.

## MetaBot verisi kendiliğinden
`.github/workflows/meta.yml` her gün `tools/mb_scrape.py` ile MetaBot'tan çeker, `meta/mb_meta.json` değiştiyse depoya kaydeder.
Uygulama açılışta bu dosyayı GitHub'dan okur (yeni APK gerekmez); internet yoksa gömülü/önbellek veri kullanılır.

## gemini.js üretimi
`gemini_body.js` içindeki `/*MD*/` yerine `md.js` konur:

    python3 -c "s=open('gemini_body.js').read();open('gemini.js','w').write(s.replace('/*MD*/',open('md.js').read()))"

## Gizli bilgiler
API anahtarı ve imza anahtarı depoda YOKTUR (imza: GitHub Secrets → KEYSTORE_B64 / KEYSTORE_PASS).
