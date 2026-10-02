'use strict';
// ---------- yardımcılar ----------
const $ = s => document.querySelector(s);
const nf = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 });
const fmt = n => (n === null || n === undefined || n === '') ? '' : nf.format(n);
const fdate = d => d ? d.slice(8, 10) + '.' + d.slice(5, 7) + '.' + d.slice(0, 4) : '';
const fts = t => { const d = new Date(t); return d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }); };
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const k of kids.flat(9)) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
let USER = localStorage.getItem('user') || '';
async function api(method, url, body) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-User': USER }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Hata');
  return j;
}
function toast(msg, err) { const d = h('div', { class: err ? 'err' : '' }, msg); $('#toast').append(d); setTimeout(() => d.remove(), err ? 6000 : 3500); }
async function run(fn) { try { return await fn(); } catch (e) { toast(e.message, true); } }
const badge = (t, kind) => h('span', { class: 'badge ' + (kind || '') }, t);
const statusBadge = s => badge(s, { ONAYLI: 'b-ok', AKTIF: 'b-ok', KABUL: 'b-ok', TASLAK: 'b-warn', TEYIT: 'b-warn', KARANTINA: 'b-warn', PASIF: '', BEKLEME: '', RED: 'b-bad' }[s]);
const qtyCell = (q, cls = '') => h('td', { class: 'n ' + cls + (q < 0 ? ' neg' : '') }, fmt(q));

let M = {}; // ana veri
const mat = c => M.materials.find(m => m.code === c);
const label = m => `${m.code} — ${m.name}`;
const codeOf = v => (v || '').split(' — ')[0].trim();
async function loadMaster() { M = await api('GET', '/api/bootstrap'); }

function field(lbl, input) { return h('div', {}, h('label', {}, lbl), input); }
function sel(opts, val, attrs) { const s = h('select', attrs, opts.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return h('option', { value: v, selected: v === val }, t); })); return s; }
function matInput(types, id) {
  const dl = h('datalist', { id }, M.materials.filter(m => m.active && (!types || types.includes(m.type))).map(m => h('option', { value: label(m) })));
  const inp = h('input', { list: id, placeholder: 'Kod veya ad yazın…' });
  return { el: h('div', {}, inp, dl), input: inp, get code() { const c = codeOf(inp.value); return mat(c) ? c : ''; } };
}
function table(cols, rows, opts = {}) {
  return h('div', { class: 'tw' }, h('table', {}, h('thead', {}, h('tr', {}, cols.map(c => h('th', { class: c.n ? 'n' : '' }, c.h)))),
    h('tbody', {}, rows.length ? rows.map(r => h('tr', {}, cols.map(c => { const v = c.f(r); return v && v.nodeType ? (v.tagName === 'TD' ? v : h('td', { class: c.n ? 'n' : '' }, v)) : h('td', { class: c.n ? 'n' : '' }, v ?? ''); }))) : h('tr', {}, h('td', { colspan: cols.length, class: 'muted' }, opts.empty || 'Kayıt yok')))));
}
function head(t, s) { return [h('h1', {}, t), h('p', { class: 'sub' }, s || '')]; }
const page = (...c) => { const m = $('#main'); m.replaceChildren(...c.flat(9)); window.scrollTo(0, 0); };

// ---------- ekranlar ----------
const VIEWS = {};
const NAV = [['sec', 'Genel'], ['dashboard', 'Pano'], ['stock', 'Stok durumu'], ['lots', 'Lot stok'], ['sec', 'İşlemler'], ['receipt', 'Mal kabul'], ['production', 'Üretim girişi'], ['dispatch', 'Mamul çıkışı'], ['count', 'Sayım / Devir'],
  ['sec', 'Tanımlar'], ['recipes', 'Reçeteler'], ['products', 'Ürünler'], ['materials', 'Malzemeler'], ['sec', 'Kayıtlar'], ['docs', 'Belgeler'], ['movements', 'Stok hareketleri']];

