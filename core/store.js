// Veri deposu: tek kaynak (db), atomik işlem (tx) ve kalıcılık.
// Her yazma işlemi tx() içinde çalışır: ya tamamen gerçekleşir ya da hiç (hata olursa bellek ve disk önceki duruma döner).
const fs = require('fs');
const path = require('path');
const { build } = require('../seed');
const { migrate } = require('./migrate');

let db = null, DIR = null, FILE = null;
const hooks = { failSave: false }; // yalnızca testler için: kaydetme hatası simülasyonu

function init(dir) {
  DIR = dir; FILE = path.join(dir, 'db.json');
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(FILE)) { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); migrate(db); }
  else { db = build(); migrate(db); save(); }
  return db;
}
function save() {
  if (hooks.failSave) throw new Error('Kaydetme hatası (test)');
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, FILE); // atomik değiştirme
}
function tx(fn) {
  const snapshot = JSON.stringify(db);
  try { const out = fn(); save(); return out; }
  catch (e) { db = JSON.parse(snapshot); throw e; }
}
const get = () => db;
const nextId = (key, prefix) => { db.seq[key] = (db.seq[key] || 0) + 1; return prefix + '-' + String(db.seq[key]).padStart(6, '0'); };
const mat = code => db.materials.find(m => m.code === code);
const prod = code => db.products.find(p => p.code === code);
module.exports = { init, save, tx, get, nextId, mat, prod, hooks };
