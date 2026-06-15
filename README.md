# Melisa Lead Finder

Melisa Lead Finder, Melisa Baby satış ekibi için potansiyel toptan bebek/çocuk giyim müşterilerini bulma, skorlama, inceleme ve CSV olarak dışa aktarma uygulamasıdır.

V1 bağımsız çalışır; ERP ile doğrudan bağlantısı yoktur.

## V1 Özellikleri

- Lead dashboard
- Lead listesi, durum/ülke/şehir/skor/firma filtreleri
- Lead detay ekranı
- Lead durum yönetimi: Yeni, İncelemede, Uygun, Uygun Değil, CRM’e Aktarıldı
- Arama görevi oluşturma ve manuel çalıştırma
- Demo provider ile örnek müşteri üretimi
- Google Places provider hazırlığı
- Balkan ülke presetleri
- Arama geçmişi uyarısı
- Duplicate lead önleme
- 100 üzerinden lead skorlama
- CSV export
- API smoke testi

## Kurulum

Windows PowerShell üzerinde `npm` execution policy hatası verirse komutları `npm.cmd` ile çalıştırın.

```powershell
Copy-Item .env.example .env
docker compose up -d
npm.cmd install
npm.cmd run db:generate
npm.cmd run db:migrate -- --name init
npm.cmd run db:seed
npm.cmd run dev
```

Adresler:

- Web: http://127.0.0.1:5173/
- API: http://localhost:4000/api
- Health: http://localhost:4000/api/health

## Günlük Çalıştırma

Veritabanı containerları kapalıysa:

```powershell
docker compose up -d
```

API ve web uygulamasını başlatmak için:

```powershell
npm.cmd run dev
```

## Doğrulama

Build:

```powershell
npm.cmd run build
```

API smoke testi:

```powershell
npm.cmd run smoke:api
```

Güvenlik/audit kontrolü:

```powershell
npm.cmd audit
```

Smoke test geçici test lead/task kayıtları üretir ve sonunda kendi kayıtlarını temizler.

## Providerlar

Varsayılan kaynak `DEMO` providerıdır ve API key gerektirmez.

Google Places kullanmak için `.env` içine key girilir:

```env
GOOGLE_PLACES_API_KEY="..."
```

Key boşsa Google Places provider fail-closed davranır; dış servise istek atmaz ve görev `FAILED` olur.

Detaylar: `docs/PROVIDERS.md`

## Balkan Ülke Presetleri

Dashboard üzerinde Balkan ülkeleri için bayraklı presetler vardır. Bayrağa tıklanınca görev formu otomatik dolar:

- ülke
- ilk şehir
- ilk arama kelimesi
- uygun provider
- maksimum sonuç

V1.1 presetleri migration gerektirmeden frontend tarafında tutulur. Tekrar arama geçmişi ve “sadece eksik şehirleri çalıştır” mantığı sonraki backend aşamasında eklenecektir.

## Tekrar Arama Uyarısı

Uygulama aynı ülke + şehir + arama kelimesi + provider kombinasyonunun daha önce tamamlanıp tamamlanmadığını kontrol eder. Aynı arama daha önce yapıldıysa görev formunda uyarı görünür.

Bu uyarı aramayı engellemez. Kullanıcı yine çalıştırabilir; duplicate lead koruması sadece yeni leadleri ekler.

## Durdurma

API/web süreçlerini terminalden `Ctrl+C` ile durdurun.

Docker servislerini durdurmak için:

```powershell
docker compose down
```

Veritabanı volume’unu silmek isterseniz, bu işlem local veriyi de siler:

```powershell
docker compose down -v
```

## V1 Sınırları

V1’de bilerek kapalı tutulanlar:

- Otomatik WhatsApp mesajı yok.
- Spam veya toplu outbound yok.
- Kontrolsüz scraping yok.
- ERP/CRM API entegrasyonu yok.
- Apify ve OpenAI gerçek bağlantıları henüz aktif değil.

## Sonraki Aşamalar

1. UI’dan tam canlı demo akışını test etmek.
2. Google Places API key ile gerçek provider testi yapmak.
3. Provider sonuçlarını zenginleştirmek.
4. CRM/ERP export sözleşmesini ayrıca tasarlamak.
