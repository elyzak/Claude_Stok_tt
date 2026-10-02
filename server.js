// Trabzon Tarım - Ezme Krema Stok Sistemi (Faz 2) - sıfır bağımlılıklı Node sunucusu.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { build } = require('./seed');
const { todayIn, isIsoDate, addDays, yymmdd } = require('./lib/time');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MAX_BODY = 1e6;
let DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
let DB_FILE = path.join(DATA_DIR, 'db.json');

// ---------- Veri deposu ----------
let db;
function load(dir) {
  if (dir) { DATA_DIR = dir; DB_FILE = path.join(DATA_DIR, 'db.json'); }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  else {
    db = { ...build(), lots: {}, movements: [], receipts: [], productions: [], dispatches: [], counts: [], seq: {} };
    save();
  }
}
function save() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}
const r3 = n => Math.round((n + Number.EPSILON) * 1000) / 1000;
const nextId = (key, prefix) => { db.seq[key] = (db.seq[key] || 0) + 1; return prefix + '-' + String(db.seq[key]).padStart(6, '0'); };
const today = () => todayIn();
const mat = code => db.materials.find(m => m.code === code);
const prod = code => db.products.find(p => p.code === code);
// Hata sınıfı: 400 doğrulama, 401/403 kullanıcı, 404 bulunamadı, 409 çakışma/durum uyuşmazlığı.
class Err extends Error { constructor(m, status = 400) { super(m); this.status = status; } }
const need = (c, m, status = 400) => { if (!c) throw new Err(m, status); };
const num = (v, name) => { need(v !== '' && v !== null && v !== undefined, `${name} girilmeli`); const n = Number(v); need(Number.isFinite(n), `${name} sayı olmalı`); return n; };
const dateOf = (v, name = 'Tarih') => { if (v === undefined || v === null || v === '') return today(); need(isIsoDate(v), `${name} geçerli bir tarih olmalı (YYYY-AA-GG)`); return v; };
const optDate = (v, name) => { if (v === undefined || v === null || v === '') return ''; need(isIsoDate(v), `${name} geçerli bir tarih olmalı (YYYY-AA-GG)`); return v; };

// ---------- Defter (ledger) ----------
const lotKey = (c, l) => c + '|' + (l || '');
const balKey = (c, l, loc) => c + '|' + (l || '') + '|' + loc;
function balances() {
  const m = new Map();
  for (const x of db.movements) { const k = balKey(x.code, x.lot, x.loc); m.set(k, (m.get(k) || 0) + x.qty); }
  return m;
}
const balOf = (code, lot, loc) => r3(balances().get(balKey(code, lot, loc)) || 0);

