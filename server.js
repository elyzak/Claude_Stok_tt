// Trabzon Tarım - Ezme Krema Stok Sistemi: HTTP katmanı.
// İş mantığı ./core altındadır ve arayüzden bağımsızdır; burası yalnızca istekleri çekirdeğe aktarır.
const http = require('http');
const fs = require('fs');
const path = require('path');
const C = require('./core');
const { Err, need } = C.errors;
const S = C.store;
const { todayIn } = require('./lib/time');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MAX_BODY = 1e6;
const DEFAULT_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

// Durum kodları: 400 doğrulama · 401 kullanıcı yok · 403 yetkisiz kullanıcı · 404 bulunamadı · 405 yöntem · 409 çakışma/durum · 413 büyük istek · 500 beklenmeyen
const routes = [];
const route = (method, pattern, fn, opts = {}) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn, readonly: method === 'GET' || !!opts.readonly });
const userOf = req => {
  const e = (req.headers['x-user'] || '').toString();
  need(e, 'Kullanıcı seçin', 401);
  const u = S.get().users.find(x => x.email === e && x.active); need(u, 'Kullanıcı tanımlı değil veya pasif', 403);
  return u.email;
};
const DOCS = { receipts: 'receipts', productions: 'productions', dispatches: 'dispatches', counts: 'counts', fires: 'fires', lotclosures: 'lotClosures', transfers: 'transfers', quality: 'qualityDocs' };

// ---- okuma ----
route('GET', '/api/bootstrap', () => { const d = S.get(); return { materials: d.materials, products: d.products.map(C.catalog.productView), recipes: d.recipes.map(C.recipes.view), locations: d.locations, suppliers: d.suppliers, reasons: d.reasons, users: d.users, mapping: d.mapping, brands: d.brands, settings: d.settings, today: todayIn() }; });
route('GET', '/api/dashboard', () => C.reports.dashboard());
route('GET', '/api/stock', () => C.reports.stockSummary());
route('GET', '/api/movements', () => ({ rows: S.get().movements.slice().reverse().slice(0, 2000) }));
route('GET', '/api/docs/:kind', (_, __, p) => { const k = DOCS[p.kind]; need(k, 'Bilinmeyen belge türü', 404); return { rows: S.get()[k].slice().reverse() }; });
route('GET', '/api/trace', (_, __, ___, q) => C.trace.traceLot(q.get('code'), q.get('lot')));
route('GET', '/api/productions/:id/consumption', (_, __, p) => C.adjust.productionConsumption(p.id));

// ---- yazma (her biri tek bir atomik işlem) ----
route('POST', '/api/receipt', (req, b) => C.receipts.receipt(b, userOf(req)));
route('POST', '/api/production/preview', (_, b) => C.production.plan(b), { readonly: true });
route('POST', '/api/production', (req, b) => C.production.record(b, userOf(req)));
route('POST', '/api/dispatch', (req, b) => C.dispatch.dispatch(b, userOf(req)));
route('POST', '/api/count', (req, b) => C.counts.count(b, userOf(req)));
route('POST', '/api/cancel/:id', (req, b, p) => C.cancel.cancelDoc(p.id, b.reason, userOf(req)));
route('POST', '/api/fire', (req, b) => C.adjust.fire(b, userOf(req)));
route('POST', '/api/lot-close', (req, b) => C.adjust.lotClose(b, userOf(req)));
route('POST', '/api/quality/release', (req, b) => C.quality.release(b, userOf(req)));
route('POST', '/api/quality/reject', (req, b) => C.quality.reject(b, userOf(req)));
route('POST', '/api/quality/hold', (req, b) => C.quality.hold(b, userOf(req)));
route('POST', '/api/transfer', (req, b) => C.quality.transfer(b, userOf(req)));
// reçeteler
route('POST', '/api/recipes', (req, b) => C.recipes.createDraft(b, userOf(req)));
route('PUT', '/api/recipes/:id', (req, b, p) => C.recipes.updateDraft(p.id, b, userOf(req)));
route('POST', '/api/recipes/:id/approve', (req, b, p) => C.recipes.approve(p.id, b, userOf(req)));
route('POST', '/api/recipes/:id/passivate', (req, b, p) => C.recipes.passivate(p.id, b, userOf(req)));
route('POST', '/api/recipes/:id/discard', (req, b, p) => C.recipes.discardDraft(p.id, b, userOf(req)));
// tanımlar
route('POST', '/api/materials', (req, b) => { userOf(req); return C.catalog.createMaterial(b); });
route('PUT', '/api/materials/:code', (req, b, p) => { userOf(req); return C.catalog.updateMaterial(p.code, b); });
route('POST', '/api/products', (req, b) => { userOf(req); return C.catalog.createProduct(b); });
route('PUT', '/api/products/:code', (req, b, p) => { userOf(req); return C.catalog.updateProduct(p.code, b); });
route('POST', '/api/suppliers', (req, b) => { userOf(req); return C.catalog.createSupplier(b); });
route('POST', '/api/brands', (req, b) => { userOf(req); return C.catalog.addBrand(b); });
route('PUT', '/api/settings', (req, b) => { userOf(req); return C.catalog.updateSettings(b); });