VIEWS.dashboard = async () => {
  const d = await api('GET', '/api/dashboard');
  page(head('Pano', 'Güncel stok defterinden hesaplanır; elle değiştirilemez.'),
    h('div', { class: 'grid' }, [['Malzeme kartı', d.counts.materials], ['Stokta olan kalem', d.counts.withStock], ['Üretim kaydı', d.counts.productions], ['Stok hareketi', d.counts.movements], ['Onay bekleyen reçete', d.draftRecipes]].map(([t, v]) => h('div', { class: 'stat' }, h('b', {}, v), h('span', {}, t)))),
    h('h2', {}, 'Mamul stoku'), table([{ h: 'Ürün', f: r => label(r) }, { h: 'Toplam (adet)', n: 1, f: r => fmt(r.total) }, { h: 'Kullanılabilir', n: 1, f: r => fmt(r.usable) }], d.products, { empty: 'Henüz mamul stoku yok' }),
    h('h2', {}, 'SKT yaklaşan / geçmiş lotlar (30 gün)'), table([{ h: 'Malzeme', f: r => `${r.code} — ${r.name}` }, { h: 'Lot', f: r => r.lot }, { h: 'Lokasyon', f: r => r.loc }, { h: 'Miktar', n: 1, f: r => fmt(r.qty) + ' ' + r.unit }, { h: 'SKT', f: r => h('span', { class: r.skt < M.today ? 'neg' : '' }, fdate(r.skt)) }], d.expiring, { empty: 'Yok' }),
    d.low.length ? [h('h2', {}, 'Minimum stok altında'), table([{ h: 'Malzeme', f: r => label(r) }, { h: 'Kullanılabilir', n: 1, f: r => fmt(r.usable) }, { h: 'Minimum', n: 1, f: r => fmt(r.minStock) }], d.low)] : '',
    d.quarantine.length ? [h('h2', {}, 'Karantinada'), table([{ h: 'Malzeme', f: r => `${r.code} — ${r.name}` }, { h: 'Lot', f: r => r.lot }, { h: 'Miktar', n: 1, f: r => fmt(r.qty) }], d.quarantine)] : '',
    h('h2', {}, 'Son hareketler'), movTable(d.recentMoves));
};

VIEWS.stock = async () => {
  const s = await api('GET', '/api/stock');
  const type = sel([['', 'Tüm tipler'], 'HAMMADDE', 'AMBALAJ', 'YARI_MAMUL', 'MAMUL'], ''), q = h('input', { placeholder: 'Ara…' }), only = h('input', { type: 'checkbox', checked: true, style: 'width:auto' });
  const box = h('div');
  const draw = () => {
    const t = q.value.toLowerCase();
    const rows = s.materials.filter(m => (!type.value || m.type === type.value) && (!only.checked || m.total !== 0) && (!t || label(m).toLowerCase().includes(t)));
    box.replaceChildren(table([{ h: 'Kod', f: r => r.code }, { h: 'Malzeme', f: r => r.name }, { h: 'Tip', f: r => r.type }, { h: 'Toplam', n: 1, f: r => fmt(r.total) }, { h: 'Kullanılabilir', n: 1, f: r => fmt(r.usable) }, { h: 'Karantina', n: 1, f: r => fmt(r.quarantine) }, { h: 'SKT geçmiş', n: 1, f: r => r.expired ? h('span', { class: 'neg' }, fmt(r.expired)) : '' }, { h: 'Birim', f: r => r.unit }], rows, { empty: 'Stok kaydı yok. Devir/Sayım veya Mal kabul ile stok girin.' }));
  };
  [type, q, only].forEach(e => e.addEventListener('input', draw)); draw();
  page(head('Stok durumu', 'Güncel stok = devir + girişler − çıkışlar ± düzeltmeler'), h('div', { class: 'tools' }, type, q, h('label', { style: 'display:flex;gap:6px;align-items:center;margin:0' }, only, 'Yalnızca stoklu')), box);
};

VIEWS.lots = async () => {
  const s = await api('GET', '/api/stock');
  const q = h('input', { placeholder: 'Ara…' }), box = h('div');
  const draw = () => { const t = q.value.toLowerCase(); box.replaceChildren(table([{ h: 'Kod', f: r => r.code }, { h: 'Malzeme', f: r => r.name }, { h: 'Lot', f: r => r.lot }, { h: 'Lokasyon', f: r => r.loc }, { h: 'Kalan', n: 1, f: r => fmt(r.qty) + ' ' + r.unit }, { h: 'SKT', f: r => h('span', { class: r.skt && r.skt < M.today ? 'neg' : '' }, fdate(r.skt)) }, { h: 'Durum', f: r => statusBadge(r.status) }], s.lots.filter(r => !t || (r.code + r.name + r.lot).toLowerCase().includes(t)).sort((a, b) => a.code.localeCompare(b.code) || (a.skt || '9').localeCompare(b.skt || '9')))); };
  q.addEventListener('input', draw); draw();
  page(head('Lot stok', 'Lot ve lokasyon bazında kalan miktarlar (FEFO: SKT\'si yakın lot önce tüketilir).'), h('div', { class: 'tools' }, q), box);
};

