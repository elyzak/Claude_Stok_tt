const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('./helpers');
const { call, db, nMoves, stockOf, preview, SKT } = T;
let c;
test.before(async () => { await T.start(); c = await T.hazelnut(); await T.approvedRecipe(c); });
test.after(() => T.stop());
const recv = (lot, qty = 100, result = 'KARANTINA') => call('POST', '/api/receipt', { code: c.findik, supplier: 'TED-001', qty, skt: SKT, lot, result });
const usable = async () => (await call('GET', '/api/stock')).j.materials.find(m => m.code === c.findik);

test('Karantinaya alınan mal kabul: karantina lokasyonunda durur, kullanılabilir stokta görünmez', async () => {
  const r = await recv('Q-1'); assert.equal(r.s, 200);
  assert.deepEqual(stockOf(c.findik), { 'Q-1@EZM-KAR': 100 });
  const m = await usable(); assert.equal(m.total, 100); assert.equal(m.usable, 0); assert.equal(m.quarantine, 100);
});

test('Serbest bırak: karar veren zorunlu; stok karantinadan depoya TRANSFER hareketiyle taşınır; lot ONAYLI olur', async () => {
  let r = await call('POST', '/api/quality/release', { code: c.findik, lot: 'Q-1' }); assert.equal(r.s, 400);
  r = await call('POST', '/api/quality/release', { code: c.findik, lot: 'Q-1', decidedBy: 'Kalite Sor.', note: 'analiz uygun' });
  assert.equal(r.s, 200, JSON.stringify(r.j)); assert.equal(r.j.action, 'SERBEST_BIRAK'); assert.equal(r.j.qty, 100);
  assert.deepEqual(stockOf(c.findik), { 'Q-1@EZM-KAR': 0, 'Q-1@EZM-DEPO': 100 });
  const types = db().movements.filter(m => m.docId === r.j.id).map(m => m.type).sort();
  assert.deepEqual(types, ['TRANSFER_CIKIS', 'TRANSFER_GIRIS']);
  assert.equal(db().lots[`${c.findik}|Q-1`].status, 'ONAYLI');
  const m = await usable(); assert.equal(m.usable, 100); assert.equal(m.quarantine, 0);
  r = await call('POST', '/api/quality/release', { code: c.findik, lot: 'Q-1', decidedBy: 'x' }); assert.equal(r.s, 409, 'karantinada değil');
});

test('Reddet: lot RED olur, stok karantinada kalır ve hiçbir yerde kullanılamaz; gerekçe zorunlu', async () => {
  await recv('Q-2', 50);
  let r = await call('POST', '/api/quality/reject', { code: c.findik, lot: 'Q-2', decidedBy: 'K' }); assert.equal(r.s, 400, 'gerekçe');
  r = await call('POST', '/api/quality/reject', { code: c.findik, lot: 'Q-2', decidedBy: 'Kalite', note: 'aflatoksin limiti aşıldı' });
  assert.equal(r.s, 200);
  assert.equal(db().lots[`${c.findik}|Q-2`].status, 'RED');
  assert.deepEqual(stockOf(c.findik)['Q-2@EZM-KAR'], 50);
  const m = await usable(); assert.equal(m.rejected, 50); assert.equal(m.usable, 100);
  // reddedilen lot: serbest bırakılamaz, transfer edilemez, üretimde kullanılamaz
  assert.equal((await call('POST', '/api/quality/release', { code: c.findik, lot: 'Q-2', decidedBy: 'K' })).s, 409);
  assert.equal((await call('POST', '/api/transfer', { code: c.findik, lot: 'Q-2', from: 'EZM-KAR', to: 'EZM-DEPO', qty: 10 })).s, 409);
  // imha/iade: red lot fire (FIRE-04 kalite red) ile stoktan çıkarılır
  const f = await call('POST', '/api/fire', { code: c.findik, lot: 'Q-2', loc: 'EZM-KAR', qty: 50, reason: 'FIRE-04', note: 'iade' });
  assert.equal(f.s, 200); assert.equal(stockOf(c.findik)['Q-2@EZM-KAR'], 0);
});

