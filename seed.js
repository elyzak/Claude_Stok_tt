// Google Sheets "Trabzon Tarım - Ezme Krema Stok Sistemi - Faz 2" ana veri tohumu.
// Stok hareketleri/test kayıtları taşınmadı: sistem temiz bir defterle (ledger) başlar.

const HM = `Fındık - Entegre çıkışlı|Kuruyemiş|Fındık
Hurma|Meyve|
Kakao tozu|Kakao|
Yer fıstığı (kavrulmuş)|Kuruyemiş|Yer fıstığı
Shea yağı|Bitkisel yağ|
Fındık yağı|Bitkisel yağ|Fındık
Hindistan cevizi yağı|Bitkisel yağ|
Yağsız süt tozu|Süt ürünü|Süt
Hindiba kökü lifi (inülin)|Lif|
Kakao kitlesi|Kakao|
Kakao tozu - Darko|Kakao|
Kakao tozu - Natürel - Marka belirsiz|Kakao|
Demineralize Peynir Altı Suyu Tozu|Süt ürünü|Süt
Süt Tozu|Süt ürünü|Süt
Kakao Tozu - Ülker - Naturel|Kakao|
Kakao Tozu - Ülker - Dark|Kakao|
Katı Yağ|Bitkisel yağ|
Sıvı Yağ|Bitkisel yağ|
Toz şeker|Şeker|
Lesitin|Emülgatör|
Peynir altı suyu - Formu teyit|Süt ürünü|Süt
Nişasta|Nişasta|
Vanilin|Aroma|
Fındık aroması|Aroma|
Fındık Püresi - Entegre çıkışlı|Kuruyemiş|Fındık
CS29 Bitkisel Yağ Karışımı|Bitkisel yağ|Fındık
Hurma tozu|Meyve|
Laktoz|Süt ürünü|Süt
Kakao tozu - Alkalize|Kakao|
Kakao Tozu - Barry Callebaut - Naturel|Kakao|
Kakao Tozu - Barry Callebaut - Dark|Kakao|
Kıyılmış Fındık - Entegre çıkışlı|Kuruyemiş|Fındık`.split('\n');

