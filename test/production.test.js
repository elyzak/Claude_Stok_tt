const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('./helpers');
const { call, db, nMoves, stockOf, produce, preview } = T;
let c;
test.before(async () => { await T.start(); c = await T.hazelnut(); await T.approvedRecipe(c); await T.stock(c); });
test.after(() => T.stop());

test('Önizleme: 1 palet = 132 koli × 12 = 1.584 kavanoz; kullanılacak hammadde/lot ve miktarlar gösterilir', async () => {
  const pv = await preview(c, { pallets: 1 });
  assert.equal(pv.s, 200, JSON.stringify(pv.j));
  const p = pv.j;
  assert.equal(p.totalJars, 1584); assert.equal(p.totalBoxes, 132); assert.equal(p.totalPallets, 1); assert.equal(p.fillKg, 475.2);
  const need = code => p.lines.find(l => l.code === code);
  assert.equal(need(c.pudra).need, 142.56);       // 1584 × 90 g
  assert.equal(need(c.findik).need, 332.64);      // 1584 × 210 g
  assert.equal(need(c.vanilin).need, 0.09504);    // 1584 × 0,06 g = 95,04 g
  assert.equal(need(c.kavanoz).need, 1584); assert.equal(need(c.kapak).need, 1584); assert.equal(need(c.etiket).need, 1584);
  assert.equal(need(c.koli).need, 132); assert.equal(need(c.palet).need, 1);
  assert.equal(p.ok, true);
  // FEFO: fındık iki lota bölünür, SKT'si yakın lot önce
  assert.deepEqual(need(c.findik).parts.map(x => [x.lot, x.qty]), [['F-A', 200], ['F-B', 132.64]]);
  assert.equal(p.recipe.totals.totalPct, 100.02, 'reçete oranı değiştirilmeden kullanılır');
  assert.equal(nMoves(), db().movements.length); // önizleme hareket üretmez
});

test('Üretim kaydı: hammadde ve ambalaj lotlardan düşer, mamul lotu oluşur, mamul stoğu artar', async () => {
  const before = { findik: stockOf(c.findik), pudra: stockOf(c.pudra), vanilin: stockOf(c.vanilin) };
  assert.deepEqual(before.findik, { 'F-A@EZM-DEPO': 200, 'F-B@EZM-DEPO': 300 });
  const r = await produce(c, { pallets: 1 });
  assert.equal(r.s, 200, JSON.stringify(r.j));
  const rec = r.j;
  assert.match(rec.lot, /^MM\d+-\d{6}-1$/); assert.equal(rec.totalJars, 1584); assert.equal(rec.recipeVersion, 1);
  // sonrası
  assert.deepEqual(stockOf(c.findik), { 'F-A@EZM-DEPO': 0, 'F-B@EZM-DEPO': 167.36 });   // 300 − 132,64
  assert.deepEqual(stockOf(c.pudra), { 'P-1@EZM-DEPO': 357.44 });                        // 500 − 142,56
  assert.deepEqual(stockOf(c.vanilin), { 'V-1@EZM-DEPO': 0.90496 });                     // 1 − 0,09504
  assert.deepEqual(stockOf(c.kavanoz), { 'K-1@EZM-DEPO': 416 });                          // 2000 − 1584
  assert.deepEqual(stockOf(c.koli), { '—@EZM-DEPO': 68 });                                // 200 − 132
  assert.deepEqual(stockOf(c.palet), { '—@EZM-DEPO': 4 });                                // 5 − 1
  assert.deepEqual(stockOf(c.product), { [`${rec.lot}@EZM-DEPO`]: 1584 });                // mamul stoğu
  assert.equal(db().lots[`${c.product}|${rec.lot}`].skt.length, 10);
  // hareket türleri açıkça ayrı
  const mv = db().movements.filter(m => m.docId === rec.id);
  assert.equal(mv.filter(m => m.type === 'URETIM_TUKETIM').length, 8 + 1, '8 reçete kalemi + fındığın ikinci lotu');
  assert.equal(mv.filter(m => m.type === 'MAMUL_GIRIS').length, 1);
});

