// Stok çekirdeği: arayüzden (HTTP / masaüstü / başka bir istemci) bağımsız tek giriş noktası.
// Yazma işlemleri S.tx() ile atomik çalıştırılmalıdır. Maliyet Yönetimi gibi yeni modüller buraya yeni dosyalar olarak eklenir
// ve aynı store/ledger üzerinden çalışır; stok çekirdeğinde değişiklik gerektirmez.
module.exports = {
  store: require('./store'), errors: require('./errors'), ledger: require('./ledger'), catalog: require('./catalog'), recipes: require('./recipes'),
  receipts: require('./receipts'), production: require('./production'), dispatch: require('./dispatch'), counts: require('./counts'),
  adjust: require('./adjust'), quality: require('./quality'), cancel: require('./cancel'), trace: require('./trace'), reports: require('./reports'),
};
