// Uçtan uca test üretimi simülasyonu. GEÇİCİ veritabanında çalışır ve sonunda siler; gerçek data/ klasörüne dokunmaz.
// Test verisi: 300 g Şekerli Fındık Ezmesi %70 Fındık (Pudra Şekeri 90 g, Fındık İçi 210 g, Etil Vanilin 0,06 g = 300,06 g / %100,02).
const os = require('os'), path = require('path'), fs = require('fs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stok-sim-'));
const app = require('../server'); app.load(dir);
const n = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 6 }), f = x => n.format(x);
const pad = (s, w) => String(s).padEnd(w), lpad = (s, w) => String(s).padStart(w);
let base;
const call = async (m, u, b) => { const r = await fetch(base + u, { method: m, headers: { 'Content-Type': 'application/json', 'X-User': 'sales@trabzontarim.com.tr' }, body: b ? JSON.stringify(b) : undefined }); const j = await r.json(); if (!r.ok) throw new Error(`${u}: ${j.error}`); return j; };
const hr = t => console.log('\n' + '═'.repeat(100) + '\n' + t + '\n' + '═'.repeat(100));
const stockTable = async codes => { const s = await call('GET', '/api/stock'); const rows = s.lots.filter(l => codes.includes(l.code)).sort((a, b) => a.code.localeCompare(b.code) || a.lot.localeCompare(b.lot));
  console.log(pad('Malzeme', 40) + pad('Lot', 22) + pad('Lokasyon', 11) + pad('SKT', 12) + lpad('Miktar', 14)); for (const r of rows) console.log(pad(r.name.slice(0, 38), 40) + pad(r.lot || '(lotsuz)', 22) + pad(r.loc, 11) + pad(r.skt || '', 12) + lpad(f(r.qty) + ' ' + r.unit, 14)); return s; };

