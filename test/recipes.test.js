const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('./helpers');
const { call, db } = T;
let c;
test.before(async () => { await T.start(); c = await T.hazelnut(); });
test.after(() => T.stop());

const draft = (lines, extra = {}) => call('POST', '/api/recipes', { productCode: c.product, description: 'TEST', lines, ...extra });

test('Test reçetesi (300,06 g / %100,02) oluşturulur; toplam ve oranlar OLDUĞU GİBİ raporlanır, yuvarlanmaz/zorlanmaz', async () => {
  const r = await draft(c.lines);
  assert.equal(r.s, 200, JSON.stringify(r.j));
  assert.equal(r.j.status, 'TASLAK'); assert.equal(r.j.version, 1);
  const t = r.j.totals;
  assert.equal(t.referenceG, 300);
  assert.equal(t.totalG, 300.06);
  assert.equal(t.totalPct, 100.02);
  assert.equal(t.deviationPct, 0.02);
  assert.equal(t.level, 'TOLERANS');
  assert.deepEqual(t.lines.map(x => [x.grams, x.pct]), [[90, 30], [210, 70], [0.06, 0.02]]);
  // satırlar girildiği gibi kalır
  assert.deepEqual(r.j.lines.slice(0, 3).map(l => [l.qty, l.unit]), [[90, 'G'], [210, 'G'], [0.06, 'G']]);
});

test('Açık taslak varken ikinci taslak açılamaz; taslak düzenlenir ve eski içerik geçmişe kopyalanır', async () => {
  let r = await draft(c.lines); assert.equal(r.s, 409);
  const id = db().recipes[0].id;
  const edited = c.lines.map(l => l.material === c.pudra ? { ...l, qty: 90.5 } : l);
  r = await call('PUT', `/api/recipes/${id}`, { lines: edited, description: 'TEST v1.1' });
  assert.equal(r.s, 200);
  const h = r.j.history; assert.deepEqual(h.map(x => x.action), ['OLUSTURULDU', 'GUNCELLENDI']);
  assert.equal(h[1].before.lines.find(l => l.material === c.pudra).qty, 90, 'önceki değer geçmişte korunur');
  // geri al
  await call('PUT', `/api/recipes/${id}`, { lines: c.lines });
});

test('Satır doğrulamaları: tekrar eden hammadde, sıfır/negatif miktar, yanlış birim, geçersiz baz', async () => {
  const id = db().recipes[0].id;
  const put = lines => call('PUT', `/api/recipes/${id}`, { lines });
  let r = await put([...c.lines, { material: c.pudra, qty: 5, unit: 'G', base: 'KAVANOZ' }]);
  assert.equal(r.s, 400); assert.match(r.j.error, /iki kez/);
  r = await put(c.lines.map(l => l.material === c.pudra ? { ...l, qty: 0 } : l)); assert.equal(r.s, 400); assert.match(r.j.error, /sıfırdan büyük/);
  r = await put(c.lines.map(l => l.material === c.pudra ? { ...l, qty: -3 } : l)); assert.equal(r.s, 400);
  r = await put(c.lines.map(l => l.material === c.pudra ? { ...l, qty: 'abc' } : l)); assert.equal(r.s, 400);
  r = await put(c.lines.map(l => l.material === c.pudra ? { ...l, unit: 'ADET' } : l)); assert.equal(r.s, 400, 'kg malzemeye ADET');
  r = await put(c.lines.map(l => l.material === c.kavanoz ? { ...l, unit: 'G' } : l)); assert.equal(r.s, 400, 'adet malzemeye G');
  r = await put(c.lines.map(l => l.material === c.pudra ? { ...l, base: 'KOLI' } : l)); assert.equal(r.s, 400, 'hammadde KOLI bazında olamaz');
  r = await put(c.lines.map(l => l.material === c.kavanoz ? { ...l, base: 'KG_DOLGU' } : l)); assert.equal(r.s, 400, 'ambalaj dolgu bazlı olamaz');
  r = await put(c.lines.map(l => l.material === c.pudra ? { ...l, material: 'HM-999' } : l)); assert.equal(r.s, 400);
  r = await put(c.lines.map(l => l.material === c.pudra ? { ...l, fire: 150 } : l)); assert.equal(r.s, 400);
  r = await put([]); assert.equal(r.s, 400);
});

