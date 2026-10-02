// Şema geçişi: eski veritabanı dosyalarını güncel şemaya getirir. Veri silmez, alan ekler.
const SCHEMA = 3;
function migrate(db) {
  const v = db.schema || 1;
  if (v < 2) { /* v1->v2: yalnızca sürüm işareti */ }
  // v3: reçete satır birimi (unit), reçete geçmişi, markalar, ayarlar, yeni belge koleksiyonları
  for (const k of ['fires', 'lotClosures', 'transfers', 'qualityDocs']) if (!db[k]) db[k] = [];
  if (!db.brands) db.brands = ['Baynut', 'Trabzon Tarım', 'Nutshell', 'Finerji'];
  if (!db.settings) db.settings = { recipeToleranceOkPct: 0.5, recipeToleranceBlockPct: 5 };
  for (const r of db.recipes || []) {
    if (!r.history) r.history = [{ ts: new Date().toISOString(), user: 'sistem', action: 'ICERI_ALINDI', note: 'Eski şemadan taşındı' }];
    for (const l of r.lines || []) if (!l.unit) { const m = db.materials.find(x => x.code === l.material); l.unit = m && m.unit === 'ADET' ? 'ADET' : 'KG'; }
  }
  for (const p of db.products || []) { if (p.name === undefined) delete p.name; }
  db.schema = SCHEMA;
  return db;
}
module.exports = { migrate, SCHEMA };