function addMove(type, code, lot, loc, qty, doc, extra = {}) {
  const mv = { id: nextId('mv', 'HRK'), ts: new Date().toISOString(), type, code, lot: lot || '', loc, qty: r3(qty), docType: doc.type, docId: doc.id, reason: extra.reason || '', user: doc.user, note: extra.note || '', reverses: extra.reverses || '' };
  db.movements.push(mv);
  return mv;
}
// Lot "kullanımda" sayılır: iptal edilmemiş (ters kaydı olmayan) bir hareketi varsa.
// İptal edilen belgenin lotu yeniden kullanılabilir.
function lotInUse(code, lot) {
  return db.movements.some(m => m.code === code && m.lot === lot && !m.reversedBy && !m.reverses);
}
function autoLot(code, date) {
  const prefix = code.replace('-', '') + '-' + yymmdd(date) + '-';
  let n = 1;
  while (lotInUse(code, prefix + String(n).padStart(2, '0'))) n++;
  return prefix + String(n).padStart(2, '0');
}
function autoMamulLot(code, date) {
  const prefix = code.replace('-', '') + '-' + yymmdd(date) + '-';
  let n = 1;
  while (lotInUse(code, prefix + n)) n++;
  return prefix + n;
}
// Yeniden kullanılan (eski kaydı iptal edilmiş) lotun üst verisi sıfırdan yazılır.
function registerLot(code, lot, skt, status, supplierLot = '') {
  if (!lot) return;
  db.lots[lotKey(code, lot)] = { code, lot, skt: skt || '', status, supplierLot };
}
function lotRows() {
  const rows = [];
  for (const [k, q] of balances()) {
    const [code, lot, loc] = k.split('|');
    const m = mat(code); const meta = db.lots[lotKey(code, lot)] || {};
    rows.push({ code, name: m ? m.name : code, type: m ? m.type : '', unit: m ? m.unit : '', lot, loc, qty: r3(q), skt: meta.skt || '', status: meta.status || (lot ? 'ONAYLI' : 'LOTSUZ'), lotTracking: m ? m.lotTracking : '' });
  }
  return rows;
}
// Tüketilebilir (FEFO) adaylar: depo/hat, ONAYLI, SKT geçmemiş, pozitif bakiye
function usableLots(code, onDate, locs = ['EZM-DEPO', 'EZM-HAT1'], onlyLot) {
  return lotRows().filter(r => r.code === code && r.qty > 0 && locs.includes(r.loc) && (!onlyLot || r.lot === onlyLot)
    && (r.status === 'ONAYLI' || r.status === 'LOTSUZ') && !(r.skt && r.skt < onDate))
    .sort((a, b) => (a.skt || '9999').localeCompare(b.skt || '9999') || a.lot.localeCompare(b.lot) || a.loc.localeCompare(b.loc));
}
function allocate(code, qty, date, locs, onlyLot) {
  let left = r3(qty); const parts = [];
  for (const r of usableLots(code, date, locs, onlyLot)) {
    if (left <= 0) break;
    const take = r3(Math.min(left, r.qty));
    parts.push({ lot: r.lot, loc: r.loc, qty: take, skt: r.skt });
    left = r3(left - take);
  }
  return { parts, short: left };
}

// ---------- Mal kabul ----------
function receipt(b, user) {
  const m = mat(b.code); need(m, 'Malzeme bulunamadı', 404);
  const sup = db.suppliers.find(s => s.id === b.supplier); need(sup, 'Tedarikçi seçin');
  const qty = num(b.qty, 'Miktar'); need(qty > 0, 'Miktar sıfırdan büyük olmalı');
  const date = dateOf(b.date);
  const result = b.result || 'KABUL'; need(['KABUL', 'KARANTINA', 'RED'].includes(result), 'Geçersiz kontrol sonucu');
  const skt = optDate(b.skt, 'SKT');
  if (m.sktTracking && result !== 'RED') need(skt, 'Bu malzeme için SKT zorunlu');
  if (m.sktTracking && skt) need(skt >= date, 'SKT kabul tarihinden önce olamaz');
  const unitPrice = b.unitPrice === '' || b.unitPrice == null ? null : num(b.unitPrice, 'Birim fiyat');
  if (unitPrice !== null) need(unitPrice >= 0, 'Birim fiyat negatif olamaz');
  let lot = m.lotTracking === 'YOK' ? '' : (b.lot || '').trim();
  if (result !== 'RED') {
    if (m.lotTracking === 'ZORUNLU' && !lot) lot = autoLot(b.code, date);
    if (lot) need(!lotInUse(b.code, lot), `Lot zaten kayıtlı: ${lot}`, 409);
  } else lot = '';
  const id = nextId('mk', 'MK'); const doc = { type: 'MALZEME_GIRISI', id, user };
  if (result !== 'RED') {
    registerLot(b.code, lot, skt, result === 'KARANTINA' ? 'KARANTINA' : 'ONAYLI', b.supplierLot || '');
    addMove(sup.id === 'ENTEGRE' ? 'ENTEGRE_TRANSFER' : 'ALIS', b.code, lot, result === 'KARANTINA' ? 'EZM-KAR' : 'EZM-DEPO', qty, doc, { note: b.note });
  }
  const rec = { id, date, supplier: sup.id, waybill: b.waybill || '', code: b.code, qty, lot, supplierLot: b.supplierLot || '', skt, result, user, note: b.note || '',
    unitPrice, currency: b.currency || '', cancelled: false };
  rec.total = rec.unitPrice != null ? r3(rec.unitPrice * qty) : null;
  db.receipts.push(rec);
  return rec;
}

