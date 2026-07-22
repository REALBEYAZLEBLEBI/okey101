# 101 Okey — Backend Mimarisi ve Çok Oyunculu Tamamlanma Planı

*Bu belge, oyunu tek-kişilik demodan gerçek çok oyunculu, para kazandıran bir ürüne dönüştürmenin teknik planıdır. Amaç: kod yazmaya başlamadan önce mimariyi ve senin (hosting/altyapı) sorumluluğunu netleştirmek.*

---

## 0. Elimizdeki En Büyük Avantaj

`engine.js` en baştan **DOM'suz, saf JS** olarak yazıldı ve hem tarayıcıda (`window.Engine`) hem Node'da (`module.exports`) çalışıyor. Bu tesadüf değildi — **aynı kural motoru sunucuda da çalışacak.** Yani:

- Oyun mantığını yeniden yazmıyoruz. Sunucu `engine.js`'i import edip **tek gerçek otorite** oluyor.
- İstemci artık bir "görüntü" katmanı oluyor: niyet gönderiyor (taş çek, at, aç), sunucunun döndürdüğü durumu çiziyor.
- Hile imkânsız hale geliyor, çünkü çipi de sonucu da sunucu hesaplıyor.

Bu, projeyi aylar öne taşıyan bir tasarım kararıydı ve şimdi karşılığını alıyoruz.

---

## 1. Mimari Genel Bakış

```
┌─────────────┐     WebSocket      ┌──────────────────────┐
│  İSTEMCİ    │ ◄───(niyet/durum)──►│   OYUN SUNUCUSU       │
│ (okey101)   │                     │   (Node + engine.js)  │
│  - görüntü  │     HTTPS/REST      │   - masa otoritesi    │
│  - girdi    │ ◄───(giriş, mağaza)►│   - eşleştirme        │
└─────────────┘                     │   - anti-hile         │
                                    └──────────┬───────────┘
                                               │
                              ┌────────────────┼────────────────┐
                              ▼                                  ▼
                    ┌──────────────────┐              ┌──────────────────┐
                    │   PostgreSQL     │              │      Redis        │
                    │  (kalıcı veri)   │              │  (canlı durum)    │
                    │  - hesaplar      │              │  - aktif masalar  │
                    │  - cüzdan/ledger │              │  - oturumlar      │
                    │  - satın alımlar │              │  - eşleştirme kuyruğu│
                    └──────────────────┘              └──────────────────┘
```

**İki veritabanı, iki farklı iş:**
- **PostgreSQL** — para ve hesap gibi *asla kaybolmaması gereken* veriler. İşlemsel (transactional): çip transferi ya tamamen olur ya hiç olmaz. Para bütünlüğünün olmazsa olmazı.
- **Redis** — hız gerektiren, geçici canlı durum: o an oynanan masalar, oturum anahtarları, eşleştirme kuyruğu. Sunucu yeniden başlasa bile kalıcı veri Postgres'te güvende.

---

## 2. Teknoloji Seçimleri (bu projeye özel öneri)

| Katman | Öneri | Neden |
|---|---|---|
| Çalışma ortamı | **Node.js** | `engine.js` zaten Node'da çalışıyor; tek dil (JS) hem sunucu hem istemci |
| Gerçek zamanlı | **Socket.IO** | Otomatik yeniden bağlanma, oda (room) yönetimi, kopukluk toleransı hazır gelir |
| Kalıcı DB | **PostgreSQL** | İşlemsel cüzdan; para için tek doğru seçim |
| Canlı durum | **Redis** | Milisaniyelik masa durumu, eşleştirme, oturum |
| Kimlik | **JWT oturum** | Cihaz-tabanlı başla, sonra e-posta/sosyal ekle |
| İstemci | **Mevcut okey101** | Sadece "yerel G" yerine "sunucudan gelen G" — çekirdek UI aynen kalır |

> Not: Elimizdeki `multiplayer/server.js` sıfır-bağımlılıklı bir WebSocket prototipi. Onu başlangıç referansı olarak kullanacağız ama üretim için Socket.IO'ya geçmek yeniden-bağlanma ve oda yönetimini bedavaya getirir.

---

## 3. Veri Modeli (PostgreSQL şema taslağı)

