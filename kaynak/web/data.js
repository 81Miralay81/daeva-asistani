// Aion 2 Templar (tank) verileri — kullanıcının oyun içi ekran görüntülerinden derlendi.
const MODES = {
  pve:   { ad: "PvE Zindan",       kisa: "Zindan" },
  boss:  { ad: "Zor Zindan / Boss", kisa: "Boss" },
  kasma: { ad: "Kasma (solo farm)", kisa: "Kasma" },
  pvp:   { ad: "PvP",              kisa: "PvP" },
};

// Specialty renkleri
const RENK = { g: "Yeşil", b: "Mavi", y: "Sarı", o: "Turuncu", s16: "16. sv" };

// Aktif yetenekler. opts: specialty seçenekleri; req: gereken toplam seviye (varsayılan 8).
// pri: mod başına öncelik sırası (ilk N tanesi, açık yuva sayısı kadar seçilir).
const ACTIVES = [
  { id: "warding_strike", ad: "Warding Strike", cd: "25 sn",
    acik: "4 düşmana vurur, ~1.500 HP iyileştirir, 10 sn Warding verir (PvE hasar azaltma +%20, saniyede ~170 HP).",
    opts: { g: "−5 sn cooldown", b: "Warding süresince +100 Block", y: "Warding süresince HoT (saniyede iyileşme)",
            o: "Ek PvE / PvP Damage Tolerance", s16: "+%10 PvE Damage Tolerance, +%5 PvP" },
    not: { g: "Vicious Strike'ta turuncu takılıysa gereksiz (cooldown zaten çok kısalıyor).", b: "Diğerlerinin gerisinde." },
    pri: { pve: ["y","o","s16","g","b"], boss: ["y","o","s16","g","b"], kasma: ["y","g","o","s16","b"], pvp: ["o","y","s16","g","b"] } },
  { id: "vicious_strike", ad: "Vicious Strike", cd: "yok (spam)",
    acik: "Anında, 4 düşman, aggro artırır, %1 HP çalar, 120 MP verir.",
    opts: { g: "+%20 MP restored", b: "Absorbs %1 HP", y: "+%50 Multi-Hit", o: "Vuruşta Warding Strike cooldown −2 sn", s16: "[Threatening Blow] zincir yeteneği" },
    not: { o: "Warding Strike'ı neredeyse sürekli açık tutar.", y: "Sadece hasar." },
    pri: { pve: ["b","o","s16","g","y"], boss: ["b","o","s16","g","y"], kasma: ["b","y","o","s16","g"], pvp: ["o","b","s16","g","y"] } },
  { id: "pummel", ad: "Pummel", cd: "yok (spam), 96 MP",
    acik: "Anında, 4 düşman, aggro, 3 stagger. Zincir: Punishing Strike.",
    opts: { g: "−%20 MP tüketimi", b: "[Punishing Strike] %3 HP çalar", y: "Düşük canda %12'ye kadar fazla hasar", o: "Vuruşta Punishment cooldown −1 sn", s16: "[Punishing Strike] ekstra hasar" },
    not: { g: "Makroda filler olarak Pummel kullanıyorsan mana için şart.", o: "Mana yetiyorsa yeşil yerine (Punishment %10 HP daha sık)." },
    pri: { pve: ["b","g","o","s16","y"], boss: ["b","g","o","s16","y"], kasma: ["b","o","y","s16","g"], pvp: ["b","o","g","y","s16"] } },
  { id: "poach", ad: "Poach", cd: "15 sn",
    acik: "20 m çekme, root, Max HP'nin %10'u kalkan, öldürünce cooldown sıfırlanır.",
    opts: { g: "Hedef etkisizse hedefe atılır", b: "Vuruşta 5 sn −%20 Status Effect Resist", y: "Düşman ölünce cooldown sıfırlanır", o: "%10 Max HP koruyucu kalkan", s16: "%50 şansla 3 sn stun" },
    not: { y: "Trash'te çok iyi, boss'ta işlemez.", g: "Tank için gereksiz." },
    pri: { pve: ["o","y","s16","b","g"], boss: ["o","b","s16","y","g"], kasma: ["y","o","s16","g","b"], pvp: ["o","b","s16","g","y"] } },
  { id: "shield_smite", ad: "Shield Smite", cd: "8 sn, 100 MP",
    acik: "4 düşman, NPC'ye %100 stun, Judgment'ı tetikler, 10 stagger.",
    opts: { g: "+1 sn stun süresi", b: "MP maliyetini kaldırır + 200 MP verir", y: "%50 şansla [Debilitating Smash] tetikler", o: "−2 sn cooldown", s16: "AoE stun" },
    not: { g: "Boss'lar stun'a bağışık — boss'ta boşa gider; trash farmında iyi." },
    pri: { pve: ["o","b","s16","g","y"], boss: ["o","b","y","s16","g"], kasma: ["o","s16","g","b","y"], pvp: ["g","o","s16","b","y"] } },
  { id: "judgment", ad: "Judgment", cd: "5 sn",
    acik: "Tek hedef, yüksek hasar, aggro, %1 HP çalar, kritik vurur.",
    opts: { g: "Absorbs %1 HP", b: "Hedefe saldırırken ekstra hasar", y: "Vuruşta ekstra hasar", o: "Vuruşta Critical Hit", s16: "Cooldown kalkar" },
    not: { s16: "16. seviye çok güçlü: spam edilebilir can çalma + aggro." },
    pri: { pve: ["g","o","s16","b","y"], boss: ["g","o","s16","b","y"], kasma: ["o","y","s16","g","b"], pvp: ["g","o","s16","b","y"] } },
  { id: "flash_rampage", ad: "Flash Rampage", cd: "yok (sadece stagger'daki hedefe)",
    acik: "Stagger almış hedefe vurur, aggro, %5 HP çalar.",
    opts: { g: "Absorbs %5 HP", b: "Vuruşta 120 MP", y: "Hareketli (mobile) yetenek", o: "Vuruşta Multi-Hit", s16: "Vuruşta TÜM yetenek cooldown'ları −1 sn" },
    not: { g: "Tüm yeteneklerdeki en güçlü can çalma.", s16: "Tank için oyunu değiştirir." },
    pri: { pve: ["g","y","s16","b","o"], boss: ["g","y","s16","b","o"], kasma: ["g","o","s16","y","b"], pvp: ["g","y","s16","b","o"] } },
  { id: "debilitating_smash", ad: "Debilitating Smash", cd: "10 sn",
    acik: "Bloktan sonra; 4 düşman, Debilitate (savunma −%25, aldığı heal −%60), NPC'ye %100 stun.",
    opts: { g: "%30 şansla 3 sn stun", b: "+3 sn Debilitate süresi", y: "Debilitate süresince −%60 Incoming Heal", o: "Blok ve kaçınmayı yok sayar, kritik vurur", s16: "Blokta %25 şansla cooldown sıfırlanır" },
    not: { g: "NPC'ye zaten %100 stun — PvE'de işe yaramaz.", y: "Sadece PvP'de (oyuncu heal'ini keser)." },
    pri: { pve: ["b","o","s16","y","g"], boss: ["b","o","s16","y","g"], kasma: ["o","b","s16","g","y"], pvp: ["y","g","o","b","s16"] } },
  { id: "shield_rush", ad: "Shield Rush", cd: "10 sn",
    acik: "Dodge sonrası / uçarken 20 m atılır, Judgment'ı tetikler, 20 stagger.",
    opts: { g: "Vuruşta 300 Stamina", b: "+10 m menzil", y: "Şarj yeteneğine dönüşür, AoE hasar", o: "−10 sn cooldown", s16: "+%25 stun şansı" },
    not: { s16: "NPC'ye zaten %100 stun — PvE'de bir şey katmaz." },
    pri: { pve: ["o","g","b","y","s16"], boss: ["o","g","b","s16","y"], kasma: ["o","y","b","g","s16"], pvp: ["o","b","g","s16","y"] } },
  { id: "annihilate", ad: "Annihilate", cd: "10 sn, 200 MP",
    acik: "Stun/knockdown'daki hedefe büyük hasar, NPC'ye %100 knockdown, 10 stagger.",
    opts: { g: "+%50 Multi-Hit", b: "+%20 knockdown şansı", y: "Stun bağışıklığı olan hedefe +%100 hasar", o: "−10 sn cooldown", s16: "AoE yeteneğe dönüşür" },
    not: { b: "NPC'ye zaten %100 — PvE'de işe yaramaz.", y: "Boss'lara karşı çalışır." },
    pri: { pve: ["o","y","s16","g","b"], boss: ["o","y","g","s16","b"], kasma: ["o","s16","g","y","b"], pvp: ["o","b","g","y","s16"] } },
  { id: "punishment", ad: "Punishment", cd: "30 sn, 200 MP, şarjlı",
    acik: "3 kademe şarj, 4 düşmana çok yüksek hasar, %10 HP çalar, 20 sn Executor (+200 isabet, PvE +%20 hasar).",
    opts: { g: "Absorbs %10 HP", b: "Hedefe zamanla hasar (DoT)", y: "+%30 Skill Speed", o: "Hareketli (mobile) yetenek", s16: "Blok ve kaçınmayı yok sayar, kritik" },
    not: { g: "En büyük iyileşme.", o: "Çok hareketli boss'larda sarı yerine." },
    pri: { pve: ["g","y","o","s16","b"], boss: ["g","y","o","s16","b"], kasma: ["g","y","s16","o","b"], pvp: ["g","o","y","s16","b"] } },
  { id: "defiance", ad: "Defiance", cd: "50 sn (cooldown azaltmadan etkilenmez)",
    acik: "Stun, knockdown, havaya kaldırma, grab, donma, korkuyu kaldırır; 5 sn Tenacity (CC bağışıklığı); %20 HP.",
    opts: { g: "[Capture] zincir yeteneği", b: "Kullanınca 1.000 Stamina", y: "Kullanınca %20 HP", o: "+2 sn Tenacity süresi", s16: "+%50 PvE Damage Tolerance (+PvP)" },
    req: { o: 12 },
    not: { s16: "Acil durum butonunu çok güçlendirir — en öncelikli 16." },
    pri: { pve: ["y","o","s16","b","g"], boss: ["y","o","s16","b","g"], kasma: ["y","b","o","s16","g"], pvp: ["y","o","s16","b","g"] } },
];