// ---------- Üretim ----------
function activeRecipe(code) { return db.recipes.find(r => r.productCode === code && r.status === 'ONAYLI'); }
function productionPlan(b) {
  const p = prod(b.productCode); need(p, 'Ürün seçin');
  need(p.targetFill && p.jarsPerBox, 'Ürün kartında hedef dolum ve koli adedi eksik (Ürünler ekranından tamamlayın)');
  const rec = activeRecipe(b.productCode); need(rec, 'Bu ürün için ONAYLI reçete yok');
  const date = dateOf(b.date);
  const cnt = (v, name) => { const n = v === '' || v == null ? 0 : num(v, name); need(Number.isInteger(n) && n >= 0, `${name} sıfır veya pozitif tam sayı olmalı`); return n; };
  const pallets = cnt(b.pallets, 'Palet'), boxes = cnt(b.boxes, 'Koli'), jars = cnt(b.jars, 'Kavanoz');
  let totalJars = pallets * (p.boxesPerPallet || 0) * p.jarsPerBox + boxes * p.jarsPerBox + jars;
  if (pallets > 0) need(p.boxesPerPallet, 'Ürün kartında koli/palet eksik');
  need(totalJars > 0, 'Üretim miktarı girin');
  const totalBoxes = Math.ceil(totalJars / p.jarsPerBox);
  const totalPallets = p.boxesPerPallet ? Math.ceil(totalBoxes / p.boxesPerPallet) : 0;
  const fillKg = r3(totalJars * p.targetFill / 1000);
  const baseQty = { KG_DOLGU: fillKg, KAVANOZ: totalJars, KOLI: totalBoxes, PALET: totalPallets };
  const lines = rec.lines.map(l => {
    let theo = baseQty[l.base] * l.qty * (1 + (l.fire || 0));
    if (l.rounding === 'YUKARI') theo = Math.ceil(theo);
    theo = r3(theo);
    const m = mat(l.material);
    const al = theo > 0 ? allocate(l.material, theo, date) : { parts: [], short: 0 };
    const avail = r3(usableLots(l.material, date).reduce((s, r) => s + r.qty, 0));
    return { code: l.material, name: m ? m.name : l.material, unit: m ? m.unit : '', perUnit: l.qty, base: l.base, fire: l.fire, rounding: l.rounding, baseQty: baseQty[l.base], need: theo, available: avail, ok: al.short <= 0, parts: al.parts, short: al.short };
  });
  const ratio = r3(rec.lines.filter(l => l.base === 'KG_DOLGU').reduce((s, l) => s + l.qty, 0) * 100);
  return { product: p, recipe: rec, date, totalJars, totalBoxes, totalPallets, fillKg, ratio, lines, ok: lines.every(l => l.ok), skt: addDays(date, p.shelfLifeDays || 365) };
}
function production(b, user) {
  // Önizleme-onay: kayıt, kullanıcının gördüğü önizlemeyle birebir aynı hesaba dayanmalı.
  need(b.expect && typeof b.expect === 'object', 'Önizleme onayı eksik: önce "Hesapla / önizle" yapın');
  const plan = productionPlan(b);
  need(b.expect.recipeId === plan.recipe.id && Number(b.expect.totalJars) === plan.totalJars && Math.abs(Number(b.expect.fillKg) - plan.fillKg) < 0.0005,
    'Önizleme güncel değil (miktar veya reçete değişti). Tekrar "Hesapla / önizle" yapın.', 409);
  need(plan.ok, 'Stok yetersiz: ' + plan.lines.filter(l => !l.ok).map(l => l.code).join(', '), 409);
  const lot = (b.lot || '').trim() || autoMamulLot(b.productCode, plan.date);
  need(!lotInUse(b.productCode, lot), 'Mamul lot zaten kayıtlı: ' + lot, 409);
  need(db.locations.some(x => x.code === (b.line || 'EZM-HAT1') && x.type === 'HAT'), 'Hat geçersiz');
  const id = nextId('urt', 'URT'); const doc = { type: 'URETIM', id, user };
  for (const l of plan.lines) for (const pt of l.parts) addMove('URETIM_TUKETIM', l.code, pt.lot, pt.loc, -pt.qty, doc);
  registerLot(b.productCode, lot, plan.skt, 'ONAYLI');
  addMove('MAMUL_GIRIS', b.productCode, lot, 'EZM-DEPO', plan.totalJars, doc);
  const rec = { id, date: plan.date, shift: b.shift || '1', line: b.line || 'EZM-HAT1', productCode: b.productCode, recipeId: plan.recipe.id, pallets: Number(b.pallets) || 0, boxes: Number(b.boxes) || 0, jars: Number(b.jars) || 0,
    totalJars: plan.totalJars, fillKg: plan.fillKg, lot, skt: plan.skt, status: 'TAMAMLANDI', user, note: b.note || '', cancelled: false };
  db.productions.push(rec);
  return rec;
}

