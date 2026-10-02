'use strict';
// Faz B ekranları: reçeteler, ürün/malzeme kartları, fire/lot kapanışı, kalite/karantina, transfer, izlenebilirlik.
// Yalnızca REST API ile konuşur; iş mantığı sunucudaki core/ modüllerindedir.

const LEVEL = { TAM: ['TAM %100', 'b-ok'], TOLERANS: ['TOLERANS İÇİ', 'b-ok'], ACIKLAMA: ['AÇIKLAMA GEREKLİ', 'b-warn'], ENGEL: ['ENGEL', 'b-bad'], BELIRSIZ: ['KONTROL EDİLEMİYOR', 'b-warn'] };
const MISS = v => (v === null || v === undefined || v === '');
const pad = v => MISS(v) ? '' : v;

// ---------- Reçeteler ----------
function totalsBox(t) {
  if (!t) return '';
  const [txt, cls] = LEVEL[t.level] || ['', ''];
  return h('div', { class: 'card', style: 'margin:8px 0' }, h('div', { class: 'grid' },
    ...[['Referans (hedef dolum)', t.referenceG == null ? '—' : fmt(t.referenceG) + ' g'], ['Reçete toplamı', t.totalG == null ? '—' : fmt(t.totalG) + ' g'], ['Toplam oran', t.totalPct == null ? '—' : '%' + fmt(t.totalPct)], ['Sapma', t.deviationPct == null ? '—' : (t.deviationPct > 0 ? '+' : '') + fmt(t.deviationPct) + '%']]
      .map(([k, v]) => h('div', { class: 'stat' }, h('b', { style: 'font-size:20px' }, v), h('span', {}, k))), h('div', { class: 'stat' }, badge(txt, cls), h('span', {}, 'Durum'))),
    h('p', { class: 'small muted', style: 'margin:8px 0 0' }, `Toplam hiçbir zaman otomatik yuvarlanmaz veya %100'e zorlanmaz. Tolerans: ±%${M.settings.recipeToleranceOkPct} kabul · ±%${M.settings.recipeToleranceBlockPct} üstü engel; arası açıklama gerektirir (ayarlanabilir).`));
}
const gramsOf = (l, m, p) => { if (!m || (m.type !== 'HAMMADDE' && m.type !== 'YARI_MAMUL')) return null; const kg = l.unit === 'G' ? l.qty / 1000 : l.qty; return l.base === 'KAVANOZ' ? kg * 1000 : (p && p.targetFill ? kg * p.targetFill : null); };

VIEWS.recipes = async () => {
  await loadMaster();
  const q = h('input', { placeholder: 'Ürün ara…' });
  const st = sel([['', 'Tüm durumlar'], 'TASLAK', 'ONAYLI', 'PASIF', 'IPTAL'], '');
  const prodSel = sel(M.products.map(p => [p.code, label(mat(p.code))]), M.products[0] && M.products[0].code);
  const box = h('div');
  const draw = () => {
    const t = q.value.toLowerCase();
    const groups = M.products.map(p => ({ p, rs: M.recipes.filter(r => r.productCode === p.code && (!st.value || r.status === st.value)) })).filter(g => g.rs.length && (!t || label(mat(g.p.code)).toLowerCase().includes(t)));
    box.replaceChildren(...(groups.length ? groups.map(({ p, rs }) => h('div', { class: 'card' }, h('b', {}, label(mat(p.code))),
      table([{ h: 'Reçete', f: r => r.id }, { h: 'Sürüm', f: r => 'v' + r.version }, { h: 'Durum', f: r => statusBadge(r.status) }, { h: 'Toplam', n: 1, f: r => r.totals.totalPct == null ? '' : '%' + fmt(r.totals.totalPct) }, { h: 'Onay', f: r => r.qualityApprover ? `${r.qualityApprover} / ${r.productionApprover} (${fdate(r.validFrom)})` : '' }, { h: 'Kalem', n: 1, f: r => r.lines.length },
        { h: '', f: r => h('span', {}, h('button', { class: 'sm sec', onclick: () => showRecipe(r.id) }, 'Aç'), ' ', r.status === 'TASLAK' ? h('button', { class: 'sm sec', onclick: () => editRecipe(p.code, r) }, 'Düzenle') : h('button', { class: 'sm sec', onclick: () => editRecipe(p.code, null, r) }, 'Yeni sürüm')) }], rs.slice().reverse()))) : [h('p', { class: 'muted' }, 'Kayıtlı reçete yok. Gerçek reçeteler kullanıcı tarafından "Yeni reçete" ile girilir.')]));
  };
  [q, st].forEach(e => e.addEventListener('input', draw)); draw();
  page(head('Reçeteler', 'Reçete yalnızca "hangi malzemeden ne kadar" bilgisidir; fiyat/maliyet içermez. Onaylı reçete değiştirilemez, değişiklik yeni sürümle yapılır.'),
    h('div', { class: 'tools' }, q, st, prodSel, h('button', { onclick: () => editRecipe(prodSel.value, null) }, 'Yeni reçete')), box);
};

