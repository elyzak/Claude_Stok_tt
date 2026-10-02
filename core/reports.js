// Özet görünümler (salt okunur): stok durumu, pano.
const S = require('./store');
const L = require('./ledger');
const { todayIn, addDays } = require('../lib/time');
const D = () => S.get();

function stockSummary() {
  const rows = L.lotRows().filter(r => r.qty !== 0);
  const by = new Map();
  for (const m of D().materials) by.set(m.code, { code: m.code, name: m.name, type: m.type, unit: m.unit, category: m.category, minStock: m.minStock, active: m.active, total: 0, usable: 0, quarantine: 0, rejected: 0, expired: 0 });
  const t = todayIn();
  for (const r of rows) {
    const s = by.get(r.code); if (!s) continue;
    s.total = L.rq(s.total + r.qty);
    if (r.status === 'RED') s.rejected = L.rq(s.rejected + r.qty);
    else if (r.status === 'KARANTINA' || r.loc === 'EZM-KAR') s.quarantine = L.rq(s.quarantine + r.qty);
    else if (r.skt && r.skt < t) s.expired = L.rq(s.expired + r.qty);
    else s.usable = L.rq(s.usable + r.qty);
  }
  return { materials: [...by.values()], lots: rows };
}
function dashboard() {
  const t = todayIn(), soon = addDays(t, 30);
  const { materials, lots } = stockSummary();
  return {
    counts: { materials: D().materials.length, withStock: materials.filter(m => m.total > 0).length, movements: D().movements.length, productions: D().productions.filter(x => !x.cancelled).length },
    expiring: lots.filter(l => l.skt && l.qty > 0 && l.skt <= soon).sort((a, b) => a.skt.localeCompare(b.skt)).slice(0, 20),
    low: materials.filter(m => m.minStock && m.usable < m.minStock),
    quarantine: lots.filter(l => (l.loc === 'EZM-KAR' || l.status === 'KARANTINA' || l.status === 'RED') && l.qty > 0),
    products: materials.filter(m => m.type === 'MAMUL' && m.total > 0),
    recentMoves: D().movements.slice(-8).reverse(),
    draftRecipes: D().recipes.filter(r => r.status === 'TASLAK').length,
  };
}
module.exports = { stockSummary, dashboard };
