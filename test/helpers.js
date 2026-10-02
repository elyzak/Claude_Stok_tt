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
module.exports = { start, stop, call, db, nMoves, balance, fixture, devir, SKT, USER };