function showRecipe(id) {
  const r = M.recipes.find(x => x.id === id); const p = M.products.find(x => x.code === r.productCode);
  const tl = new Map((r.totals.lines || []).map(x => [x.material, x]));
  const act = [];
  if (r.status === 'TASLAK') {
    const qa = h('input', { placeholder: 'Kalite onaylayan' }), pa = h('input', { placeholder: 'Üretim onaylayan' }), dn = h('input', { placeholder: r.totals.level === 'ACIKLAMA' ? 'Sapma açıklaması (zorunlu)' : 'Sapma açıklaması (isteğe bağlı)' });
    act.push(h('h2', {}, 'Onay'), h('div', { class: 'form' }, field('Kalite onaylayan', qa), field('Üretim onaylayan', pa), field('Sapma açıklaması', dn),
      h('button', { onclick: () => run(async () => { await api('POST', `/api/recipes/${r.id}/approve`, { quality: qa.value, production: pa.value, deviationNote: dn.value }, newRid()); toast('Reçete onaylandı; önceki onaylı sürüm pasife alındı'); VIEWS.recipes(); }) }, 'Onayla')),
      h('div', { class: 'row' }, h('button', { class: 'sec', onclick: () => editRecipe(r.productCode, r) }, 'Düzenle'), h('button', { class: 'danger', onclick: () => { const n = prompt('Taslak iptal nedeni?'); if (n !== null) run(async () => { await api('POST', `/api/recipes/${r.id}/discard`, { note: n }); toast('Taslak iptal edildi'); VIEWS.recipes(); }); } }, 'Taslağı iptal et')));
  }
  if (r.status === 'ONAYLI') act.push(h('div', { class: 'row' }, h('button', { class: 'danger', onclick: () => { const n = prompt('Pasife alma nedeni?'); if (n !== null) run(async () => { await api('POST', `/api/recipes/${r.id}/passivate`, { note: n }); toast('Reçete pasife alındı'); VIEWS.recipes(); }); } }, 'Pasife al')));
  if (r.status !== 'TASLAK') act.push(h('div', { class: 'row' }, h('button', { class: 'sec', onclick: () => editRecipe(r.productCode, null, r) }, 'Bu sürümden yeni sürüm oluştur')));
  page(head(r.id, `${label(mat(r.productCode))} · v${r.version}`), h('p', {}, statusBadge(r.status), ' ', r.description), totalsBox(r.totals),
    table([{ h: 'Malzeme', f: l => label(mat(l.material)) }, { h: 'Miktar', n: 1, f: l => fmt(l.qty) + ' ' + l.unit }, { h: 'Baz', f: l => l.base }, { h: 'g / kavanoz', n: 1, f: l => tl.has(l.material) ? fmt(tl.get(l.material).grams) : '' }, { h: 'Oran', n: 1, f: l => tl.has(l.material) ? '%' + fmt(tl.get(l.material).pct) : '' }, { h: 'Fire %', n: 1, f: l => fmt(l.fire * 100) }, { h: 'Yuvarlama', f: l => l.rounding }, { h: 'Kritik tartım', f: l => l.critical ? 'EVET' : '' }], r.lines),
    act, h('h2', {}, 'Değişiklik geçmişi'),
    table([{ h: 'Zaman', f: x => fts(x.ts) }, { h: 'Kullanıcı', f: x => x.user }, { h: 'İşlem', f: x => x.action }, { h: 'Not', f: x => x.note || (x.before ? `önceki: ${x.before.lines.length} kalem` : '') }], r.history.slice().reverse()),
    h('div', { class: 'row' }, h('button', { class: 'sec', onclick: () => VIEWS.recipes() }, '← Geri')));
}

