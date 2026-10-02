// Test yardımcıları: her test dosyası KENDİ geçici veri klasöründe sunucu açar; gerçek data/ klasörüne dokunmaz.
// Test verisi (lot, miktar, reçete) yalnızca bu geçici veritabanında üretilir ve test bitince silinir.
const os = require('os'), path = require('path'), fs = require('fs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stok-test-'));
process.env.DATA_DIR = dir;
const app = require('../server');
app.load(dir);

const USER = 'sales@trabzontarim.com.tr';
let base;
const start = () => new Promise(res => app.server.listen(0, () => { base = 'http://localhost:' + app.server.address().port; res(); }));
const stop = () => new Promise(res => { app.server.close(res); fs.rmSync(dir, { recursive: true, force: true }); });

async function call(method, url, body, { user = USER, headers = {}, raw } = {}) {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (user) h['X-User'] = user;
  const r = await fetch(base + url, { method, headers: h, body: raw !== undefined ? raw : (body ? JSON.stringify(body) : undefined) });
  return { s: r.status, j: await r.json(), h: r.headers };
}
const db = () => app.getDb();
const nMoves = () => db().movements.length;
const balance = (code, lot, loc = 'EZM-DEPO') => db().movements.filter(m => m.code === code && m.lot === lot && m.loc === loc).reduce((s, m) => s + m.qty, 0);

// Sahte test ürünü: MM-001 kartı yalnızca bu geçici DB'de test değerleriyle ayarlanır (üretim verisine yazılmaz).
async function fixture() {
  await call('PUT', '/api/products/MM-001', { nominal: 300, targetFill: 300, jarsPerBox: 12, boxesPerPallet: 132, shelfLifeDays: 365 });
  const mk = (material, qty, base) => ({ material, qty, base, fire: 0, rounding: 'YOK', critical: false });
  const r = await call('POST', '/api/recipes', { productCode: 'MM-001', description: 'TEST', lines: [
    mk('HM-025', 0.6, 'KG_DOLGU'), mk('HM-027', 0.4, 'KG_DOLGU'), mk('AM-070', 1, 'KAVANOZ'), mk('AM-072', 1, 'KOLI'), mk('AM-011', 1, 'PALET')] });
  await call('POST', `/api/recipes/${r.j.id}/approve`, { quality: 'TEST-K', production: 'TEST-U' });
  return r.j.id;
}
const SKT = '2027-12-31';
const devir = lines => call('POST', '/api/count', { type: 'DEVIR', lines: lines.map(l => ({ loc: 'EZM-DEPO', skt: SKT, ...l })) });

