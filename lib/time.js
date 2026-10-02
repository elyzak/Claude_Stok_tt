// Tarih/saat yardımcıları. Uygulama tarihi UTC değil, işletmenin saat dilimine (varsayılan Europe/Istanbul) göre hesaplanır.
const TZ = process.env.APP_TZ || 'Europe/Istanbul';
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

const todayIn = (now = new Date()) => dayFmt.format(now); // YYYY-MM-DD
const isIsoDate = s => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
const addDays = (iso, n) => { const t = new Date(iso + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const yymmdd = iso => iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10);

module.exports = { TZ, todayIn, isIsoDate, addDays, yymmdd };