function editRecipe(code, draft, basedOn) {
  const src = draft || basedOn; const p = M.products.find(x => x.code === code);
  const rows = []; const tbody = h('tbody'); let n = 0;
  const live = h('div');
  const upd = () => {
    const ref = p && (p.targetFill || p.nominal); let tot = 0, any = false;
    for (const r of rows) { const m = mat(r.mi.code); const g = gramsOf({ qty: Number(r.qty.value), unit: r.unit.value, base: r.base.value }, m, p); if (g != null && Number.isFinite(g)) { tot += g; any = true; } }
    live.replaceChildren(h('p', { class: ref ? '' : 'neg' }, ref ? `Hammadde toplamı: ${fmt(Math.round(tot * 1e6) / 1e6)} g — referans ${fmt(ref)} g — oran %${fmt(Math.round(tot / ref * 1e6) / 1e4)}  (yalnızca bilgi; kesin kontrol sunucuda yapılır)` : 'Ürün kartında hedef dolum/nominal gram yok: reçete toplamı kontrol edilemez, onaylanamaz. Ürünler ekranından tamamlayın.'));
  };
  const add = l => {
    const mi = matInput(['HAMMADDE', 'YARI_MAMUL', 'AMBALAJ'], 'dl-r' + (n++)); if (l) mi.input.value = label(mat(l.material));
    const r = { mi, qty: h('input', { type: 'number', step: 'any', value: l ? l.qty : '' }), unit: sel(['G', 'KG', 'ADET'], l ? l.unit : 'G'), base: sel(['KAVANOZ', 'KOLI', 'PALET', 'KG_DOLGU'], l ? l.base : 'KAVANOZ'),
      fire: h('input', { type: 'number', step: 'any', value: l ? Math.round(l.fire * 1e8) / 1e6 : 0 }), rounding: sel(['YOK', 'YUKARI'], l ? l.rounding : 'YOK'), critical: h('input', { type: 'checkbox', checked: l ? l.critical : false, style: 'width:auto' }) };
    mi.input.addEventListener('change', () => { const m = mat(mi.code); if (m) { r.unit.value = m.unit === 'ADET' ? 'ADET' : (r.unit.value === 'ADET' ? 'G' : r.unit.value); r.base.value = m.type === 'AMBALAJ' ? (r.base.value === 'KG_DOLGU' ? 'KAVANOZ' : r.base.value) : (r.base.value === 'KOLI' || r.base.value === 'PALET' ? 'KAVANOZ' : r.base.value); } upd(); });
    [r.qty, r.unit, r.base].forEach(e => e.addEventListener('input', upd));
    const tr = h('tr', {}, h('td', {}, mi.el), h('td', {}, r.qty), h('td', {}, r.unit), h('td', {}, r.base), h('td', {}, r.fire), h('td', {}, r.rounding), h('td', {}, r.critical), h('td', {}, h('button', { class: 'sm danger', onclick: () => { tr.remove(); rows.splice(rows.indexOf(r), 1); upd(); } }, '✕')));
    rows.push(r); tbody.append(tr);
  };
  (src ? src.lines : [null]).forEach(add); upd();
  const desc = h('input', { value: draft ? draft.description : '' });
  const rid = newRid();
  const body = () => ({ productCode: code, description: desc.value, basedOn: basedOn ? basedOn.id : undefined, lines: rows.filter(x => x.mi.code).map(x => ({ material: x.mi.code, qty: x.qty.value, unit: x.unit.value, base: x.base.value, fire: x.fire.value, rounding: x.rounding.value, critical: x.critical.checked })) });
  page(head(draft ? `Taslağı düzenle — ${draft.id}` : (basedOn ? `Yeni sürüm — ${basedOn.id} esas alınarak` : 'Yeni reçete taslağı'), label(mat(code))),
    h('div', { class: 'card' }, field('Açıklama', desc),
      h('p', { class: 'small muted' }, 'Miktar, seçilen BAZ birimi başınadır: KAVANOZ = 1 kavanoz başına · KOLI = 1 koli başına · PALET = 1 palet başına · KG_DOLGU = 1 kg dolgu başına (yalnızca hammadde). Fiyat/maliyet girilmez.'),
      h('div', { class: 'tw', style: 'margin-top:12px;max-height:none' }, h('table', {}, h('thead', {}, h('tr', {}, ['Malzeme', 'Miktar', 'Birim', 'Baz', 'Fire %', 'Yuvarlama', 'Kritik tartım', ''].map(t => h('th', {}, t)))), tbody)), live,
      h('div', { class: 'row' }, h('button', { class: 'sec', onclick: () => { add(null); } }, '+ Kalem'),
        h('button', { onclick: () => run(async () => { const r = draft ? await api('PUT', `/api/recipes/${draft.id}`, body(), rid) : await api('POST', '/api/recipes', body(), rid); toast(`${r.id} TASLAK olarak kaydedildi`); await loadMaster(); showRecipe(r.id); }) }, 'Taslak olarak kaydet'), h('button', { class: 'sec', onclick: () => VIEWS.recipes() }, 'Vazgeç'))));
}

