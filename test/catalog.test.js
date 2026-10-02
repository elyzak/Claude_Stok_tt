const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('./helpers');
const { call, db } = T;
test.before(() => T.start());
test.after(() => T.stop());

test('Yeni ürün kartı: yalnızca girilen alanlar dolar, bilinmeyenler boş kalır (tahmin edilmez)', async () => {
  const r = await call('POST', '/api/products', { name: 'TEST Yeni Ürün 1' });
  assert.equal(r.s, 200, JSON.stringify(r.j));
  assert.match(r.j.code, /^MM-0\d\d$/); assert.equal(r.j.status, 'TEYIT');
  for (const k of ['nominal', 'targetFill', 'jarsPerBox', 'boxesPerPallet', 'shelfLifeDays', 'palletJars']) assert.equal(r.j[k], null, k);
  assert.equal(r.j.brand, ''); assert.equal(r.j.newCode, '');
  assert.equal((await call('POST', '/api/products', { name: '  ' })).s, 400);
  assert.equal((await call('POST', '/api/products', {})).s, 400);
  const m = db().materials.find(x => x.code === r.j.code); assert.equal(m.type, 'MAMUL'); assert.equal(m.unit, 'ADET'); assert.equal(m.lotTracking, 'ZORUNLU');
});

test('Markalar: tanımlı marka seçilir (Baynut, Trabzon Tarım, Nutshell, Finerji), yenisi eklenebilir', async () => {
  const b = (await call('GET', '/api/bootstrap')).j;
  assert.deepEqual(b.brands, ['Baynut', 'Trabzon Tarım', 'Nutshell', 'Finerji']);
  assert.equal((await call('POST', '/api/products', { name: 'TEST', brand: 'Bilinmeyen' })).s, 400);
  assert.equal((await call('POST', '/api/products', { name: 'TEST Finerji ürünü', brand: 'Finerji' })).s, 200);
  assert.equal((await call('POST', '/api/brands', { name: 'baynut' })).s, 409, 'büyük/küçük harf farkıyla tekrar');
  assert.equal((await call('POST', '/api/brands', { name: 'Yeni Marka' })).s, 200);
  assert.equal((await call('POST', '/api/products', { name: 'TEST yeni marka', brand: 'Yeni Marka' })).s, 200);
});

test('Palet toplam adedi: koli içi adetten türetilir/doğrulanır; çelişki ve bölünemezlik reddedilir', async () => {
  const p = (await call('POST', '/api/products', { name: 'TEST palet', jarsPerBox: 12, palletJars: 1584 })).j;
  assert.equal(p.boxesPerPallet, 132); assert.equal(p.palletJars, 1584);
  assert.equal((await call('POST', '/api/products', { name: 'TEST x', jarsPerBox: 12, palletJars: 1000 })).s, 400, '1000 / 12 tam bölünmez');
  assert.equal((await call('POST', '/api/products', { name: 'TEST y', palletJars: 1584 })).s, 400, 'koli içi adet yok');
  assert.equal((await call('POST', '/api/products', { name: 'TEST z', jarsPerBox: 12, boxesPerPallet: 100, palletJars: 1584 })).s, 400, 'çelişki');
  const u = await call('PUT', `/api/products/${p.code}`, { jarsPerBox: 6, palletJars: 1584 });
  assert.equal(u.s, 200); assert.equal(u.j.boxesPerPallet, 264);
  const b = (await call('GET', '/api/bootstrap')).j.products.find(x => x.code === p.code); assert.equal(b.palletJars, 1584, 'bootstrap türetilmiş alanı verir');
});