```
users
  id, username, avatar, created_at, last_seen, level, xp,
  device_id (ilk giriş), email (opsiyonel, sonra), status

wallets
  user_id (FK), chips (bigint), updated_at
  -- bakiye ASLA istemciden yazılmaz; sadece sunucu ledger üzerinden

transactions           ← para bütünlüğünün kalbi (ledger)
  id, user_id, delta (+/-), reason (stake|win|purchase|gift|bonus|task),
  ref_id (masa/satın alım), balance_after, created_at
  -- her çip hareketi buraya yazılır: denetlenebilir, geri alınabilir, anti-fraud

tables / matches
  id, room_id, stake, mode (tek/esli/rizikolu), katlamali,
  seats[4] (user_id | bot), state (waiting|playing|done),
  started_at, ended_at, result_json

purchases              ← gerçek para (IAP)
  id, user_id, product_id, chips, store (google|apple),
  receipt, verified (bool), created_at
  -- makbuz SUNUCUDA doğrulanmadan çip yazılmaz

friends
  user_id, friend_id, status (pending|accepted), created_at

daily / tasks / bonuses
  user_id, last_daily_at, streak, task_progress_json
```

**Kritik kural:** Çip hiçbir zaman doğrudan `wallets.chips` yazılarak değişmez. Her değişim önce `transactions`'a bir satır düşer, sonra bakiye güncellenir (tek işlemde). Böylece her kuruşun nereden geldiği bellidir — hem para güvenliği hem hile/fraud tespiti için şart.

---

## 4. Sunucu-Otoriter Oyun Akışı

**Şu anki (istemci) akış:** İstemci `E.discardTile(G, tile)` çağırıp kendi durumunu güncelliyor.

**Yeni (sunucu) akış:**
1. İstemci sunucuya niyet gönderir: `{action: 'discard', tileId: 42}`
2. Sunucu, o masanın `engine.js` durumunda hamleyi **doğrular ve uygular** (sıra sende mi? bu taş sende mi? kural uygun mu?).
3. Sunucu güncel durumu masadaki **4 oyuncuya da** yayınlar.
4. İstemciler sadece çizer.

Böylece herkes aynı şeyi görür (senin istediğin "online oyunda herkes aynı şeyi görmeli" kuralı otomatik sağlanır) ve kimse hile yapamaz.