// ---------- Mamul çıkışı ----------
function dispatch(b, user) {
  const p = prod(b.productCode); need(p, 'Ürün seçin', 404);
  const q = num(b.qty, 'Miktar'); need(q > 0, 'Miktar sıfırdan büyük olmalı');
  const shape = b.shape || 'ADET';
  let jars = q;
  if (shape === 'KOLI') { need(p.jarsPerBox, 'Ürün kartında koli adedi eksik'); jars = q * p.jarsPerBox; }
  if (shape === 'PALET') { need(p.jarsPerBox && p.boxesPerPallet, 'Ürün kartında koli/palet eksik'); jars = q * p.boxesPerPallet * p.jarsPerBox; }
  need(Number.isInteger(jars), 'Çıkış adedi tam sayı olmalı');
  need(['ADET', 'KOLI', 'PALET'].includes(shape), 'Çıkış şekli geçersiz');
  const dtype = b.type || 'SEVKIYAT'; need(['SEVKIYAT', 'FIRE'].includes(dtype), 'İşlem türü geçersiz');
  if (dtype === 'FIRE') need(b.reason, 'Fire için neden kodu seçin');
  const date = dateOf(b.date); const loc = b.loc || 'EZM-DEPO'; need(db.locations.some(x => x.code === loc), 'Lokasyon geçersiz');
  const al = allocate(b.productCode, jars, date, [loc], b.lot || undefined);
  need(al.short <= 0, `Stok yetersiz: ${r3(jars - al.short)} adet çıkılabilir, ${jars} istendi`, 409);
  const id = nextId('cik', 'CIK'); const doc = { type: 'MAMUL_CIKISI', id, user };
  for (const pt of al.parts) addMove(dtype === 'FIRE' ? 'FIRE' : 'SEVK', b.productCode, pt.lot, pt.loc, -pt.qty, doc, { reason: b.reason, note: b.note });
  const rec = { id, date, type: dtype, productCode: b.productCode, shape, qty: q, jars, lots: al.parts.map(x => `${x.lot} (${x.qty})`).join(', '), loc, docNo: b.docNo || '', user, note: b.note || '', cancelled: false };
  db.dispatches.push(rec);
  return rec;
}