// ---------- Ürün kartları ----------
VIEWS.products = async () => {
  await loadMaster();
  const q = h('input', { placeholder: 'Ara…' }), box = h('div');
  const patch = (code, k, v) => run(async () => { const r = await api('PUT', `/api/products/${code}`, { [k]: v }); Object.assign(M.products.find(x => x.code === code), r); toast('Kaydedildi'); draw(); });
  const num = (p, k, w = 70) => { const i = h('input', { type: 'number', value: pad(p[k]), style: `width:${w}px`, class: MISS(p[k]) ? 'miss' : '' }); i.addEventListener('change', () => patch(p.code, k, i.value)); return i; };
  const txt = (p, k, w = 140) => { const i = h('input', { value: pad(p[k]), style: `width:${w}px` }); i.addEventListener('change', () => patch(p.code, k, i.value)); return i; };
  const draw = () => {
    const t = q.value.toLowerCase();
    const rows = M.products.filter(p => !t || (p.code + p.name + p.brand).toLowerCase().includes(t));
    box.replaceChildren(table([{ h: 'Kod', f: p => p.code }, { h: 'Yeni kod', f: p => txt(p, 'newCode', 150) }, { h: 'Ürün adı', f: p => txt(p, 'name', 260) },
      { h: 'Marka', f: p => { const s = sel([['', '—'], ...M.brands], p.brand); s.addEventListener('change', () => patch(p.code, 'brand', s.value)); return s; } },
      { h: 'Nominal g', f: p => num(p, 'nominal') }, { h: 'Hedef dolum g', f: p => num(p, 'targetFill') }, { h: 'Kavanoz/koli', f: p => num(p, 'jarsPerBox') }, { h: 'Koli/palet', f: p => num(p, 'boxesPerPallet') },
      { h: 'Palet toplam adet', f: p => num(p, 'palletJars', 90) }, { h: 'Raf ömrü gün', f: p => num(p, 'shelfLifeDays', 80) },
      { h: 'Durum', f: p => { const s = sel(['AKTIF', 'TEYIT', 'BEKLEME', 'PASIF'], p.status); s.addEventListener('change', () => patch(p.code, 'status', s.value)); return s; } },
      { h: 'Onaylı reçete', f: p => { const r = M.recipes.find(x => x.productCode === p.code && x.status === 'ONAYLI'); return r ? badge('v' + r.version, 'b-ok') : badge('yok'); } }], rows));
  };
  q.addEventListener('input', draw); draw();
  const f = { name: h('input', { placeholder: 'Ürün adı *' }), brand: sel([['', 'Marka seçin'], ...M.brands], ''), nominal: h('input', { type: 'number', placeholder: 'Nominal g' }), targetFill: h('input', { type: 'number', placeholder: 'Hedef dolum g' }), jarsPerBox: h('input', { type: 'number', placeholder: 'Kavanoz/koli' }), boxesPerPallet: h('input', { type: 'number', placeholder: 'Koli/palet' }), shelfLifeDays: h('input', { type: 'number', placeholder: 'Raf ömrü gün' }) };
  const nb = h('input', { placeholder: 'Yeni marka adı' });
  page(head('Ürün kartları', 'Boş (kırmızı çerçeveli) alanlar henüz teyit edilmemiş bilgidir; sistem tahmin etmez. Hücreyi değiştirince kaydedilir.'),
    h('div', { class: 'card' }, h('b', {}, 'Yeni ürün kartı'), h('div', { class: 'form', style: 'margin-top:8px' }, field('Ürün adı', f.name), field('Marka', f.brand), field('Nominal gram', f.nominal), field('Hedef dolum (g)', f.targetFill), field('Koli içi adet', f.jarsPerBox), field('Palette koli', f.boxesPerPallet), field('Raf ömrü (gün)', f.shelfLifeDays),
      h('button', { onclick: () => run(async () => { const body = {}; for (const [k, e] of Object.entries(f)) if (e.value !== '') body[k] = e.value; const r = await api('POST', '/api/products', body, newRid()); toast(`${r.code} oluşturuldu (durum: TEYIT)`); VIEWS.products(); }) }, 'Ürün ekle')),
      h('div', { class: 'row' }, nb, h('button', { class: 'sec', onclick: () => run(async () => { await api('POST', '/api/brands', { name: nb.value }); toast('Marka eklendi'); VIEWS.products(); }) }, '+ Marka ekle'))),
    h('div', { class: 'tools' }, q), box);
};