// kod|ad|birim|kategori|lot takibi
const AM = `001|Kavanoz 300 g (70x70x110 mm)|ADET|Birincil ambalaj
002|Kapak (300 g kavanoz)|ADET|Birincil ambalaj
013|Kavanoz - Trabzon Tarım fındık ezmesi - 350 cc - 300 g|ADET|Kavanoz
014|Kavanoz - Şeffaf PET - 700 cc - 82 mm|ADET|Kavanoz
015|Kavanoz - Tarım Kredi - 425 cc - 400 g|ADET|Kavanoz
031|Kavanoz - Fındık ezmesi - 255 cc - 180 g|ADET|Kavanoz
032|Kavanoz - Tarım Kredi fındık ezmesi - Topaz - 340 cc - 300 g|ADET|Kavanoz
039|Kavanoz - 720 cc|ADET|Kavanoz
040|Kavanoz - Düz - 350 cc|ADET|Kavanoz
041|Kavanoz - 425 cc - Model belirsiz|ADET|Kavanoz
070|Kavanoz - Baynut - 350 cc - 300 g|ADET|Kavanoz
072|Koli - Baynut|ADET|Koli / Tava|O
080|Kavanoz - 700 g - Plastik Yassı|ADET|Kavanoz
081|Kavanoz - 700 g - Kova Baskılı|ADET|Kavanoz
021|Kapak - Dağlıoğlu - 82 mm - Cam folyolu - Beyaz|ADET|Kapak
022|Kapak - Dağlıoğlu - 82 mm - Cam folyolu - Gold|ADET|Kapak
023|Kapak - Trabzon Tarım - Yeşil / Black C zemin|ADET|Kapak
024|Kapak - Gün Kapak - 63 mm - Gold RTS|ADET|Kapak
025|Kapak - Gün Kapak - 70 mm - RTS - Beyaz|ADET|Kapak
026|Kapak - Sarten - Gold - Baskısız - Fındık ezmesi|ADET|Kapak
027|Kapak - 70 mm - Uzun etek - Beyaz folyolu|ADET|Kapak
028|Kapak - 82 mm - PET folyolu - Beyaz|ADET|Kapak
029|Kapak - 70 mm - Uzun etek - Kırmızı folyolu|ADET|Kapak
030|Kapak - 82 mm - PET folyolu - Kırmızı|ADET|Kapak
042|Kapak - Plastik - 82 mm - Cam folyolu - Gold|ADET|Kapak
043|Kapak - 82 mm - Cam folyolu - Beyaz - Marka belirsiz|ADET|Kapak
044|Kapak - Gün Kapak - 63 mm - Gold - Model teyit|ADET|Kapak
045|Kapak - Sarten - Trabzon Tarım - Gold - 300 g|ADET|Kapak
046|Kapak - Sarten - Trabzon Tarım - Yeşil - 300 g|ADET|Kapak
071|Kapak - Baynut - Gün Kapak - 70 mm|ADET|Kapak
074|Kapak - Trabzon Tarım Fındık Ezmesi - Beyaz|ADET|Kapak
075|Kapak - Trabzon Tarım Fıstık Ezmesi - Kahverengi|ADET|Kapak
076|Kapak - TMO - Baskılı - 63 mm|ADET|Kapak
077|Kapak - 700 g Kova|ADET|Kapak
078|Kapak - 700 g - Kırmızı|ADET|Kapak
079|Kapak - 700 g - 82 mm Folyolu|ADET|Kapak
033|Emniyet bandı - Baskısız - 108 mm - Rulo|KG|Emniyet bandı|O
034|Emniyet bandı - Baskısız - 118 mm - Rulo|KG|Emniyet bandı|O
035|Emniyet bandı - Kesik - 108 mm|ADET|Emniyet bandı|O
036|Emniyet bandı - Kesik - 118 mm|ADET|Emniyet bandı|O
037|Emniyet bandı - Kesik - 137 mm|ADET|Emniyet bandı|O
038|Emniyet bandı - Kesik beyaz - 118 mm - KG sayımı|KG|Emniyet bandı|O
003|Etiket - Hurmalı Kakaolu Fındık Kreması %40 300 g|ADET|Etiket
004|Etiket - Fıstık Ezmesi %100 300 g|ADET|Etiket
005|Etiket - Hurmalı %70 Fındık Ezmesi 300 g|ADET|Etiket
006|Etiket - Hurmalı %70 Fıstık Ezmesi 300 g|ADET|Etiket
007|Etiket - Hurmalı Kakaolu Parçacıklı Fındık Kreması 300 g|ADET|Etiket
008|Etiket - Hurmalı Kakaolu Fıstık Kreması %40 300 g|ADET|Etiket
010|Koli etiketi|ADET|Etiket|O
051|Etiket - Tarım Kredi - Parçacıklı fındıklı - 400 g|ADET|Etiket
052|Etiket - Tarım Kredi - Fındık ezmesi - 300 g|ADET|Etiket
053|Etiket - Tarım Kredi - Kakaolu fındık kreması - 400 g|ADET|Etiket
054|Etiket - Tarım Kredi - Kakaolu fındık kreması - 700 g|ADET|Etiket
055|Etiket - Trabzon Tarım - Fındık ezmesi - 300 g|ADET|Etiket
056|Etiket - Trabzon Tarım - Şekersiz fındık ezmesi - 300 g|ADET|Etiket
057|Etiket - Trabzon Tarım - Fındık ezmesi - 180 g|ADET|Etiket
058|Etiket - Trabzon Tarım - Fıstık ezmesi - 300 g|ADET|Etiket
059|Etiket - Trabzon Tarım - Şekersiz fıstık ezmesi - 300 g|ADET|Etiket
060|Etiket - Trabzon Tarım - Kakaolu krema - 320 g|ADET|Etiket
061|Etiket - Trabzon Tarım - Kakaolu krema - 700 g|ADET|Etiket
062|Etiket - Nutshell - Kakaolu krema - 320 g|ADET|Etiket
063|Etiket - Nutshell - Kakaolu krema - 700 g|ADET|Etiket
064|Etiket - Trabzon Tarım - Parçacıklı fındıklı kakaolu krema - 300 g|ADET|Etiket
065|Etiket - Can Bakkal - Fındık ezmesi|ADET|Etiket
066|Etiket - Can Bakkal - Şekersiz fındık ezmesi|ADET|Etiket
067|Etiket - Can Bakkal - Fıstık ezmesi|ADET|Etiket
068|Etiket - Can Bakkal - Şekersiz fıstık ezmesi|ADET|Etiket
069|Etiket - Can Bakkal - Hurmalı - Ürün türü teyit|ADET|Etiket
073|Etiket - Lokma's - Fındık Ezmesi - 300 g|ADET|Etiket
009|Koli - 12'li|ADET|Koli / Tava|O
016|Koli - 700 g - Fason|ADET|Koli / Tava|O
017|Koli - Trabzon Tarım - Baskılı (Tava Güncel)|ADET|Koli / Tava|O
018|Koli - Tarım Kredi - Baskılı|ADET|Koli / Tava|O
019|Koli - Fason - Baskısız|ADET|Koli / Tava|O
020|Koli - A101 - Baskılı|ADET|Koli / Tava|O
082|Koli - 700 g - Trabzon Tarım|ADET|Koli / Tava|O
011|Palet|ADET|Sevkiyat|Y
012|Streç film|KG|Sevkiyat|Y
047|Shrink film - Rulo|KG|Sarf|O
048|Makine streç filmi - Rulo/adet sayımı|ADET|Sarf|O
049|Bant - Şeffaf|ADET|Sarf|O
050|Bant - Trabzon Tarım - Baskılı|ADET|Sarf|O`.split('\n');