// ---------- Sayım / devir ----------
function autoDevirLot(code, date) {
  const prefix = code.replace('-', '') + '-' + yymmdd(date) + '-D';
  let n = 1;
  while (lotInUse(code, prefix + String(n).padStart(2, '0'))) n++;
  return prefix + String(n).padStart(2, '0');
}
const devirExists = (code, lot, loc) => db.movements.some(m => m.type === 'DEVIR' && m.code === code && m.lot === lot && m.loc === loc && !m.reversedBy);
function count(b, user) {
  need(['DEVIR', 'SAYIM'].includes(b.type), 'Sayım tipi seçin');
  need(Array.isArray(b.lines) && b.lines.length, 'Satır ekleyin');
  const date = dateOf(b.date);
  const id = nextId('say', 'SAY'); const doc = { type: 'SAYIM', id, user };
  const out = [];
  for (const l of b.lines) {
    const m = mat(l.code); need(m, 'Malzeme bulunamadı: ' + l.code, 404);
    const counted = num(l.qty, 'Sayılan miktar'); need(counted >= 0, 'Miktar negatif olamaz');
    const loc = l.loc || 'EZM-DEPO'; need(db.locations.some(x => x.code === loc), 'Lokasyon geçersiz');
    let lot = m.lotTracking === 'YOK' ? '' : (l.lot || '').trim();
    if (b.type === 'DEVIR') {
      need(counted > 0, `${l.code}: devir miktarı sıfırdan büyük olmalı`);
      const skt = optDate(l.skt, `${l.code}: SKT`);
      if (m.sktTracking) need(skt, `${l.code}: SKT zorunlu`);
      if (m.lotTracking === 'ZORUNLU' && !lot) lot = autoDevirLot(l.code, date);
      // Mevcut bir lota devir girilemez: lotun durum/SKT bilgisi bozulur, miktar mükerrer sayılır.
      if (lot) need(!lotInUse(l.code, lot), `${l.code}: ${lot} lotu zaten kayıtlı. Mevcut lotun miktarı için Sayım kullanın.`, 409);
      need(!devirExists(l.code, lot, loc), `${l.code}: bu lot/lokasyon için devir zaten girilmiş. Fark için Sayım kullanın.`, 409);
      registerLot(l.code, lot, skt, 'ONAYLI');
      addMove('DEVIR', l.code, lot, loc, counted, doc, { note: l.note });
      out.push({ code: l.code, lot, loc, counted, diff: counted });
    } else {
      // Sayım yalnızca sistemde kaydı bulunan lot/lokasyon için yapılır; yeni stok Devir veya Mal kabul ile girilir.
      need(m.lotTracking !== 'ZORUNLU' || lot, `${l.code}: lot takibi zorunlu, sayılan lotu seçin`);
      need(balances().has(balKey(l.code, lot, loc)), `${l.code}: ${lot || '(lotsuz)'} / ${loc} için sistemde kayıt yok. Yeni stok için Devir veya Mal kabul kullanın.`);
      const cur = balOf(l.code, lot, loc);
      const diff = r3(counted - cur);
      if (diff === 0) { out.push({ code: l.code, lot, loc, counted, system: cur, diff: 0 }); continue; }
      need(l.reason && db.reasons.some(r => r.code === l.reason && r.category === 'SAYIM'), `${l.code}: fark için sayım neden kodu seçin`);
      addMove('SAYIM_DUZELTME', l.code, lot, loc, diff, doc, { reason: l.reason, note: l.note });
      out.push({ code: l.code, lot, loc, counted, system: cur, diff });
    }
  }
  const rec = { id, date, type: b.type, counter: b.counter || '', user, note: b.note || '', lines: out, cancelled: false };
  db.counts.push(rec);
  return rec;
}

// ---------- İptal (ters kayıt) ----------
function cancelDoc(docId, reason, user) {
  need(typeof docId === 'string', 'Belge no geçersiz');
  const list = { MK: 'receipts', URT: 'productions', CIK: 'dispatches', SAY: 'counts' }[docId.split('-')[0]];
  need(list, 'Belge türü tanınmadı', 404);
  const rec = db[list].find(x => x.id === docId); need(rec, 'Belge bulunamadı', 404); need(!rec.cancelled, 'Belge zaten iptal edilmiş', 409);
  need(reason, 'İptal nedeni yazın');
  const orig = db.movements.filter(m => m.docId === docId && !m.reverses);
  const delta = new Map();
  for (const m of orig) { const k = balKey(m.code, m.lot, m.loc); delta.set(k, (delta.get(k) || 0) - m.qty); }
  const bal = balances();
  for (const [k, d] of delta) need(r3((bal.get(k) || 0) + d) >= 0, `İptal edilemez: ${k.split('|')[0]} / ${k.split('|')[1] || '-'} lotundan sonraki hareketlerle stok kullanılmış`, 409);
  const doc = { type: 'IPTAL', id: docId, user };
  for (const m of orig) {
    const rv = addMove('TERS_KAYIT', m.code, m.lot, m.loc, -m.qty, doc, { reverses: m.id, note: 'İptal: ' + reason });
    m.reversedBy = rv.id;
  }
  rec.cancelled = true; rec.cancelReason = reason;
  return rec;
}