test('Stok yetersiz: üretim reddedilir (409) ve hiçbir hareket oluşmaz', async () => {
  const before = JSON.stringify(db().movements) + JSON.stringify(db().seq);
  const r = await produce(c, { pallets: 1 }); // fındık: 167,36 kg kaldı, 332,64 gerekir
  assert.equal(r.s, 409); assert.match(r.j.error, /Stok yetersiz/);
  const pv = await preview(c, { pallets: 1 });
  assert.equal(pv.j.ok, false);
  assert.equal(pv.j.lines.find(l => l.code === c.findik).ok, false);
  assert.equal(JSON.stringify(db().movements) + JSON.stringify(db().seq), before);
});

test('Karantina, red ve SKT geçmiş lotlar üretimde kullanılamaz', async () => {
  // yeni fındık: karantina lotu (kullanılamaz) + SKT'si geçmiş lot + onaylı lot
  await call('POST', '/api/receipt', { code: c.findik, supplier: 'TED-001', qty: 1000, skt: '2027-12-01', lot: 'F-Q', result: 'KARANTINA' });
  await T.devir([{ code: c.findik, lot: 'F-OLD', qty: 1000, skt: '2020-01-01' }]);
  let pv = await preview(c, { boxes: 1 });
  const parts = pv.j.lines.find(l => l.code === c.findik).parts;
  assert.ok(parts.every(x => x.lot === 'F-B'), 'yalnızca onaylı ve SKT geçmemiş lot: ' + JSON.stringify(parts));
  // karantina lotu serbest bırakılırsa kullanılabilir olur, SKT'si yakın lot yine önce gelir
  await call('POST', '/api/quality/release', { code: c.findik, lot: 'F-Q', decidedBy: 'Kalite' });
  pv = await preview(c, { boxes: 1 });
  assert.ok(pv.j.lines.find(l => l.code === c.findik).ok);
});

test('Üretim önizleme-onay, tam sayı, reçetesiz/pasif ürün kontrolleri', async () => {
  let r = await call('POST', '/api/production', { productCode: c.product, boxes: 1 }); assert.equal(r.s, 400, 'onaysız');
  r = await preview(c, { boxes: 1.5 }); assert.equal(r.s, 400);
  const p2 = (await call('POST', '/api/products', { name: 'TEST reçetesiz', nominal: 300, targetFill: 300, jarsPerBox: 12, shelfLifeDays: 365 })).j;
  r = await call('POST', '/api/production/preview', { productCode: p2.code, boxes: 1 }); assert.equal(r.s, 409); assert.match(r.j.error, /ONAYLI reçete/);
  const p3 = (await call('POST', '/api/products', { name: 'TEST raf ömrü yok', nominal: 300, targetFill: 300, jarsPerBox: 12 })).j;
  r = await call('POST', '/api/production/preview', { productCode: p3.code, boxes: 1 }); assert.equal(r.s, 400); assert.match(r.j.error, /raf ömrü/);
  await call('PUT', `/api/products/${c.product}`, { status: 'PASIF' });
  r = await preview(c, { boxes: 1 }); assert.equal(r.s, 409); assert.match(r.j.error, /Pasif ürün/);
  await call('PUT', `/api/products/${c.product}`, { status: 'AKTIF' });
});

test('Mamul sevkiyatı: koli ve palet bazlı çıkış, FEFO, stoktan fazla çıkış engeli', async () => {
  const lot = db().productions[0].lot;
  let r = await call('POST', '/api/dispatch', { productCode: c.product, shape: 'KOLI', qty: 10, docNo: 'IRS-1' });
  assert.equal(r.s, 200); assert.equal(r.j.jars, 120);
  assert.deepEqual(stockOf(c.product), { [`${lot}@EZM-DEPO`]: 1464 });
  r = await call('POST', '/api/dispatch', { productCode: c.product, shape: 'PALET', qty: 1 }); assert.equal(r.s, 409, '1.584 > 1.464');
  r = await call('POST', '/api/dispatch', { productCode: c.product, shape: 'ADET', qty: 1464 }); assert.equal(r.s, 200);
  assert.deepEqual(stockOf(c.product), { [`${lot}@EZM-DEPO`]: 0 });
});