const PASSIVES = [
  { id: "enhance_health", ad: "Enhance Health", etki: "+3.750 HP, Max HP +%42,5, alınan heal +%20 (15. sv değerleri)" },
  { id: "warding_shield", ad: "Warding Shield", etki: "+200 Block, blokta 509–611 HP (3 sn'de bir)" },
  { id: "punishing_benediction", ad: "Punishing Benediction", etki: "+240 Crit, %50 şansla 920–938 ekstra hasar" },
  { id: "ironclad_defense", ad: "Ironclad Defense", etki: "Defense +%35, Endurance +%15" },
  { id: "guarding_seal", ad: "Guarding Seal", etki: "HP %50 altında Max HP'nin %31'i kalkan (1 dk'da bir)" },
  { id: "impact_hit", ad: "Impact Hit", etki: "Impact şansı +%23,2, Double +%3,3 (11. sv değerleri)" },
  { id: "insulting_roar", ad: "Insulting Roar", etki: "Aggro +%100, ön saldırıda 5 sn Attack +%12" },
  { id: "fury", ad: "Fury", etki: "Blokta tüm grup PvE hasarı +%9, PvP +%4,5 (20 sn) (8. sv değerleri)" },
  { id: "survival_willpower", ad: "Survival Willpower", etki: "Status Resist +%19; CC yerken PvE hasar azaltma +%14" },
  { id: "block_pain", ad: "Block Pain", etki: "Vuruş alınca 10 sn PvE hasar azaltma +%15 (20 sn'de bir)" },
];