VIEWS.receipt = async () => {
  const mi = matInput(null, 'dl-rcv');
  const f = {
    date: h('input', { type: 'date', value: M.today }), supplier: sel(M.suppliers.filter(s => s.approval === 'ONAYLI').map(s => [s.id, s.name]), 'TED-001'),
    waybill: h('input'), qty: h('input', { type: 'number', step: 'any', min: 0 }), lot: h('input', { placeholder: 'Boşsa otomatik' }), supplierLot: h('input'), skt: h('input', { type: 'date' }),
    result: sel(['KABUL', 'KARANTINA', 'RED'], 'KABUL'), price: h('input', { type: 'number', step: 'any' }), cur: sel(['', 'TRY', 'USD', 'EUR'], ''), note: h('input'),
  };
  const info = h('div', { class: 'small muted' });
  mi.input.addEventListener('input', () => { const m = mat(mi.code); info.textContent = m ? `Birim: ${m.unit} · Lot: ${m.lotTracking} · SKT takibi: ${m.sktTracking ? 'evet' : 'hayır'}` : ''; });
  const btn = h('button', { onclick: () => run(async () => {
    const r = await api('POST', '/api/receipt', { code: mi.code, date: f.date.value, supplier: f.supplier.value, waybill: f.waybill.value, qty: f.qty.value, lot: f.lot.value, supplierLot: f.supplierLot.value, skt: f.skt.value, result: f.result.value, unitPrice: f.price.value, currency: f.cur.value, note: f.note.value });
    toast(`${r.id} kaydedildi${r.lot ? ' · lot ' + r.lot : ''}`); await loadMaster(); VIEWS.receipt();
  }) }, 'Kaydet');
  page(head('Mal kabul', 'Entegre transferi için tedarikçi olarak "Trabzon Tarım - Entegre" seçin.'),
    h('div', { class: 'card' }, h('div', { class: 'form' }, field('Tarih', f.date), field('Tedarikçi', f.supplier), field('İrsaliye no', f.waybill), field('Malzeme', mi.el), field('Miktar', f.qty), field('Lot no', f.lot), field('Tedarikçi lot no', f.supplierLot), field('SKT', f.skt), field('Kontrol sonucu', f.result), field('Birim alış fiyatı', f.price), field('Para birimi', f.cur), field('Açıklama', f.note)), info, h('div', { class: 'row' }, btn),
      h('p', { class: 'small muted' }, 'KABUL → Ezme Deposu · KARANTINA → Karantina lokasyonu (üretimde kullanılmaz) · RED → yalnızca kayıt, stoğa girmez.')));
};

VIEWS.production = async () => {
  const prods = M.products.filter(p => p.status === 'AKTIF' || M.recipes.some(r => r.productCode === p.code && r.status === 'ONAYLI'));
  const f = { date: h('input', { type: 'date', value: M.today }), shift: sel(['1', '2', '3'], '1'), line: sel(M.locations.filter(l => l.type === 'HAT').map(l => l.code), 'EZM-HAT1'),
    product: sel(prods.map(p => [p.code, label(mat(p.code))]), prods[0] && prods[0].code), pallets: h('input', { type: 'number', min: 0, value: 0 }), boxes: h('input', { type: 'number', min: 0, value: 0 }), jars: h('input', { type: 'number', min: 0, value: 0 }), lot: h('input', { placeholder: 'Boşsa otomatik' }), note: h('input') };
  const out = h('div'); let plan = null;
  const body = () => ({ productCode: f.product.value, date: f.date.value, pallets: f.pallets.value, boxes: f.boxes.value, jars: f.jars.value, shift: f.shift.value, line: f.line.value, lot: f.lot.value, note: f.note.value });
  const prev = async () => {
    try {
      plan = await api('POST', '/api/production/preview', body());
      out.replaceChildren(
        h('div', { class: 'grid' }, [['Toplam kavanoz', fmt(plan.totalJars)], ['Toplam koli', fmt(plan.totalBoxes)], ['Toplam palet', fmt(plan.totalPallets)], ['Dolgu (kg)', fmt(plan.fillKg)], ['Dolgu oranı toplamı', '%' + fmt(plan.ratio)], ['Mamul SKT', fdate(plan.skt)]].map(([t, v]) => h('div', { class: 'stat' }, h('b', {}, v), h('span', {}, t)))),
        h('p', { class: 'small muted' }, `Reçete: ${plan.recipe.id} (v${plan.recipe.version})`),
        table([{ h: 'Malzeme', f: r => `${r.code} — ${r.name}` }, { h: 'Birim miktar', n: 1, f: r => fmt(r.perUnit) }, { h: 'Baz', f: r => r.base }, { h: 'Teorik tüketim', n: 1, f: r => fmt(r.need) + ' ' + r.unit }, { h: 'Kullanılabilir', n: 1, f: r => fmt(r.available) }, { h: 'Lot dağılımı (FEFO)', f: r => r.parts.map(p => `${p.lot || '—'}: ${fmt(p.qty)}`).join(', ') }, { h: 'Durum', f: r => badge(r.ok ? 'YETERLİ' : 'YETERSİZ', r.ok ? 'b-ok' : 'b-bad') }], plan.lines),
        h('div', { class: 'row' }, h('button', { disabled: !plan.ok, onclick: () => run(async () => { const r = await api('POST', '/api/production', body()); toast(`${r.id} kaydedildi · lot ${r.lot} · ${r.totalJars} kavanoz`); await loadMaster(); VIEWS.production(); }) }, plan.ok ? 'Üretimi kaydet' : 'Stok yetersiz — kaydedilemez')));
    } catch (e) { plan = null; out.replaceChildren(h('p', { class: 'neg' }, e.message)); }
  };
  const btn = h('button', { class: 'sec', onclick: prev }, 'Hesapla / önizle');
  page(head('Üretim girişi', 'Reçeteye göre hammadde ve ambalaj tüketimi otomatik hesaplanır ve lotlardan (FEFO) düşülür.'),
    h('div', { class: 'card' }, h('div', { class: 'form' }, field('Tarih', f.date), field('Vardiya', f.shift), field('Hat', f.line), field('Ürün', f.product), field('Palet', f.pallets), field('Koli (palet dışı)', f.boxes), field('Tek kavanoz (koli dışı)', f.jars), field('Mamul lot no', f.lot), field('Notlar', f.note)), h('div', { class: 'row' }, btn)), out);
};

