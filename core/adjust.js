// Fire ve lot kapanışı: stok miktarını değiştiren, her zaman neden kodu ve belge (FRE / LKP) ile kaydedilen AYRI hareketler.
// Hiçbir miktar sessizce değişmez; stok geçmişinde tür (FIRE / LOT_KAPANIS) ve neden açıkça görünür.
// Üretime bağlanabilir (productionId): teorik tüketim (URETIM_TUKETIM) + fire + lot kapanış farkı = gerçek tüketim.
const S = require('./store');
const L = require('./ledger');
const { need, num } = require('./errors');
const D = () => S.get();

const reasonOk = (code, cat) => D().reasons.some(r => r.code === code && r.category === cat);
function prodRef(id) {
  if (!id) return '';
  const p = D().productions.find(x => x.id === id);
  need(p, 'Üretim kaydı bulunamadı', 404); need(!p.cancelled, 'İptal edilmiş üretime fire/fark bağlanamaz', 409);
  return id;
}

// Fire: lot verilirse o lottan, verilmezse FEFO ile kullanılabilir lotlardan düşülür.
function fire(b, user) {
  const m = S.mat(b.code); need(m, 'Malzeme bulunamadı', 404);
  const qty = num(b.qty, 'Fire miktarı'); need(qty > 0, 'Fire miktarı sıfırdan büyük olmalı');
  need(reasonOk(b.reason, 'FIRE'), 'Fire için FIRE kategorisinden neden kodu zorunlu');
  const ref = prodRef(b.productionId);
  const id = S.nextId('fre', 'FRE'); const doc = { type: 'FIRE', id, user };
  const lot = m.lotTracking === 'YOK' ? '' : String(b.lot || '').trim();
  const parts = [];
  if (lot || m.lotTracking === 'YOK' && b.loc) {
    const loc = b.loc || 'EZM-DEPO'; need(D().locations.some(x => x.code === loc), 'Lokasyon geçersiz');
    need(L.balOf(b.code, lot, loc) >= qty, `Stok yetersiz: ${lot || '(lotsuz)'} / ${loc} bakiyesi ${L.balOf(b.code, lot, loc)}`, 409);
    parts.push({ lot, loc, qty });
  } else {
    const al = L.allocate(b.code, qty, require('../lib/time').todayIn(), undefined);
    need(al.short <= 0, `Stok yetersiz: ${L.rq(qty - al.short)} ${m.unit} düşülebilir`, 409);
    parts.push(...al.parts);
  }
  for (const p of parts) L.addMove('FIRE', b.code, p.lot, p.loc, -p.qty, doc, { reason: b.reason, note: b.note, ref });
  const rec = { id, ts: new Date().toISOString(), code: b.code, qty, reason: b.reason, productionId: ref, lots: parts.map(p => `${p.lot || '—'}@${p.loc} (${p.qty})`).join(', '), user, note: b.note || '', cancelled: false };
  D().fires.push(rec);
  return rec;
}

// Lot kapanışı: lotun fiziksel kalanı ile sistem bakiyesi arasındaki fark, neden koduyla ayrı hareket olarak kaydedilir.
// close:true ise lot kapatılır (KAPALI): tüm lokasyonlardaki bakiyesi sıfır olmalıdır, sonra kullanılamaz.
function lotClose(b, user) {
  const m = S.mat(b.code); need(m, 'Malzeme bulunamadı', 404);
  const lot = String(b.lot || '').trim(); need(lot, 'Lot seçin');
  const meta = L.lotMeta(b.code, lot); need(meta, 'Lot bulunamadı', 404); need(meta.status !== 'KAPALI', 'Lot zaten kapalı', 409);
  const loc = b.loc || 'EZM-DEPO'; need(D().locations.some(x => x.code === loc), 'Lokasyon geçersiz');
  need(L.balances().has(L.balKey(b.code, lot, loc)), `${lot} / ${loc} için kayıt yok`);
  const actual = num(b.actual, 'Fiziksel kalan'); need(actual >= 0, 'Fiziksel kalan negatif olamaz');
  const ref = prodRef(b.productionId);
  const cur = L.balOf(b.code, lot, loc); const diff = L.rq(actual - cur);
  need(diff !== 0 || b.close, 'Fark yok; kaydedilecek bir şey yok');
  if (diff !== 0) need(reasonOk(b.reason, 'LOT_KAPANIS'), 'Lot kapanış farkı için LOT_KAPANIS kategorisinden neden kodu zorunlu');
  const id = S.nextId('lkp', 'LKP'); const doc = { type: 'LOT_KAPANIS', id, user };
  if (diff !== 0) L.addMove('LOT_KAPANIS', b.code, lot, loc, diff, doc, { reason: b.reason, note: b.note, ref });
  let prevStatus = '';
  if (b.close) {
    for (const r of L.lotRows().filter(r => r.code === b.code && r.lot === lot)) need(r.qty === 0, `Lot kapatılamaz: ${r.loc} lokasyonunda ${r.qty} ${m.unit} kalan var`, 409);
    prevStatus = meta.status; meta.status = 'KAPALI';
  }
  const rec = { id, ts: new Date().toISOString(), code: b.code, lot, loc, system: cur, actual, diff, reason: b.reason || '', productionId: ref, closed: !!b.close, prevStatus, user, note: b.note || '', cancelled: false };
  D().lotClosures.push(rec);
  return rec;
}

// Üretime ait teorik / fire / fark / gerçek tüketim özeti
function productionConsumption(productionId) {
  const p = D().productions.find(x => x.id === productionId); need(p, 'Üretim bulunamadı', 404);
  const rows = new Map();
  const row = c => { if (!rows.has(c)) { const m = S.mat(c); rows.set(c, { code: c, name: m ? m.name : c, unit: m ? m.unit : '', theoretical: 0, fire: 0, lotDiff: 0 }); } return rows.get(c); };
  for (const mv of D().movements) {
    if (mv.reversedBy || mv.reverses) continue;
    if (mv.docId === productionId && mv.type === 'URETIM_TUKETIM') row(mv.code).theoretical = L.rq(row(mv.code).theoretical - mv.qty);
    else if (mv.ref === productionId && mv.type === 'FIRE') row(mv.code).fire = L.rq(row(mv.code).fire - mv.qty);
    else if (mv.ref === productionId && mv.type === 'LOT_KAPANIS') row(mv.code).lotDiff = L.rq(row(mv.code).lotDiff - mv.qty); // + = ek tüketim, − = stoğa geri
  }
  const out = [...rows.values()].map(r => ({ ...r, actual: L.rq(r.theoretical + r.fire + r.lotDiff) }));
  return { production: p, rows: out };
}
module.exports = { fire, lotClose, productionConsumption };