// kod|ad|kategori|alerjen
const MM = `001|Baynut Hurmalı Kakaolu Fındık Kreması %40 Fındık 300 g|Baynut|Fındık, Süt
002|Baynut Fıstık Ezmesi %100 Fıstık 300 g|Baynut|Yer fıstığı
003|Baynut Hurmalı %70 Fındık Ezmesi 300 g|Baynut|Fındık
004|Baynut Hurmalı %70 Fıstık Ezmesi 300 g|Baynut|Yer fıstığı
005|Baynut Hurmalı Kakaolu Parçacıklı Fındık Kreması %33 Fındık 300 g|Baynut|Fındık, Süt
006|Baynut Hurmalı Kakaolu Fıstık Kreması %40 Fıstık 300 g|Baynut|Yer fıstığı, Süt, Fındık
007|Marka teyit - Hurmalı kakaolu fındık kreması - 300 g|Ezme ve krema|
008|Trabzon Tarım - Fındık ezmesi - 300 g|Ezme ve krema|
009|Trabzon Tarım - Şekersiz fındık ezmesi - 300 g|Ezme ve krema|
010|Trabzon Tarım - Fıstık ezmesi - 300 g|Ezme ve krema|
011|Trabzon Tarım - Şekersiz fıstık ezmesi - 300 g|Ezme ve krema|
012|Trabzon Tarım - Kakaolu krema - 700 g - Plastik kutu|Ezme ve krema|
013|Trabzon Tarım - Kakaolu krema - 320 g|Ezme ve krema|
014|Trabzon Tarım - Parçacıklı fındıklı kakaolu krema - 320 g|Ezme ve krema|
015|Marka teyit - Kakaolu fıstık kreması|Ezme ve krema|
016|Marka teyit - Krokantlı fındık kreması|Ezme ve krema|
017|Marka teyit - Hurmalı kakaolu fındık kreması - Gramaj teyit|Ezme ve krema|
018|Marka teyit - %100 fıstık ezmesi - Gramaj teyit|Ezme ve krema|
019|Marka teyit - Hurmalı fıstık ezmesi - Gramaj teyit|Ezme ve krema|
020|Marka teyit - Hurmalı fındık ezmesi - Gramaj teyit|Ezme ve krema|
021|Trabzon Tarım - Kakaolu krema - 700 g - Cam kavanoz|Ezme ve krema|
022|Tarım Kredi - Fındık ezmesi - 300 g|Ezme ve krema|
023|Tarım Kredi - Parçacıklı fındıklı ürün - 400 g|Ezme ve krema|
024|Tarım Kredi - Kakaolu krema - 700 g - Cam|Ezme ve krema|
025|Marka teyit - Şekersiz fındık ezmesi - 1 kg|Ezme ve krema|
026|Marka teyit - Şekersiz fıstık ezmesi - 1 kg|Ezme ve krema|
027|Marka teyit - Şekerli fıstık ezmesi - 1 kg|Ezme ve krema|
028|Marka teyit - Şekerli fındık ezmesi - 1 kg|Ezme ve krema|
029|Finerji - Ürün çeşidi ve gramaj teyit|Ezme ve krema|
030|Marka teyit - Şekerli fındık ezmesi - 180 g|Ezme ve krema|
031|Marka teyit - Fındık parçacıklı fındık kreması|Ezme ve krema|
032|Finerji - Kakaolu parçacıklı fıstık kreması - Gramaj teyit|Ezme ve krema|
033|Trabzon Tarım - Şekersiz fındık ezmesi - Gramaj teyit|Ezme ve krema|
034|Marka teyit - Şekerli fındık ezmesi - Gramaj teyit|Ezme ve krema|
035|Marka teyit - Şekerli fıstık ezmesi - Gramaj teyit|Ezme ve krema|
036|Marka teyit - Şekersiz fıstık ezmesi - Gramaj teyit|Ezme ve krema|
037|Marka teyit - Kakaolu fındık kreması - Gramaj teyit|Ezme ve krema|
038|Marka/ürün teyit - 700 g plastik kutulu mamul|Ezme ve krema|
039|Tarım Kredi - Sade kakaolu krema - 400 g|Ezme ve krema|
040|Trabzon Tarım - Parçacıklı ürün - Gramaj teyit|Ezme ve krema|
041|Tarım Kredi - Parçacıklı çikolata - Gramaj teyit|Ezme ve krema|
042|Trabzon Tarım - Kakaolu fındık kreması - Gramaj teyit|Ezme ve krema|
043|Trabzon Tarım - Fındık ezmesi - 180 g|Ezme ve krema|
044|Nutshell - Kakaolu krema - 320 g|Ezme ve krema|
045|Nutshell - Kakaolu krema - 700 g|Ezme ve krema|
046|Trabzon Tarım - Parçacıklı fındıklı kakaolu krema - 300 g|Ezme ve krema|
047|Can Bakkal - Fındık ezmesi - Gramaj teyit|Ezme ve krema|
048|Can Bakkal - Şekersiz fındık ezmesi - Gramaj teyit|Ezme ve krema|
049|Can Bakkal - Fıstık ezmesi - Gramaj teyit|Ezme ve krema|
050|Can Bakkal - Şekersiz fıstık ezmesi - Gramaj teyit|Ezme ve krema|
051|Can Bakkal - Hurmalı ürün - Çeşit ve gramaj teyit|Ezme ve krema|`.split('\n');