VIEWS.dispatch = async () => {
  const st = await api('GET', '/api/stock');
  const prods = M.products.filter(p => st.lots.some(l => l.code === p.code && l.qty > 0));
  const f = { date: h('input', { type: 'date', value: M.today }), type: sel([['SEVKIYAT', 'Sevkiyat'], ['FIRE', 'Fire / zayiat']], 'SEVKIYAT'), product: sel(prods.length ? prods.map(p => [p.code, label(mat(p.code))]) : [['', 'Stokta mamul yok']], ''), shape: sel(['ADET', 'KOLI', 'PALET'], 'KOLI'), qty: h('input', { type: 'number', min: 0, step: 1 }), lot: sel([['', 'Otomatik (FEFO)']], ''), docNo: h('input'), reason: sel([['', '—'], ...M.reasons.filter(r => r.category === 'FIRE').map(r => [r.code, `${r.code} ${r.desc}`])], ''), note: h('input') };
  const info = h('div', { class: 'small muted' });
  const upd = () => { const ls = st.lots.filter(l => l.code === f.product.value && l.qty > 0 && l.loc === 'EZM-DEPO'); f.lot.replaceChildren(h('option', { value: '' }, 'Otomatik (FEFO)'), ...ls.map(l => h('option', { value: l.lot }, `${l.lot} · ${fmt(l.qty)} adet`))); const p = M.products.find(x => x.code === f.product.value); info.textContent = `Depoda: ${fmt(ls.reduce((s, l) => s + l.qty, 0))} adet` + (p ? ` · ${p.jarsPerBox || '?'} kavanoz/koli · ${p.boxesPerPallet || '?'} koli/palet` : ''); };
  f.product.addEventListener('change', upd); upd();
  page(head('Mamul çıkışı', 'Sevkiyat veya fire; lot belirtilmezse SKT\'si en yakın lottan düşülür.'),
    h('div', { class: 'card' }, h('div', { class: 'form' }, field('Tarih', f.date), field('İşlem türü', f.type), field('Ürün', f.product), field('Çıkış şekli', f.shape), field('Miktar', f.qty), field('Lot', f.lot), field('Belge / sevk no', f.docNo), field('Fire nedeni', f.reason), field('Açıklama', f.note)), info,
      h('div', { class: 'row' }, h('button', { onclick: () => run(async () => { const r = await api('POST', '/api/dispatch', { date: f.date.value, type: f.type.value, productCode: f.product.value, shape: f.shape.value, qty: f.qty.value, lot: f.lot.value, docNo: f.docNo.value, reason: f.reason.value, note: f.note.value }); toast(`${r.id}: ${fmt(r.jars)} adet çıkış · ${r.lots}`); VIEWS.dispatch(); }) }, 'Kaydet'))));
};