test('Ürün kartı güncelleme: tüm alanlar yönetilebilir ve doğrulanır; durum aktif/pasif', async () => {
  const p = (await call('POST', '/api/products', { name: 'TEST kart' })).j;
  const u = await call('PUT', `/api/products/${p.code}`, { name: 'TEST kart (yeni ad)', brand: 'Nutshell', nominal: 320, targetFill: 322.5, jarsPerBox: 12, boxesPerPallet: 100, shelfLifeDays: 540, status: 'AKTIF', newCode: 'NS-TEST-320', note: 'teyit edildi' });
  assert.equal(u.s, 200, JSON.stringify(u.j));
  assert.deepEqual([u.j.name, u.j.brand, u.j.nominal, u.j.targetFill, u.j.jarsPerBox, u.j.boxesPerPallet, u.j.palletJars, u.j.shelfLifeDays, u.j.status], ['TEST kart (yeni ad)', 'Nutshell', 320, 322.5, 12, 100, 1200, 540, 'AKTIF']);
  assert.equal(db().materials.find(m => m.code === p.code).name, 'TEST kart (yeni ad)');
  // alanı boşaltmak serbest (bilgi geri alınabilir)
  assert.equal((await call('PUT', `/api/products/${p.code}`, { targetFill: '' })).j.targetFill, null);
  for (const bad of [{ nominal: 0 }, { nominal: -1 }, { jarsPerBox: 1.5 }, { shelfLifeDays: -5 }, { status: 'X' }, { name: '' }, { brand: 'YOK' }]) assert.equal((await call('PUT', `/api/products/${p.code}`, bad)).s, 400, JSON.stringify(bad));
  const q = (await call('POST', '/api/products', { name: 'TEST kart 2' })).j;
  assert.equal((await call('PUT', `/api/products/${q.code}`, { newCode: 'NS-TEST-320' })).s, 409, 'yeni kod tekil');
  assert.equal((await call('PUT', `/api/products/${p.code}`, { status: 'PASIF' })).j.status, 'PASIF');
});

test('Malzeme kartı: kod otomatik, birim/lot takibi doğrulanır; hareketi olan malzemenin birimi/lot takibi değişmez; pasif malzemeye mal kabul yok', async () => {
  const m = (await call('POST', '/api/materials', { name: 'TEST Hammadde', type: 'HAMMADDE', unit: 'KG', category: 'Test' })).j;
  assert.match(m.code, /^HM-\d{3}$/); assert.equal(m.lotTracking, 'ZORUNLU'); assert.equal(m.sktTracking, true);
  const a = (await call('POST', '/api/materials', { name: 'TEST Ambalaj', type: 'AMBALAJ', unit: 'ADET' })).j;
  assert.match(a.code, /^AM-\d{3}$/); assert.equal(a.lotTracking, 'OPSIYONEL'); assert.equal(a.sktTracking, false);
  assert.equal((await call('POST', '/api/materials', { name: 'x', type: 'HAMMADDE', unit: 'LITRE' })).s, 400);
  assert.equal((await call('POST', '/api/materials', { name: 'x', type: 'YOK', unit: 'KG' })).s, 400);
  assert.equal((await call('POST', '/api/materials', { name: 'x', type: 'HAMMADDE', unit: 'KG', lotTracking: 'BELKI' })).s, 400);
  assert.equal((await call('PUT', `/api/materials/${m.code}`, { unit: 'ADET' })).s, 200, 'hareket yokken birim değişir');
  await call('PUT', `/api/materials/${m.code}`, { unit: 'KG' });
  await call('POST', '/api/receipt', { code: m.code, supplier: 'TED-001', qty: 5, skt: '2027-12-31' });
  assert.equal((await call('PUT', `/api/materials/${m.code}`, { unit: 'ADET' })).s, 409);
  assert.equal((await call('PUT', `/api/materials/${m.code}`, { lotTracking: 'YOK' })).s, 409);
  await call('PUT', `/api/materials/${m.code}`, { active: false });
  assert.equal((await call('POST', '/api/receipt', { code: m.code, supplier: 'TED-001', qty: 5, skt: '2027-12-31' })).s, 409, 'pasif malzeme');
});

test('Tedarikçi: kod tekil ve artan; sertifika tarihi doğrulanır', async () => {
  const a = (await call('POST', '/api/suppliers', { name: 'TEST Tedarikçi A' })).j;
  const b = (await call('POST', '/api/suppliers', { name: 'TEST Tedarikçi B', certEnd: '2027-05-01' })).j;
  assert.notEqual(a.id, b.id); assert.match(b.id, /^TED-\d{3}$/);
  assert.equal((await call('POST', '/api/suppliers', { name: 'x', certEnd: 'dün' })).s, 400);
  assert.equal((await call('POST', '/api/suppliers', { name: '' })).s, 400);
});