// Nominal gramaj (sheet'teki Urun_Spec)
const NOMINAL = { '007': 300, '008': 300, '009': 300, '010': 300, '011': 300, '012': 700, '013': 320, '014': 320, '021': 700, '022': 300, '023': 400, '024': 700, '025': 1000, '026': 1000, '027': 1000, '028': 1000, '030': 180, '038': 700, '039': 400, '043': 180, '044': 320, '045': 700, '046': 300 };
const BEKLEME = ['029', '032'];

function build() {
  const materials = [];
  HM.forEach((l, i) => {
    const [name, cat, al] = l.split('|');
    materials.push({ code: 'HM-' + String(i + 1).padStart(3, '0'), name, type: 'HAMMADDE', unit: 'KG', category: cat, lotTracking: 'ZORUNLU', sktTracking: true, allergens: al, minStock: null, active: true });
  });
  materials.push({ code: 'YM-001', name: 'Hurmalı kakaolu fındık kreması - Dökme / 750 kg kaydı', type: 'YARI_MAMUL', unit: 'KG', category: 'Ezme ve krema', lotTracking: 'ZORUNLU', sktTracking: true, allergens: '', minStock: null, active: true });
  AM.forEach(l => {
    const [n, name, unit, cat, flag] = l.split('|');
    materials.push({ code: 'AM-' + n, name, type: 'AMBALAJ', unit, category: cat, lotTracking: flag === 'Y' ? 'YOK' : flag === 'O' ? 'OPSIYONEL' : 'ZORUNLU', sktTracking: false, allergens: '', minStock: null, active: true });
  });
  const products = [];
  MM.forEach(l => {
    const [n, name, cat, al] = l.split('|');
    materials.push({ code: 'MM-' + n, name, type: 'MAMUL', unit: 'ADET', category: cat, lotTracking: 'ZORUNLU', sktTracking: true, allergens: al, minStock: null, active: true });
    const full = n <= '006';
    products.push({
      code: 'MM-' + n, nominal: full ? 300 : (NOMINAL[n] || null), targetFill: full ? 300 : null,
      jarsPerBox: full ? 12 : null, boxesPerPallet: n === '001' ? 132 : null, shelfLifeDays: 365,
      status: full ? 'AKTIF' : BEKLEME.includes(n) ? 'BEKLEME' : 'TEYIT', note: '',
    });
  });

  const R = (id, prod, ver, status, desc, lines) => ({ id, productCode: prod, version: ver, status, description: desc, qualityApprover: '', productionApprover: '', validFrom: '',
    lines: lines.map(s => { const [m, q, b, k] = s.split(':'); return { material: m, qty: Number(q), base: b, fire: 0, rounding: 'YOK', critical: k === '1' }; }) });
  const pk = (lbl) => ['AM-001:1:KAVANOZ', 'AM-002:1:KAVANOZ', `${lbl}:1:KAVANOZ`, 'AM-009:1:KOLI', 'AM-010:1:KOLI', 'AM-011:1:PALET', 'AM-012:0:PALET'];
  const recipes = [
    R('REC-MM001-V1', 'MM-001', 1, 'PASIF', 'Etiketteki içindekilerden. Fındık %40 ve kakao %7 biliniyor, diğer oranlar üretim reçetesinden girilecek.', ['HM-001:0.4:KG_DOLGU:1', 'HM-003:0.07:KG_DOLGU:1', ...pk('AM-003')]),
    R('REC-MM002-V1', 'MM-002', 1, 'TASLAK', 'Etiketteki içindekilerden (%100 yer fıstığı). Kalite onayı bekliyor.', ['HM-004:1:KG_DOLGU:1', ...pk('AM-004')]),
    R('REC-MM003-V1', 'MM-003', 1, 'TASLAK', 'Etiketteki içindekilerden (fındık %70, hurma %30). Kalite onayı bekliyor.', ['HM-001:0.7:KG_DOLGU:1', 'HM-002:0.3:KG_DOLGU:1', ...pk('AM-005')]),
    R('REC-MM004-V1', 'MM-004', 1, 'TASLAK', 'Etiketteki içindekilerden (fıstık %70, hurma %30). Kalite onayı bekliyor.', ['HM-004:0.7:KG_DOLGU:1', 'HM-002:0.3:KG_DOLGU:1', ...pk('AM-006')]),
    R('REC-MM005-V1', 'MM-005', 1, 'TASLAK', 'Etiketteki içindekilerden. Fındık %33 ve kakao %7 biliniyor, diğer oranlar üretim reçetesinden girilecek. Parçacıkların ayrı bir hammadde (kıyılmış fındık) olup olmadığı teyit edilecek.', ['HM-001:0.33:KG_DOLGU:1', 'HM-003:0.07:KG_DOLGU:1', ...pk('AM-007')]),
    R('REC-MM006-V1', 'MM-006', 1, 'TASLAK', 'Etiketteki içindekilerden. Fıstık %40 ve kakao %7 biliniyor, diğer oranlar üretim reçetesinden girilecek.', ['HM-004:0.4:KG_DOLGU:1', 'HM-003:0.07:KG_DOLGU:1', ...pk('AM-008')]),
    R('REC-MM001-V2-GECICI', 'MM-001', 2, 'ONAYLI', 'ASIL REÇETE: Baynut Hurmalı Kakaolu Fındık Kreması. Kullanıcının verdiği üretim reçetesi; toplam %100.',
      ['HM-025:0.4:KG_DOLGU:1', 'HM-026:0.06:KG_DOLGU:1', 'HM-027:0.13:KG_DOLGU:1', 'HM-028:0.05:KG_DOLGU:1', 'HM-006:0.1:KG_DOLGU:1', 'HM-031:0.03:KG_DOLGU:1', 'HM-030:0.038:KG_DOLGU:1', 'HM-009:0.006:KG_DOLGU:1', 'HM-008:0.186:KG_DOLGU:1',
       'AM-070:1:KAVANOZ', 'AM-071:1:KAVANOZ', 'AM-036:1:KAVANOZ', 'AM-003:1:KAVANOZ', 'AM-072:1:KOLI', 'AM-011:1:PALET']),
  ];

  const mapping = [
    ['MM-001', 'BN-HK-FINDIK40-300', 'Baynut', 'AKTIF'], ['MM-002', 'BN-FISTIK100-300', 'Baynut', 'AKTIF'], ['MM-003', 'BN-HUR-FINDIK70-300', 'Baynut', 'AKTIF'],
    ['MM-004', 'BN-HUR-FISTIK70-300', 'Baynut', 'AKTIF'], ['MM-005', 'BN-HK-PARCA-FINDIK33-300', 'Baynut', 'AKTIF'], ['MM-006', 'BN-HK-FISTIK40-300', 'Baynut', 'AKTIF'],
    ['MM-008', 'TT-FINDIK70-300', 'Trabzon Tarım', 'TEYIT'], ['MM-009', 'TT-FINDIK999-300', 'Trabzon Tarım', 'TEYIT'], ['MM-011', 'TT-FISTIK999-300', 'Trabzon Tarım', 'TEYIT'],
    ['MM-025', 'TT-FINDIK999-1K', 'Trabzon Tarım', 'TEYIT'], ['MM-026', 'TT-FISTIK999-1K', 'Trabzon Tarım', 'TEYIT'],
  ].map(([old, nw, brand, status]) => ({ oldCode: old, newCode: nw, brand, status }));
  const brandOf = {}; mapping.forEach(m => brandOf[m.oldCode] = m.brand);
  products.forEach(p => { p.brand = brandOf[p.code] || (materials.find(m => m.code === p.code).name.startsWith('Nutshell') ? 'Nutshell' : ''); p.newCode = (mapping.find(m => m.oldCode === p.code) || {}).newCode || ''; });

  return {
    materials, products, recipes,
    locations: [
      { code: 'EZM-DEPO', name: 'Ezme Bölümü Deposu', type: 'DEPO' }, { code: 'EZM-HAT1', name: 'Hat 1', type: 'HAT' },
      { code: 'EZM-KAR', name: 'Karantina', type: 'KARANTINA' }, { code: 'ANA-DEPO', name: 'Ana Depo (sistem dışı)', type: 'SANAL' },
    ],
    suppliers: [
      { id: 'TED-001', name: 'Örnek Fındık Tedarikçisi', approval: 'ONAYLI', certEnd: '2027-01-15', note: 'Örnek' },
      { id: 'ENTEGRE', name: 'Trabzon Tarım - Entegre', approval: 'ONAYLI', certEnd: '', note: 'İç transfer kaynağıdır; dış tedarikçi değildir.' },
    ],
    reasons: [
      ['FIRE-01', 'FIRE', 'Kırık kavanoz'], ['FIRE-02', 'FIRE', 'Hat başı / hat sonu ürün'], ['FIRE-03', 'FIRE', 'Dökülme'], ['FIRE-04', 'FIRE', 'Kalite red'], ['FIRE-05', 'FIRE', 'Etiket basım / yapıştırma hatası'],
      ['LOT-01', 'LOT_KAPANIS', 'Dolum fazlası'], ['LOT-02', 'LOT_KAPANIS', 'Tartım farkı'], ['LOT-03', 'LOT_KAPANIS', 'Nem / kuruma kaybı'],
      ['SAY-01', 'SAYIM', 'Sayım hatası'], ['SAY-02', 'SAYIM', 'Kayıt hatası'], ['SAY-03', 'SAYIM', 'Kayıp, nedeni bilinmiyor'],
    ].map(([code, category, desc]) => ({ code, category, desc })),
    users: [{ email: 'sales@trabzontarim.com.tr', name: 'Sistem Yöneticisi', role: 'ADMIN', active: true }],
    mapping,
  };
}
module.exports = { build };