// ---------- Malzeme kartları ----------
VIEWS.materials = async () => {
  await loadMaster();
  const type = sel([['', 'Tüm tipler'], 'HAMMADDE', 'AMBALAJ', 'YARI_MAMUL', 'MAMUL'], ''), q = h('input', { placeholder: 'Ara…' }), box = h('div');
  const patch = (code, body) => run(async () => { const r = await api('PUT', `/api/materials/${code}`, body); Object.assign(mat(code), r); toast('Kaydedildi'); draw(); });
  const draw = () => {
    const t = q.value.toLowerCase();
    box.replaceChildren(table([{ h: 'Kod', f: m => m.code }, { h: 'Ad', f: m => { const i = h('input', { value: m.name, style: 'width:300px' }); i.addEventListener('change', () => patch(m.code, { name: i.value })); return i; } }, { h: 'Tip', f: m => m.type },
      { h: 'Birim', f: m => { const s = sel(['KG', 'ADET'], m.unit); s.addEventListener('change', () => patch(m.code, { unit: s.value }).then(() => draw())); return s; } },
      { h: 'Kategori', f: m => m.category }, { h: 'Lot takibi', f: m => { const s = sel(['ZORUNLU', 'OPSIYONEL', 'YOK'], m.lotTracking); s.addEventListener('change', () => patch(m.code, { lotTracking: s.value })); return s; } },
      { h: 'SKT', f: m => m.sktTracking ? 'EVET' : 'HAYIR' }, { h: 'Alerjen', f: m => m.allergens },
      { h: 'Min. stok', f: m => { const i = h('input', { type: 'number', value: pad(m.minStock), style: 'width:90px' }); i.addEventListener('change', () => patch(m.code, { minStock: i.value })); return i; } },
      { h: 'Aktif', f: m => { const c = h('input', { type: 'checkbox', checked: m.active, style: 'width:auto' }); c.addEventListener('change', () => patch(m.code, { active: c.checked })); return c; } }],
      M.materials.filter(m => (!type.value || m.type === type.value) && (!t || label(m).toLowerCase().includes(t)))));
  };
  [type, q].forEach(e => e.addEventListener('input', draw)); draw();
  const f = { name: h('input'), type: sel(['HAMMADDE', 'AMBALAJ', 'YARI_MAMUL'], 'HAMMADDE'), unit: sel(['KG', 'ADET'], 'KG'), cat: h('input', { placeholder: 'Kategori' }), lot: sel(['ZORUNLU', 'OPSIYONEL', 'YOK'], 'ZORUNLU'), al: h('input', { placeholder: 'Alerjenler' }) };
  page(head('Malzeme kartları', 'Kod sistem tarafından üretilir. Hareketi olan malzemenin birimi ve lot takibi değiştirilemez. Pasif malzemeye mal kabul yapılamaz.'),
    h('div', { class: 'card' }, h('b', {}, 'Yeni malzeme'), h('div', { class: 'form', style: 'margin-top:8px' }, field('Ad', f.name), field('Tip', f.type), field('Birim', f.unit), field('Kategori', f.cat), field('Lot takibi', f.lot), field('Alerjenler', f.al),
      h('button', { onclick: () => run(async () => { const m = await api('POST', '/api/materials', { name: f.name.value, type: f.type.value, unit: f.unit.value, category: f.cat.value, lotTracking: f.lot.value, allergens: f.al.value }, newRid()); toast(m.code + ' oluşturuldu'); VIEWS.materials(); }) }, 'Ekle'))), h('div', { class: 'tools' }, type, q), box);
};

