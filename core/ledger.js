// Stok defteri (ledger): hareketler, bakiyeler, lot üst verisi, FEFO tahsisi.
// Stok hiçbir yerde elle yazılmaz; bakiye = hareketlerin toplamıdır.
const S = require('./store');
const { yymmdd } = require('../lib/time');

const D = () => S.get();
const rq = n => Math.round((n + Number.EPSILON) * 1e6) / 1e6; // miktar hassasiyeti: 6 ondalık (KG için miligram)

const lotKey = (c, l) => c + '|' + (l || '');
const balKey = (c, l, loc) => c + '|' + (l || '') + '|' + loc;
function balances() {
  const m = new Map();
  for (const x of D().movements) { const k = balKey(x.code, x.lot, x.loc); m.set(k, (m.get(k) || 0) + x.qty); }
  return m;
}
const balOf = (code, lot, loc) => rq(balances().get(balKey(code, lot, loc)) || 0);

function addMove(type, code, lot, loc, qty, doc, extra = {}) {
  const mv = { id: S.nextId('mv', 'HRK'), ts: new Date().toISOString(), type, code, lot: lot || '', loc, qty: rq(qty), docType: doc.type, docId: doc.id,
    reason: extra.reason || '', user: doc.user, note: extra.note || '', reverses: extra.reverses || '', ref: extra.ref || '' };
  D().movements.push(mv);
  return mv;
}

// Lot "kullanımda" sayılır: iptal edilmemiş (ters kaydı olmayan) bir hareketi varsa. İptal edilen belgenin lotu yeniden kullanılabilir.
const lotInUse = (code, lot) => D().movements.some(m => m.code === code && m.lot === lot && !m.reversedBy && !m.reverses);
function nextLotNo(code, date, suffix, pad) {
  const prefix = code.replace('-', '') + '-' + yymmdd(date) + '-' + suffix;
  let n = 1; const fmt = k => (pad ? String(k).padStart(2, '0') : String(k));
  while (lotInUse(code, prefix + fmt(n))) n++;
  return prefix + fmt(n);
}
const autoLot = (code, date) => nextLotNo(code, date, '', true);          // MALZEME-YYMMDD-01
const autoMamulLot = (code, date) => nextLotNo(code, date, '', false);    // MM001-YYMMDD-1
const autoDevirLot = (code, date) => nextLotNo(code, date, 'D', true);    // MALZEME-YYMMDD-D01

const lotMeta = (code, lot) => D().lots[lotKey(code, lot)] || null;
function registerLot(code, lot, skt, status, extra = {}) {
  if (!lot) return;
  D().lots[lotKey(code, lot)] = { code, lot, skt: skt || '', status, supplierLot: extra.supplierLot || '', productionId: extra.productionId || '' };
}
function setLotStatus(code, lot, status) {
  const m = lotMeta(code, lot); if (m) m.status = status;
}

function lotRows() {
  const rows = [];
  for (const [k, q] of balances()) {
    const [code, lot, loc] = k.split('|');
    const m = S.mat(code); const meta = lotMeta(code, lot) || {};
    rows.push({ code, name: m ? m.name : code, type: m ? m.type : '', unit: m ? m.unit : '', lot, loc, qty: rq(q), skt: meta.skt || '', status: meta.status || (lot ? 'ONAYLI' : 'LOTSUZ'), lotTracking: m ? m.lotTracking : '' });
  }
  return rows;
}
// Tüketilebilir (FEFO) adaylar: depo/hat, ONAYLI/lotsuz, SKT geçmemiş, pozitif bakiye. Karantina/red/kapalı lot hiçbir zaman gelmez.
function usableLots(code, onDate, locs = ['EZM-DEPO', 'EZM-HAT1'], onlyLot) {
  return lotRows().filter(r => r.code === code && r.qty > 0 && locs.includes(r.loc) && (!onlyLot || r.lot === onlyLot)
    && (r.status === 'ONAYLI' || r.status === 'LOTSUZ') && !(r.skt && r.skt < onDate))
    .sort((a, b) => (a.skt || '9999').localeCompare(b.skt || '9999') || a.lot.localeCompare(b.lot) || a.loc.localeCompare(b.loc));
}
function allocate(code, qty, date, locs, onlyLot) {
  let left = rq(qty); const parts = [];
  for (const r of usableLots(code, date, locs, onlyLot)) {
    if (left <= 0) break;
    const take = rq(Math.min(left, r.qty));
    parts.push({ lot: r.lot, loc: r.loc, qty: take, skt: r.skt });
    left = rq(left - take);
  }
  return { parts, short: left };
}
module.exports = { rq, lotKey, balKey, balances, balOf, addMove, lotInUse, autoLot, autoMamulLot, autoDevirLot, lotMeta, registerLot, setLotStatus, lotRows, usableLots, allocate };