// Çift tıklama / yeniden gönderim koruması: aynı X-Request-Id ile gelen başarılı yazma isteği tekrar işlenmez, ilk yanıt döner.
const replay = new Map();
const rememberReply = (id, out) => { replay.set(id, out); if (replay.size > 1000) replay.delete(replay.keys().next().value); };

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
function handle(req, res, url, raw) {
  const send = (code, obj, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...headers }); res.end(JSON.stringify(obj)); };
  const matches = routes.filter(r => r.re.test(url.pathname));
  if (!matches.length) return send(404, { error: 'Bulunamadı' });
  const r = matches.find(x => x.method === req.method);
  if (!r) return send(405, { error: 'Bu adres için yöntem desteklenmiyor' }, { Allow: matches.map(x => x.method).join(', ') });
  const rid = !r.readonly && req.headers['x-request-id'] ? String(req.headers['x-request-id']).slice(0, 80) : '';
  if (rid && replay.has(rid)) return send(200, replay.get(rid), { 'X-Idempotent-Replay': 'true' });
  try {
    let body = {};
    if (raw) { try { body = JSON.parse(raw); } catch { throw new Err('İstek gövdesi geçerli JSON değil'); } }
    need(body && typeof body === 'object' && !Array.isArray(body), 'İstek gövdesi bir JSON nesnesi olmalı');
    const params = r.re.exec(url.pathname).groups || {};
    const run = () => r.fn(req, body, params, url.searchParams);
    const out = r.readonly ? run() : S.tx(run); // yazma: ya tamamen gerçekleşir ya hiç
    if (!r.readonly && rid) rememberReply(rid, out);
    return send(200, out);
  } catch (e) {
    if (e instanceof Err) return send(e.status, { error: e.message });
    console.error(e);
    return send(500, { error: 'Beklenmeyen sunucu hatası' });
  }
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/api/')) {
    let f = path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!f.startsWith(PUBLIC) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(PUBLIC, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    return fs.createReadStream(f).pipe(res);
  }
  let raw = '', tooBig = false;
  req.on('data', c => {
    if (tooBig) return;
    raw += c;
    if (raw.length > MAX_BODY) { tooBig = true; res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8', Connection: 'close' }); res.end(JSON.stringify({ error: 'İstek çok büyük' })); }
  });
  req.on('end', () => { if (!tooBig) handle(req, res, url, raw); });
});
const load = dir => S.init(dir || DEFAULT_DIR);
if (require.main === module) { load(); server.listen(PORT, () => console.log(`Stok sistemi http://localhost:${PORT}`)); }
module.exports = { server, load, getDb: () => S.get(), store: S };