// Puan önceliği (aktif + pasif aynı skill puanını kullanır). Üstteki daha önemli.
const SKILL_PRI = {
  pve:   ["defiance","block_pain","survival_willpower","guarding_seal","fury","warding_strike","judgment","flash_rampage","punishment","enhance_health","ironclad_defense","warding_shield","vicious_strike","pummel","shield_smite","debilitating_smash","annihilate","poach","shield_rush","insulting_roar","punishing_benediction","impact_hit"],
  boss:  ["defiance","block_pain","survival_willpower","guarding_seal","fury","warding_strike","judgment","flash_rampage","punishment","enhance_health","ironclad_defense","warding_shield","vicious_strike","pummel","shield_smite","debilitating_smash","annihilate","poach","shield_rush","insulting_roar","punishing_benediction","impact_hit"],
  kasma: ["punishment","annihilate","judgment","flash_rampage","warding_strike","vicious_strike","pummel","shield_smite","punishing_benediction","insulting_roar","enhance_health","ironclad_defense","debilitating_smash","warding_shield","fury","block_pain","guarding_seal","defiance","poach","shield_rush","impact_hit","survival_willpower"],
  pvp:   ["defiance","survival_willpower","block_pain","impact_hit","enhance_health","ironclad_defense","guarding_seal","warding_strike","judgment","flash_rampage","punishment","shield_smite","poach","shield_rush","debilitating_smash","warding_shield","annihilate","vicious_strike","pummel","fury","punishing_benediction","insulting_roar"],
};
// Puan gerekirse buradan geri alınabilir (mod başına)
const SKILL_KAYNAK = {
  pve:   [["impact_hit","NPC'lere stun/knockdown zaten %100"],["punishing_benediction","Sadece kritik/ekstra hasar"]],
  boss:  [["impact_hit","NPC'lere stun/knockdown zaten %100"],["punishing_benediction","Sadece kritik/ekstra hasar"]],
  kasma: [["survival_willpower","Farmda CC nadir"],["impact_hit","Mob'lara zaten %100"]],
  pvp:   [["insulting_roar","Oyunculara aggro işlemez"],["fury","PvP payı düşük"]],
};