test('Gram/kg birimi: 90 G ile 0,09 KG aynı gramajı verir', async () => {
  const id = db().recipes[0].id;
  const r = await call('PUT', `/api/recipes/${id}`, { lines: c.lines.map(l => l.material === c.pudra ? { ...l, qty: 0.09, unit: 'KG' } : l) });
  assert.equal(r.s, 200);
  assert.equal(r.j.totals.lines.find(x => x.material === c.pudra).grams, 90);
  assert.equal(r.j.totals.totalG, 300.06);
  await call('PUT', `/api/recipes/${id}`, { lines: c.lines });
});

test('Fiyat/maliyet alanları reçeteye girmez (reçete yalnızca hangi malzemeden ne kadar)', async () => {
  const id = db().recipes[0].id;
  const r = await call('PUT', `/api/recipes/${id}`, { lines: c.lines.map(l => ({ ...l, price: 99, unitPrice: 5, cost: 12 })), cost: 5, salePrice: 100 });
  assert.equal(r.s, 200);
  for (const l of r.j.lines) assert.deepEqual(Object.keys(l).sort(), ['base', 'critical', 'fire', 'material', 'qty', 'rounding', 'unit']);
  assert.ok(!('cost' in r.j) && !('salePrice' in r.j));
});

test('Onay: %100,02 tolerans içinde onaylanır, oranlar değişmez; onaylayan kaydedilir', async () => {
  const id = db().recipes[0].id;
  let r = await call('POST', `/api/recipes/${id}/approve`, { quality: '', production: 'U' }); assert.equal(r.s, 400, 'onaylayan zorunlu');
  r = await call('POST', `/api/recipes/${id}/approve`, { quality: 'Kalite Sor.', production: 'Üretim Sor.' });
  assert.equal(r.s, 200, JSON.stringify(r.j));
  assert.equal(r.j.status, 'ONAYLI'); assert.equal(r.j.totals.totalPct, 100.02);
  assert.equal(r.j.approvedTotals.totalG, 300.06, 'onay anındaki toplam saklanır');
  assert.equal(r.j.lines.find(l => l.material === c.findik).qty, 210);
  // onaylı reçete düzenlenemez
  r = await call('PUT', `/api/recipes/${id}`, { description: 'x' }); assert.equal(r.s, 409);
});

test('Yeni sürüm: eski ONAYLI otomatik PASİF olur, geçmişte kalır; aynı anda tek ONAYLI', async () => {
  const v1 = db().recipes[0].id;
  let r = await draft(c.lines.map(l => l.material === c.pudra ? { ...l, qty: 89.94 } : l), { basedOn: v1 });
  assert.equal(r.s, 200); assert.equal(r.j.version, 2); assert.equal(r.j.id.endsWith('-V2'), true);
  assert.equal(r.j.totals.totalG, 300); assert.equal(r.j.totals.level, 'TAM');
  r = await call('POST', `/api/recipes/${r.j.id}/approve`, { quality: 'K', production: 'U' });
  assert.equal(r.s, 200);
  const recs = db().recipes.filter(x => x.productCode === c.product);
  assert.deepEqual(recs.map(x => x.status), ['PASIF', 'ONAYLI']);
  assert.equal(recs.filter(x => x.status === 'ONAYLI').length, 1);
  const old = recs[0];
  const acts = old.history.map(h => h.action);
  assert.equal(acts[0], 'OLUSTURULDU'); assert.ok(acts.includes('GUNCELLENDI')); assert.ok(acts.includes('ONAYLANDI'));
  assert.equal(old.history.at(-1).action, 'PASIFE_ALINDI');
  assert.equal(old.lines.find(l => l.material === c.pudra).qty, 90, 'eski sürüm içeriği değişmedi');
});

