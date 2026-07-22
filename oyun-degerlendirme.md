# 101 Okey — Objektif Değerlendirme ve Tamamlanma Yol Haritası

*Kod tabanının güncel durumu denetlenerek hazırlanmıştır (motor + arayüz + testler incelendi). Amaç cesaretlendirmek değil, dürüst bir tablo çıkarmak.*

---

## Özet Yargı (bir cümlede)

Elimizde **kural motoru mükemmele yakın, cilası çok iyi bir tek-kişilik demo** var; ama "insanların oynadığı bir oyun" olması için gereken **temel (sunucu + hesap + gerçek çok oyunculu)** henüz yok. Yani en zor kısım (kurallar) çözülmüş, en kritik kısım (çevrimiçi altyapı) ise başlamamış durumda.

---

## 1. Güçlü Yönler (gerçekten iyi olanlar)

**Kural motoru — projenin en değerli parçası.** `engine.js` (1.033 satır) Okey 101'in bütün zor kurallarını doğru uyguluyor: okey/gösterge belirleme, işlek cezası, elden bitme, katlamalı açış barajı, çift açma, okey↔gerçek taş değişimi, ardışık seri zorunluluğu, rizikolu çarpanı, eşli puanlama. **117 otomatik test geçiyor** ve bunlar tam da en kolay hata yapılacak yerleri (skorlama, elden bitme, katlama) tutuyor. Bir okey oyununda işin %70'i budur ve bu %70 sağlam.

**Tek dosya, sıfır bağımlılık, anında açılıyor.** İnternetsiz, kurulumsuz, her cihazda çift tıkla çalışıyor. Bu, dağıtım ve test için büyük bir avantaj.

**His ve cila kalitesi yüksek.** Sürükle-bırak, taş sesleri, çip animasyonları, çarpan efektleri, telefon yatay modu, dokunmatik performans optimizasyonu, otomatik-devam sayaçları. Çoğu "hobi" projesinin ulaşamadığı bir parlaklık var.

**Meta-sistem iskeleti kurulmuş.** Zero-sum çip ekonomisi, seviye/XP, 9 kademeli oda, rizikolu ve eşli modlar, görevler, sohbet, arkadaş listesi, profil kartları, demo mağaza. Doğru para birimi mantığı (baştan öde, sonda dağıt) oturmuş.

---

## 2. Eksikler (tamamlanma için kritik olanlar)

### 🔴 2.1 Gerçek çok oyunculu YOK — en büyük boşluk
Denetimde doğrulandı: `ui.js` içinde tek bir WebSocket/sunucu bağlantısı yok. **Oyun %100 istemci tarafında, 3 bota karşı çalışıyor.** Sohbet, arkadaşlar, odalar, "X kişi çevrimiçi", masa listesi — hepsi *simülasyon*. `multiplayer/server.js` bir prototip olarak duruyor ama oyuna bağlı değil. Bir "sosyal okey oyunu" tanımı gereği çok oyunculudur; bu olmadan ürün "etkileyici demo" seviyesinde kalır. **"Tamamlanmış oyun" ile aramızdaki asıl fark budur.**

### 🔴 2.2 Kalıcı hesap / kimlik YOK
Bütün ilerleme tek bir tarayıcının `localStorage`'ında (10 anahtar). Tarayıcı önbelleği silinince **her şey gider**: çip, seviye, arkadaş, satın alım. Giriş sistemi, cihazlar arası senkron, "hesabım" kavramı yok.

### 🔴 2.3 Ekonomi sunucu-otoriter değil
Çipler istemcide tutuluyor — herkes kendi bakiyesini düzenleyebilir. Demo için sorun değil ama **gerçek para/satın alım bunun üzerine kurulamaz** (daha önce konuştuğumuz kumar/güvenlik konusu). Mağaza şu an sahte.