// ---------- Reçete yönetimi ----------
function recipeDraft(b, user) {
  need(prod(b.productCode), 'Ürün seçin');
  need(Array.isArray(b.lines) && b.lines.length, 'En az bir kalem girin');
  const ver = Math.max(0, ...db.recipes.filter(r => r.productCode === b.productCode).map(r => r.version)) + 1;
  const lines = b.lines.map(l => {
    need(mat(l.material), 'Malzeme bulunamadı: ' + l.material);
    need(['KG_DOLGU', 'KAVANOZ', 'KOLI', 'PALET'].includes(l.base), 'Hesap bazı geçersiz');
    return { material: l.material, qty: num(l.qty, 'Miktar'), base: l.base, fire: (num(l.fire || 0, 'Fire') / 100), rounding: l.rounding === 'YUKARI' ? 'YUKARI' : 'YOK', critical: !!l.critical };
  });
  const rec = { id: `REC-${b.productCode.replace('-', '')}-V${ver}`, productCode: b.productCode, version: ver, status: 'TASLAK', description: b.description || '', qualityApprover: '', productionApprover: '', validFrom: '', lines, createdBy: user };
  db.recipes.push(rec);
  return rec;
}
function recipeApprove(id, b) {
  const rec = db.recipes.find(r => r.id === id); need(rec, 'Reçete bulunamadı'); need(rec.status === 'TASLAK', 'Yalnızca TASLAK reçete onaylanır');
  need(b.quality && b.production, 'Kalite ve üretim onaylayanı yazın');
  const kg = r3(rec.lines.filter(l => l.base === 'KG_DOLGU').reduce((s, l) => s + l.qty, 0) * 100);
  need(Math.abs(kg - 100) < 0.01, `Dolgu oranları toplamı %100 olmalı (şu an %${kg})`);
  db.recipes.filter(r => r.productCode === rec.productCode && r.status === 'ONAYLI').forEach(r => r.status = 'PASIF');
  Object.assign(rec, { status: 'ONAYLI', qualityApprover: b.quality, productionApprover: b.production, validFrom: today() });
  return rec;
}

// ---------- Tanımlar ----------
function newMaterial(b) {
  need(b.name && b.type && b.unit, 'Ad, tip ve birim zorunlu');
  const pre = { HAMMADDE: 'HM', AMBALAJ: 'AM', YARI_MAMUL: 'YM', MAMUL: 'MM' }[b.type]; need(pre, 'Tip geçersiz');
  const n = Math.max(0, ...db.materials.filter(m => m.code.startsWith(pre + '-')).map(m => Number(m.code.slice(3)))) + 1;
  const m = { code: `${pre}-${String(n).padStart(3, '0')}`, name: b.name, type: b.type, unit: b.unit, category: b.category || '', lotTracking: b.lotTracking || 'ZORUNLU', sktTracking: b.type !== 'AMBALAJ', allergens: b.allergens || '', minStock: b.minStock ? Number(b.minStock) : null, active: true };
  db.materials.push(m);
  if (b.type === 'MAMUL') db.products.push({ code: m.code, brand: b.brand || '', nominal: Number(b.nominal) || null, targetFill: Number(b.targetFill) || null, jarsPerBox: Number(b.jarsPerBox) || null, boxesPerPallet: Number(b.boxesPerPallet) || null, shelfLifeDays: Number(b.shelfLifeDays) || 365, status: 'TEYIT', note: '', newCode: '' });
  return m;
}

// ---------- Özetler ----------
function stockSummary() {
  const rows = lotRows().filter(r => r.qty !== 0);
  const by = new Map();
  for (const m of db.materials) by.set(m.code, { code: m.code, name: m.name, type: m.type, unit: m.unit, category: m.category, minStock: m.minStock, total: 0, usable: 0, quarantine: 0, expired: 0 });
  const t = today();
  for (const r of rows) {
    const s = by.get(r.code); if (!s) continue;
    s.total = r3(s.total + r.qty);
    if (r.status === 'KARANTINA' || r.loc === 'EZM-KAR') s.quarantine = r3(s.quarantine + r.qty);
    else if (r.skt && r.skt < t) s.expired = r3(s.expired + r.qty);
    else s.usable = r3(s.usable + r.qty);
  }
  return { materials: [...by.values()], lots: rows };
}
function dashboard() {
  const t = today(), soon = addDays(t, 30);
  const { materials, lots } = stockSummary();
  return {
    counts: { materials: db.materials.length, withStock: materials.filter(m => m.total > 0).length, movements: db.movements.length, productions: db.productions.filter(x => !x.cancelled).length },
    expiring: lots.filter(l => l.skt && l.qty > 0 && l.skt <= soon).sort((a, b) => a.skt.localeCompare(b.skt)).slice(0, 20),
    low: materials.filter(m => m.minStock && m.usable < m.minStock),
    quarantine: lots.filter(l => l.loc === 'EZM-KAR' && l.qty > 0),
    products: materials.filter(m => m.type === 'MAMUL' && m.total > 0),
    recentMoves: db.movements.slice(-8).reverse(),
    draftRecipes: db.recipes.filter(r => r.status === 'TASLAK').length,
  };
}