test('Karantinadaki malzeme üretimde kullanılamaz (önizleme stok yetersiz der)', async () => {
  await T.devir([{ code: c.pudra, lot: 'P', qty: 1000 }, { code: c.vanilin, lot: 'V', qty: 5 }, { code: c.kavanoz, lot: 'K', qty: 100, skt: '' }, { code: c.kapak, lot: 'KP', qty: 100, skt: '' }, { code: c.etiket, lot: 'E', qty: 100, skt: '' }, { code: c.koli, qty: 10 }, { code: c.palet, qty: 1 }]);
  // fındık: yalnızca Q-1 (100 kg) onaylı. Yeni karantina lotu 500 kg
  await recv('Q-3', 500);
  const pv = await preview(c, { boxes: 5 }); // 60 kavanoz × 210 g = 12,6 kg → Q-1'den
  assert.deepEqual(pv.j.lines.find(l => l.code === c.findik).parts.map(p => p.lot), ['Q-1']);
  const big = await preview(c, { boxes: 100 }); // 252 kg > 100 kg onaylı (karantinadaki 500 kg sayılmaz)
  assert.equal(big.j.ok, false);
  assert.equal(big.j.lines.find(l => l.code === c.findik).available, 100);
});

test('Karantinaya al (sonradan sorun): onaylı lot karantina lokasyonuna çekilir; gerekçe zorunlu', async () => {
  let r = await call('POST', '/api/quality/hold', { code: c.findik, lot: 'Q-1', decidedBy: 'K' }); assert.equal(r.s, 400);
  r = await call('POST', '/api/quality/hold', { code: c.findik, lot: 'Q-1', decidedBy: 'Kalite', note: 'tedarikçi geri çağırma bildirimi' });
  assert.equal(r.s, 200, JSON.stringify(r.j));
  assert.equal(db().lots[`${c.findik}|Q-1`].status, 'KARANTINA');
  const st = stockOf(c.findik); assert.equal(st['Q-1@EZM-KAR'], 100); assert.equal(st['Q-1@EZM-DEPO'], 0);
  const m = await usable(); assert.equal(m.usable, 0);
  assert.equal((await call('POST', `/api/cancel/${r.j.id}`, { reason: 'x' })).s, 409, 'kalite kararı iptal edilmez');
});

test('Lokasyonlar arası transfer: iki hareket, tek belge; yetersiz stok/aynı lokasyon/karantina geçişi engellenir', async () => {
  await T.devir([{ code: c.pudra, lot: 'PT', qty: 50 }]);
  const before = nMoves();
  assert.equal((await call('POST', '/api/transfer', { code: c.pudra, lot: 'PT', from: 'EZM-DEPO', to: 'EZM-DEPO', qty: 5 })).s, 400);
  assert.equal((await call('POST', '/api/transfer', { code: c.pudra, lot: 'PT', from: 'EZM-DEPO', to: 'EZM-HAT1', qty: 500 })).s, 409);
  assert.equal((await call('POST', '/api/transfer', { code: c.pudra, lot: 'PT', from: 'EZM-DEPO', to: 'EZM-KAR', qty: 5 })).s, 409, 'karantinaya normal transfer yok');
  assert.equal((await call('POST', '/api/transfer', { code: c.pudra, lot: 'PT', from: 'EZM-DEPO', to: 'YOK', qty: 5 })).s, 400);
  assert.equal((await call('POST', '/api/transfer', { code: c.pudra, lot: 'PT', from: 'EZM-DEPO', to: 'EZM-HAT1', qty: 0 })).s, 400);
  assert.equal(nMoves(), before);
  const r = await call('POST', '/api/transfer', { code: c.pudra, lot: 'PT', from: 'EZM-DEPO', to: 'EZM-HAT1', qty: 20 });
  assert.equal(r.s, 200);
  assert.deepEqual(stockOf(c.pudra)['PT@EZM-DEPO'], 30); assert.deepEqual(stockOf(c.pudra)['PT@EZM-HAT1'], 20);
  assert.equal(db().movements.filter(m => m.docId === r.j.id).length, 2);
  // toplam stok değişmez; hat stoğu da üretimde tüketilebilir (FEFO her iki lokasyona bakar)
  assert.equal(Object.entries(stockOf(c.pudra)).filter(([k]) => k.startsWith('PT@')).reduce((s, [, v]) => s + v, 0), 50);
  // iptal: hat stoğu yeterliyse geri alınır
  const x = await call('POST', `/api/cancel/${r.j.id}`, { reason: 'yanlış lokasyon' }); assert.equal(x.s, 200);
  assert.equal(stockOf(c.pudra)['PT@EZM-DEPO'], 50);
});
