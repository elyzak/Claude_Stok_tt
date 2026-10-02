// İzlenebilirlik: hammadde lotu → üretim → mamul lotu → sevkiyat, ve tersi.
// Yalnızca iptal edilmemiş hareketlerden hesaplanır (kaynak: stok defteri), ayrı bir kopya tutulmaz.
const S = require('./store');
const L = require('./ledger');
const { need } = require('./errors');
const D = () => S.get();
const live = m => !m.reversedBy && !m.reverses;

function lotInfo(code, lot) {
  const m = S.mat(code), meta = L.lotMeta(code, lot) || {};
  const rc = [...D().receipts].reverse().find(r => r.code === code && r.lot === lot && !r.cancelled);
  const sup = rc && D().suppliers.find(s => s.id === rc.supplier);
  return { code, name: m ? m.name : code, type: m ? m.type : '', unit: m ? m.unit : '', lot, skt: meta.skt || '', status: meta.status || '',
    supplier: rc ? { id: rc.supplier, name: sup ? sup.name : rc.supplier, supplierLot: rc.supplierLot, waybill: rc.waybill, receiptId: rc.id, date: rc.date } : null,
    stock: L.lotRows().filter(r => r.code === code && r.lot === lot && r.qty !== 0).map(r => ({ loc: r.loc, qty: r.qty })) };
}
// bir mamul lotunun sevkleri
function shipments(code, lot) {
  const by = new Map();
  for (const mv of D().movements.filter(x => live(x) && x.type === 'SEVK' && x.code === code && x.lot === lot)) {
    const d = D().dispatches.find(c => c.id === mv.docId);
    const e = by.get(mv.docId) || { docId: mv.docId, date: d ? d.date : '', docNo: d ? d.docNo : '', qty: 0 };
    e.qty = L.rq(e.qty - mv.qty); by.set(mv.docId, e);
  }
  return [...by.values()];
}
function producedBy(productionId) {
  return D().movements.filter(x => live(x) && x.docId === productionId && x.type === 'MAMUL_GIRIS').map(x => ({ code: x.code, lot: x.lot, qty: x.qty }));
}

function traceLot(code, lot) {
  need(S.mat(code), 'Malzeme bulunamadı', 404); need(lot, 'Lot seçin');
  need(L.lotMeta(code, lot) || D().movements.some(m => m.code === code && m.lot === lot), 'Lot bulunamadı', 404);
  const info = lotInfo(code, lot);
  // 1) Bu lot hangi üretimde kullanıldı → hangi mamul lotu oldu → nereye sevk edildi
  const uses = new Map();
  for (const mv of D().movements.filter(x => live(x) && x.type === 'URETIM_TUKETIM' && x.code === code && x.lot === lot)) {
    const e = uses.get(mv.docId) || { productionId: mv.docId, qty: 0 }; e.qty = L.rq(e.qty - mv.qty); uses.set(mv.docId, e);
  }
  const usedIn = [...uses.values()].map(u => {
    const p = D().productions.find(x => x.id === u.productionId);
    const outs = producedBy(u.productionId).map(o => ({ ...o, name: S.mat(o.code).name, skt: (L.lotMeta(o.code, o.lot) || {}).skt || '', shipments: shipments(o.code, o.lot) }));
    return { productionId: u.productionId, date: p ? p.date : '', consumedQty: u.qty, unit: info.unit, outputs: outs };
  });
  // 2) Bu lot hangi üretimde, hangi hammadde lotlarından yapıldı
  const madeBy = [];
  for (const mv of D().movements.filter(x => live(x) && x.type === 'MAMUL_GIRIS' && x.code === code && x.lot === lot)) {
    const p = D().productions.find(x => x.id === mv.docId);
    const inputs = new Map();
    for (const c of D().movements.filter(x => live(x) && x.type === 'URETIM_TUKETIM' && x.docId === mv.docId)) {
      const k = c.code + '|' + c.lot; const e = inputs.get(k) || { ...lotInfo(c.code, c.lot), qty: 0 }; e.qty = L.rq(e.qty - c.qty); inputs.set(k, e);
    }
    madeBy.push({ productionId: mv.docId, date: p ? p.date : '', producedQty: mv.qty, recipeId: p ? p.recipeId : '', recipeVersion: p ? p.recipeVersion : '', inputs: [...inputs.values()] });
  }
  return { lot: info, madeBy, usedIn, shipments: info.type === 'MAMUL' ? shipments(code, lot) : [] };
}
module.exports = { traceLot };
