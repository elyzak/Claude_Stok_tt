// Sayım / devir.
const S = require('./store');
const L = require('./ledger');
const { need, num, dateOf, optDate } = require('./errors');
const D = () => S.get();
const devirExists = (code, lot, loc) => D().movements.some(m => m.type === 'DEVIR' && m.code === code && m.lot === lot && m.loc === loc && !m.reversedBy);

function count(b, user) {
  need(['DEVIR', 'SAYIM'].includes(b.type), 'Sayım tipi seçin');
  need(Array.isArray(b.lines) && b.lines.length, 'Satır ekleyin');
  const date = dateOf(b.date);
  const id = S.nextId('say', 'SAY'); const doc = { type: 'SAYIM', id, user };
  const out = [];
  for (const l of b.lines) {
    const m = S.mat(l.code); need(m, 'Malzeme bulunamadı: ' + l.code, 404);
    const counted = num(l.qty, 'Sayılan miktar'); need(counted >= 0, 'Miktar negatif olamaz');
    const loc = l.loc || 'EZM-DEPO'; need(D().locations.some(x => x.code === loc), 'Lokasyon geçersiz');
    let lot = m.lotTracking === 'YOK' ? '' : String(l.lot || '').trim();
    if (b.type === 'DEVIR') {
      need(counted > 0, `${l.code}: devir miktarı sıfırdan büyük olmalı`);
      const skt = optDate(l.skt, `${l.code}: SKT`);
      if (m.sktTracking) need(skt, `${l.code}: SKT zorunlu`);
      if (m.lotTracking === 'ZORUNLU' && !lot) lot = L.autoDevirLot(l.code, date);
      // Mevcut bir lota devir girilemez: lotun durum/SKT bilgisi bozulur, miktar mükerrer sayılır.
      if (lot) need(!L.lotInUse(l.code, lot), `${l.code}: ${lot} lotu zaten kayıtlı. Mevcut lotun miktarı için Sayım kullanın.`, 409);
      need(!devirExists(l.code, lot, loc), `${l.code}: bu lot/lokasyon için devir zaten girilmiş. Fark için Sayım kullanın.`, 409);
      L.registerLot(l.code, lot, skt, 'ONAYLI');
      L.addMove('DEVIR', l.code, lot, loc, counted, doc, { note: l.note });
      out.push({ code: l.code, lot, loc, counted, diff: counted });
    } else {
      // Sayım yalnızca sistemde kaydı bulunan lot/lokasyon için yapılır; yeni stok Devir veya Mal kabul ile girilir.
      need(m.lotTracking !== 'ZORUNLU' || lot, `${l.code}: lot takibi zorunlu, sayılan lotu seçin`);
      need(L.balances().has(L.balKey(l.code, lot, loc)), `${l.code}: ${lot || '(lotsuz)'} / ${loc} için sistemde kayıt yok. Yeni stok için Devir veya Mal kabul kullanın.`);
      const meta = L.lotMeta(l.code, lot); need(!meta || meta.status !== 'KAPALI', `${l.code}: ${lot} lotu kapatılmış`, 409);
      const cur = L.balOf(l.code, lot, loc);
      const diff = L.rq(counted - cur);
      if (diff === 0) { out.push({ code: l.code, lot, loc, counted, system: cur, diff: 0 }); continue; }
      need(l.reason && D().reasons.some(r => r.code === l.reason && r.category === 'SAYIM'), `${l.code}: fark için sayım neden kodu seçin`);
      L.addMove('SAYIM_DUZELTME', l.code, lot, loc, diff, doc, { reason: l.reason, note: l.note });
      out.push({ code: l.code, lot, loc, counted, system: cur, diff });
    }
  }
  const rec = { id, date, type: b.type, counter: b.counter || '', user, note: b.note || '', lines: out, cancelled: false };
  D().counts.push(rec);
  return rec;
}
module.exports = { count };