// ---- TEST VERİSİ (yalnızca geçici veritabanı) ----
// Kullanıcının verdiği test reçetesi: 300 g Şekerli Fındık Ezmesi %70 Fındık
//   Pudra Şekeri 90 g (%30) · Çifte Kavrulmuş Fındık İçi 210 g (%70) · Etil Vanilin 0,06 g (%0,02) → 300,06 g / %100,02
// Ürün, hammadde ve ambalaj kartları ile stok yalnızca test içinde üretilir; gerçek veriye karışmaz.
async function hazelnut() {
  const mat = async (name, type, unit, lotTracking = 'ZORUNLU') => (await call('POST', '/api/materials', { name, type, unit, lotTracking })).j.code;
  const c = {
    pudra: await mat('TEST Pudra Şekeri', 'HAMMADDE', 'KG'),
    findik: await mat('TEST Çifte Kavrulmuş Fındık İçi', 'HAMMADDE', 'KG'),
    vanilin: await mat('TEST Etil Vanilin', 'HAMMADDE', 'KG'),
    kavanoz: await mat('TEST Kavanoz 300 g', 'AMBALAJ', 'ADET'),
    kapak: await mat('TEST Kapak', 'AMBALAJ', 'ADET'),
    etiket: await mat('TEST Etiket', 'AMBALAJ', 'ADET'),
    koli: await mat('TEST Koli 12li', 'AMBALAJ', 'ADET', 'OPSIYONEL'),
    palet: await mat('TEST Palet', 'AMBALAJ', 'ADET', 'YOK'),
  };
  const pr = await call('POST', '/api/products', { name: 'TEST Şekerli Fındık Ezmesi %70 Fındık 300 g', brand: 'Trabzon Tarım', nominal: 300, targetFill: 300, jarsPerBox: 12, boxesPerPallet: 132, shelfLifeDays: 365, status: 'AKTIF' });
  c.product = pr.j.code;
  c.lines = [
    { material: c.pudra, qty: 90, unit: 'G', base: 'KAVANOZ' },
    { material: c.findik, qty: 210, unit: 'G', base: 'KAVANOZ' },
    { material: c.vanilin, qty: 0.06, unit: 'G', base: 'KAVANOZ' },
    { material: c.kavanoz, qty: 1, unit: 'ADET', base: 'KAVANOZ' },
    { material: c.kapak, qty: 1, unit: 'ADET', base: 'KAVANOZ' },
    { material: c.etiket, qty: 1, unit: 'ADET', base: 'KAVANOZ' },
    { material: c.koli, qty: 1, unit: 'ADET', base: 'KOLI' },
    { material: c.palet, qty: 1, unit: 'ADET', base: 'PALET' },
  ];
  return c;
}
// Test reçetesini taslak olarak açıp onaylar.
async function approvedRecipe(c) {
  const r = await call('POST', '/api/recipes', { productCode: c.product, description: 'TEST VERİSİ', lines: c.lines });
  if (r.s !== 200) throw new Error('reçete: ' + JSON.stringify(r.j));
  const a = await call('POST', `/api/recipes/${r.j.id}/approve`, { quality: 'TEST-K', production: 'TEST-U' });
  if (a.s !== 200) throw new Error('onay: ' + JSON.stringify(a.j));
  return a.j;
}
// 1 paletlik test stoğu (fındıkta iki lot: FEFO bölünmesi için)
async function stock(c, { extra = {} } = {}) {
  const r = await devir([
    { code: c.pudra, lot: 'P-1', qty: 500, skt: '2027-09-01' },
    { code: c.findik, lot: 'F-A', qty: 200, skt: '2027-03-01' },
    { code: c.findik, lot: 'F-B', qty: 300, skt: '2027-06-01' },
    { code: c.vanilin, lot: 'V-1', qty: 1, skt: '2027-12-01' },
    { code: c.kavanoz, lot: 'K-1', qty: 2000, skt: '' },
    { code: c.kapak, lot: 'KP-1', qty: 2000, skt: '' },
    { code: c.etiket, lot: 'ET-1', qty: 2000, skt: '' },
    { code: c.koli, qty: 200 },
    { code: c.palet, qty: 5 },
  ].map(l => ({ skt: SKT, ...l })));
  if (r.s !== 200) throw new Error('stok: ' + JSON.stringify(r.j));
  return r.j;
}
const stockOf = (code) => { const o = {}; for (const m of db().movements) if (m.code === code) { const k = (m.lot || '—') + '@' + m.loc; o[k] = Math.round((((o[k] || 0) + m.qty)) * 1e6) / 1e6; } return o; };
const preview = (c, body) => call('POST', '/api/production/preview', { productCode: c.product, ...body });
async function produce(c, body, extra = {}) {
  const pv = await preview(c, body);
  if (pv.s !== 200) return pv;
  return call('POST', '/api/production', { productCode: c.product, ...body, expect: { recipeId: pv.j.recipe.id, totalJars: pv.j.totalJars, fillKg: pv.j.fillKg }, ...extra });
}
module.exports = { start, stop, call, db, nMoves, balance, fixture, devir, SKT, USER, hazelnut, approvedRecipe, stock, stockOf, preview, produce, store: app.store };
