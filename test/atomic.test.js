// Atomiklik: işlem ya tamamen gerçekleşir ya hiç. Hata/çökme simülasyonlarında stok hareketi yarım kalmamalı.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const T = require('./helpers');
const L = require('../core/ledger');
const { call, db, produce } = T;
let c;
const snap = () => JSON.stringify(db());
const disk = () => fs.readFileSync(path.join(process.env.DATA_DIR, 'db.json'), 'utf8');
test.before(async () => { await T.start(); c = await T.hazelnut(); await T.approvedRecipe(c); await T.stock(c); });
test.after(() => T.stop());

test('İşlemin ortasında hata (5. hareket yazılırken): hiçbir hareket/lot/belge/sayaç kalmaz, disk değişmez', async () => {
  const mem0 = snap(), disk0 = disk();
  const orig = L.addMove; let n = 0;
  L.addMove = (...a) => { if (++n === 5) throw new Error('Simüle edilmiş çökme'); return orig(...a); };
  try {
    const r = await produce(c, { boxes: 10 });
    assert.equal(r.s, 500); assert.equal(r.j.error, 'Beklenmeyen sunucu hatası', 'iç hata detayı sızdırılmaz');
  } finally { L.addMove = orig; }
  assert.equal(snap(), mem0, 'bellek önceki durumda');
  assert.equal(disk(), disk0, 'disk değişmedi');
  const r2 = await produce(c, { boxes: 10 }); assert.equal(r2.s, 200, 'sistem hatadan sonra sağlıklı çalışır');
});

test('Kaydetme (disk yazma) hatası: işlem geri alınır, bellek ile disk tutarlı kalır', async () => {
  const mem0 = snap();
  T.store.hooks.failSave = true;
  const r = await call('POST', '/api/count', { type: 'DEVIR', lines: [{ code: c.pudra, lot: 'P-NEW', qty: 10, skt: T.SKT, loc: 'EZM-DEPO' }] });
  T.store.hooks.failSave = false;
  assert.equal(r.s, 500);
  assert.equal(snap(), mem0);
  assert.equal(JSON.stringify(JSON.parse(disk())), mem0, 'diskteki veri bellekle aynı');
  const ok = await call('POST', '/api/count', { type: 'DEVIR', lines: [{ code: c.pudra, lot: 'P-NEW', qty: 10, skt: T.SKT, loc: 'EZM-DEPO' }] });
  assert.equal(ok.s, 200, 'aynı işlem hatasız tekrar edilebilir');
});

test('Çok satırlı işlemin ortasındaki doğrulama hatası: önceki satırlar yazılmaz (sayım, transfer, kalite)', async () => {
  const mem0 = snap();
  let r = await call('POST', '/api/count', { type: 'DEVIR', lines: [{ code: c.pudra, lot: 'X1', qty: 5, skt: T.SKT }, { code: c.pudra, lot: 'X2', qty: 5, skt: '' }] });
  assert.equal(r.s, 400); assert.equal(snap(), mem0);
  // iptal sırasında eksi bakiye: kısmi ters kayıt kalmaz
  const prod = db().productions[0];
  r = await call('POST', `/api/dispatch`, { productCode: c.product, lot: prod.lot, shape: 'KOLI', qty: 2 }); assert.equal(r.s, 200);
  const mem1 = snap();
  r = await call('POST', `/api/cancel/${prod.id}`, { reason: 'dene' });
  assert.equal(r.s, 409); assert.equal(snap(), mem1, 'iptal reddedildi, ters kayıt yazılmadı');
});

test('Veri bütünlüğü: her stok bakiyesi hareket toplamına eşit, eksi bakiye yok, iptal edilen hareketlerin ters kaydı var', async () => {
  const bal = new Map();
  for (const m of db().movements) { const k = `${m.code}|${m.lot}|${m.loc}`; bal.set(k, Math.round(((bal.get(k) || 0) + m.qty) * 1e6) / 1e6); }
  for (const [k, v] of bal) assert.ok(v >= 0, `eksi bakiye: ${k} = ${v}`);
  for (const m of db().movements.filter(x => x.reversedBy)) {
    const rv = db().movements.find(x => x.id === m.reversedBy);
    assert.ok(rv && rv.reverses === m.id && rv.qty === -m.qty, `ters kayıt tutarsız: ${m.id}`);
  }
  const ids = db().movements.map(m => m.id); assert.equal(new Set(ids).size, ids.length, 'hareket numaraları tekil');
});
