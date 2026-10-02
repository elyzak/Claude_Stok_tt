// Reçete yönetimi. Reçete YALNIZCA "hangi malzemeden ne kadar" bilgisini taşır.
// Fiyat, maliyet, enerji, işçilik vb. reçetenin parçası DEĞİLDİR (ayrı Maliyet Modülü'nün konusudur).
//
// Satır birimi (unit): G | KG | ADET. Miktar, "baz" birim başınadır:
//   KAVANOZ: 1 kavanoz başına · KOLI: 1 koli başına · PALET: 1 palet başına · KG_DOLGU: 1 kg dolgu başına (hammaddede)
// Örnek: Pudra şekeri 90 G / KAVANOZ  → 1 kavanozda 90 g.
// Reçete toplamı hiçbir zaman otomatik yuvarlanmaz, oranlar değiştirilmez, hedef gramaja zorlanmaz.
const S = require('./store');
const { need, num } = require('./errors');
const { rq } = require('./ledger');
const { todayIn } = require('../lib/time');

const D = () => S.get();
const UNITS = ['G', 'KG', 'ADET'];
const BASES = ['KG_DOLGU', 'KAVANOZ', 'KOLI', 'PALET'];
const isIngredient = m => m.type === 'HAMMADDE' || m.type === 'YARI_MAMUL';
const now = () => new Date().toISOString();

// Malzeme biriminde, 1 baz birim başına miktar
const lineFactor = (line, material) => (material.unit === 'ADET' ? line.qty : (line.unit === 'G' ? line.qty / 1000 : line.qty));

function normLines(raw) {
  need(Array.isArray(raw) && raw.length, 'En az bir kalem girin');
  const seen = new Set();
  return raw.map((l, i) => {
    const w = `Kalem ${i + 1}`;
    const m = S.mat(l.material); need(m, `${w}: malzeme bulunamadı (${l.material || 'boş'})`);
    need(m.type !== 'MAMUL', `${w}: mamul reçete bileşeni olamaz`);
    need(!seen.has(m.code), `${w}: ${m.code} ${m.name} reçetede iki kez girilmiş`); seen.add(m.code);
    const qty = num(l.qty, `${w}: miktar`); need(qty > 0, `${w}: miktar sıfırdan büyük olmalı`);
    need(BASES.includes(l.base), `${w}: hesap bazı geçersiz`);
    const unit = l.unit || (m.unit === 'ADET' ? 'ADET' : 'KG'); need(UNITS.includes(unit), `${w}: birim geçersiz`);
    if (m.unit === 'ADET') need(unit === 'ADET', `${w}: ${m.name} adet cinsinden; birim ADET olmalı`);
    else need(unit === 'G' || unit === 'KG', `${w}: ${m.name} kilogram cinsinden; birim G veya KG olmalı`);
    if (isIngredient(m)) need(l.base === 'KG_DOLGU' || l.base === 'KAVANOZ', `${w}: hammadde KG_DOLGU veya KAVANOZ bazında girilmeli`);
    else need(l.base !== 'KG_DOLGU', `${w}: ambalaj dolgu bazlı olamaz`);
    const firePct = l.fire === '' || l.fire == null ? 0 : num(l.fire, `${w}: fire`); need(firePct >= 0 && firePct <= 100, `${w}: fire %0–100 arasında olmalı`);
    return { material: m.code, qty, unit, base: l.base, fire: rq(firePct / 100), rounding: l.rounding === 'YUKARI' ? 'YUKARI' : 'YOK', critical: !!l.critical };
  });
}

// 1 kavanozdaki hammadde gramı (yalnızca bilgi/toplam kontrolü için)
function gramsPerJar(line, mat, product) {
  const kgPerBase = lineFactor(line, mat);
  return line.base === 'KAVANOZ' ? kgPerBase * 1000 : kgPerBase * product.targetFill;
}
// Reçete toplamı: yuvarlanmaz, sadece raporlanır. Referans: ürünün hedef dolumu (yoksa nominal gram).
function totals(rec) {
  const p = S.prod(rec.productCode); const s = D().settings;
  const ref = p && (p.targetFill || p.nominal) || null;
  if (!ref) return { referenceG: null, totalG: null, totalPct: null, deviationPct: null, level: 'BELIRSIZ', lines: [], note: 'Ürün kartında hedef dolum/nominal gram yok' };
  const lines = rec.lines.filter(l => isIngredient(S.mat(l.material))).map(l => {
    const g = rq(gramsPerJar(l, S.mat(l.material), p));
    return { material: l.material, grams: g, pct: rq(g / ref * 100) };
  });
  const totalG = rq(lines.reduce((a, x) => a + x.grams, 0));
  const dev = (totalG - ref) / ref * 100;
  const a = Math.abs(dev);
  const level = a < 1e-9 ? 'TAM' : a <= s.recipeToleranceOkPct ? 'TOLERANS' : a <= s.recipeToleranceBlockPct ? 'ACIKLAMA' : 'ENGEL';
  return { referenceG: ref, totalG, totalPct: rq(totalG / ref * 100), deviationPct: rq(dev), level, lines };
}
const view = r => ({ ...r, totals: totals(r) });

