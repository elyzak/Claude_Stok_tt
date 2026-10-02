// Tanımlar: malzeme/ürün kartları, tedarikçiler, markalar, ayarlar.
const S = require('./store');
const { need, optNum, optDate } = require('./errors');

const D = () => S.get();
const hasMovements = code => D().movements.some(m => m.code === code);
const PRODUCT_STATUS = ['AKTIF', 'TEYIT', 'BEKLEME', 'PASIF'];
const TYPES = { HAMMADDE: 'HM', AMBALAJ: 'AM', YARI_MAMUL: 'YM', MAMUL: 'MM' };

const productView = p => { const m = S.mat(p.code) || {}; return { ...p, name: m.name || '', category: m.category || '', allergens: m.allergens || '', palletJars: p.jarsPerBox && p.boxesPerPallet ? p.jarsPerBox * p.boxesPerPallet : null }; };

function nextCode(type) {
  const pre = TYPES[type];
  const n = Math.max(0, ...D().materials.filter(m => m.code.startsWith(pre + '-')).map(m => Number(m.code.slice(3)))) + 1;
  return `${pre}-${String(n).padStart(3, '0')}`;
}

// Ürün kartı alanları: boş bırakılabilir (teyit edilmemiş bilgi tahmin edilmez), verilmişse doğrulanır.
function productFields(b, cur = {}) {
  const f = {};
  if ('nominal' in b) f.nominal = optNum(b.nominal, 'Nominal gram', { positive: true });
  if ('targetFill' in b) f.targetFill = optNum(b.targetFill, 'Hedef dolum', { positive: true });
  if ('jarsPerBox' in b) f.jarsPerBox = optNum(b.jarsPerBox, 'Kavanoz/koli', { positive: true, int: true });
  if ('boxesPerPallet' in b) f.boxesPerPallet = optNum(b.boxesPerPallet, 'Koli/palet', { positive: true, int: true });
  if ('shelfLifeDays' in b) f.shelfLifeDays = optNum(b.shelfLifeDays, 'Raf ömrü', { positive: true, int: true });
  if ('palletJars' in b && b.palletJars !== '' && b.palletJars !== null) {
    const pj = optNum(b.palletJars, 'Palet toplam adet', { positive: true, int: true });
    const jpb = 'jarsPerBox' in f ? f.jarsPerBox : cur.jarsPerBox;
    need(jpb, 'Palet toplam adet için önce koli içi adet girilmeli');
    need(pj % jpb === 0, `Palet toplam adet (${pj}) koli içi adede (${jpb}) tam bölünmeli`);
    const bpp = pj / jpb;
    need(!('boxesPerPallet' in f) || f.boxesPerPallet === bpp, 'Koli/palet ile palet toplam adet birbiriyle çelişiyor');
    f.boxesPerPallet = bpp;
  }
  if ('status' in b) { need(PRODUCT_STATUS.includes(b.status), 'Durum geçersiz'); f.status = b.status; }
  if ('brand' in b) { const br = String(b.brand || ''); need(!br || D().brands.includes(br), 'Marka tanımlı değil; önce markayı ekleyin'); f.brand = br; }
  if ('note' in b) f.note = String(b.note || '');
  if ('newCode' in b) {
    const nc = String(b.newCode || '').trim();
    need(!nc || !D().products.some(p => p.newCode === nc && p.code !== cur.code), 'Bu yeni ürün kodu başka üründe kullanılıyor', 409);
    f.newCode = nc;
  }
  return f;
}

function createProduct(b) {
  need(typeof b.name === 'string' && b.name.trim(), 'Ürün adı zorunlu');
  const f = productFields(b);
  const m = { code: nextCode('MAMUL'), name: b.name.trim(), type: 'MAMUL', unit: 'ADET', category: b.category || 'Ezme ve krema', lotTracking: 'ZORUNLU', sktTracking: true, allergens: String(b.allergens || ''), minStock: null, active: true };
  D().materials.push(m);
  // Bilinmeyen alanlar boş kalır; hiçbir değer varsayılan olarak uydurulmaz.
  const p = { code: m.code, brand: '', nominal: null, targetFill: null, jarsPerBox: null, boxesPerPallet: null, shelfLifeDays: null, status: 'TEYIT', note: '', newCode: '', ...f };
  D().products.push(p);
  return productView(p);
}
function updateProduct(code, b) {
  const p = S.prod(code); need(p, 'Ürün bulunamadı', 404);
  const f = productFields(b, p);
  if ('name' in b) { need(typeof b.name === 'string' && b.name.trim(), 'Ürün adı boş olamaz'); S.mat(code).name = b.name.trim(); }
  return productView(Object.assign(p, f));
}