**Bahis (escrow):** Masaya oturunca bahis, cüzdandan alınıp masada *kilitlenir* (ledger'a `stake` işlemi). Oyun bitince sunucu dağıtımı yapar (`win` işlemleri). Oyuncu bağlantıyı kesse bile bahis sunucuda kilitli olduğu için kaçış yok — daha önce konuştuğumuz rizikolu "çıkamama" sorununun gerçek çözümü budur.

---

## 5. Eşleştirme + Bot Doldurma + Yeniden Bağlanma

**Eşleştirme:** Oyuncu oda (bahis kademesi) seçer → sunucu boş koltuklu bir masaya oturtur → koltuklar gerçek oyuncularla dolar; belli bir süre dolmazsa **bot ile tamamlanır** ki masa her zaman başlasın. (Bot AI kalitesi bu yüzden hâlâ önemli — `engine.js`'in AI'ı sunucuda çalışır.)

**Yeniden bağlanma:** Her oturumun bir anahtarı var. Bağlantı koparsa koltuk N saniye tutulur, süre barı işler; oyuncu dönerse görüntü geri yüklenir, dönmezse **bot devralır** (bu mantık zaten istemcide var — sunucuya taşınacak).

---

## 6. Anti-Hile ve Güvenlik

- Tüm oyun kararları sunucuda doğrulanır; istemci sadece girdi/çıktı.
- Cüzdan yazımları işlemsel ve ledger üzerinden — istemci asla kendi çipini yazamaz.
- IAP makbuzları sunucuda Google/Apple'a doğrulatılır; sahte makbuzla çip alınamaz.
- Hız/oran sınırlama (rate limit): bir oyuncu saniyede 100 hamle gönderemez.
- Sunucu, imkânsız durumları (elinde olmayan taşı atma vb.) reddeder ve loglar.

---

## 7. Para Kazanma ve Tutundurma Ekonomisi (tasarım)

Hedefin "insanları oyunda tutmak + güçlü biçimde harcamaya teşvik" — bunun etkili yolu rastgele sinir bozmak değil, **kanıtlanmış psikolojik tasarımdır.** Sunucu geldiğinde bunları gerçek veriyle bağlarız:

**Oyunda tutan kancalar:**
- **Günlük giriş serisi:** her gün artan bonus (1. gün 5K → 7. gün 100K); seriyi kaçırırsan sıfırlanır (kayıp korkusu).
- **4 saatlik küçük bonus** (zaten var) — geri gelme sebebi.
- **Liderlik tablosu / haftalık lig:** sıralamada geride kalmak yeni oyun oynatır.
- **Arkadaş aktivitesi:** "Ahmet 2M kazandı" bildirimleri — sosyal baskı.
- **Görev/başarım zinciri:** sürekli "bir sonraki ödül" hedefi.

**Harcamaya teşvik eden kancalar (agresif ama yıkıcı değil):**
- **Bakiye azaldı uyarısı:** çip biterken tam o anda çıkan "hemen doldur" teklifi.
- **Sınırlı süreli teklifler:** "sadece 10 dakika — %50 fazla çip" (geri sayımlı, FOMO).
- **İlk alım bonusu:** ilk satın alımda 2 katı çip (bariyeri aşırtır).
- **Kumbara (piggy bank):** oynadıkça dolan, ama açmak için para gereken bir çip birikimi.
- **VIP/ayrıcalık:** yüksek bahis odaları, özel masa/taş temaları, statü.
- **"Az kalsın kazanıyordun" anları:** kaybettiğin ele vurgu — tekrar oynatır.

**Tek sağlam sınır (gelirini KORUYAN kural):** Oyun sosyal-casino kalmalı — çip **paraya çevrilemez**, gerçek para ödülü yok. Bu çizgiyi korudukça mağaza yasağı, geri ödeme (chargeback) dalgası ve hukuki risk kapıda kalır; aştığın an oyun kumar olur ve hesap kapanır. Yani "agresif ama bu çizginin içinde" — uzun vadede en çok kazandıran budur.

---

## 8. Aşamalı İnşa Planı (kod fazları)

Her faz çalışır bir şey üretir; üst üste binerler.

**FAZ A — Çekirdek sunucu + tek masa** *(ilk büyük Fable turu)*
- `engine.js`'i ortak modül yap (sunucu + istemci paylaşır).
- Sunucu: kimlik (cihaz-tabanlı), cüzdan + ledger, **tek** masa tipi engine ile çalışır.
- İstemci: yerel `G` yerine WebSocket ile sunucu-senkron `G`. Çekirdek UI aynen kalır.
- Çıktı: 4 gerçek oyuncu (ya da sen + 3 sekme) aynı masada gerçekten oynayabilir.

**FAZ B — Eşleştirme + çoklu masa + bot doldurma + yeniden bağlanma**
- Oda seçimi → gerçek eşleştirme → boş koltukları bot doldurma.
- Kopma/yeniden bağlanma, bot devralma.
- Çıktı: gerçek bir lobi — masalar açılır, dolar, biter.

**FAZ C — Ekonomi + tutundurma (gerçek veriyle)**
- Bahis escrow, dağıtım, günlük bonus, görevler, liderlik tablosu — hepsi sunucuda.
- Sohbet ve arkadaşlar *gerçek* olur (mevcut arayüz aynı kalır, içi dolar).
- Çıktı: tutundurma döngüsü canlı.

**FAZ D — Gerçek para (IAP) + yayın**
- Mağazayı Google Play Billing / Apple IAP'ye bağla + sunucuda makbuz doğrulama.
- Capacitor ile Android/iOS paketleme.
- Vergi/hukuk kurulumu (ayrı belgede).
- Çıktı: para kazanan, mağazada yayınlanmış oyun.

**FAZ E — Cila + ölçek**
- Fon müziği, temalar, turnuvalar, sezonlar, CI'da UI testleri, yük testi.

---

## 9. Senin Sorumluluğun (altyapı — ben kuramam)

Ben tüm **kodu** buradan yazabilirim ve yerelde test edebiliriz. Ama şunları **sen** temin edeceksin (yönlendiririm):

1. **Bir sunucu (hosting):** Başlangıç için tek bir bulut sunucu (VPS) yeter. Türk oyuncu için gecikme önemli, o yüzden Avrupa/Türkiye bölgesi olan bir sağlayıcı iyi olur. (VPS mi, hazır platform mu — fazı gelince güncel fiyatlarla karşılaştırırız.)
2. **Bir veritabanı:** PostgreSQL + Redis (çoğu hosting yönetilen olarak sunar).
3. **Bir alan adı** (ör. oyunismi.com) + SSL.
4. **Sonra:** Google Play (25$) / Apple (99$/yıl) geliştirici hesapları + ödeme kurulumu (vergi belgesiyle).

Yani "Fable'ı aç → kod hazır + yerelde test"; "canlıya çık → senin bu altyapıyı kurman" gerekir. İkisi ayrı adımlar.

---

## 10. Sıradaki Somut Adım

Bu plan onaylandıysa, ilk kod turu **FAZ A** olur ve o an Fable 5'i açmanı isteyeceğim (büyük, çok oturumlu iş). FAZ A bittiğinde: gerçek bir sunucu üzerinde, birden fazla tarayıcı sekmesiyle aynı masada gerçekten çok oyunculu oynayabildiğimizi göreceğiz — para ve durum sunucuda, hilesiz.

Başlamadan önce senden tek bir şey netleştirmeni isterim: **FAZ A'yı yerelde (kendi bilgisayarında/sunucumuzda test amaçlı) mı kuralım, yoksa sen baştan gerçek bir hosting mi ayarlayacaksın?** Yerelde başlamak en hızlısı — çalıştığını görürüz, sonra hosting'e taşırız.
