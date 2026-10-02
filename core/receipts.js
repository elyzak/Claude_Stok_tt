// Mal kabul (satın alma / entegre transferi / karantina / red).
const S = require('./store');
const L = require('./ledger');
const { need, num, dateOf, optDate } = require('./errors');
const D = () => S.get();

function receipt(b, user) {
  const m = S.mat(b.code); need(m, 'Malzeme bulunamadı', 404);
  need(m.active, 'Pasif malzemeye mal kabul yapılamaz', 409);
  const sup = D().suppliers.find(s => s.id === b.supplier); need(sup, 'Tedarikçi seçin');
  const qty = num(b.qty, 'Miktar'); need(qty > 0, 'Miktar sıfırdan büyük olmalı');
  const date = dateOf(b.date);
  const result = b.result || 'KABUL'; need(['KABUL', 'KARANTINA', 'RED'].includes(result), 'Geçersiz kontrol sonucu');
  const skt = optDate(b.skt, 'SKT');
  if (m.sktTracking && result !== 'RED') need(skt, 'Bu malzeme için SKT zorunlu');
  if (m.sktTracking && skt) need(skt >= date, 'SKT kabul tarihinden önce olamaz');
  const unitPrice = b.unitPrice === '' || b.unitPrice == null ? null : num(b.unitPrice, 'Birim fiyat');
  if (unitPrice !== null) need(unitPrice >= 0, 'Birim fiyat negatif olamaz');
  let lot = m.lotTracking === 'YOK' ? '' : String(b.lot || '').trim();
  if (result !== 'RED') {
    if (m.lotTracking === 'ZORUNLU' && !lot) lot = L.autoLot(b.code, date);
    if (lot) need(!L.lotInUse(b.code, lot), `Lot zaten kayıtlı: ${lot}`, 409);
  } else lot = '';
  const id = S.nextId('mk', 'MK'); const doc = { type: 'MALZEME_GIRISI', id, user };
  if (result !== 'RED') {
    L.registerLot(b.code, lot, skt, result === 'KARANTINA' ? 'KARANTINA' : 'ONAYLI', { supplierLot: b.supplierLot || '' });
    L.addMove(sup.id === 'ENTEGRE' ? 'ENTEGRE_TRANSFER' : 'ALIS', b.code, lot, result === 'KARANTINA' ? 'EZM-KAR' : 'EZM-DEPO', qty, doc, { note: b.note });
  }
  const rec = { id, date, supplier: sup.id, waybill: b.waybill || '', code: b.code, qty, lot, supplierLot: b.supplierLot || '', skt, result, user, note: b.note || '', unitPrice, currency: b.currency || '', cancelled: false };
  rec.total = unitPrice != null ? L.rq(unitPrice * qty) : null; // yalnızca kayıt; maliyet hesabı Maliyet Modülü'nün işi
  D().receipts.push(rec);
  return rec;
}
module.exports = { receipt };
