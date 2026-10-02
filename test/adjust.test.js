const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('./helpers');
const { call, db, nMoves, stockOf, produce } = T;
let c, prod;
test.before(async () => {
  await T.start(); c = await T.hazelnut(); await T.approvedRecipe(c); await T.stock(c);
  prod = (await produce(c, { boxes: 10 })).j; // 120 kavanoz
});
test.after(() => T.stop());

test('Fire: neden kodu zorunlu (FIRE kategorisi), ayrı FIRE hareketi olarak görünür, üretime bağlanır', async () => {
  const before = nMoves();
  let r = await call('POST', '/api/fire', { code: c.kavanoz, qty: 3, productionId: prod.id });
  assert.equal(r.s, 400); assert.match(r.j.error, /neden kodu/);
  r = await call('POST', '/api/fire', { code: c.kavanoz, qty: 3, reason: 'SAY-01', productionId: prod.id });
  assert.equal(r.s, 400, 'FIRE dışı kategori reddedilir');
  r = await call('POST', '/api/fire', { code: c.kavanoz, qty: 0, reason: 'FIRE-01' }); assert.equal(r.s, 400);
  assert.equal(nMoves(), before);
  r = await call('POST', '/api/fire', { code: c.kavanoz, qty: 3, reason: 'FIRE-01', productionId: prod.id, note: 'kırık kavanoz' });
  assert.equal(r.s, 200, JSON.stringify(r.j)); assert.match(r.j.id, /^FRE-/);
  const mv = db().movements.filter(m => m.docId === r.j.id);
  assert.equal(mv.length, 1); assert.equal(mv[0].type, 'FIRE'); assert.equal(mv[0].qty, -3); assert.equal(mv[0].reason, 'FIRE-01'); assert.equal(mv[0].ref, prod.id);
  assert.equal(stockOf(c.kavanoz)['K-1@EZM-DEPO'], 2000 - 120 - 3);
});

test('Fire: lot belirtilmezse FEFO ile bölünür; stoktan fazla fire engellenir; eksiye düşmez', async () => {
  const r = await call('POST', '/api/fire', { code: c.findik, qty: 100, reason: 'FIRE-03', productionId: prod.id }); // F-A: 200 − 25.2 = 174.8 → yeterli
  assert.equal(r.s, 200);
  const big = await call('POST', '/api/fire', { code: c.findik, qty: 100000, reason: 'FIRE-03' });
  assert.equal(big.s, 409);
  const bad = await call('POST', '/api/fire', { code: c.findik, lot: 'F-B', qty: 100000, reason: 'FIRE-03' });
  assert.equal(bad.s, 409);
});

test('Üretim tüketim özeti: teorik + fire + lot kapanış farkı = gerçek tüketim', async () => {
  // hammadde kg: pudra teorik 1584?? 120 kavanoz × 90 g = 10,8 kg
  const lc = await call('POST', '/api/lot-close', { code: c.pudra, lot: 'P-1', loc: 'EZM-DEPO', actual: 489.0, reason: 'LOT-02', productionId: prod.id, note: 'tartım farkı' });
  assert.equal(lc.s, 200, JSON.stringify(lc.j));
  const s = await call('GET', `/api/productions/${prod.id}/consumption`);
  const row = code => s.j.rows.find(r => r.code === code);
  assert.equal(row(c.pudra).theoretical, 10.8);
  // sistem 500 − 10,8 = 489,2; fiziksel 489,0 → 0,2 kg ek tüketim (fark)
  assert.equal(lc.j.diff, -0.2);
  assert.equal(row(c.pudra).lotDiff, 0.2);
  assert.equal(row(c.pudra).actual, 11);
  assert.equal(row(c.kavanoz).theoretical, 120); assert.equal(row(c.kavanoz).fire, 3); assert.equal(row(c.kavanoz).actual, 123);
});