VIEWS.count = async () => {
  const type = sel([['DEVIR', 'Devir / ilk sayım (açılış stoğu)'], ['SAYIM', 'Periyodik sayım (fark düzeltme)']], 'DEVIR');
  const date = h('input', { type: 'date', value: M.today }), counter = h('input', { placeholder: 'Sayan kişi' }), note = h('input');
  const tbody = h('tbody'); let n = 0;
  const addRow = () => {
    const mi = matInput(null, 'dl-c' + (n++));
    const r = { mi, lot: h('input', { placeholder: 'Boşsa otomatik' }), loc: sel(M.locations.map(l => l.code), 'EZM-DEPO'), qty: h('input', { type: 'number', step: 'any' }), skt: h('input', { type: 'date' }), reason: sel([['', '—'], ...M.reasons.filter(x => x.category === 'SAYIM').map(x => [x.code, `${x.code} ${x.desc}`])], '') };
    const tr = h('tr', {}, h('td', {}, mi.el), h('td', {}, r.lot), h('td', {}, r.loc), h('td', {}, r.qty), h('td', {}, r.skt), h('td', {}, r.reason), h('td', {}, h('button', { class: 'sm danger', onclick: () => { tr.remove(); rows.splice(rows.indexOf(r), 1); } }, '✕')));
    rows.push(r); tbody.append(tr);
  };
  const rows = []; addRow();
  page(head('Sayım / Devir', 'Devir: eski stokların açılış hareketi. Sayım: sayılan miktar sistemle karşılaştırılır, fark neden koduyla düzeltme hareketi olur.'),
    h('div', { class: 'card' }, h('div', { class: 'form' }, field('Tip', type), field('Tarih', date), field('Sayan', counter), field('Açıklama', note)),
      h('div', { class: 'tw', style: 'margin-top:12px;max-height:none' }, h('table', {}, h('thead', {}, h('tr', {}, ['Malzeme', 'Lot', 'Lokasyon', 'Sayılan miktar', 'SKT', 'Fark nedeni (sayımda)', ''].map(t => h('th', {}, t)))), tbody)),
      h('div', { class: 'row' }, h('button', { class: 'sec', onclick: addRow }, '+ Satır'), h('button', { onclick: () => run(async () => {
        const r = await api('POST', '/api/count', { type: type.value, date: date.value, counter: counter.value, note: note.value, lines: rows.filter(x => x.mi.code).map(x => ({ code: x.mi.code, lot: x.lot.value, loc: x.loc.value, qty: x.qty.value, skt: x.skt.value, reason: x.reason.value })) });
        toast(`${r.id} kaydedildi (${r.lines.length} satır)`); VIEWS.count();
      }) }, 'Kaydet'))));
};