### 🟠 2.4 Bot yapay zekâsı tek seviye ve öngörülebilir
Botlar işlevsel (geçerli oynuyorlar) ama tek zorluk seviyesi var, blöf/strateji yok. Gerçek oyuncular kısa sürede zayıf bulur. Masalar dolmadığında botla doldurmak için de daha iyi bir YZ gerekecek.

### 🟠 2.5 Tutundurma (retention) döngüsü zayıf
Oyuncuyu geri getirecek şeyler eksik: günlük giriş bonusu (tasarım dokümanında var, kodda yok), gerçek görev/başarım ilerlemesi, liderlik tablosu/sıralama, turnuvalar. Şu an "bir kez oyna, kapat" ötesine geçiren bir kanca yok.

### 🟠 2.6 Yeni oyuncu deneyimi (onboarding) yok
İlk açan biri kuralları bilmiyorsa kayboluyor. "Nasıl oynanır" metni var ama interaktif bir tanıtım/öğretici turu yok. Sosyal casino oyunlarında ilk 60 saniye elde tutmanın belkemiğidir.

### 🟡 2.7 Otomatik UI testi yok
117 test sadece *motoru* kapıyor. Arayüz hataları (üst üste binen taşlar, kayan animasyonlar gibi tur tur düzelttiklerimiz) otomatik yakalanmıyor; her seferinde elle/ekran görüntüsüyle fark ediliyor. Ürün büyüdükçe bu risk artar.

### 🟡 2.8 Küçük olgunluk boşlukları
Bağlantı kopunca yeniden bağlanma yok (multiplayer gelince şart olacak), fon müziği anahtarı bağlı ama müzik yok, tek dil (TR — hedef TR ise sorun değil), bazı hata durumları için kullanıcı geri bildirimi yok.

---

## 3. Fazlalıklar (dürüst kısım: temelden önce gelen özellikler)

Burada eleştiri değil, bir *sıralama* uyarısı var. Son turlarda çok sayıda meta-özellik ekledik: rizikolu, eşli, 9 kademeli oda, arkadaş listesi, sohbet, görevler, mağaza. Bunların **hepsi tek-kişilik-bota-karşı bir temelin üzerine kuruldu.**

- **Sohbet ve arkadaş listesi** şu an tamamen simülasyon — gerçek oyuncu yokken ne sohbet edilecek biri var, ne eklenecek arkadaş. Bakım yükü getiriyor ama gerçek oyuncular gelene kadar gerçek değer üretmiyor.
- **9 oda, kademeli bahisler, "çevrimiçi" sayıları** — hepsi sahte veriyle dolduruluyor.

Bunlar "boşa gitti" demek değil: gerçek sürümlerin *arayüz iskeleti* olarak duruyorlar, sunucu gelince içleri dolacak. Ama **derinlik yerine genişliğe yatırım yaptık** — çekirdek döngü (oyunun kendisi) mükemmelken, onu saran 8-10 özellik henüz gerçek olmayan bir dünyaya işaret ediyor. Tamamlanma sürecinde yeni "meta" özellik eklemeyi durdurup, var olanları *gerçek* yapmaya (sunucuya bağlamaya) odaklanmak en doğrusu.

---

## 4. "Tamamlanmış Oyun" Tanımı

Net bir hedef koyalım. Tamamlanmış = yeni bir oyuncunun şunları **güvenilir biçimde** yapabilmesi:

1. Oyunu kurar (mağazadan ya da web'den).
2. Kalıcı bir **hesap** oluşturur — çip ve ilerleme cihaz değişse de durur.
3. **Gerçek insanlarla** eşleşir (masa dolmazsa botla tamamlanır).
4. Kurallara %100 uygun, akıcı bir oyun oynar. ✅ *(bu kısım zaten hazır)*
5. İlerler (seviye, günlük bonus, görev, sıralama).
6. İsterse **güvenli biçimde** çip satın alır.

Şu an **sadece 4. madde** tam. 1, 2, 3, 5, 6 ya simülasyon ya da eksik.

---

## 5. Aşamalı Tamamlanma Yol Haritası

Sıralama kasıtlı: her faz bir öncekinin üzerine oturur.

### FAZ 1 — Temel (make-or-break) 🔴
*Hedef: oyunu "gerçek" yapan altyapı.*
- **Sunucu + hesap sistemi:** üyelik/giriş, sunucuda kullanıcı profili ve cüzdan. `multiplayer/server.js` prototipini gerçek bir oyun sunucusuna dönüştürmek.
- **Sunucu-otoriter durum:** çip, XP, satın alım artık sunucuda; istemci asla kendi bakiyesini yazamaz.
- **Gerçek çok oyunculu masalar:** 4 gerçek oyuncu ya da eksik koltukları bot doldurma; oyun mantığı sunucuda doğrulanır (mevcut engine.js sunucuda da çalışacak biçimde yazılmıştı — bu bir avantaj).
- **Yeniden bağlanma** ve kopan oyuncu yönetimi.

> Bu faz bitmeden oyun "tamamlanmış" sayılmaz. Diğer her şey buradan sonra anlam kazanır.

### FAZ 2 — Tutundurma ve içerik 🟠
*Hedef: oyuncuyu geri getirmek.*
- Günlük giriş bonusu + 4 saatlik küçük bonus (tasarımda var).
- Gerçek görevler/başarımlar ve ödül döngüsü.
- Liderlik tablosu / haftalık sıralama.
- İnteraktif onboarding (yeni oyuncu turu).
- Daha güçlü ve çok seviyeli bot YZ (masaları doldurmak ve tek-kişilik mod için).

### FAZ 3 — Para kazanma ve yayın 💰
*Hedef: gelir ve mağazalara çıkış (araştırma dokümanındaki adımlar).*
- Mağazayı gerçek Google Play Billing / Apple IAP'ye bağlamak + sunucuda makbuz doğrulama.
- Capacitor ile Android/iOS paketleme.
- Vergi/hukuk kurulumu (20/B, kumar sınırı — ayrı belgede).

### FAZ 4 — Cila ve ölçek ✨
*Hedef: kalıcılık ve topluluk.*
- Fon müziği + ses paketleri, avatar/tema mağazası (çiple).
- Turnuvalar, sezonlar, lig.
- Çoklu dil (gerekirse).
- CI'da otomatik UI testleri.

---

## 6. Somut Tavsiyeler

1. **Yeni meta-özellik eklemeyi şimdilik durdur.** Çekirdek oyun ve cila yeterince olgun. Bundan sonra her yeni buton, temeli (sunucu) geciktirir.
2. **Bir sonraki büyük iş Faz 1 olmalı** — özellikle hesap + sunucu cüzdanı. Bu olmadan mağaza, gerçek arkadaşlar, sıralamalar hep sahte kalır.
3. **Var olan simülasyonları "gerçeğe" çevir**, silme. Sohbet/arkadaş/oda arayüzleri hazır; sunucu gelince içlerini doldur.
4. **Küçük ama yüksek etkili bir ara adım:** günlük bonus + basit onboarding — Faz 1 uzun sürerken bile oyuncu tutmayı hemen artırır ve tek-kişilik modda da işe yarar.
5. **Karar senin:** "hızlıca yayınlanabilir bir tek-kişilik sürüm" mü istiyorsun (o zaman Faz 2'nin bir kısmı + mağaza yeter), yoksa "gerçek çok oyunculu sosyal oyun" mu (o zaman Faz 1 şart)? İkisi çok farklı yollar; hangisini seçtiğin sıradaki tüm işi belirler.

---

### Kapanış
Bu proje, çoğu benzerinin ölçeğinin üstünde bir kural doğruluğuna ve cilaya sahip. Zor kısım bitti. Kalan iş "daha fazla özellik" değil, **var olan iskeleti gerçek bir sunucuya bağlamak** — yani genişliği değil, derinliği tamamlamak. Bir sonraki adımda hangi yolu (tek-kişilik hızlı yayın mı, tam çok oyunculu mu) seçtiğini söyle; ona göre net bir görev listesi çıkaralım.