app.server.listen(0, async () => {
  base = 'http://localhost:' + app.server.address().port;
  try {
    console.log('TEST SİMÜLASYONU — geçici veritabanı: ' + dir + ' (sonunda silinir; gerçek veriye dokunulmaz)');
    const mat = async (name, type, unit, lt = 'ZORUNLU') => (await call('POST', '/api/materials', { name, type, unit, lotTracking: lt })).code;
    const c = { pudra: await mat('TEST Pudra Şekeri', 'HAMMADDE', 'KG'), findik: await mat('TEST Çifte Kavrulmuş Fındık İçi', 'HAMMADDE', 'KG'), vanilin: await mat('TEST Etil Vanilin', 'HAMMADDE', 'KG'),
      kavanoz: await mat('TEST Kavanoz 300 g', 'AMBALAJ', 'ADET'), kapak: await mat('TEST Kapak', 'AMBALAJ', 'ADET'), etiket: await mat('TEST Etiket', 'AMBALAJ', 'ADET'), koli: await mat('TEST Koli 12li', 'AMBALAJ', 'ADET', 'OPSIYONEL'), palet: await mat('TEST Palet', 'AMBALAJ', 'ADET', 'YOK') };
    const p = await call('POST', '/api/products', { name: 'TEST Şekerli Fındık Ezmesi %70 Fındık 300 g', brand: 'Trabzon Tarım', nominal: 300, targetFill: 300, jarsPerBox: 12, boxesPerPallet: 132, shelfLifeDays: 365, status: 'AKTIF' });
    const lines = [[c.pudra, 90, 'G', 'KAVANOZ'], [c.findik, 210, 'G', 'KAVANOZ'], [c.vanilin, 0.06, 'G', 'KAVANOZ'], [c.kavanoz, 1, 'ADET', 'KAVANOZ'], [c.kapak, 1, 'ADET', 'KAVANOZ'], [c.etiket, 1, 'ADET', 'KAVANOZ'], [c.koli, 1, 'ADET', 'KOLI'], [c.palet, 1, 'ADET', 'PALET']].map(([material, qty, unit, b]) => ({ material, qty, unit, base: b }));
    const rec = await call('POST', '/api/recipes', { productCode: p.code, description: 'TEST VERİSİ', lines });
    hr('1) REÇETE (TEST VERİSİ) — ' + rec.id + ' · ürün: ' + p.name);
    const t = rec.totals; console.log(`Hammadde toplamı: ${f(t.totalG)} g · referans ${f(t.referenceG)} g · oran %${f(t.totalPct)} · sapma %+${f(t.deviationPct)} · durum: ${t.level} (otomatik yuvarlanmadı, oranlar değişmedi)`);
    for (const l of t.lines) console.log(`   ${pad(l.material, 8)} ${lpad(f(l.grams) + ' g', 10)}   %${f(l.pct)}`);
    await call('POST', `/api/recipes/${rec.id}/approve`, { quality: 'TEST-Kalite', production: 'TEST-Üretim' });
    const S = '2027-12-31';
    await call('POST', '/api/count', { type: 'DEVIR', lines: [{ code: c.pudra, lot: 'P-1', qty: 500, skt: '2027-09-01' }, { code: c.findik, lot: 'F-A', qty: 200, skt: '2027-03-01' }, { code: c.findik, lot: 'F-B', qty: 300, skt: '2027-06-01' }, { code: c.vanilin, lot: 'V-1', qty: 1, skt: S }, { code: c.kavanoz, lot: 'K-1', qty: 2000 }, { code: c.kapak, lot: 'KP-1', qty: 2000 }, { code: c.etiket, lot: 'ET-1', qty: 2000 }, { code: c.koli, qty: 200 }, { code: c.palet, qty: 5 }] });
    const all = Object.values(c).filter(x => x !== p.code);
    hr('2) ÜRETİM ÖNCESİ STOK (sahte test stoğu)'); await stockTable(all);
    hr('3) ÜRETİM ÖNİZLEME — 1 palet (132 koli × 12 = 1.584 kavanoz)');
    const pv = await call('POST', '/api/production/preview', { productCode: p.code, pallets: 1 });
    console.log(`Kavanoz ${f(pv.totalJars)} · koli ${f(pv.totalBoxes)} · palet ${f(pv.totalPallets)} · dolgu ${f(pv.fillKg)} kg · mamul SKT ${pv.skt}`);
    console.log(pad('Malzeme', 36) + lpad('Birim miktar', 14) + lpad('Düşülecek', 18) + '   Lot dağılımı (FEFO)');
    for (const l of pv.lines) console.log(pad(l.name.slice(0, 34), 36) + lpad(f(l.perUnit) + ' ' + l.perUnitUnit + '/' + l.base.toLowerCase(), 14) + lpad(f(l.need) + ' ' + l.unit, 18) + '   ' + l.parts.map(x => `${x.lot || '(lotsuz)'}: ${f(x.qty)}`).join(' + '));
    const r = await call('POST', '/api/production', { productCode: p.code, pallets: 1, expect: { recipeId: pv.recipe.id, totalJars: pv.totalJars, fillKg: pv.fillKg } });
    hr(`4) ÜRETİM KAYDEDİLDİ — ${r.id} · mamul lotu: ${r.lot} · ${f(r.totalJars)} adet · SKT ${r.skt}`); await stockTable([...Object.values(c), p.code]);
    hr('5) FİRE ve LOT KAPANIŞI (üretime bağlı, neden kodlu, ayrı hareketler)');
    const fi = await call('POST', '/api/fire', { code: c.kavanoz, qty: 8, reason: 'FIRE-01', productionId: r.id, note: 'kırık kavanoz' }); console.log(`${fi.id}: ${c.kavanoz} 8 adet, neden FIRE-01 (Kırık kavanoz) → ${fi.lots}`);
    const lc = await call('POST', '/api/lot-close', { code: c.pudra, lot: 'P-1', loc: 'EZM-DEPO', actual: 357.0, reason: 'LOT-02', productionId: r.id, note: 'tartım farkı' }); console.log(`${lc.id}: ${c.pudra} / P-1 sistem ${f(lc.system)} kg, fiziksel ${f(lc.actual)} kg → fark ${f(lc.diff)} kg, neden LOT-02 (Tartım farkı)`);
    const cs = await call('GET', `/api/productions/${r.id}/consumption`);
    console.log('(+ lot kapanış farkı = sistemden fazla tüketim, − = stoğa geri)');
    console.log('\n' + pad('Malzeme', 36) + lpad('Teorik', 14) + lpad('+ Fire', 10) + lpad('± Lot kapanış', 16) + lpad('= Gerçek', 14));
    for (const x of cs.rows.filter(x => x.fire || x.lotDiff)) console.log(pad(x.name.slice(0, 34), 36) + lpad(f(x.theoretical), 14) + lpad(f(x.fire), 10) + lpad(f(x.lotDiff), 16) + lpad(f(x.actual) + ' ' + x.unit, 14));
    hr('6) KARANTİNA AKIŞI — 100 kg fındık karantinaya alınır, üretimde kullanılamaz, serbest bırakılınca kullanılır');
    await call('POST', '/api/receipt', { code: c.findik, supplier: 'TED-001', qty: 100, skt: S, lot: 'F-Q', result: 'KARANTINA' });
    let sm = (await call('GET', '/api/stock')).materials.find(m => m.code === c.findik); console.log(`Karantinada: toplam ${f(sm.total)} kg · kullanılabilir ${f(sm.usable)} kg · karantina ${f(sm.quarantine)} kg`);
    const rel = await call('POST', '/api/quality/release', { code: c.findik, lot: 'F-Q', decidedBy: 'TEST-Kalite', note: 'analiz uygun' }); console.log(`${rel.id}: ${rel.action} → ${rel.from} → ${rel.to} (${f(rel.qty)} kg)`);
    sm = (await call('GET', '/api/stock')).materials.find(m => m.code === c.findik); console.log(`Serbest bırakıldı: kullanılabilir ${f(sm.usable)} kg · karantina ${f(sm.quarantine)} kg`);
    hr('7) İZLENEBİLİRLİK');
    const tb = await call('GET', `/api/trace?code=${p.code}&lot=${r.lot}`);
    console.log(`Mamul lotu ${r.lot} → ${tb.madeBy[0].productionId} (${f(tb.madeBy[0].producedQty)} adet) şu lotlardan üretildi:`);
    for (const i of tb.madeBy[0].inputs) console.log(`   ${pad(i.name.slice(0, 34), 36)} lot ${pad(i.lot || '(lotsuz)', 8)} ${lpad(f(i.qty) + ' ' + i.unit, 16)}  SKT ${i.skt || '-'}`);
    await call('POST', '/api/dispatch', { productCode: p.code, lot: r.lot, shape: 'KOLI', qty: 20, docNo: 'IRS-TEST-1' });
    const tf = await call('GET', `/api/trace?code=${c.findik}&lot=F-A`);
    console.log(`\nTers yön: ${c.findik} / F-A lotu → ${tf.usedIn.map(u => `${u.productionId} (${f(u.consumedQty)} kg)`).join(', ')}`);
    for (const u of tf.usedIn) for (const o of u.outputs) console.log(`   → mamul lotu ${o.lot} (${f(o.qty)} adet) → sevkiyat: ${o.shipments.map(s => `${s.docNo}: ${f(s.qty)} adet`).join(', ') || 'yok'}`);
  } catch (e) { console.error('SİMÜLASYON HATASI:', e.message); process.exitCode = 1; }
  app.server.close(); fs.rmSync(dir, { recursive: true, force: true });
});