VIEWS.recipes = async () => {
  await loadMaster();
  const q = h('input', { placeholder: 'Ürün ara…' }), box = h('div');
  const draw = () => {
    const t = q.value.toLowerCase();
    const prods = M.products.filter(p => !t || label(mat(p.code)).toLowerCase().includes(t) || p.code.toLowerCase().includes(t));
    box.replaceChildren(...prods.map(p => { const rs = M.recipes.filter(r => r.productCode === p.code); if (!rs.length) return ''; return h('div', { class: 'card' }, h('b', {}, label(mat(p.code))),
      table([{ h: 'Reçete', f: r => r.id }, { h: 'Sürüm', f: r => 'v' + r.version }, { h: 'Durum', f: r => statusBadge(r.status) }, { h: 'Onay', f: r => r.qualityApprover ? `${r.qualityApprover} / ${r.productionApprover} (${fdate(r.validFrom)})` : '' }, { h: 'Kalem', n: 1, f: r => r.lines.length }, { h: '', f: r => h('span', {}, h('button', { class: 'sm sec', onclick: () => showRecipe(r) }, 'Aç'), ' ', h('button', { class: 'sm sec', onclick: () => editRecipe(p.code, r) }, 'Yeni sürüm')) }], rs)); }),
      h('p', { class: 'muted' }, 'Reçeteye sahip olmayan bir ürün için yeni reçete: Ürünler ekranından değil, buradaki "Yeni reçete" ile.'));
  };
  q.addEventListener('input', draw); draw();
  const prodSel = sel(M.products.map(p => [p.code, label(mat(p.code))]), 'MM-001');
  page(head('Reçeteler', 'Reçete üzerine yazılmaz; değişiklik yeni sürüm olur. Bir ürün için aynı anda tek ONAYLI reçete olur.'), h('div', { class: 'tools' }, q, prodSel, h('button', { onclick: () => editRecipe(prodSel.value, null) }, 'Yeni reçete')), box);
};
function showRecipe(r) {
  const approve = r.status === 'TASLAK' ? [h('h2', {}, 'Onay'), h('div', { class: 'form' }, field('Kalite onaylayan', h('input', { id: 'qa' })), field('Üretim onaylayan', h('input', { id: 'pa' })), h('button', { onclick: () => run(async () => { await api('POST', `/api/recipes/${r.id}/approve`, { quality: $('#qa').value, production: $('#pa').value }); toast('Reçete onaylandı; önceki onaylı sürüm pasife alındı'); VIEWS.recipes(); }) }, 'Onayla'))] : '';
  page(head(`${r.id}`, `${label(mat(r.productCode))} · v${r.version} · ${r.status}`), h('p', {}, r.description),
    table([{ h: 'Malzeme', f: l => label(mat(l.material)) }, { h: 'Miktar', n: 1, f: l => fmt(l.qty) }, { h: 'Hesap bazı', f: l => l.base }, { h: 'Fire %', n: 1, f: l => fmt(l.fire * 100) }, { h: 'Yuvarlama', f: l => l.rounding }, { h: 'Kritik tartım', f: l => l.critical ? 'EVET' : '' }], r.lines),
    approve, h('div', { class: 'row' }, h('button', { class: 'sec', onclick: () => VIEWS.recipes() }, '← Geri')));
}
function editRecipe(code, from) {
  const rows = []; const tbody = h('tbody'); let n = 0;
  const add = (l) => {
    const mi = matInput(['HAMMADDE', 'YARI_MAMUL', 'AMBALAJ'], 'dl-r' + (n++)); if (l) mi.input.value = label(mat(l.material));
    const r = { mi, qty: h('input', { type: 'number', step: 'any', value: l ? l.qty : '' }), base: sel(['KG_DOLGU', 'KAVANOZ', 'KOLI', 'PALET'], l ? l.base : 'KG_DOLGU'), fire: h('input', { type: 'number', step: 'any', value: l ? l.fire * 100 : 0 }), rounding: sel(['YOK', 'YUKARI'], l ? l.rounding : 'YOK'), critical: h('input', { type: 'checkbox', checked: l ? l.critical : false, style: 'width:auto' }) };
    const tr = h('tr', {}, h('td', {}, mi.el), h('td', {}, r.qty), h('td', {}, r.base), h('td', {}, r.fire), h('td', {}, r.rounding), h('td', {}, r.critical), h('td', {}, h('button', { class: 'sm danger', onclick: () => { tr.remove(); rows.splice(rows.indexOf(r), 1); } }, '✕')));
    rows.push(r); tbody.append(tr);
  };
  (from ? from.lines : [null]).forEach(add);
  const desc = h('input', { value: from ? from.description : '' });
  page(head('Reçete taslağı', label(mat(code)) + (from ? ` — ${from.id} esas alınarak yeni sürüm` : '')),
    h('div', { class: 'card' }, field('Açıklama', desc), h('div', { class: 'tw', style: 'margin-top:12px;max-height:none' }, h('table', {}, h('thead', {}, h('tr', {}, ['Malzeme', 'Miktar (KG_DOLGU için kg/kg, örn. 0,4 = %40)', 'Hesap bazı', 'Fire %', 'Yuvarlama', 'Kritik', ''].map(t => h('th', {}, t)))), tbody)),
      h('div', { class: 'row' }, h('button', { class: 'sec', onclick: () => add(null) }, '+ Kalem'), h('button', { onclick: () => run(async () => { const r = await api('POST', '/api/recipes', { productCode: code, description: desc.value, lines: rows.filter(x => x.mi.code).map(x => ({ material: x.mi.code, qty: x.qty.value, base: x.base.value, fire: x.fire.value, rounding: x.rounding.value, critical: x.critical.checked })) }); toast(`${r.id} TASLAK olarak kaydedildi`); VIEWS.recipes(); }) }, 'Taslak olarak kaydet'), h('button', { class: 'sec', onclick: () => VIEWS.recipes() }, 'Vazgeç'))));
}