// ---------- Fire / Lot kapanışı ----------
VIEWS.adjust = async () => {
  const st = await api('GET', '/api/stock'); const prods = (await api('GET', '/api/docs/productions')).rows.filter(x => !x.cancelled);
  const lotsOf = code => st.lots.filter(l => l.code === code && l.qty > 0);
  const lotSel = (mi, locSel) => { const s = h('select'); const fill = () => { s.replaceChildren(h('option', { value: '' }, '— FEFO / otomatik —'), ...lotsOf(mi.code).map(l => h('option', { value: l.lot + '|' + l.loc }, `${l.lot || '(lotsuz)'} · ${l.loc} · ${fmt(l.qty)} ${l.unit} · ${l.status}`))); }; mi.input.addEventListener('input', fill); fill(); return s; };
  const reasons = cat => M.reasons.filter(r => r.category === cat).map(r => [r.code, `${r.code} — ${r.desc}`]);
  const prodOpt = [['', '— üretime bağlı değil —'], ...prods.slice(0, 50).map(p => [p.id, `${p.id} · ${fdate(p.date)} · ${p.lot}`])];
  const rid1 = newRid(), rid2 = newRid();
  // fire
  const fm = matInput(null, 'dl-fire'); const fl = lotSel(fm); const fq = h('input', { type: 'number', step: 'any', min: 0 }), fr = sel([['', 'Neden seçin *'], ...reasons('FIRE')], ''), fp = sel(prodOpt, ''), fn = h('input');
  // lot kapanış
  const cm = matInput(null, 'dl-lc'); const cl = h('select'); const fillC = () => cl.replaceChildren(h('option', { value: '' }, '— lot seçin —'), ...st.lots.filter(l => l.code === cm.code && l.lot).map(l => h('option', { value: l.lot + '|' + l.loc }, `${l.lot} · ${l.loc} · sistem ${fmt(l.qty)} ${l.unit} · ${l.status}`))); cm.input.addEventListener('input', fillC); fillC();
  const ca = h('input', { type: 'number', step: 'any', min: 0 }), cr = sel([['', 'Neden (fark varsa zorunlu)'], ...reasons('LOT_KAPANIS')], ''), cc = h('input', { type: 'checkbox', style: 'width:auto' }), cp = sel(prodOpt, ''), cn = h('input');
  // üretim tüketim özeti
  const ps = sel([['', 'Üretim seçin'], ...prodOpt.slice(1)], ''); const sumBox = h('div');
  ps.addEventListener('change', () => run(async () => { if (!ps.value) return sumBox.replaceChildren(); const d = await api('GET', `/api/productions/${ps.value}/consumption`); sumBox.replaceChildren(table([{ h: 'Malzeme', f: r => `${r.code} — ${r.name}` }, { h: 'Teorik (reçete)', n: 1, f: r => fmt(r.theoretical) + ' ' + r.unit }, { h: '+ Fire', n: 1, f: r => fmt(r.fire) }, { h: '± Lot kapanış farkı', n: 1, f: r => fmt(r.lotDiff) }, { h: '= Gerçek tüketim', n: 1, f: r => h('b', {}, fmt(r.actual)) }], d.rows)); }));
  page(head('Fire / Lot kapanışı', 'Her kayıt ayrı bir hareket olarak (FIRE / LOT_KAPANIS) ve neden koduyla stok geçmişinde görünür; miktar sessizce değişmez.'),
    h('div', { class: 'card' }, h('b', {}, 'Fire (zayiat)'), h('div', { class: 'form', style: 'margin-top:8px' }, field('Malzeme', fm.el), field('Lot / lokasyon', fl), field('Fire miktarı', fq), field('Neden (zorunlu)', fr), field('Üretime bağla', fp), field('Not', fn),
      h('button', { onclick: () => run(async () => { const [lot, loc] = (fl.value || '|').split('|'); const r = await api('POST', '/api/fire', { code: fm.code, lot, loc: lot ? loc : undefined, qty: fq.value, reason: fr.value, productionId: fp.value, note: fn.value }, rid1); toast(`${r.id} kaydedildi · ${r.lots}`); VIEWS.adjust(); }) }, 'Fire kaydet'))),
    h('div', { class: 'card' }, h('b', {}, 'Lot kapanışı / fark'), h('p', { class: 'small muted' }, 'Lotun fiziksel kalanını girin; sistemle fark neden koduyla ayrı hareket olur. "Lotu kapat" işaretlenirse tüm lokasyonlarda bakiye sıfır olmalı ve lot bir daha kullanılamaz.'),
      h('div', { class: 'form' }, field('Malzeme', cm.el), field('Lot / lokasyon', cl), field('Fiziksel kalan', ca), field('Neden', cr), field('Üretime bağla', cp), field('Not', cn), field('Lotu kapat', cc),
        h('button', { onclick: () => run(async () => { const [lot, loc] = (cl.value || '|').split('|'); const r = await api('POST', '/api/lot-close', { code: cm.code, lot, loc, actual: ca.value, reason: cr.value, close: cc.checked, productionId: cp.value, note: cn.value }, rid2); toast(`${r.id} kaydedildi · fark ${fmt(r.diff)}${r.closed ? ' · lot kapatıldı' : ''}`); VIEWS.adjust(); }) }, 'Kaydet'))),
    h('h2', {}, 'Üretim tüketim özeti (teorik → gerçek)'), h('div', { class: 'tools' }, ps), sumBox);
};

