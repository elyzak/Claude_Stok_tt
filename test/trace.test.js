const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('./helpers');
const { call, db, produce } = T;
let c, u1, u2;
test.before(async () => {
  await T.start(); c = await T.hazelnut(); await T.approvedRecipe(c); await T.stock(c);
  u1 = (await produce(c, { boxes: 20 })).j;            // 240 kavanoz  → fındık F-A 50,4 kg
  u2 = (await produce(c, { boxes: 100, lot: 'MAMUL-B' })).j; // 1200 kavanoz → fındık F-A 149,6 + F-B 102,4
  await call('POST', '/api/dispatch', { productCode: c.product, lot: u1.lot, shape: 'KOLI', qty: 5, docNo: 'IRS-77' });
});
test.after(() => T.stop());

test('Mamul lotu → hangi hammadde → hangi hammadde lotu → ne kadar → hangi üretim', async () => {
  const r = await call('GET', `/api/trace?code=${c.product}&lot=${u2.lot}`);
  assert.equal(r.s, 200, JSON.stringify(r.j));
  assert.equal(r.j.madeBy.length, 1);
  const mb = r.j.madeBy[0];
  assert.equal(mb.productionId, u2.id); assert.equal(mb.producedQty, 1200); assert.equal(mb.recipeVersion, 1);
  const inp = (code, lot) => mb.inputs.find(i => i.code === code && i.lot === lot);
  assert.equal(inp(c.findik, 'F-A').qty, 149.6);   // 1200 × 210 g = 252 kg: F-A'dan kalan 149,6 + F-B 102,4
  assert.equal(inp(c.findik, 'F-B').qty, 102.4);
  assert.equal(inp(c.pudra, 'P-1').qty, 108);       // 1200 × 90 g
  assert.equal(inp(c.vanilin, 'V-1').qty, 0.072);   // 1200 × 0,06 g
  assert.equal(inp(c.findik, 'F-A').skt, '2027-03-01');
  assert.equal(inp(c.findik, 'F-A').supplier, null, 'devirle açılan lotun tedarikçi kaydı yok (açık bilgi)');
  const sum = mb.inputs.filter(i => i.code === c.findik).reduce((s, i) => s + i.qty, 0);
  assert.equal(Math.round(sum * 1e6) / 1e6, 252);
});

test('Hammadde lotu → hangi üretimler → hangi mamul lotları → nereye sevk edildi (geri çağırma)', async () => {
  const r = await call('GET', `/api/trace?code=${c.findik}&lot=F-A`);
  assert.equal(r.s, 200);
  assert.deepEqual(r.j.usedIn.map(u => u.productionId).sort(), [u1.id, u2.id].sort());
  const a = r.j.usedIn.find(u => u.productionId === u1.id);
  assert.equal(a.consumedQty, 50.4);
  assert.equal(a.outputs[0].lot, u1.lot); assert.equal(a.outputs[0].qty, 240);
  assert.deepEqual(a.outputs[0].shipments.map(s => [s.docNo, s.qty]), [['IRS-77', 60]]);
  const total = r.j.usedIn.reduce((s, u) => s + u.consumedQty, 0);
  assert.equal(Math.round(total * 1e6) / 1e6, 200);
  assert.equal(r.j.lot.status, 'ONAYLI');
});

test('Mamul lotunun sevkleri izlenir; iptal edilen üretim izlenebilirlikten düşer', async () => {
  let r = await call('GET', `/api/trace?code=${c.product}&lot=${u1.lot}`);
  assert.deepEqual(r.j.shipments.map(s => [s.docNo, s.qty]), [['IRS-77', 60]]);
  r = await call('GET', `/api/trace?code=${c.product}&lot=MAMUL-B`);
  assert.deepEqual(r.j.shipments, []);
  // u2 sevk edilmemiş → iptal edilebilir
  assert.equal((await call('POST', `/api/cancel/${u2.id}`, { reason: 'hatalı üretim' })).s, 200);
  r = await call('GET', `/api/trace?code=${c.findik}&lot=F-A`);
  assert.deepEqual(r.j.usedIn.map(u => u.productionId), [u1.id]);
  // iptal edilen mamul lotu yeniden kullanılabilir olur ama geçmiş kaydı kaybolmaz
  assert.ok(db().productions.find(p => p.id === u2.id).cancelled);
});

test('İzlenebilirlik hataları: bilinmeyen lot 404, lot belirtilmemiş 400', async () => {
  assert.equal((await call('GET', `/api/trace?code=${c.findik}&lot=YOKYOK`)).s, 404);
  assert.equal((await call('GET', `/api/trace?code=HM-999&lot=x`)).s, 404);
  assert.equal((await call('GET', `/api/trace?code=${c.findik}`)).s, 400);
});