VIEWS.products = async () => {
  await loadMaster();
  const q = h('input', { placeholder: 'Ara…' }), box = h('div');
  const draw = () => {
    const t = q.value.toLowerCase();
    const mk = (p, k, w = 70) => { const i = h('input', { type: 'number', value: p[k] ?? '', style: `width:${w}px` }); i.addEventListener('change', () => run(async () => { await api('PUT', `/api/products/${p.code}`, { [k]: i.value }); Object.assign(p, { [k]: i.value === '' ? null : Number(i.value) }); toast('Kaydedildi'); })); return i; };
    const st = p => { const s = sel(['AKTIF', 'TEYIT', 'BEKLEME', 'PASIF'], p.status); s.addEventListener('change', () => run(async () => { await api('PUT', `/api/products/${p.code}`, { status: s.value }); p.status = s.value; toast('Kaydedildi'); })); return s; };
    box.replaceChildren(table([{ h: 'Kod', f: p => p.code }, { h: 'Yeni kod', f: p => p.newCode }, { h: 'Ürün', f: p => mat(p.code).name }, { h: 'Nominal g', f: p => mk(p, 'nominal') }, { h: 'Hedef dolum g', f: p => mk(p, 'targetFill') }, { h: 'Kavanoz/koli', f: p => mk(p, 'jarsPerBox') }, { h: 'Koli/palet', f: p => mk(p, 'boxesPerPallet') }, { h: 'Raf ömrü gün', f: p => mk(p, 'shelfLifeDays', 80) }, { h: 'Durum', f: st }, { h: 'Onaylı reçete', f: p => { const r = M.recipes.find(x => x.productCode === p.code && x.status === 'ONAYLI'); return r ? badge('v' + r.version, 'b-ok') : badge('yok'); } }], M.products.filter(p => !t || (p.code + mat(p.code).name).toLowerCase().includes(t))));
  };
  q.addEventListener('input', draw); draw();
  const nm = h('input', { placeholder: 'Yeni ürün adı' }), brand = sel(['', 'Baynut', 'Trabzon Tarım', 'Nutshell'], '');
  page(head('Ürün kartları', 'Üretim/sevk hesapları için hedef dolum, koli ve palet dizilimi dolu olmalıdır. Hücreyi değiştirince otomatik kaydedilir.'), h('div', { class: 'tools' }, q, nm, brand, h('button', { class: 'sec', onclick: () => run(async () => { const m = await api('POST', '/api/materials', { name: nm.value, type: 'MAMUL', unit: 'ADET', category: 'Ezme ve krema', brand: brand.value }); toast(m.code + ' oluşturuldu'); VIEWS.products(); }) }, '+ Yeni ürün')), box);
};

VIEWS.materials = async () => {
  await loadMaster();
  const type = sel([['', 'Tüm tipler'], 'HAMMADDE', 'AMBALAJ', 'YARI_MAMUL', 'MAMUL'], ''), q = h('input', { placeholder: 'Ara…' }), box = h('div');
  const draw = () => { const t = q.value.toLowerCase(); box.replaceChildren(table([{ h: 'Kod', f: m => m.code }, { h: 'Ad', f: m => m.name }, { h: 'Tip', f: m => m.type }, { h: 'Birim', f: m => m.unit }, { h: 'Kategori', f: m => m.category }, { h: 'Lot', f: m => m.lotTracking }, { h: 'SKT', f: m => m.sktTracking ? 'EVET' : 'HAYIR' }, { h: 'Alerjen', f: m => m.allergens },
    { h: 'Min. stok', f: m => { const i = h('input', { type: 'number', value: m.minStock ?? '', style: 'width:90px' }); i.addEventListener('change', () => run(async () => { await api('PUT', `/api/materials/${m.code}`, { minStock: i.value }); m.minStock = i.value === '' ? null : Number(i.value); toast('Kaydedildi'); })); return i; } }], M.materials.filter(m => (!type.value || m.type === type.value) && (!t || label(m).toLowerCase().includes(t))))); };
  [type, q].forEach(e => e.addEventListener('input', draw)); draw();
  const f = { name: h('input'), type: sel(['HAMMADDE', 'AMBALAJ', 'YARI_MAMUL'], 'HAMMADDE'), unit: sel(['KG', 'ADET'], 'KG'), cat: h('input', { placeholder: 'Kategori' }), al: h('input', { placeholder: 'Alerjenler' }) };
  page(head('Malzeme kartları', 'Kod sistem tarafından üretilir.'), h('div', { class: 'card' }, h('b', {}, 'Yeni malzeme'), h('div', { class: 'form', style: 'margin-top:8px' }, field('Ad', f.name), field('Tip', f.type), field('Birim', f.unit), field('Kategori', f.cat), field('Alerjenler', f.al), h('button', { onclick: () => run(async () => { const m = await api('POST', '/api/materials', { name: f.name.value, type: f.type.value, unit: f.unit.value, category: f.cat.value, allergens: f.al.value, lotTracking: f.type.value === 'AMBALAJ' ? 'OPSIYONEL' : 'ZORUNLU' }); toast(m.code + ' oluşturuldu'); VIEWS.materials(); }) }, 'Ekle'))), h('div', { class: 'tools' }, type, q), box);
};