const STIGMAS = [
  { id: "st_empyrean", ad: "Empyrean Lord's Punishment", cd: "1 dk", acik: "20 m hedef + 4 m'deki 4 düşman, NPC'ye stun, 100 stagger.",
    sv: { 5: "Az hedefte %20'ye kadar fazla hasar", 10: "+50 stagger", 15: "+%10 PvE hasar, +%5 PvP", 20: "+%25 stun şansı" } },
  { id: "st_nezekan_shield", ad: "Nezekan's Shield", cd: "1 dk", acik: "Sana ve 40 m'deki gruba Max HP'nin %41'i kalkan (3 sn).",
    sv: { 5: "Kalkan süresince +%20 element direnci", 10: "+2 sn kalkan süresi", 15: "+%20 PvE hasar azaltma", 20: "Kalkan bitince %20 Max HP iyileştirir" } },
  { id: "st_shield_of_protection", ad: "Shield of Protection", cd: "20 sn", acik: "Garantili blok, blok hasar azaltma +%100, blokta 110 MP ve stamina.",
    sv: { 5: "+1 art arda kullanım", 10: "Hareketli yetenek", 15: "Blokta 3 sn +%20 hareket hızı", 20: "Blokta bir kez %10 HP" } },
  { id: "st_taunt", ad: "Taunt", cd: "30 sn", acik: "20 m, aggro, 15 sn Shrink (isabet −200, Attack −%20, hasar azaltma −%10).",
    sv: { 5: "Shrink'e −%10 PvE hasar azaltma", 10: "Shrink Attack azaltma +%10", 15: "−5 sn cooldown", 20: "+2 sn Taunt, +5 sn Shrink" } },
  { id: "st_armor_of_balance", ad: "Armor of Balance", cd: "1 dk 30 sn", acik: "10 sn Impact direnci +%50.",
    sv: { 5: "+%20 Ailment/Mental direnci", 10: "Süre boyunca +%20 hareket hızı", 15: "Warding Shield x1,5", 20: "+%50 ek Impact direnci" } },
  { id: "st_second_skin", ad: "Second Skin", cd: "1 dk 30 sn", acik: "PvE hasar azaltma +%30, PvP +%15 (8. sv'de 13,5 sn).",
    sv: { 5: "Süre boyunca +%10 element direnci", 10: "Süre boyunca +%20 Block", 15: "Ironclad Defense x1,5", 20: "+%20 PvE hasar azaltma" } },
  { id: "st_doom_shield", ad: "Doom Shield", cd: "30 sn", acik: "20 m atılma, knockdown, %5 HP kalkan, +200 Block, Annihilate'i sıfırlar.",
    sv: { 5: "Vuruşta Annihilate cooldown sıfırlanır", 10: "Vuruşta 5 sn +200 Block", 15: "Düşman ölünce cooldown sıfırlanır", 20: "+%25 knockdown şansı" } },
  { id: "st_noble_armor", ad: "Noble Armor", cd: "2 dk", acik: "2 dk Max HP +%5,4 ve anında %5,4 HP. Dispel edilemez.",
    sv: { 5: "+%5 Defense", 10: "Insulting Roar x1,5", 15: "Fury x1,5", 20: "+%10 alınan heal" } },
  { id: "st_executing_blade", ad: "Executing Blade", cd: "45 sn", acik: "4 düşman, 5 sn Defense −%30, Impact durumundakine +%20 hasar.",
    sv: { 5: "−15 sn cooldown", 10: "Vuruşta 5 sn Exposed", 15: "Vuruşta kritik", 20: "Impact durumundakine +%30 hasar" } },
  { id: "st_comrade_in_arms", ad: "Comrade in Arms", cd: "2 dk", acik: "PvE hasar azaltma +%20; 6 sn gruba gelen hasarın %50'sini sen alırsın.",
    sv: { 5: "Bir kez %25 Max HP iyileşme", 10: "Guarding Seal kalkanı x1,5", 15: "Block Pain x1,5", 20: "%50 Max HP iyileşme" } },
  { id: "st_grapple", ad: "Grapple", cd: "1 dk 30 sn", acik: "20 m hedefin 7 m çevresindeki 4 düşmanı önüne çeker, 3 sn root.",
    sv: { 5: "%50 şansla 3 sn stun", 10: "%20 Max HP kalkan", 15: "−30 sn cooldown", 20: "%20'ye kadar PvE hasar azaltma" } },
  { id: "st_assault_fury", ad: "Assault Fury", cd: "2 dk", acik: "4 düşmana AoE, NPC'ye stun, vurulan hedef sayısıyla Defense %20'ye kadar.",
    sv: { 5: "Vuruşta 5 sn +%20 Attack", 10: "Vuruşta 500 MP hasarı", 15: "+10 m menzil", 20: "+%20 stun şansı" } },
  { id: "st_battlefield_banner", ad: "Battlefield Banner", cd: "1 dk 30 sn", acik: "10 sn Defense'e orantılı Attack artışı.",
    sv: { 5: "+%10 Multi-Hit", 10: "+%10 silah hasarı", 15: "+%20 Attack artışı", 20: "−30 sn cooldown" } },
];

