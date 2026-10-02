// Belge iptali = ters kayıt. Stok hiçbir zaman silinmez; her iptal yeni hareketler üretir ve eksi bakiyeye yol açıyorsa engellenir.
const S = require('./store');
const L = require('./ledger');
const { need } = require('./errors');
const D = () => S.get();
const LISTS = { MK: 'receipts', URT: 'productions', CIK: 'dispatches', SAY: 'counts', FRE: 'fires', LKP: 'lotClosures', TRF: 'transfers' };

function cancelDoc(docId, reason, user) {
  need(typeof docId === 'string', 'Belge no geçersiz');
  const prefix = docId.split('-')[0];
  need(prefix !== 'KAL', 'Kalite kararı iptal edilemez; ters işlem yapın (ör. karantinaya al)', 409);
  const list = LISTS[prefix]; need(list, 'Belge türü tanınmadı', 404);
  const rec = D()[list].find(x => x.id === docId); need(rec, 'Belge bulunamadı', 404); need(!rec.cancelled, 'Belge zaten iptal edilmiş', 409);
  need(String(reason || '').trim(), 'İptal nedeni yazın');
  const orig = D().movements.filter(m => m.docId === docId && !m.reverses);
  const delta = new Map();
  for (const m of orig) { const k = L.balKey(m.code, m.lot, m.loc); delta.set(k, (delta.get(k) || 0) - m.qty); }
  const bal = L.balances();
  for (const [k, d] of delta) need(L.rq((bal.get(k) || 0) + d) >= 0, `İptal edilemez: ${k.split('|')[0]} / ${k.split('|')[1] || '-'} lotundan sonraki hareketlerle stok kullanılmış`, 409);
  const doc = { type: 'IPTAL', id: docId, user };
  for (const m of orig) { const rv = L.addMove('TERS_KAYIT', m.code, m.lot, m.loc, -m.qty, doc, { reverses: m.id, note: 'İptal: ' + reason, ref: m.ref }); m.reversedBy = rv.id; }
  if (list === 'lotClosures' && rec.closed) L.setLotStatus(rec.code, rec.lot, rec.prevStatus || 'ONAYLI'); // kapatılan lot yeniden açılır
  rec.cancelled = true; rec.cancelReason = reason;
  return rec;
}
module.exports = { cancelDoc, LISTS };
