const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('./helpers');
const { call, db, nMoves, balance, devir, SKT } = T;
const { todayIn, isIsoDate } = require('../lib/time');

test.before(() => T.start());
test.after(() => T.stop());

test('Saat dilimi: tarih Europe/Istanbul\'a göre hesaplanır (UTC değil)', () => {
  assert.equal(todayIn(new Date('2026-10-01T22:30:00Z')), '2026-10-02'); // İstanbul 01:30
  assert.equal(todayIn(new Date('2026-10-01T20:59:00Z')), '2026-10-01'); // İstanbul 23:59
  assert.equal(todayIn(new Date('2026-12-31T21:00:00Z')), '2027-01-01'); // yıl geçişi
  assert.equal(isIsoDate('2026-02-30'), false);
  assert.equal(isIsoDate('2026-02-28'), true);
});

test('Tarih alanları doğrulanır; geçersiz tarih 400', async () => {
  let r = await call('POST', '/api/receipt', { code: 'HM-002', supplier: 'TED-001', qty: 1, skt: SKT, date: '31.09.2026' });
  assert.equal(r.s, 400);
  r = await call('POST', '/api/receipt', { code: 'HM-002', supplier: 'TED-001', qty: 1, skt: 'yarin' });
  assert.equal(r.s, 400);
});

test('Tekrarlanan devir: aynı lot/lokasyona ikinci devir engellenir, stok iki katına çıkmaz', async () => {
  let r = await devir([{ code: 'AM-011', qty: 10 }]); // lotsuz malzeme
  assert.equal(r.s, 200, JSON.stringify(r.j));
  const before = nMoves();
  r = await devir([{ code: 'AM-011', qty: 10 }]);
  assert.equal(r.s, 409);
  assert.equal(nMoves(), before, 'engellenen devir hareket üretmemeli');
  assert.equal(balance('AM-011', ''), 10);
  // aynı istek içinde tekrar
  r = await devir([{ code: 'AM-012', qty: 5 }, { code: 'AM-012', qty: 5 }]);
  assert.equal(r.s, 409);
  assert.equal(balance('AM-012', ''), 0, 'kısmen yazılmış devir kalmamalı');
  // aynı malzemenin FARKLI lotu meşru devirdir
  r = await devir([{ code: 'HM-009', lot: 'T-L1', qty: 3 }, { code: 'HM-009', lot: 'T-L2', qty: 4 }]);
  assert.equal(r.s, 200);
});

test('Devir iptal edilirse aynı lot/lokasyona yeniden devir girilebilir', async () => {
  let r = await devir([{ code: 'HM-010', lot: 'T-REDO', qty: 7 }]);
  assert.equal(r.s, 200);
  r = await call('POST', `/api/cancel/${r.j.id}`, { reason: 'yanlış giriş' });
  assert.equal(r.s, 200);
  r = await devir([{ code: 'HM-010', lot: 'T-REDO', qty: 7 }]);
  assert.equal(r.s, 200, JSON.stringify(r.j));
  assert.equal(balance('HM-010', 'T-REDO'), 7);
});

test('Mevcut lota devir: lot durumu/SKT bozulmaz, devir reddedilir', async () => {
  let r = await call('POST', '/api/receipt', { code: 'HM-002', supplier: 'TED-001', qty: 50, skt: SKT, result: 'KARANTINA', lot: 'T-Q1' });
  assert.equal(r.s, 200);
  const metaBefore = JSON.stringify(db().lots['HM-002|T-Q1']);
  const before = nMoves();
  r = await devir([{ code: 'HM-002', lot: 'T-Q1', qty: 5, skt: '2030-01-01' }]);
  assert.equal(r.s, 409);
  assert.equal(JSON.stringify(db().lots['HM-002|T-Q1']), metaBefore);
  assert.equal(db().lots['HM-002|T-Q1'].status, 'KARANTINA');
  assert.equal(db().lots['HM-002|T-Q1'].skt, SKT);
  assert.equal(nMoves(), before);
});

test('Devir: SKT zorunlu malzemede SKT yoksa reddedilir; lot-takipli malzemede boş lot otomatik üretilir', async () => {
  let r = await devir([{ code: 'HM-003', qty: 5, skt: '' }]);
  assert.equal(r.s, 400);
  r = await devir([{ code: 'HM-003', qty: 5 }]);
  assert.equal(r.s, 200);
  assert.match(r.j.lines[0].lot, /^HM003-\d{6}-D\d{2}$/);
});