// ---------- Kalite / Karantina ----------
VIEWS.quality = async () => {
  const st = await api('GET', '/api/stock');
  const who = h('input', { placeholder: 'Karar veren (kalite sorumlusu) *', value: localStorage.getItem('qa') || '' }), note = h('input', { placeholder: 'Not / gerekçe' });
  who.addEventListener('change', () => { try { localStorage.setItem('qa', who.value); } catch { /* yoksay */ } });
  const decide = (kind, l) => run(async () => { const r = await api('POST', `/api/quality/${kind}`, { code: l.code, lot: l.lot, decidedBy: who.value, note: note.value }, newRid()); toast(`${r.id}: ${r.action} — ${l.lot}`); VIEWS.quality(); });
  const rows = st.lots.filter(l => (l.status === 'KARANTINA' || l.status === 'RED') && l.qty > 0);
  const hm = matInput(null, 'dl-hold'); const hl = h('select'); const fillH = () => hl.replaceChildren(h('option', { value: '' }, '— lot seçin —'), ...[...new Map(st.lots.filter(l => l.code === hm.code && l.lot && l.status === 'ONAYLI' && l.qty > 0 && l.loc !== 'EZM-KAR').map(l => [l.lot, l])).values()].map(l => h('option', { value: l.lot }, `${l.lot} · ${fmt(l.qty)} ${l.unit}`))); hm.input.addEventListener('input', fillH); fillH();
  page(head('Kalite / Karantina', 'Karantina ve red lotları üretimde ve sevkte kullanılamaz. Serbest bırakılan lot depoya taşınır ve tekrar kullanılabilir olur. Kalite kararları iptal edilmez, ters kararla düzeltilir.'),
    h('div', { class: 'card' }, h('div', { class: 'form' }, field('Karar veren', who), field('Not / gerekçe (red ve karantinaya almada zorunlu)', note))),
    h('h2', {}, 'Karantinadaki / reddedilen lotlar'),
    table([{ h: 'Malzeme', f: l => `${l.code} — ${l.name}` }, { h: 'Lot', f: l => l.lot }, { h: 'Lokasyon', f: l => l.loc }, { h: 'Miktar', n: 1, f: l => fmt(l.qty) + ' ' + l.unit }, { h: 'SKT', f: l => fdate(l.skt) }, { h: 'Durum', f: l => statusBadge(l.status) },
      { h: '', f: l => l.status === 'KARANTINA' ? h('span', {}, h('button', { class: 'sm', onclick: () => decide('release', l) }, 'Serbest bırak'), ' ', h('button', { class: 'sm danger', onclick: () => decide('reject', l) }, 'Reddet')) : 'İade/imha için Fire ekranını kullanın' }], rows, { empty: 'Karantinada lot yok' }),
    h('h2', {}, 'Onaylı lotu karantinaya al'), h('div', { class: 'card' }, h('div', { class: 'form' }, field('Malzeme', hm.el), field('Lot', hl), h('button', { class: 'danger', onclick: () => { if (!hl.value) return toast('Lot seçin', true); decide('hold', { code: hm.code, lot: hl.value }); } }, 'Karantinaya al'))));
};

// ---------- Lokasyon transferi ----------
VIEWS.transfer = async () => {
  const st = await api('GET', '/api/stock'); const rid = newRid();
  const mi = matInput(null, 'dl-trf'); const lotS = h('select');
  const fill = () => lotS.replaceChildren(h('option', { value: '' }, '— lot / lokasyon seçin —'), ...st.lots.filter(l => l.code === mi.code && l.qty > 0 && l.status !== 'KARANTINA' && l.status !== 'RED' && l.loc !== 'EZM-KAR').map(l => h('option', { value: l.lot + '|' + l.loc }, `${l.lot || '(lotsuz)'} · ${l.loc} · ${fmt(l.qty)} ${l.unit}`)));
  mi.input.addEventListener('input', fill); fill();
  const to = sel(M.locations.filter(l => l.code !== 'EZM-KAR').map(l => [l.code, `${l.code} — ${l.name}`]), 'EZM-HAT1'), qty = h('input', { type: 'number', step: 'any', min: 0 }), note = h('input');
  const hist = h('div'); run(async () => { const d = await api('GET', '/api/docs/transfers'); hist.replaceChildren(table([{ h: 'No', f: r => r.id }, { h: 'Zaman', f: r => fts(r.ts) }, { h: 'Malzeme', f: r => r.code }, { h: 'Lot', f: r => r.lot }, { h: 'Kaynak', f: r => r.from }, { h: 'Hedef', f: r => r.to }, { h: 'Miktar', n: 1, f: r => fmt(r.qty) }, { h: '', f: r => r.cancelled ? badge('İPTAL', 'b-bad') : '' }], d.rows.slice(0, 30))); });
  page(head('Lokasyon transferi', 'Çıkış ve giriş iki ayrı stok hareketi olarak, tek belgeyle kaydedilir. Karantina lokasyonuna giriş/çıkış yalnızca Kalite ekranından yapılır.'),
    h('div', { class: 'card' }, h('div', { class: 'form' }, field('Malzeme', mi.el), field('Kaynak lot / lokasyon', lotS), field('Hedef lokasyon', to), field('Miktar', qty), field('Not', note),
      h('button', { onclick: () => run(async () => { const [lot, from] = (lotS.value || '|').split('|'); const r = await api('POST', '/api/transfer', { code: mi.code, lot, from, to: to.value, qty: qty.value, note: note.value }, rid); toast(`${r.id} kaydedildi`); VIEWS.transfer(); }) }, 'Transfer et'))),
    h('h2', {}, 'Son transferler'), hist);
};