const find = id => { const r = D().recipes.find(x => x.id === id); need(r, 'Reçete bulunamadı', 404); return r; };
const activeRecipe = code => D().recipes.find(r => r.productCode === code && r.status === 'ONAYLI');
const log = (r, user, action, extra = {}) => r.history.push({ ts: now(), user, action, ...extra });

function createDraft(b, user) {
  const p = S.prod(b.productCode); need(p, 'Ürün bulunamadı', 404);
  need(!D().recipes.some(r => r.productCode === b.productCode && r.status === 'TASLAK'), 'Bu ürün için açık bir taslak var; onu düzenleyin veya iptal edin', 409);
  const lines = normLines(b.lines);
  const ver = Math.max(0, ...D().recipes.filter(r => r.productCode === b.productCode).map(r => r.version)) + 1;
  const rec = { id: `REC-${b.productCode.replace('-', '')}-V${ver}`, productCode: b.productCode, version: ver, status: 'TASLAK', description: String(b.description || ''),
    qualityApprover: '', productionApprover: '', validFrom: '', createdBy: user, createdAt: now(), lines, history: [] };
  log(rec, user, 'OLUSTURULDU', { note: b.basedOn ? `${b.basedOn} esas alınarak` : '' });
  D().recipes.push(rec);
  return view(rec);
}
// Yalnızca TASLAK düzenlenir; her düzenlemede önceki içerik geçmişe kopyalanır.
function updateDraft(id, b, user) {
  const r = find(id); need(r.status === 'TASLAK', 'Yalnızca TASLAK reçete düzenlenir; onaylı reçete için yeni sürüm oluşturun', 409);
  const before = { description: r.description, lines: JSON.parse(JSON.stringify(r.lines)) };
  if ('lines' in b) r.lines = normLines(b.lines);
  if ('description' in b) r.description = String(b.description || '');
  log(r, user, 'GUNCELLENDI', { before });
  return view(r);
}
function discardDraft(id, b, user) {
  const r = find(id); need(r.status === 'TASLAK', 'Yalnızca TASLAK iptal edilir', 409);
  r.status = 'IPTAL'; log(r, user, 'TASLAK_IPTAL', { note: b.note || '' });
  return view(r);
}
function approve(id, b, user) {
  const r = find(id); need(r.status === 'TASLAK', 'Yalnızca TASLAK reçete onaylanır', 409);
  need(String(b.quality || '').trim() && String(b.production || '').trim(), 'Kalite ve üretim onaylayanı yazın');
  const p = S.prod(r.productCode); need(p, 'Ürün bulunamadı', 404);
  r.lines = normLines(r.lines.map(l => ({ ...l, fire: l.fire * 100 }))); // kayıtlı satırları yeniden doğrula (malzeme sonradan değişmiş olabilir)
  for (const l of r.lines) need(S.mat(l.material).active, `${l.material} pasif malzeme; reçeteden çıkarın veya malzemeyi aktifleştirin`, 409);
  need(r.lines.some(l => isIngredient(S.mat(l.material))), 'Reçetede en az bir hammadde bulunmalı');
  const t = totals(r);
  need(t.level !== 'BELIRSIZ', 'Reçete toplamı kontrol edilemiyor: ürün kartında hedef dolum/nominal gram eksik', 409);
  need(t.level !== 'ENGEL', `Reçete toplamı hedeften çok uzak (%${t.totalPct}, sapma %${t.deviationPct}). Girişi kontrol edin.`);
  const note = String(b.deviationNote || '').trim();
  if (t.level === 'ACIKLAMA') need(note, `Reçete toplamı %${t.totalPct} (sapma %${t.deviationPct}); onay için sapma açıklaması (deviationNote) gerekli`);
  for (const o of D().recipes.filter(x => x.productCode === r.productCode && x.status === 'ONAYLI')) { o.status = 'PASIF'; o.passiveAt = now(); log(o, user, 'PASIFE_ALINDI', { note: `Yeni sürüm onaylandı: ${r.id}` }); }
  Object.assign(r, { status: 'ONAYLI', qualityApprover: b.quality.trim(), productionApprover: b.production.trim(), validFrom: todayIn(), approvedTotals: t, deviationNote: note });
  log(r, user, 'ONAYLANDI', { note, totals: { totalG: t.totalG, totalPct: t.totalPct, deviationPct: t.deviationPct } });
  return view(r);
}
function passivate(id, b, user) {
  const r = find(id); need(r.status === 'ONAYLI', 'Yalnızca ONAYLI reçete pasife alınır', 409);
  r.status = 'PASIF'; r.passiveAt = now(); log(r, user, 'PASIFE_ALINDI', { note: b.note || '' });
  return view(r);
}
module.exports = { UNITS, BASES, isIngredient, lineFactor, normLines, totals, view, activeRecipe, createDraft, updateDraft, discardDraft, approve, passivate };