test('Tolerans yaklaşımı: küçük sapma onaylanır, orta sapma açıklama ister, büyük sapma engellenir', async () => {
  const mk = q => c.lines.map(l => l.material === c.pudra ? { ...l, qty: q } : l);
  let r = await draft(mk(93)); // 303,06 → %+1,02 (>0,5, ≤5)
  assert.equal(r.s, 200); assert.equal(r.j.totals.level, 'ACIKLAMA');
  const id = r.j.id;
  let a = await call('POST', `/api/recipes/${id}/approve`, { quality: 'K', production: 'U' });
  assert.equal(a.s, 400); assert.match(a.j.error, /açıklama/);
  a = await call('POST', `/api/recipes/${id}/approve`, { quality: 'K', production: 'U', deviationNote: 'Pudra şekeri tartım payı' });
  assert.equal(a.s, 200); assert.equal(a.j.deviationNote, 'Pudra şekeri tartım payı');
  // büyük sapma: %+16,7 (>5)
  r = await draft(mk(140)); assert.equal(r.s, 200); assert.equal(r.j.totals.level, 'ENGEL');
  a = await call('POST', `/api/recipes/${r.j.id}/approve`, { quality: 'K', production: 'U', deviationNote: 'deneme' });
  assert.equal(a.s, 400); assert.match(a.j.error, /çok uzak/);
  // taslağı iptal et: geçmişte IPTAL olarak kalır
  const d = await call('POST', `/api/recipes/${r.j.id}/discard`, { note: 'hatalı' }); assert.equal(d.j.status, 'IPTAL');
  assert.ok(db().recipes.find(x => x.id === r.j.id));
  // eşikler ayarlanabilir
  const s = await call('PUT', '/api/settings', { recipeToleranceOkPct: 2 }); assert.equal(s.s, 200);
  const bad = await call('PUT', '/api/settings', { recipeToleranceOkPct: 10 }); assert.equal(bad.s, 400, 'kabul eşiği engel eşiğini aşamaz');
  await call('PUT', '/api/settings', { recipeToleranceOkPct: 0.5 });
});

test('Pasife alma ve ürün kartı eksikse onay engeli', async () => {
  const active = db().recipes.find(x => x.productCode === c.product && x.status === 'ONAYLI');
  const r = await call('POST', `/api/recipes/${active.id}/passivate`, { note: 'üretimden kalktı' });
  assert.equal(r.s, 200); assert.equal(r.j.status, 'PASIF');
  assert.equal((await call('POST', `/api/recipes/${active.id}/passivate`, {})).s, 409);
  // hedef dolumu/nominali olmayan ürün: reçete taslağı açılır ama onaylanamaz
  const p = (await call('POST', '/api/products', { name: 'TEST kartı eksik ürün' })).j;
  assert.equal(p.targetFill, null, 'bilinmeyen alanlar tahmin edilmez');
  assert.equal(p.shelfLifeDays, null);
  const d = await call('POST', '/api/recipes', { productCode: p.code, lines: c.lines });
  assert.equal(d.s, 200); assert.equal(d.j.totals.level, 'BELIRSIZ');
  const a = await call('POST', `/api/recipes/${d.j.id}/approve`, { quality: 'K', production: 'U' });
  assert.equal(a.s, 409);
});

test('Pasif malzeme içeren reçete onaylanamaz', async () => {
  const p = (await call('POST', '/api/products', { name: 'TEST pasif malzeme ürünü', nominal: 300, targetFill: 300 })).j;
  const d = await call('POST', '/api/recipes', { productCode: p.code, lines: [{ material: c.findik, qty: 300, unit: 'G', base: 'KAVANOZ' }] });
  assert.equal(d.s, 200);
  await call('PUT', `/api/materials/${c.findik}`, { active: false });
  const a = await call('POST', `/api/recipes/${d.j.id}/approve`, { quality: 'K', production: 'U' });
  assert.equal(a.s, 409);
  await call('PUT', `/api/materials/${c.findik}`, { active: true });
});

test('Seed temiz: gerçek veride hazır reçete yok; ürün kartı MM-001 300 g', () => {
  const { build } = require('../seed');
  const s = build();
  assert.equal(s.recipes.length, 0);
  assert.equal(s.movements.length, 0);
  const mm1 = s.products.find(p => p.code === 'MM-001');
  assert.equal(mm1.nominal, 300); assert.equal(mm1.targetFill, 300);
});
