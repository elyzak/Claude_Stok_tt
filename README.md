# Trabzon Tarım – Ezme Krema Stok Sistemi (Faz 2)

Sıfır bağımlılıklı Node.js (>= 22) uygulaması. Veri `data/db.json` dosyasındadır (git'e girmez).

```
npm start     # http://localhost:3000  (PORT, DATA_DIR, APP_TZ ile değiştirilebilir)
npm test      # otomatik testler (geçici veritabanında, gerçek veriye dokunmaz)
npm run simulate   # tek bir test üretimini baştan sona gösterir (geçici veritabanı)
```

## Dallar
- `main`: çalışan / güvenli sürüm. Doğrudan geliştirme yapılmaz.
- `develop`: tüm geliştirme burada.

## Veri ilkeleri
- Uygulama **temiz** başlar: stok hareketi yoktur. Gerçek stok **Sayım / Devir** ekranından girilir.
- Seed'deki ürün kartları ve reçeteler Sheet'ten gelen **taslak/test** verisidir, gerçek veri sayılmaz;
  gerçek ürün bilgileri ve reçeteler kullanıcı tarafından girilip doğrulanacaktır.
- Testler kendi sahte verisini yalnızca geçici bir klasörde üretir ve siler (`test/helpers.js`).

## Saat dilimi
Tarihler `Europe/Istanbul` saatine göre hesaplanır (`lib/time.js`, `APP_TZ` ile değiştirilebilir).

## Hata kodları (API)
400 doğrulama · 401 kullanıcı yok · 403 tanımsız/pasif kullanıcı · 404 bulunamadı · 405 yöntem · 409 çakışma/durum uyuşmazlığı · 413 büyük istek · 500 beklenmeyen.
Yazma isteklerinde `X-Request-Id` başlığı çift gönderimi engeller.

## Faz A kuralları (stok bütünlüğü)
- Devir: mevcut lota devir girilemez; aynı lot/lokasyona ikinci devir engellenir (iptal edilmişse yeniden girilebilir).
- Sayım: yalnızca sistemde kayıtlı lot/lokasyon için; fark neden koduyla düzeltilir. Yeni stok Devir/Mal kabul ile girilir.
- İptal edilen belgenin lotu yeniden kullanılabilir.
- Üretim: kayıt, ekranda onaylanan önizlemeyle birebir aynı hesaba dayanır (`expect`); değişmişse 409.

## Mimari
- `core/` — stok çekirdeği (arayüzden bağımsız): `store` (atomik `tx`), `ledger`, `catalog`, `recipes`, `receipts`, `production`, `dispatch`,
  `counts`, `adjust` (fire/lot kapanışı), `quality` (karantina/transfer), `cancel`, `trace`, `reports`. Yeni modüller (ör. Maliyet) aynı
  `store`/`ledger` üzerinden ayrı dosyalar olarak eklenir; çekirdek değişmez.
- `server.js` — yalnızca HTTP katmanı. `public/` — tarayıcı arayüzü (yalnızca REST API kullanır).
- Her yazma işlemi tek bir atomik işlemdir: hata olursa bellek ve disk önceki duruma döner.

## Faz B kuralları
- Reçete yalnızca "hangi malzemeden ne kadar"dır (G/KG/ADET; KAVANOZ/KOLI/PALET/KG_DOLGU bazı). Fiyat/maliyet reçeteye girmez.
- Reçete toplamı otomatik yuvarlanmaz/zorlanmaz. Sapma: ≤ %0,5 kabul · %0,5–%5 açıklama gerekir · > %5 engel (`settings`, ayarlanabilir; ÖNERİDİR).
- Onaylı reçete değişmez; yeni sürüm → eski ONAYLI otomatik PASİF; her değişiklik `history` içinde saklanır.
- Fire (`FRE`) ve lot kapanışı (`LKP`) ayrı hareket türleridir (`FIRE`, `LOT_KAPANIS`), neden kodu zorunludur, üretime bağlanabilir.
- Karantina/red lotları üretimde ve sevkte kullanılamaz. Serbest bırak / reddet / karantinaya al (`KAL`) ve lokasyon transferi (`TRF`).
- İzlenebilirlik: `GET /api/trace?code=&lot=` (mamul ↔ hammadde lotu ↔ üretim ↔ sevk).
