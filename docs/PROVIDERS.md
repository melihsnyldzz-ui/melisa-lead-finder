# Lead Providers

V1 provider akışı kontrollü ve manuel tetiklenir. Otomatik outbound mesaj, spam veya izinsiz scraping yoktur.

## Provider Durumları

API endpoint:

```text
GET /api/providers
```

Bu endpoint her provider için şu bilgileri döndürür:

- `label`: ekranda gösterilecek ad
- `implemented`: provider kodu var mı
- `configured`: gerekli environment ayarı hazır mı
- `requiredEnv`: varsa gereken `.env` anahtarı

Frontend bu bilgiyi kullanarak örneğin Google Places için `API key gerekli` notu gösterir.

## DEMO

`DEMO` yerel demo verisi üretir.

- API key gerektirmez.
- Geliştirme, sunum ve smoke test için varsayılan kaynaktır.
- Duplicate koruması aktif olduğu için aynı demo görev tekrar çalıştırıldığında yeni kopya lead oluşturmaz.

## GOOGLE_PLACES

`GOOGLE_PLACES`, Google Places API (New) Text Search endpointini kullanır:

```text
POST https://places.googleapis.com/v1/places:searchText
```

Gerekli ayar:

```env
GOOGLE_PLACES_API_KEY="..."
```

Google Places API (New) Text Search için response field mask zorunludur. Provider bu nedenle `X-Goog-FieldMask` headerı gönderir ve V1’de yalnızca şu ihtiyaç alanlarını ister:

- Place ID
- Firma adı
- Adres
- Telefon
- Website
- Google Maps URL
- Rating
- Review count
- Place type bilgisi

API key yoksa provider fail-closed davranır:

- Dış servise istek atmaz.
- Task `FAILED` olur.
- Hata mesajı UI’da task satırında görünür.

## Henüz Kapalı Providerlar

- `APIFY`: hazır actor/provider sözleşmesi netleştikten sonra.
- `OPENAI`: enrichment ve scoring açıklaması için; gerçek lead toplama kaynağı olarak değil.
- `WEBSITE`, `INSTAGRAM`, `MANUAL`: V1’de aktif provider değildir.

## Sonraki Provider Adımı

Google Places key girildikten sonra ilk canlı test şu şekilde yapılır:

1. `.env` içine `GOOGLE_PLACES_API_KEY` gir.
2. API serverı yeniden başlat.
3. UI’da kaynak olarak `Google Places` seç.
4. Küçük `maxResults` değeriyle görev oluştur.
5. Görevi çalıştır.
6. Oluşan lead’leri skor, duplicate ve CSV export açısından kontrol et.
