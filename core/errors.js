// Ortak hata türü ve doğrulama yardımcıları. Arayüzden (HTTP/masaüstü) bağımsızdır.
// status: 400 doğrulama · 401/403 kullanıcı · 404 bulunamadı · 409 çakışma/durum uyuşmazlığı
const { todayIn, isIsoDate } = require('../lib/time');

class Err extends Error { constructor(m, status = 400) { super(m); this.status = status; } }
const need = (c, m, status = 400) => { if (!c) throw new Err(m, status); };
const num = (v, name) => {
  need(v !== '' && v !== null && v !== undefined, `${name} girilmeli`);
  const n = Number(v); need(Number.isFinite(n), `${name} sayı olmalı`); return n;
};
const dateOf = (v, name = 'Tarih') => {
  if (v === undefined || v === null || v === '') return todayIn();
  need(isIsoDate(v), `${name} geçerli bir tarih olmalı (YYYY-AA-GG)`); return v;
};
const optDate = (v, name) => {
  if (v === undefined || v === null || v === '') return '';
  need(isIsoDate(v), `${name} geçerli bir tarih olmalı (YYYY-AA-GG)`); return v;
};
// Sayısal alan: boşsa null; verilmişse doğrulanır.
const optNum = (v, name, { int = false, min = 0, positive = false } = {}) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = num(v, name);
  need(positive ? n > 0 : n >= min, positive ? `${name} sıfırdan büyük olmalı` : `${name} negatif olamaz`);
  if (int) need(Number.isInteger(n), `${name} tam sayı olmalı`);
  return n;
};
module.exports = { Err, need, num, dateOf, optDate, optNum };