function createMaterial(b) {
  need(b.name && b.type && b.unit, 'Ad, tip ve birim zorunlu');
  need(TYPES[b.type], 'Tip geçersiz'); need(['KG', 'ADET'].includes(b.unit), 'Birim KG veya ADET olmalı');
  if (b.type === 'MAMUL') return createProduct(b);
  const m = { code: nextCode(b.type), name: String(b.name).trim(), type: b.type, unit: b.unit, category: b.category || '', lotTracking: b.lotTracking || (b.type === 'AMBALAJ' ? 'OPSIYONEL' : 'ZORUNLU'),
    sktTracking: b.type !== 'AMBALAJ', allergens: b.allergens || '', minStock: optNum(b.minStock, 'Minimum stok'), active: true };
  need(['ZORUNLU', 'OPSIYONEL', 'YOK'].includes(m.lotTracking), 'Lot takibi değeri geçersiz');
  D().materials.push(m);
  return m;
}
function updateMaterial(code, b) {
  const m = S.mat(code); need(m, 'Malzeme bulunamadı', 404);
  const upd = {};
  if ('name' in b) { need(typeof b.name === 'string' && b.name.trim(), 'Ad boş olamaz'); upd.name = b.name.trim(); }
  if ('category' in b) upd.category = String(b.category || '');
  if ('allergens' in b) upd.allergens = String(b.allergens || '');
  if ('lotTracking' in b && b.lotTracking !== m.lotTracking) {
    need(['ZORUNLU', 'OPSIYONEL', 'YOK'].includes(b.lotTracking), 'Lot takibi değeri geçersiz');
    need(!hasMovements(code), 'Hareketi olan malzemenin lot takibi değiştirilemez', 409);
    upd.lotTracking = b.lotTracking;
  }
  if ('unit' in b && b.unit !== m.unit) {
    need(['KG', 'ADET'].includes(b.unit), 'Birim KG veya ADET olmalı');
    need(!hasMovements(code), 'Hareketi olan malzemenin birimi değiştirilemez', 409);
    upd.unit = b.unit;
  }
  if ('active' in b) { need(typeof b.active === 'boolean', 'Aktif alanı true/false olmalı'); upd.active = b.active; }
  if ('minStock' in b) upd.minStock = optNum(b.minStock, 'Minimum stok');
  return Object.assign(m, upd);
}

function createSupplier(b) {
  need(typeof b.name === 'string' && b.name.trim(), 'Ad zorunlu');
  const id = 'TED-' + String(Math.max(0, ...D().suppliers.filter(s => s.id.startsWith('TED-')).map(s => Number(s.id.slice(4)))) + 1).padStart(3, '0');
  const s = { id, name: b.name.trim(), approval: b.approval || 'ONAYLI', certEnd: optDate(b.certEnd, 'Sertifika bitişi'), note: b.note || '' };
  D().suppliers.push(s); return s;
}
function addBrand(b) {
  const name = String(b.name || '').trim(); need(name, 'Marka adı zorunlu');
  need(!D().brands.some(x => x.toLowerCase() === name.toLowerCase()), 'Marka zaten tanımlı', 409);
  D().brands.push(name); return D().brands;
}
function updateSettings(b) {
  const s = D().settings;
  if ('recipeToleranceOkPct' in b) s.recipeToleranceOkPct = optNum(b.recipeToleranceOkPct, 'Tolerans (kabul)', { min: 0 }) ?? s.recipeToleranceOkPct;
  if ('recipeToleranceBlockPct' in b) s.recipeToleranceBlockPct = optNum(b.recipeToleranceBlockPct, 'Tolerans (engel)', { min: 0 }) ?? s.recipeToleranceBlockPct;
  need(s.recipeToleranceOkPct <= s.recipeToleranceBlockPct, 'Kabul toleransı, engel toleransından büyük olamaz');
  return s;
}
module.exports = { hasMovements, productView, createProduct, updateProduct, createMaterial, updateMaterial, createSupplier, addBrand, updateSettings, PRODUCT_STATUS };
