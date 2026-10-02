// Kalite akışı (karantina / serbest bırak / red) ve lokasyonlar arası transfer.
// Karantina ve red lotları hiçbir koşulda üretimde/sevkte kullanılamaz (FEFO yalnızca ONAYLI lotları görür).
// Karantina lokasyonuna giriş/çıkış YALNIZCA kalite kararıyla yapılır; normal transfer bu geçişi yapamaz.
const S = require('./store');
const L = require('./ledger');
const { need, num } = require('./errors');
const D = () => S.get();
const KAR = 'EZM-KAR';

function lotOf(b) {
  const code = b.code, lot = String(b.lot || '').trim();
  need(S.mat(code), 'Malzeme bulunamadı', 404); need(lot, 'Lot seçin');
  const meta = L.lotMeta(code, lot); need(meta, 'Lot bulunamadı', 404);
  return { code, lot, meta };
}
const stockOf = (code, lot) => L.lotRows().filter(r => r.code === code && r.lot === lot && r.qty > 0);
function qdoc(action, { code, lot }, from, to, qty, user, note, extra = {}) {
  const rec = { id: S.nextId('kal', 'KAL'), ts: new Date().toISOString(), action, code, lot, from, to, qty, user, note: note || '', ...extra };
  D().qualityDocs.push(rec); return rec;
}
function move(code, lot, from, to, qty, doc, note) {
  L.addMove('TRANSFER_CIKIS', code, lot, from, -qty, doc, { note });
  L.addMove('TRANSFER_GIRIS', code, lot, to, qty, doc, { note });
}

// Karantinadaki lotu serbest bırak: durum ONAYLI olur, stok karantina lokasyonundan hedef lokasyona taşınır.
function release(b, user) {
  const { code, lot, meta } = lotOf(b);
  need(meta.status === 'KARANTINA', `Lot karantinada değil (durum: ${meta.status})`, 409);
  const to = b.to || 'EZM-DEPO'; need(D().locations.some(x => x.code === to) && to !== KAR && to !== 'ANA-DEPO', 'Hedef lokasyon geçersiz');
  const rows = stockOf(code, lot).filter(r => r.loc === KAR);
  const rec = qdoc('SERBEST_BIRAK', { code, lot }, KAR, to, rows.reduce((s, r) => s + r.qty, 0), user, b.note, { decidedBy: String(b.decidedBy || '').trim() });
  need(rec.decidedBy, 'Karar veren (kalite sorumlusu) adı zorunlu');
  for (const r of rows) move(code, lot, KAR, to, r.qty, { type: 'KALITE', id: rec.id, user }, 'Serbest bırakma');
  meta.status = 'ONAYLI';
  return rec;
}
// Reddet: durum RED olur; stok karantina lokasyonunda kalır (iade/imha için fire ile çıkarılır), hiçbir yerde kullanılamaz.
function reject(b, user) {
  const { code, lot, meta } = lotOf(b);
  need(meta.status === 'KARANTINA', `Yalnızca karantinadaki lot reddedilebilir (durum: ${meta.status})`, 409);
  need(String(b.note || '').trim(), 'Red gerekçesi zorunlu');
  const rec = qdoc('RED', { code, lot }, KAR, KAR, stockOf(code, lot).reduce((s, r) => s + r.qty, 0), user, b.note, { decidedBy: String(b.decidedBy || '').trim() });
  need(rec.decidedBy, 'Karar veren (kalite sorumlusu) adı zorunlu');
  meta.status = 'RED';
  return rec;
}
// Karantinaya al: onaylı (kullanılabilir) bir lotta sonradan sorun çıkarsa tüm stoğu karantina lokasyonuna çekilir.
function hold(b, user) {
  const { code, lot, meta } = lotOf(b);
  need(meta.status === 'ONAYLI', `Yalnızca ONAYLI lot karantinaya alınabilir (durum: ${meta.status})`, 409);
  need(String(b.note || '').trim(), 'Gerekçe zorunlu');
  const rows = stockOf(code, lot).filter(r => r.loc !== KAR);
  need(rows.length, 'Lotun karantinaya alınacak stoğu yok', 409);
  const rec = qdoc('KARANTINAYA_AL', { code, lot }, rows.map(r => r.loc).join(','), KAR, rows.reduce((s, r) => s + r.qty, 0), user, b.note, { decidedBy: String(b.decidedBy || '').trim() });
  need(rec.decidedBy, 'Karar veren adı zorunlu');
  for (const r of rows) move(code, lot, r.loc, KAR, r.qty, { type: 'KALITE', id: rec.id, user }, 'Karantinaya alma');
  meta.status = 'KARANTINA';
  return rec;
}

// Lokasyonlar arası transfer: iki hareket (çıkış + giriş), tek belge (TRF).
function transfer(b, user) {
  const m = S.mat(b.code); need(m, 'Malzeme bulunamadı', 404);
  const qty = num(b.qty, 'Miktar'); need(qty > 0, 'Miktar sıfırdan büyük olmalı');
  const lot = m.lotTracking === 'YOK' ? '' : String(b.lot || '').trim();
  need(m.lotTracking !== 'ZORUNLU' || lot, 'Lot seçin');
  const locs = D().locations.map(l => l.code);
  need(locs.includes(b.from) && locs.includes(b.to), 'Lokasyon geçersiz'); need(b.from !== b.to, 'Kaynak ve hedef lokasyon aynı olamaz');
  need(b.from !== KAR && b.to !== KAR, 'Karantina lokasyonuna giriş/çıkış için Kalite ekranını (serbest bırak / karantinaya al) kullanın', 409);
  const meta = lot ? L.lotMeta(b.code, lot) : null;
  need(!meta || meta.status === 'ONAYLI', `${lot} lotu ${meta && meta.status} durumunda; transfer edilemez`, 409);
  const cur = L.balOf(b.code, lot, b.from);
  need(cur >= qty, `Stok yetersiz: ${b.from} lokasyonunda ${cur} ${m.unit}`, 409);
  const id = S.nextId('trf', 'TRF'); const doc = { type: 'TRANSFER', id, user };
  move(b.code, lot, b.from, b.to, qty, doc, b.note);
  const rec = { id, ts: new Date().toISOString(), code: b.code, lot, from: b.from, to: b.to, qty, user, note: b.note || '', cancelled: false };
  D().transfers.push(rec);
  return rec;
}
module.exports = { release, reject, hold, transfer };