// ---------- HTTP ----------
// Durum kodları: 400 doğrulama · 401 kullanıcı yok · 403 yetkisiz kullanıcı · 404 bulunamadı · 405 yöntem · 409 çakışma/durum · 413 büyük istek · 500 beklenmeyen
const routes = [];
const route = (method, pattern, fn, opts = {}) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn, readonly: method === 'GET' || !!opts.readonly });
const userOf = req => {
  const e = (req.headers['x-user'] || '').toString();
  need(e, 'Kullanıcı seçin', 401);
  const u = db.users.find(x => x.email === e && x.active); need(u, 'Kullanıcı tanımlı değil veya pasif', 403);
  return u.email;
};
const hasMovements = code => db.movements.some(m => m.code === code);
const optNum = (v, name, { int = false, min = 0, positive = false } = {}) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = num(v, name);
  need(positive ? n > 0 : n >= min, positive ? `${name} sıfırdan büyük olmalı` : `${name} negatif olamaz`);
  if (int) need(Number.isInteger(n), `${name} tam sayı olmalı`);
  return n;
};

route('GET', '/api/bootstrap', () => ({ materials: db.materials, products: db.products, recipes: db.recipes, locations: db.locations, suppliers: db.suppliers, reasons: db.reasons, users: db.users, mapping: db.mapping, today: today() }));
route('GET', '/api/dashboard', () => dashboard());
route('GET', '/api/stock', () => stockSummary());
route('GET', '/api/movements', () => ({ rows: db.movements.slice().reverse().slice(0, 1000) }));
route('GET', '/api/docs/:kind', (_, __, p) => { const k = { receipts: 'receipts', productions: 'productions', dispatches: 'dispatches', counts: 'counts' }[p.kind]; need(k, 'Bilinmeyen belge türü', 404); return { rows: db[k].slice().reverse() }; });
route('POST', '/api/receipt', (req, b) => receipt(b, userOf(req)));
route('POST', '/api/production/preview', (_, b) => productionPlan(b), { readonly: true });
route('POST', '/api/production', (req, b) => production(b, userOf(req)));
route('POST', '/api/dispatch', (req, b) => dispatch(b, userOf(req)));
route('POST', '/api/count', (req, b) => count(b, userOf(req)));
route('POST', '/api/cancel/:id', (req, b, p) => cancelDoc(p.id, b.reason, userOf(req)));
route('POST', '/api/recipes', (req, b) => recipeDraft(b, userOf(req)));
route('POST', '/api/recipes/:id/approve', (req, b, p) => { userOf(req); return recipeApprove(p.id, b); });
route('POST', '/api/materials', (req, b) => { userOf(req); return newMaterial(b); });
route('PUT', '/api/materials/:code', (req, b, p) => {
  userOf(req); const m = mat(p.code); need(m, 'Malzeme bulunamadı', 404);
  const upd = {};
  if ('name' in b) { need(typeof b.name === 'string' && b.name.trim(), 'Ad boş olamaz'); upd.name = b.name.trim(); }
  if ('category' in b) upd.category = String(b.category || '');
  if ('allergens' in b) upd.allergens = String(b.allergens || '');
  if ('lotTracking' in b && b.lotTracking !== m.lotTracking) {
    need(['ZORUNLU', 'OPSIYONEL', 'YOK'].includes(b.lotTracking), 'Lot takibi değeri geçersiz');
    need(!hasMovements(m.code), 'Hareketi olan malzemenin lot takibi değiştirilemez', 409);
    upd.lotTracking = b.lotTracking;
  }
  if ('active' in b) { need(typeof b.active === 'boolean', 'Aktif alanı true/false olmalı'); upd.active = b.active; }
  if ('minStock' in b) upd.minStock = optNum(b.minStock, 'Minimum stok');
  return Object.assign(m, upd);
});
route('PUT', '/api/products/:code', (req, b, p) => {
  userOf(req); const x = prod(p.code); need(x, 'Ürün bulunamadı', 404);
  const upd = {};
  if ('nominal' in b) upd.nominal = optNum(b.nominal, 'Nominal gram', { positive: true });
  if ('targetFill' in b) upd.targetFill = optNum(b.targetFill, 'Hedef dolum', { positive: true });
  if ('jarsPerBox' in b) upd.jarsPerBox = optNum(b.jarsPerBox, 'Kavanoz/koli', { positive: true, int: true });
  if ('boxesPerPallet' in b) upd.boxesPerPallet = optNum(b.boxesPerPallet, 'Koli/palet', { positive: true, int: true });
  if ('shelfLifeDays' in b) upd.shelfLifeDays = optNum(b.shelfLifeDays, 'Raf ömrü', { positive: true, int: true });
  if ('status' in b) { need(['AKTIF', 'TEYIT', 'BEKLEME', 'PASIF'].includes(b.status), 'Durum geçersiz'); upd.status = b.status; }
  for (const k of ['note', 'brand']) if (k in b) upd[k] = String(b[k] || '');
  return Object.assign(x, upd);
});
route('POST', '/api/suppliers', (req, b) => { userOf(req); need(b.name, 'Ad zorunlu'); const id = 'TED-' + String(db.suppliers.filter(s => s.id.startsWith('TED-')).length + 1).padStart(3, '0'); const s = { id, name: b.name, approval: b.approval || 'ONAYLI', certEnd: optDate(b.certEnd, 'Sertifika bitişi'), note: b.note || '' }; db.suppliers.push(s); return s; });