// 4 stigma yuvası — mod başına dizilim + alternatifler
const STIGMA_SET = {
  pve:   { set: ["st_taunt","st_empyrean","st_second_skin","st_shield_of_protection"],
           alt: [["st_grapple","Trash ağırlıklı zindanda Shield of Protection yerine"],["st_nezekan_shield","Zor boss için Empyrean yerine"]] },
  boss:  { set: ["st_taunt","st_second_skin","st_nezekan_shield","st_shield_of_protection"],
           alt: [["st_comrade_in_arms","Healer çok zorlanıyorsa Shield of Protection yerine"],["st_empyrean","Daha fazla stagger/heal için Nezekan yerine"]] },
  kasma: { set: ["st_empyrean","st_grapple","st_executing_blade","st_battlefield_banner"],
           alt: [["st_assault_fury","Grapple yerine"],["st_doom_shield","Executing Blade yerine"]] },
  pvp:   { set: ["st_armor_of_balance","st_second_skin","st_grapple","st_executing_blade"],
           alt: [["st_taunt","Oyunculara %50 taunt — Executing Blade yerine"],["st_doom_shield","Grapple yerine"]] },
};

// Makro (üstteki öncelikli). "st_" ile başlayanlar sadece o modun stigma dizilimindeyse eklenir.
const MACRO = {
  pve:   ["flash_rampage","warding_strike","st_taunt","annihilate","debilitating_smash","shield_smite","judgment","pummel"],
  boss:  ["flash_rampage","warding_strike","st_taunt","annihilate","debilitating_smash","shield_smite","judgment","pummel"],
  kasma: ["flash_rampage","warding_strike","annihilate","shield_smite","st_executing_blade","st_empyrean","judgment","debilitating_smash","vicious_strike"],
  pvp:   ["flash_rampage","warding_strike","judgment","shield_smite","pummel"],
};
const MACRO_DISI = [
  ["punishment","Şarjlı — makro yanlış seviyede bırakır. Elle bas."],
  ["defiance","Acil durum butonu, zamanlama ister."],
  ["poach","Çekme — konuma göre elle."],
  ["shield_rush","Atılma — dodge sonrası elle."],
  ["st_second_skin","Kalkan — zamanlama ister."],
  ["st_nezekan_shield","Grup kalkanı — boss'un alan saldırısından hemen önce."],
  ["st_shield_of_protection","Sert tek vuruştan hemen önce."],
];

