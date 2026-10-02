// Uçtan uca duman testi: geçici veri klasöründe sunucuyu açıp ana akışları dener.
const assert = require('assert');
const os = require('os'), path = require('path'), fs = require('fs');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'stok-'));
const { server, load } = require('./server');
load();
server.listen(0, async () => {
  const base = 'http://localhost:' + server.address().port;
  const call = async (m, u, b) => { const r = await fetch(base + u, { method: m, headers: { 'Content-Type': 'application/json', 'X-User': 'sales@trabzontarim.com.tr' }, body: b ? JSON.stringify(b) : undefined }); return { s: r.status, j: await r.json() }; };
  try {
    const rec = (await call('GET', '/api/bootstrap')).j.recipes.find(r => r.status === 'ONAYLI' && r.productCode === 'MM-001');
    const skt = '2027-12-31';
    // devir: reçetedeki tüm kalemlere bol stok
    const lines = rec.lines.map(l => ({ code: l.material, qty: 100000, skt, loc: 'EZM-DEPO' }));
    let r = await call('POST', '/api/count', { type: 'DEVIR', lines }); assert.equal(r.s, 200, JSON.stringify(r.j));
    r = await call('POST', '/api/production/preview', { productCode: 'MM-001', pallets: 1 });
    assert.equal(r.j.totalJars, 1584); assert.equal(r.j.fillKg, 475.2); assert.equal(r.j.ratio, 100); assert.ok(r.j.ok);
    r = await call('POST', '/api/production', { productCode: 'MM-001', pallets: 1 }); assert.equal(r.s, 200, JSON.stringify(r.j));
    const prodId = r.j.id, lot = r.j.lot;
    r = await call('POST', '/api/dispatch', { productCode: 'MM-001', shape: 'KOLI', qty: 2 }); assert.equal(r.j.jars, 24);
    r = await call('POST', '/api/dispatch', { productCode: 'MM-001', shape: 'PALET', qty: 2 }); assert.equal(r.s, 400); // stok yetersiz
    r = await call('POST', '/api/cancel/' + prodId, { reason: 'test' }); assert.equal(r.s, 400); // mamul sevk edilmiş → iptal engellenir
    const st = (await call('GET', '/api/stock')).j.materials.find(m => m.code === 'MM-001'); assert.equal(st.total, 1560);
    // fazla tüketim → yetersiz
    r = await call('POST', '/api/production', { productCode: 'MM-001', pallets: 1000 }); assert.equal(r.s, 400);
    // sayım düzeltme
    r = await call('POST', '/api/count', { type: 'SAYIM', lines: [{ code: 'MM-001', lot, loc: 'EZM-DEPO', qty: 1500 }] }); assert.equal(r.s, 400); // neden yok
    r = await call('POST', '/api/count', { type: 'SAYIM', lines: [{ code: 'MM-001', lot, loc: 'EZM-DEPO', qty: 1500, reason: 'SAY-03' }] }); assert.equal(r.j.lines[0].diff, -60);
    // mal kabul + karantina
    r = await call('POST', '/api/receipt', { code: 'HM-002', supplier: 'TED-001', qty: 50, skt, result: 'KARANTINA' }); assert.equal(r.s, 200); assert.ok(r.j.lot.startsWith('HM002-'));
    // reçete: taslak → onay
    r = await call('POST', '/api/recipes', { productCode: 'MM-002', lines: [{ material: 'HM-004', qty: 1, base: 'KG_DOLGU' }] }); assert.equal(r.j.status, 'TASLAK');
    r = await call('POST', `/api/recipes/${r.j.id}/approve`, { quality: 'K', production: 'U' }); assert.equal(r.j.status, 'ONAYLI');
    console.log('TÜM TESTLER GEÇTİ');
  } catch (e) { console.error('BAŞARISIZ:', e.message); process.exitCode = 1; }
  server.close();
});