test('Lot kapanışı: fark için LOT_KAPANIS neden kodu zorunlu; sessiz değişim yok; ayrı hareket türü', async () => {
  const before = nMoves();
  let r = await call('POST', '/api/lot-close', { code: c.vanilin, lot: 'V-1', loc: 'EZM-DEPO', actual: 0.5 });
  assert.equal(r.s, 400); assert.match(r.j.error, /neden kodu/);
  r = await call('POST', '/api/lot-close', { code: c.vanilin, lot: 'V-1', loc: 'EZM-DEPO', actual: 0.5, reason: 'FIRE-01' }); assert.equal(r.s, 400, 'başka kategori');
  r = await call('POST', '/api/lot-close', { code: c.vanilin, lot: 'V-1', loc: 'EZM-DEPO', actual: 0.5, reason: 'SAY-01' }); assert.equal(r.s, 400);
  r = await call('POST', '/api/lot-close', { code: c.vanilin, lot: 'V-1', loc: 'EZM-DEPO', actual: 1 + 0, close: false }); assert.equal(r.s, 400, 'fark yok');
  r = await call('POST', '/api/lot-close', { code: c.vanilin, lot: 'YOK', loc: 'EZM-DEPO', actual: 0, reason: 'LOT-02' }); assert.equal(r.s, 404);
  assert.equal(nMoves(), before);
  // kapanış: kalan 1 kg fiziksel 0,9 → fark −0,1 (nem/kuruma kaybı), lot kapat → bakiye 0 olmalı
  const cur = stockOf(c.vanilin)['V-1@EZM-DEPO'];
  r = await call('POST', '/api/lot-close', { code: c.vanilin, lot: 'V-1', loc: 'EZM-DEPO', actual: 0, reason: 'LOT-03', close: true });
  assert.equal(r.s, 200, JSON.stringify(r.j)); assert.equal(r.j.diff, -cur); assert.equal(r.j.closed, true);
  assert.equal(stockOf(c.vanilin)['V-1@EZM-DEPO'], 0);
  const mv = db().movements.find(m => m.docId === r.j.id); assert.equal(mv.type, 'LOT_KAPANIS'); assert.equal(mv.reason, 'LOT-03');
  assert.equal(db().lots[`${c.vanilin}|V-1`].status, 'KAPALI');
});

test('Kapalı lot kullanılamaz/sayılamaz/yeniden kapatılamaz; kapatma iptal edilirse lot yeniden açılır', async () => {
  let r = await call('POST', '/api/lot-close', { code: c.vanilin, lot: 'V-1', loc: 'EZM-DEPO', actual: 0, close: true }); assert.equal(r.s, 409);
  r = await call('POST', '/api/count', { type: 'SAYIM', lines: [{ code: c.vanilin, lot: 'V-1', loc: 'EZM-DEPO', qty: 5, reason: 'SAY-01' }] }); assert.equal(r.s, 409);
  // kapatmayı iptal et
  const lk = db().lotClosures.find(x => x.lot === 'V-1');
  r = await call('POST', `/api/cancel/${lk.id}`, { reason: 'yanlış kapatma' }); assert.equal(r.s, 200);
  assert.equal(db().lots[`${c.vanilin}|V-1`].status, 'ONAYLI');
  assert.ok(stockOf(c.vanilin)['V-1@EZM-DEPO'] > 0, 'bakiye geri geldi');
});

test('Lot kapatma: başka lokasyonda kalan varsa engellenir ve hiçbir şey değişmez', async () => {
  await call('POST', '/api/transfer', { code: c.kapak, lot: 'KP-1', from: 'EZM-DEPO', to: 'EZM-HAT1', qty: 100 });
  const before = nMoves();
  const r = await call('POST', '/api/lot-close', { code: c.kapak, lot: 'KP-1', loc: 'EZM-DEPO', actual: 0, reason: 'LOT-02', close: true });
  assert.equal(r.s, 409); assert.match(r.j.error, /kalan var/);
  assert.equal(nMoves(), before, 'kısmen yazılmış fark hareketi kalmadı');
  assert.equal(db().lots[`${c.kapak}|KP-1`].status, 'ONAYLI');
});

test('Fire ve lot kapanışı iptal edilebilir (ters kayıt); stok geçmişinde TERS_KAYIT olarak ayrışır', async () => {
  const f = db().fires[0];
  const before = stockOf(c.kavanoz)['K-1@EZM-DEPO'];
  const r = await call('POST', `/api/cancel/${f.id}`, { reason: 'yanlış fire' });
  assert.equal(r.s, 200);
  assert.equal(stockOf(c.kavanoz)['K-1@EZM-DEPO'], before + 3);
  assert.ok(db().movements.some(m => m.type === 'TERS_KAYIT' && m.docId === f.id));
});
