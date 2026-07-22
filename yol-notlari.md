# Yol Notları — İleride Yapılacaklar (plan dışına çıkmadan not edildi)

*Mehmet'in tespit ettikleri + teknik borç. Fazlar ilerledikçe buradan çekilecek.*

## Mehmet'in notları (Render testi sonrası)
- Telefon entegrasyonu/optimizasyonu tekrar gözden geçirilecek (online modda telefonda tam test edilmedi).
- Eksik/aksayan detaylar toplanacak (görüldükçe buraya eklenecek).

## Teknik borç / bilinçli ertelenenler
- **Kalıcı veritabanı (FAZ C öncesi şart):** Render ücretsiz planda `data.json` diskte kalıcı değil — yeniden dağıtımda hesap/çipler sıfırlanabilir. Üretim: PostgreSQL (plan hazır: backend-mimari-plani.md).
- **Menü ekonomisinin sunucuya taşınması:** Mağaza (demo), hediye çipi, görev ödülleri, seviye/XP göstergesi hâlâ YEREL meta'ya yazıyor; online cüzdanla birleşecek (FAZ C/D). Menüdeki bakiye artık sunucudan geliyor ama ＋mağaza alımları henüz yerel.
- **Profil avatar seçimi:** İnsan oyuncular şimdilik hep 🙂. Avatar seçme ekranı + sunucuda saklama.
- **Elden bitme sayacı online'da kullanıcı istatistiğine işlenmiyor** (sunucu user.elden alanı var ama artırılmıyor).
- **Bot zekâsı/insansılığı:** tempo insansı yapıldı; oyun tarzı hâlâ tek seviye. Zorluk çeşitliliği + daha doğal hamle hataları (FAZ B/C cilası).
- **Uyku modu:** Render ücretsizde 15 dk hareketsizlikte uyur (ilk giriş 30-60 sn). Yayında ücretli plana geçilecek.
- **Oyun içi görünüm online'da doğrulama turu:** işlek oto-işleme animasyon zamanlaması, çift sayaç senaryoları online akışta uzun oturumda gözlenecek.
- **Rizikoluda "masadan çık" online:** şu an online ayrılma serbest (bahis yanar); rizikolu için kilit istenirse sunucu tarafına taşınacak.
- **UI otomasyon testleri CI'a bağlanacak** (şu an elle koşuluyor).