test('Sayım: geçersiz / boş / kayıtsız lot ile stok yaratılamaz', async () => {
  await devir([{ code: 'HM-004', lot: 'T-S1', qty: 20 }]);
  const before = nMoves();
  let r = await call('POST', '/api/count', { type: 'SAYIM', lines: [{ code: 'HM-004', lot: '', loc: 'EZM-DEPO', qty: 77, reason: 'SAY-01' }] });
  assert.equal(r.s, 400, 'zorunlu lotta boş lot'); 
  r = await call('POST', '/api/count', { type: 'SAYIM', lines: [{ code: 'HM-004', lot: 'UYDURMA', loc: 'EZM-DEPO', qty: 5, reason: 'SAY-01' }] });
  assert.equal(r.s, 400, 'kayıtsız lot');
  r = await call('POST', '/api/count', { type: 'SAYIM', lines: [{ code: 'HM-004', lot: 'T-S1', loc: 'EZM-HAT1', qty: 5, reason: 'SAY-01' }] });
  assert.equal(r.s, 400, 'kaydı olmayan lokasyon');
  assert.equal(nMoves(), before);
  assert.ok(!db().lots['HM-004|UYDURMA']);
});

test('Sayım: kayıtlı lotta fark düzeltmesi neden koduyla yapılır; neden yoksa/yanlış kategoriyse reddedilir', async () => {
  let r = await call('POST', '/api/count', { type: 'SAYIM', lines: [{ code: 'HM-004', lot: 'T-S1', loc: 'EZM-DEPO', qty: 18 }] });
  assert.equal(r.s, 400, 'neden yok');
  r = await call('POST', '/api/count', { type: 'SAYIM', lines: [{ code: 'HM-004', lot: 'T-S1', loc: 'EZM-DEPO', qty: 18, reason: 'FIRE-01' }] });
  assert.equal(r.s, 400, 'sayım dışı neden kodu');
  r = await call('POST', '/api/count', { type: 'SAYIM', lines: [{ code: 'HM-004', lot: 'T-S1', loc: 'EZM-DEPO', qty: 18, reason: 'SAY-01' }] });
  assert.equal(r.s, 200);
  assert.equal(r.j.lines[0].diff, -2);
  assert.equal(balance('HM-004', 'T-S1'), 18);
  r = await call('POST', '/api/count', { type: 'SAYIM', lines: [{ code: 'HM-004', lot: 'T-S1', loc: 'EZM-DEPO', qty: 18 }] });
  assert.equal(r.s, 200, 'fark yoksa neden gerekmez');
  assert.equal(r.j.lines[0].diff, 0);
});

test('İptal edilen mal kabulün lotu yeniden kullanılabilir; aktif lot kullanılamaz', async () => {
  const body = { code: 'HM-005', supplier: 'TED-001', qty: 10, skt: SKT, lot: 'T-REUSE' };
  let r = await call('POST', '/api/receipt', body);
  assert.equal(r.s, 200);
  const id = r.j.id;
  r = await call('POST', '/api/receipt', body);
  assert.equal(r.s, 409, 'aktif lot tekrar girilemez');
  r = await call('POST', `/api/cancel/${id}`, { reason: 'hatalı giriş' });
  assert.equal(r.s, 200);
  assert.equal(balance('HM-005', 'T-REUSE'), 0);
  r = await call('POST', '/api/receipt', { ...body, qty: 12, skt: '2028-06-30' });
  assert.equal(r.s, 200, JSON.stringify(r.j));
  assert.equal(balance('HM-005', 'T-REUSE'), 12);
  assert.equal(db().lots['HM-005|T-REUSE'].skt, '2028-06-30', 'yeniden kullanılan lotun SKT bilgisi güncel');
  r = await call('POST', `/api/cancel/${id}`, { reason: 'tekrar' });
  assert.equal(r.s, 409, 'iptal edilmiş belge ikinci kez iptal edilemez');
});

test('Üretim önizleme-onay: bayat önizleme (miktar değişti) 409, onaysız istek 400, doğru onayla kayıt yapılır', async () => {
  await T.fixture();
  await devir([{ code: 'HM-025', lot: 'T-P', qty: 1000 }, { code: 'HM-027', lot: 'T-H', qty: 1000 }, { code: 'AM-070', lot: 'T-K', qty: 5000 }, { code: 'AM-072', lot: 'T-C', qty: 500 }]);
  let pv = await call('POST', '/api/production/preview', { productCode: 'MM-001', pallets: 1 });
  assert.equal(pv.s, 200, JSON.stringify(pv.j));
  assert.equal(pv.j.totalJars, 1584); assert.equal(pv.j.fillKg, 475.2);
  const expect = { recipeId: pv.j.recipe.id, totalJars: pv.j.totalJars, fillKg: pv.j.fillKg };
  const before = nMoves();
  let r = await call('POST', '/api/production', { productCode: 'MM-001', pallets: 1 });
  assert.equal(r.s, 400, 'onay (expect) olmadan');
  r = await call('POST', '/api/production', { productCode: 'MM-001', pallets: 0, boxes: 5, expect });
  assert.equal(r.s, 409, 'önizleme sonrası miktar değişmiş');
  r = await call('POST', '/api/production', { productCode: 'MM-001', pallets: 1, expect: { ...expect, recipeId: 'REC-ESKI' } });
  assert.equal(r.s, 409, 'reçete değişmiş');
  assert.equal(nMoves(), before, 'reddedilen üretim hareket üretmemeli');
});