// Çift tıklama / yeniden gönderim koruması: aynı X-Request-Id ile gelen başarılı yazma isteği tekrar işlenmez, ilk yanıt döner.
const replay = new Map();
const rememberReply = (id, out) => { replay.set(id, out); if (replay.size > 1000) replay.delete(replay.keys().next().value); };

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
function handle(req, res, url, raw) {
  const send = (code, obj, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...headers }); res.end(JSON.stringify(obj)); };
  const matches = routes.filter(r => r.re.test(url.pathname));
  if (!matches.length) return send(404, { error: 'Bulunamadı' });
  const r = matches.find(x => x.method === req.method);
  if (!r) return send(405, { error: 'Bu adres için yöntem desteklenmiyor' }, { Allow: matches.map(x => x.method).join(', ') });
  const rid = !r.readonly && req.headers['x-request-id'] ? String(req.headers['x-request-id']).slice(0, 80) : '';
  if (rid && replay.has(rid)) return send(200, replay.get(rid), { 'X-Idempotent-Replay': 'true' });
  // Hata olursa bellekteki durumu işlem öncesine döndür (yarım yazılmış işlem kalmasın)
  const snapshot = r.readonly ? null : JSON.stringify(db);
  try {
    let body = {};
    if (raw) { try { body = JSON.parse(raw); } catch { throw new Err('İstek gövdesi geçerli JSON değil'); } }
    need(body && typeof body === 'object' && !Array.isArray(body), 'İstek gövdesi bir JSON nesnesi olmalı');
    const out = r.fn(req, body, r.re.exec(url.pathname).groups || {});
    if (!r.readonly) { save(); if (rid) rememberReply(rid, out); }
    return send(200, out);
  } catch (e) {
    if (snapshot) db = JSON.parse(snapshot);
    if (e instanceof Err) return send(e.status, { error: e.message });
    console.error(e);
    return send(500, { error: 'Beklenmeyen sunucu hatası' });
  }
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/api/')) {
    let f = path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!f.startsWith(PUBLIC) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(PUBLIC, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    return fs.createReadStream(f).pipe(res);
  }
  let raw = '', tooBig = false;
  req.on('data', c => {
    if (tooBig) return;
    raw += c;
    if (raw.length > MAX_BODY) { tooBig = true; res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8', Connection: 'close' }); res.end(JSON.stringify({ error: 'İstek çok büyük' })); }
  });
  req.on('end', () => { if (!tooBig) handle(req, res, url, raw); });
});
if (require.main === module) { load(); server.listen(PORT, () => console.log(`Stok sistemi http://localhost:${PORT}`)); }
module.exports = { server, load, getDb: () => db };
