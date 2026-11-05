# Daeva Asistanı — Geliştirme günlüğü

Yeni bir sohbette kaldığımız yerden devam etmek için bu dosyayı oku.
Kaynak kodun nasıl derlendiği `kaynak/OKU.md` dosyasında yazıyor.

## Şu anki durum (5 Kasım 2026)

| Parça | Sürüm | Nerede |
|---|---|---|
| Bilgisayar (exe) | 1.4.3 | [Releases → exe-v1.4.3](https://github.com/81Miralay81/daeva-asistani/releases/tag/exe-v1.4.3) |
| Telefon (APK) | 1.0.25 | Releases → v1.0.25 (en son sürüm) |
| DPS kaynak tabloları | 2026-11-05.1 | `meta/dps_kaynak.json` |

- Exe kendini otomatik günceller (1.4.6 ve sonrası; 1.4.2–1.4.5 güncelleyicisi bozuktu: .bat takılıyordu, PowerShell ile düzeltildi). APK açılışta kendini günceller.
- `main` dalına her gönderimde GitHub Actions iki şeyi derler:
  - exe: `.github/workflows/exe.yml`, sürüm numarası `1.4.<çalıştırma no>`.
  - APK: `.github/workflows/apk.yml`.
- Gerçek oyunla HİÇBİR ŞEY henüz denenmedi. Kullanıcının ilk denemesi ve geri bildirimi bekleniyor.

## Kullanıcı ve tercihleri

- Aion 2 Global oynuyor, oyun istemcisi İngilizce. Şimdilik Elyos, ırk ve sunucusu değişebilir: uygulama açılışta sorar.
- Türkiye'de yaşıyor: bütün saatler Türkiye saatiyle gösterilir, sunucu saati gösterilmez.
- Arayüz ve bütün açıklamalar Türkçe.

## Neler yaptık, sırasıyla

### 1. Araştırma: DPS ölçer yapılabilir mi? (3 Kasım)
- Açık kaynak örnekler bulundu: A2Tools, cyberbadger6969/aion2-dps-meter, AionFlex, ING Meter, LagoFast.
- Hepsi aynı yöntemi kullanıyor: Npcap ile gelen ağ paketlerini pasif okumak. Oyunun belleğine dokunmuyorlar, oyuna hiçbir şey göndermiyorlar.
- Ban durumu: meter kullandığı için ban yiyen birine dair haber bulunamadı; NC'nin cezaları makro ve bot kullananlara. Ama Kore işletim politikası "izinsiz program" kullanmayı da yasaklıyor, yani risk sıfır değil.

### 2. DPS çekirdeği (3 Kasım) — `kaynak/masaustu/dps/`
- `protocol.py`:
  - cyberbadger6969/aion2-dps-meter'in (GPL-3.0) C# çözücüsünün Python'a aktarımı.
  - TCP birleştirme, çerçeveleme, LZ4.
  - Paketler: hasar, DoT, kendi karakterin, diğer oyuncular, parti listesi, doğan varlıklar/petler, ölüm, can, harita, saha boss listesi.
- `capture.py`: Npcap (wpcap.dll) ctypes ile. Bütün ağ kartlarını dinler, oyun akışını kalp atışı paketlerinden tanır.
- `tracker.py`: dövüşler, parti filtresi, skill başına hasar/vuruş/kritik/en büyük vuruş, pet hasarını sahibine yazma, dövüş geçmişi.
- Testler: `kaynak/masaustu/tests/`.
  - Gerçek EU yakalamalarından alınmış bayt dizileriyle 14 test, hepsi geçiyor.
  - Linux'ta loopback üzerinden uçtan uca yakalama testi de geçti.

### 3. NCSOFT resmi karakter verisi (3 Kasım) — `kaynak/masaustu/ncsoft.py`
- Kullanılan uçlar (uç adları github.com/nuriland/aion2-api'den):
  - Arama: `api-search.plaync.com/aion2global/search/v2/character`
  - Karakter: `aion2.plaync.com/api/character/info`, `/equipment`, `/equipment/item`
- Ekipman gruplanıyor: silah / zırh / takı / Arcana (boş yuvalar dahil) / kanat-pet / görünüm.
- Ayrıca: unvan, sıralama, statlar ve etkileri, Daevanion tahtaları.
- Eşya detayı: ana ve ek statlar, manataşları, tanrı taşı, eşya yetenekleri.
- NCSOFT cevap vermezse MetaBot'a geçilir. Telefonda karakter verisi hâlâ MetaBot'tan.

### 4. Oyun güncellemesi kontrolü (5 Kasım)
- 4 Kasım yamasından sonra referans projelere bakıldı: hasar paketi değişmemiş, sadece Abyss puan kaydı değişmiş (biz kullanmıyoruz).
- NPC tablosu yenilendi.

### 5. Büyük paket, sürüm 1.4.0 (5 Kasım)
- Açılışta ırk / bölge / sunucu sorulur; ⚙ düğmesiyle değiştirilir.
- **DPS Ölçer sekmesi:**
  - Başlat / Durdur / Sıfırla.
  - Üye başına toplam, DPS, pay, kritik oranı, en büyük vuruş.
  - Skill ikonları ve altlarında hasarları (ikonlar NC'nin CDN'inden).
  - Dövüş geçmişi, "sadece parti / herkes" seçimi.
- **Oyun üstü pencere** (`dps/overlay.py`, tkinter):
  - Sol üstte, yarı saydam. DPS ve geri sayımlar burada.
  - [–] küçültme, [×] kapatma, her sayaçta kendi ×. İki bölüm de kapanınca küçük "D" düğmesi kalır.
  - Odak çalmaz. Oyun "Pencereli tam ekran" modunda olmalı.
- **"Oyun verisi yok" uyarısı:** Oyun kapalıysa hem pencerede hem sekmelerde görünür.
- **Geri sayım sekmesi** (`dps/timers.py`, Türkiye saati):
  - Spacetime Rift: UTC 00'dan 3 saatte bir, girişler 10 dk.
  - Watcher Kaira: sunucu saatiyle 01:00'den 3 saatte bir.
  - Günlük sıfırlama 07:00 UTC, haftalık sıfırlama Çarşamba.
  - Saha bossları oyundan otomatik gelir: haritadaki boss listesi bir kez açılınca (opcode 01 91). Ölçer bossun ölümünü görürse de 6 ya da 12 saatlik sayaç başlar.
  - "Kendi geri sayımın": siege ve Abyss savaşları için. Saatleri doğrulanmış bir kaynak bulunamadığı için kullanıcı kendisi giriyor.
- **Harita sekmesi:**
  - Veri aion2-interactive-map'ten (CC BY-NC 4.0): ışınlanma noktaları, küpler, mühürler, karakollar, savaş alanları.
  - Yaratık/boss konumu yok, harita resmi yok (noktalar koyu zemin üzerinde). Veri Kore sürümünden.
  - interactivemap.app verisini paylaşmadığı ve kullanım izni olmadığı için kullanılmadı.
- **Eşya / pet arama sekmesi:**
  - NC'nin eşya sözlüğü kullanılıyor. Global'de sözlük yok, bu yüzden Tayvan sözlüğü İngilizce olarak.
  - "Nereden elde edilir" bilgisi NC'de kaba (Crafting, Dungeon gibi).
- **Güncelleme sistemi:**
  - Tablolar her gün kendiliğinden yenilenir (`.github/workflows/dps_data.yml`, `tools/dps_data.py`).
  - Uygulama açılışta "Yeni DPS kaynağı var" diye sorar; exe yeniden derlenmez.

### 6. Sürüm 1.4.2 (5 Kasım)
- Exe kendini günceller (`kaynak/masaustu/updater.py`):
  1. Açılışta GitHub'daki en yeni `exe-v*` sürümüne bakar.
  2. "Güncelle ve yeniden aç" denince yeni exe'yi indirir.
  3. Uygulama kapanınca küçük bir .bat dosyası eski exe'nin yerine yenisini koyup uygulamayı yeniden açar.
- DPS sekmesine "Oyun üstü pencere nasıl açılır?" yardımı eklendi.
- Parti radarı denendi (konum paketi 23 36) ama kaldırıldı: güvenilir değil, oyunun kendi haritası zaten var.

### 7. Sürüm 1.4.3 (5 Kasım)
- Başlat: oyun açıksa kapatmaz ve yeniden açmaz, ölçer açık oyuna bağlanır; kapalıysa Steam'den açar (Steam uygulama no 3393110).
- Oyunun açık olduğunu, adında "aion2" geçen çalışan bir işlem olup olmadığına bakarak anlar.

### 8. Kanatix markası — exe 1.4.4, APK 1.0.27 (5 Kasım)
- Neden: kullanıcı bütün programları için ortak marka olarak **Kanatix**'i seçti (kanat + X logosu).
- Ad: telefonda ve pencere başlığında **Kanatix Daeva Asistanı**. Dosyalar: `KanatixDaevaAsistani.exe`, `KanatixDaevaAsistani.apk`.
- Simge: Kanatix kanat-X + altın kılıç rozeti. Exe: `kaynak/masaustu/icon.ico`. Android: `android/app/src/main/res/mipmap-*/ic_launcher.png`.
- Banner: arayüzün en üstünde, uygulamanın kendi renkleriyle (#1B2232→#0B0F16, altın #E8B94A çizgi). Dosya `kaynak/web/kanatix_banner.webp`; `kaynak/build_all.py` derlerken sayfaya gömer (hem exe hem APK).
- Değişmeyenler (bilerek):
  - `%APPDATA%\DaevaAsistani` veri klasörü: ayarlar ve sohbet geçmişi kaybolmasın diye.
  - Android paket adı `com.daeva.asistani` ve imza: güncelleme eskisinin üzerine kurulsun diye.
- Güncelleyiciler `.exe` / `.apk` ile biten herhangi bir dosyayı aldığı için yeni dosya adları otomatik güncellemeyi bozmuyor.
  - Kurulu eski exe güncellenince kendi dosya adıyla kalır.
  - Yeni indirenler `KanatixDaevaAsistani.exe` alır.
- Marka kaynakları: `marka/` (`uret.py`, `daeva-icon.svg`, `daeva-banner.svg`).

### 9. Zorunlu güncelleme — exe 1.4.5, APK 1.0.28 (5 Kasım)
- Neden: kullanıcı Kalıp Takip dışındaki bütün programlarının güncellemeye zorlanmasını istedi.
- Telefon (`MainActivity.java`): yeni sürüm varsa "Güncelleme gerekli" penceresi çıkar. "Sonra" düğmesi yok, pencere kapatılamaz. İndirme sırasında "Tekrar indir" düğmesi var. Kurulum ekranından vazgeçip geri dönülürse pencere yeniden açılır.
- Bilgisayar (`kaynak/web/dps.js` → `forceAppUpdate`): exe yeni sürümü görünce ekranı kilitler, indirir, kapanıp yeni sürümle açılır. İnternet yoksa 3 denemeden sonra "şimdilik devam et" çıkar.
- Not: 1.0.27 / 1.4.4 ve öncesi kurulu olanlar bu sürümü bir kez eski usulle (öneriyle) alır; bundan sonraki her sürüm zorunludur.

## Bekleyen / sıradaki işler
1. Kullanıcı gerçek oyunda denesin:
   - DPS sayıları doğru mu?
   - Oyun üstü pencere görünüyor mu?
   - Başlat açık oyunu algılıyor mu?
   - Saha boss sayaçları doluyor mu?
2. Telefonda karakter ekranı için NCSOFT bağlantısı (`android_bridge.js` + `MainActivity.java`).
3. Eşya aramada "hangi boss düşürür" için daha ayrıntılı bir loot tablosu.
4. Siege / Abyss savaş saatleri doğrulanırsa sabit programa eklemek.
5. Haritaya boss/yaratık konumları ve gerçek harita resmi (açık bir kaynak bulunursa).

## Lisans notu
DPS kısmı GPL-3.0 projelerden aktarıldı (`kaynak/masaustu/dps/LICENSE`). Bu yüzden uygulama açık kaynak kalmalı; depo zaten herkese açık.

## Kaynaklar
- DPS protokolü: [cyberbadger6969/aion2-dps-meter](https://github.com/cyberbadger6969/aion2-dps-meter) (GPL-3.0)
- Tablolar: [taengu/A2Tools-DPS-Meter](https://github.com/taengu/A2Tools-DPS-Meter) (GPL-3.0)
- NC uçları: [nuriland/aion2-api](https://github.com/nuriland/aion2-api)
- Program saatleri: [jackships/aion2-data](https://github.com/jackships/aion2-data) (CC BY 4.0), aion2hub.com
- Harita: [aion2-interactive-map](https://github.com/aion2-interactive-map/aion2-interactive-map) (CC BY-NC 4.0)

### 8. 1.4.12 (5 Kasım akşam)
- Harita: gerçek harita resmi (harita_img/, aion2-interactive-map karolarından birleştirildi), fare tekerleğiyle yakınlaştırma/sürükleme, sağda türe göre seçmeli liste (varsayılan hiçbiri görünmez), Çince adlar İngilizce bölge adıyla değiştirildi.
- DPS sekmesi: üyeler yan yana sütun, skiller büyükten küçüğe alt alta; Theostone gibi ikonu olmayan skiller için yedek ikon.
- Oyun üstü geri sayımlar geri geldi ama varsayılan kapalı: uygulamada "üstte göster" denenler görünür.
- Eşya arama: NC 404 = Global'de yok mesajı; her eşyada düşme/toplama yeri için web araması bağlantısı (açık lisanslı düşme/toplama verisi bulunamadı).
- Training Scarecrow gibi kuklalar saha bossu sayacına girmez.

### 9. 1.4.14 (5 Kasım gece)
- Harita Leaflet ile yeniden yapıldı: oyunun harita karoları (aion2-interactive-map deposundan), akıcı yakınlaştırma, oyun simgeleriyle işaretler, simge boyu yakınlaştırmaya göre küçülür, adı üstüne gelince çıkar.
- Harita verisi tools/harita_data.py + .github/workflows/harita.yml ile her gün yenilenir; sitenin canlı dışa aktarımı (aion2.tc-imba.com/api/v1/export) toplama malzemelerini (Odyle, Orichalcum, Ruby…) içeriyorsa onlar da gelir. Uygulama harita.json dosyasını açılışta GitHub dan çeker.
- interactivemap.app robots.txt ile otomatik erişimi yasakladığı için kullanılmadı.
- Güncelleyici yeni sürümü Windows Gezgini ile başlatır (Python DLL hatası için).
