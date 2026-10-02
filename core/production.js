// Üretim: reçete → önizleme (hangi hammadde/lot, ne kadar) → kayıt (tüketim + mamul girişi tek işlemde).
const S = require('./store');
const L = require('./ledger');
const R = require('./recipes');
const { need, num, dateOf } = require('./errors');
const { addDays } = require('../lib/time');
const D = () => S.get();

const cnt = (v, name) => { const n = v === '' || v == null ? 0 : num(v, name); need(Number.isInteger(n) && n >= 0, `${name} sıfır veya pozitif tam sayı olmalı`); return n; };

function plan(b) {
  const p = S.prod(b.productCode); need(p, 'Ürün seçin', 404);
  need(p.status !== 'PASIF', 'Pasif ürün için üretim yapılamaz', 409);
  need(p.targetFill && p.jarsPerBox, 'Ürün kartında hedef dolum ve koli içi adet eksik (Ürünler ekranından tamamlayın)');
  need(p.shelfLifeDays, 'Ürün kartında raf ömrü eksik (mamul SKT hesaplanamıyor)');
  const rec = R.activeRecipe(b.productCode); need(rec, 'Bu ürün için ONAYLI reçete yok', 409);
  const date = dateOf(b.date);
  const pallets = cnt(b.pallets, 'Palet'), boxes = cnt(b.boxes, 'Koli'), jars = cnt(b.jars, 'Kavanoz');
  if (pallets > 0) need(p.boxesPerPallet, 'Ürün kartında koli/palet eksik');
  const totalJars = pallets * (p.boxesPerPallet || 0) * p.jarsPerBox + boxes * p.jarsPerBox + jars;
  need(totalJars > 0, 'Üretim miktarı girin');
  const totalBoxes = Math.ceil(totalJars / p.jarsPerBox);
  const totalPallets = p.boxesPerPallet ? Math.ceil(totalBoxes / p.boxesPerPallet) : 0;
  const fillKg = L.rq(totalJars * p.targetFill / 1000);
  const baseQty = { KG_DOLGU: fillKg, KAVANOZ: totalJars, KOLI: totalBoxes, PALET: totalPallets };
  const lines = rec.lines.map(l => {
    const m = S.mat(l.material); need(m.active, `${l.material} pasif malzeme; reçete güncellenmeli`, 409);
    let theo = baseQty[l.base] * R.lineFactor(l, m) * (1 + (l.fire || 0));
    if (l.rounding === 'YUKARI') theo = Math.ceil(theo);
    theo = L.rq(theo);
    const al = theo > 0 ? L.allocate(l.material, theo, date) : { parts: [], short: 0 };
    const avail = L.rq(L.usableLots(l.material, date).reduce((s, r) => s + r.qty, 0));
    return { code: l.material, name: m.name, unit: m.unit, perUnit: l.qty, perUnitUnit: l.unit, base: l.base, fire: l.fire, rounding: l.rounding, baseQty: baseQty[l.base], need: theo, available: avail, ok: al.short <= 0, parts: al.parts, short: al.short };
  });
  const t = R.totals(rec);
  return { product: p, recipe: { id: rec.id, version: rec.version, totals: t }, date, totalJars, totalBoxes, totalPallets, fillKg, ratio: t.totalPct, lines, ok: lines.every(l => l.ok), skt: addDays(date, p.shelfLifeDays) };
}

function record(b, user) {
  // Önizleme-onay: kayıt, kullanıcının gördüğü önizlemeyle birebir aynı hesaba dayanmalı.
  need(b.expect && typeof b.expect === 'object', 'Önizleme onayı eksik: önce "Hesapla / önizle" yapın');
  const pl = plan(b);
  need(b.expect.recipeId === pl.recipe.id && Number(b.expect.totalJars) === pl.totalJars && Math.abs(Number(b.expect.fillKg) - pl.fillKg) < 0.0005,
    'Önizleme güncel değil (miktar veya reçete değişti). Tekrar "Hesapla / önizle" yapın.', 409);
  need(pl.ok, 'Stok yetersiz: ' + pl.lines.filter(l => !l.ok).map(l => l.code).join(', '), 409);
  const lot = String(b.lot || '').trim() || L.autoMamulLot(b.productCode, pl.date);
  need(!L.lotInUse(b.productCode, lot), 'Mamul lot zaten kayıtlı: ' + lot, 409);
  need(D().locations.some(x => x.code === (b.line || 'EZM-HAT1') && x.type === 'HAT'), 'Hat geçersiz');
  const id = S.nextId('urt', 'URT'); const doc = { type: 'URETIM', id, user };
  for (const l of pl.lines) for (const pt of l.parts) L.addMove('URETIM_TUKETIM', l.code, pt.lot, pt.loc, -pt.qty, doc, { ref: lot });
  L.registerLot(b.productCode, lot, pl.skt, 'ONAYLI', { productionId: id });
  L.addMove('MAMUL_GIRIS', b.productCode, lot, 'EZM-DEPO', pl.totalJars, doc);
  const rec = { id, date: pl.date, shift: b.shift || '1', line: b.line || 'EZM-HAT1', productCode: b.productCode, recipeId: pl.recipe.id, recipeVersion: pl.recipe.version,
    pallets: Number(b.pallets) || 0, boxes: Number(b.boxes) || 0, jars: Number(b.jars) || 0, totalJars: pl.totalJars, fillKg: pl.fillKg, lot, skt: pl.skt, status: 'TAMAMLANDI', user, note: b.note || '', cancelled: false };
  D().productions.push(rec);
  return rec;
}
module.exports = { plan, record };