// Puan maliyetleri (seviye başına). Yetenek: 2–4:1, 5–7:2, 8–10:4.  Stigma: 2–5:1, 6–10:2.
function skillCost(lv) { return lv <= 4 ? 1 : lv <= 7 ? 2 : 4; }   // lv = ulaşılacak seviye
function stigmaCost(lv) { return lv <= 5 ? 1 : lv <= 10 ? 2 : null; } // 10 üstü bilinmiyor

// Kullanıcının mevcut seviyeleri (temel, bonus)
const DEFAULT_STATE = {
  mode: "boss",
  lv: {
    warding_strike: [10,4], vicious_strike: [10,4], pummel: [10,4], poach: [10,5], shield_smite: [10,4], judgment: [10,4],
    flash_rampage: [10,4], debilitating_smash: [10,4], shield_rush: [10,5], annihilate: [10,4], punishment: [10,4], defiance: [10,4],
    enhance_health: [10,5], warding_shield: [10,4], punishing_benediction: [10,5], ironclad_defense: [10,5], guarding_seal: [10,1],
    impact_hit: [1,3], insulting_roar: [10,4], fury: [4,4], survival_willpower: [2,1], block_pain: [2,3],
  },
  st: { st_empyrean: 1, st_nezekan_shield: 10, st_shield_of_protection: 5, st_taunt: 10, st_armor_of_balance: 1, st_second_skin: 8,
        st_doom_shield: 1, st_noble_armor: 1, st_executing_blade: 1, st_comrade_in_arms: 1, st_grapple: 1, st_assault_fury: 1, st_battlefield_banner: 1 },
  freeSkill: 0, freeStigma: 0,
};