test('Üretim: koli/kavanoz tam sayı olmalı; çift tıklama (aynı X-Request-Id) tek kayıt üretir', async () => {
  let r = await call('POST', '/api/production/preview', { productCode: 'MM-001', pallets: 0, boxes: 1.5 });
  assert.equal(r.s, 400);
  r = await call('POST', '/api/production/preview', { productCode: 'MM-001', pallets: -1 });
  assert.equal(r.s, 400);
  const pv = await call('POST', '/api/production/preview', { productCode: 'MM-001', pallets: 0, boxes: 2 });
  const body = { productCode: 'MM-001', boxes: 2, expect: { recipeId: pv.j.recipe.id, totalJars: 24, fillKg: pv.j.fillKg } };
  const n0 = db().productions.length;
  const a = await call('POST', '/api/production', body, { headers: { 'X-Request-Id': 'rid-1' } });
  const b = await call('POST', '/api/production', body, { headers: { 'X-Request-Id': 'rid-1' } });
  assert.equal(a.s, 200); assert.equal(b.s, 200);
  assert.equal(b.h.get('x-idempotent-replay'), 'true');
  assert.equal(a.j.id, b.j.id);
  assert.equal(db().productions.length, n0 + 1);
});

test('Üretim iptali ile mamul lotu yeniden kullanılabilir (sevk edilmemişse)', async () => {
  const p = db().productions[db().productions.length - 1];
  const r = await call('POST', `/api/cancel/${p.id}`, { reason: 'test iptal' });
  assert.equal(r.s, 200, JSON.stringify(r.j));
  assert.equal(balance('MM-001', p.lot), 0);
  const pv = await call('POST', '/api/production/preview', { productCode: 'MM-001', boxes: 2 });
  const r2 = await call('POST', '/api/production', { productCode: 'MM-001', boxes: 2, lot: p.lot, expect: { recipeId: pv.j.recipe.id, totalJars: 24, fillKg: pv.j.fillKg } });
  assert.equal(r2.s, 200, JSON.stringify(r2.j));
  assert.equal(r2.j.lot, p.lot);
});

test('API: geçersiz JSON 400, JSON dizisi 400, çok büyük istek 413', async () => {
  let r = await call('POST', '/api/receipt', null, { raw: '{bozuk' });
  assert.equal(r.s, 400);
  r = await call('POST', '/api/receipt', null, { raw: '[1,2]' });
  assert.equal(r.s, 400);
  r = await call('POST', '/api/receipt', null, { raw: JSON.stringify({ x: 'a'.repeat(1.2e6) }) });
  assert.equal(r.s, 413);
});

test('API: kullanıcı yok 401, tanımsız kullanıcı 403, bilinmeyen adres 404, yanlış yöntem 405', async () => {
  let r = await call('POST', '/api/count', { type: 'DEVIR', lines: [] }, { user: null });
  assert.equal(r.s, 401);
  r = await call('POST', '/api/count', { type: 'DEVIR', lines: [] }, { user: 'yabanci@x.com' });
  assert.equal(r.s, 403);
  r = await call('GET', '/api/yok');
  assert.equal(r.s, 404);
  r = await call('DELETE', '/api/stock');
  assert.equal(r.s, 405);
  r = await call('POST', '/api/cancel/MK-999999', { reason: 'x' });
  assert.equal(r.s, 404);
  r = await call('POST', '/api/cancel/XYZ-1', { reason: 'x' });
  assert.equal(r.s, 404);
});

test('API: kart güncellemeleri doğrulanır (negatif/geçersiz değer 400, hareketli malzemenin lot takibi 409)', async () => {
  let r = await call('PUT', '/api/products/MM-001', { jarsPerBox: -3 });
  assert.equal(r.s, 400);
  r = await call('PUT', '/api/products/MM-001', { boxesPerPallet: 2.5 });
  assert.equal(r.s, 400);
  r = await call('PUT', '/api/products/MM-001', { status: 'UYDURMA' });
  assert.equal(r.s, 400);
  r = await call('PUT', '/api/products/YOK-1', { nominal: 1 });
  assert.equal(r.s, 404);
  r = await call('PUT', '/api/materials/HM-004', { lotTracking: 'YOK' });
  assert.equal(r.s, 409);
  r = await call('PUT', '/api/materials/HM-004', { minStock: -5 });
  assert.equal(r.s, 400);
  r = await call('PUT', '/api/materials/HM-004', { minStock: 50 });
  assert.equal(r.s, 200);
  assert.equal(r.j.minStock, 50);
});

test('Hata durumunda durum geri alınır: reddedilen işlem hiçbir kayıt/sayaç bırakmaz', async () => {
  const snapshot = JSON.stringify({ m: db().movements, seq: db().seq, c: db().counts });
  await call('POST', '/api/count', { type: 'DEVIR', lines: [{ code: 'HM-020', lot: 'T-OK', qty: 5, skt: SKT, loc: 'EZM-DEPO' }, { code: 'HM-020', lot: 'T-BAD', qty: -1, skt: SKT, loc: 'EZM-DEPO' }] });
  assert.equal(JSON.stringify({ m: db().movements, seq: db().seq, c: db().counts }), snapshot);
});