function movTable(rows) {
  return table([{ h: 'Zaman', f: r => fts(r.ts) }, { h: 'Tür', f: r => r.type }, { h: 'Malzeme', f: r => { const m = mat(r.code); return `${r.code} ${m ? m.name : ''}`; } }, { h: 'Lot', f: r => r.lot }, { h: 'Lokasyon', f: r => r.loc }, { h: 'Miktar', n: 1, f: r => h('span', { class: r.qty < 0 ? 'neg' : 'pos' }, fmt(r.qty)) }, { h: 'Belge', f: r => r.docId }, { h: 'Neden', f: r => r.reason }, { h: 'Not', f: r => r.note }], rows, { empty: 'Henüz hareket yok' });
}
VIEWS.movements = async () => { const d = await api('GET', '/api/movements'); page(head('Stok hareketleri', 'Değişmez defter. Hatalar belge iptaliyle ters kayıt olarak düzeltilir (son 1000 hareket).'), movTable(d.rows)); };

VIEWS.docs = async () => {
  const kind = sel([['receipts', 'Mal kabuller'], ['productions', 'Üretimler'], ['dispatches', 'Mamul çıkışları'], ['counts', 'Sayım / devir']], 'productions'); const box = h('div');
  const cancel = d => h('span', {}, d.cancelled ? badge('İPTAL', 'b-bad') : h('button', { class: 'sm danger', onclick: () => { const r = prompt(`${d.id} iptal nedeni?`); if (r) run(async () => { await api('POST', `/api/cancel/${d.id}`, { reason: r }); toast('İptal edildi (ters kayıt)'); draw(); }); } }, 'İptal et'));
  const draw = async () => {
    const d = await api('GET', '/api/docs/' + kind.value); const k = kind.value; const nm = c => { const m = mat(c); return m ? `${c} ${m.name}` : c; };
    const cols = { receipts: [{ h: 'No', f: r => r.id }, { h: 'Tarih', f: r => fdate(r.date) }, { h: 'Malzeme', f: r => nm(r.code) }, { h: 'Miktar', n: 1, f: r => fmt(r.qty) }, { h: 'Lot', f: r => r.lot }, { h: 'SKT', f: r => fdate(r.skt) }, { h: 'Sonuç', f: r => statusBadge(r.result) }, { h: 'Tedarikçi', f: r => r.supplier }, { h: 'Fiyat', f: r => r.unitPrice != null ? `${fmt(r.unitPrice)} ${r.currency}` : '' }],
      productions: [{ h: 'No', f: r => r.id }, { h: 'Tarih', f: r => fdate(r.date) }, { h: 'Ürün', f: r => nm(r.productCode) }, { h: 'Kavanoz', n: 1, f: r => fmt(r.totalJars) }, { h: 'Dolgu kg', n: 1, f: r => fmt(r.fillKg) }, { h: 'Mamul lot', f: r => r.lot }, { h: 'Reçete', f: r => r.recipeId }, { h: 'SKT', f: r => fdate(r.skt) }],
      dispatches: [{ h: 'No', f: r => r.id }, { h: 'Tarih', f: r => fdate(r.date) }, { h: 'Tür', f: r => r.type }, { h: 'Ürün', f: r => nm(r.productCode) }, { h: 'Adet', n: 1, f: r => fmt(r.jars) }, { h: 'Lotlar', f: r => r.lots }, { h: 'Belge no', f: r => r.docNo }],
      counts: [{ h: 'No', f: r => r.id }, { h: 'Tarih', f: r => fdate(r.date) }, { h: 'Tip', f: r => r.type }, { h: 'Sayan', f: r => r.counter }, { h: 'Satır', n: 1, f: r => r.lines.length }, { h: 'Fark toplamı', n: 1, f: r => fmt(r.lines.reduce((s, l) => s + (l.diff || 0), 0)) }] }[k];
    box.replaceChildren(table([...cols, { h: 'Kaydeden', f: r => r.user }, { h: '', f: cancel }], d.rows));
  };
  kind.addEventListener('change', draw); draw();
  page(head('Belgeler', 'Belge iptali, ters hareket üretir; sonraki işlemlerle stok kullanılmışsa iptal engellenir.'), h('div', { class: 'tools' }, kind), box);
};

// ---------- başlangıç ----------
let cur = 'dashboard';
function go(v) { cur = v; location.hash = v; document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.v === v)); run(() => VIEWS[v]()); }
(async () => {
  await loadMaster();
  const u = $('#user'); u.append(...M.users.filter(x => x.active).map(x => h('option', { value: x.email }, `${x.name} (${x.role})`)));
  if (!M.users.some(x => x.email === USER)) USER = M.users[0].email; u.value = USER;
  u.addEventListener('change', () => { USER = u.value; localStorage.setItem('user', USER); });
  $('#nav').append(...NAV.map(([v, t]) => v === 'sec' ? h('div', { class: 'sec' }, t) : h('a', { 'data-v': v, onclick: () => go(v) }, t)));
  go(VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : 'dashboard');
})();
