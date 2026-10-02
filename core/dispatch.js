// Mamul çıkışı: sevkiyat (adet/koli/palet) ve mamul fire'ı.
const S = require('./store');
const L = require('./ledger');
const { need, num, dateOf } = require('./errors');
const D = () => S.get();

function dispatch(b, user) {
  const p = S.prod(b.productCode); need(p, 'Ürün seçin', 404);
  const q = num(b.qty, 'Miktar'); need(q > 0, 'Miktar sıfırdan büyük olmalı');
  const shape = b.shape || 'ADET';
  need(['ADET', 'KOLI', 'PALET'].includes(shape), 'Çıkış şekli geçersiz');
  let jars = q;
  if (shape === 'KOLI') { need(p.jarsPerBox, 'Ürün kartında koli içi adet eksik'); jars = q * p.jarsPerBox; }
  if (shape === 'PALET') { need(p.jarsPerBox && p.boxesPerPallet, 'Ürün kartında koli/palet eksik'); jars = q * p.boxesPerPallet * p.jarsPerBox; }
  need(Number.isInteger(jars), 'Çıkış adedi tam sayı olmalı');
  const dtype = b.type || 'SEVKIYAT'; need(['SEVKIYAT', 'FIRE'].includes(dtype), 'İşlem türü geçersiz');
  if (dtype === 'FIRE') need(D().reasons.some(r => r.code === b.reason && r.category === 'FIRE'), 'Fire için FIRE kategorisinden neden kodu seçin');
  const date = dateOf(b.date); const loc = b.loc || 'EZM-DEPO'; need(D().locations.some(x => x.code === loc), 'Lokasyon geçersiz');
  const al = L.allocate(b.productCode, jars, date, [loc], b.lot || undefined);
  need(al.short <= 0, `Stok yetersiz: ${L.rq(jars - al.short)} adet çıkılabilir, ${jars} istendi`, 409);
  const id = S.nextId('cik', 'CIK'); const doc = { type: 'MAMUL_CIKISI', id, user };
  for (const pt of al.parts) L.addMove(dtype === 'FIRE' ? 'FIRE' : 'SEVK', b.productCode, pt.lot, pt.loc, -pt.qty, doc, { reason: b.reason, note: b.note });
  const rec = { id, date, type: dtype, productCode: b.productCode, shape, qty: q, jars, lots: al.parts.map(x => `${x.lot} (${x.qty})`).join(', '), loc, docNo: b.docNo || '', user, note: b.note || '', cancelled: false };
  D().dispatches.push(rec);
  return rec;
}
module.exports = { dispatch };