// ---------- İzlenebilirlik ----------
VIEWS.trace = async () => {
  const st = await api('GET', '/api/stock');
  const mi = matInput(null, 'dl-tr'); const lot = h('input', { list: 'dl-trlot', placeholder: 'Lot no' }); const dl = h('datalist', { id: 'dl-trlot' });
  mi.input.addEventListener('input', () => dl.replaceChildren(...[...new Set(st.lots.filter(l => l.code === mi.code && l.lot).map(l => l.lot))].map(v => h('option', { value: v }))));
  const out = h('div');
  const go = (code, lt) => run(async () => {
    const d = await api('GET', `/api/trace?code=${encodeURIComponent(code)}&lot=${encodeURIComponent(lt)}`);
    const L = d.lot; const parts = [];
    parts.push(h('div', { class: 'card' }, h('b', {}, `${L.code} — ${L.name}`), h('p', {}, `Lot: `, h('b', {}, L.lot), ` · SKT: ${fdate(L.skt) || '—'} · Durum: `, statusBadge(L.status || '—'), ` · Stok: ${L.stock.map(s => `${s.loc} ${fmt(s.qty)} ${L.unit}`).join(', ') || '0'}`),
      L.supplier ? h('p', { class: 'small' }, `Tedarikçi: ${L.supplier.name} · tedarikçi lotu: ${L.supplier.supplierLot || '—'} · irsaliye: ${L.supplier.waybill || '—'} · kabul: ${L.supplier.receiptId} (${fdate(L.supplier.date)})`) : ''));
    if (d.madeBy.length) {
      parts.push(h('h2', {}, 'Bu lot nasıl üretildi? (mamul → hammadde)'));
      for (const mb of d.madeBy) parts.push(h('div', { class: 'card' }, h('b', {}, `${mb.productionId} · ${fdate(mb.date)} · ${fmt(mb.producedQty)} adet · reçete ${mb.recipeId} v${mb.recipeVersion}`),
        table([{ h: 'Hammadde / ambalaj', f: i => `${i.code} — ${i.name}` }, { h: 'Hammadde lotu', f: i => h('a', { href: '#', onclick: e => { e.preventDefault(); mi.input.value = label(mat(i.code)); lot.value = i.lot; go(i.code, i.lot); } }, i.lot || '(lotsuz)') }, { h: 'Kullanılan', n: 1, f: i => fmt(i.qty) + ' ' + i.unit }, { h: 'SKT', f: i => fdate(i.skt) }, { h: 'Tedarikçi', f: i => i.supplier ? `${i.supplier.name} (${i.supplier.supplierLot || '—'})` : '' }], mb.inputs)));
    }
    if (d.usedIn.length) {
      parts.push(h('h2', {}, 'Bu lot nerelerde kullanıldı? (hammadde → mamul → sevk)'));
      for (const u of d.usedIn) parts.push(h('div', { class: 'card' }, h('b', {}, `${u.productionId} · ${fdate(u.date)} · bu üretimde ${fmt(u.consumedQty)} ${u.unit} kullanıldı`),
        table([{ h: 'Oluşan mamul lotu', f: o => h('a', { href: '#', onclick: e => { e.preventDefault(); mi.input.value = label(mat(o.code)); lot.value = o.lot; go(o.code, o.lot); } }, `${o.code} — ${o.name} / ${o.lot}`) }, { h: 'Üretilen', n: 1, f: o => fmt(o.qty) }, { h: 'SKT', f: o => fdate(o.skt) }, { h: 'Sevkiyatlar', f: o => o.shipments.map(s => `${fdate(s.date)} ${s.docNo || s.docId}: ${fmt(s.qty)}`).join(' · ') || 'sevk yok' }], u.outputs)));
    }
    if (d.shipments.length) parts.push(h('h2', {}, 'Sevkiyatlar'), table([{ h: 'Belge', f: s => s.docId }, { h: 'Tarih', f: s => fdate(s.date) }, { h: 'Sevk/irsaliye no', f: s => s.docNo }, { h: 'Adet', n: 1, f: s => fmt(s.qty) }], d.shipments));
    if (!d.madeBy.length && !d.usedIn.length) parts.push(h('p', { class: 'muted' }, 'Bu lot için henüz üretim kaydı yok.'));
    out.replaceChildren(...parts);
  });
  page(head('İzlenebilirlik', 'Mamul lotundan hammadde lotlarına, hammadde lotundan üretimlere, mamul lotlarına ve sevkiyatlara. Geri çağırma / kalite incelemesi için.'),
    h('div', { class: 'card' }, h('div', { class: 'form' }, field('Malzeme / ürün', mi.el), field('Lot', h('div', {}, lot, dl)), h('button', { onclick: () => { if (!mi.code || !lot.value) return toast('Malzeme ve lot seçin', true); go(mi.code, lot.value); } }, 'İzle'))), out);
};
