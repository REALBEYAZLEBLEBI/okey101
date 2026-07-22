# 101 Okey — Mağaza (Uygulama İçi Satın Alım) ve Türkiye Vergi/Hukuk Analizi

> **Önemli not:** Ben avukat ya da mali müşavir değilim; aşağıdakiler güncel kaynaklara dayalı bir yol haritası ve bilgilendirmedir, resmi danışmanlık değildir. Şirket kurma, vergi ve özellikle "çip satışı kumar mıdır" konularında **mutlaka bir mali müşavir (SMMM) ve gerekirse bir avukatla** teyit et. Rakamlar Temmuz 2026 itibarıyladır ve her yıl değişir.

---

## 0. En Kritik İki Gerçek (önce bunları oku)

1. **Çip satabilmen için önce sunucu (backend) şart.** Şu an çipler oyuncunun telefonunda (localStorage) tutuluyor. Para karşılığı çip satacağın an bu yapı çöker: herkes kendi cihazına istediği kadar çip yazabilir. Bakiye, satın alma ve cüzdan **sunucuda** tutulmalı. Bu, hem güvenlik hem de mağazaların zorunlu şartı.

2. **Çip asla gerçek paraya/çekilebilir değere dönüşmemeli.** Türkiye'de bir oyunun kumar sayılması için **"şans unsuru" ve "para/menfaat riski" birlikte** bulunmalı. Okey bir sosyal oyun olarak kalır — çip satılabilir ama **çip geri paraya çevrilemez, kullanıcılar arası gerçek-değer transferi olmaz**. Bu çizgiyi geçersen (çip bozdurma, gerçek para ödülü) oyun kumar mevzuatına (7258 s. Kanun / TCK) girer. Bu, teknik bir tercih değil, işin **hukuki bel kemiği**.

---

## 1. "Kendi hesabımı mı bağlayacağım?" — Evet, iki ayrı hesap

Para akışı için iki katman var:

**A) Geliştirici (yayıncı) hesabı** — uygulamayı mağazaya koyan hesap:
- **Google Play Console:** tek seferlik **25 USD** kayıt ücreti, yıllık yenileme yok.
- **Apple Developer Program:** yıllık **99 USD** (≈ 5 yılda 495 USD).
- Kasım 2023 sonrası açılan **kişisel** Google hesaplarında yeni kural: yayına almadan önce **en az 12 test kullanıcısı ile 14 gün kapalı test** zorunlu. Yani ilk yayın 2-4 hafta sürer.

**B) Ödeme/tahsilat hesabı** — paranın yattığı yer:
- Mağaza içi satışta parayı **Google/Apple toplar**, komisyonunu keser, kalanını **senin banka hesabına** (aylık ödeme eşiğiyle) gönderir. Yani "kendi hesabını bağlarsın" derken kastedilen budur: mağaza panelinde IBAN/banka bilgisi + vergi bilgisi girersin.
- Web sitesinde satarsan parayı **ödeme sağlayıcı** (iyzico, PayTR vb.) toplar, komisyonunu keser, sana aktarır.

**Kişisel mi, şirket mi hesap?** Kişisel hesapla da başlayabilirsin ama düzenli gelir başlayınca vergi tarafı (bkz. Bölüm 4) şahıs şirketi ya da limited şirket gerektirir. Mağaza hesabını sonradan "Organization" tipine geçirmek mümkün ama zahmetli — ciddi gelir bekliyorsan baştan şirketle açmak daha temiz.

---

## 2. Dağıtım Kanalı ve Komisyonlar (2026)

Nerede sattığın, ne kadar komisyon ödeyeceğini belirler.

| Kanal | Komisyon (2026) | Not |
|---|---|---|
| **Google Play (uygulama içi)** | İlk 1 milyon USD/yıl **%15**, üstü %30 (Epic uzlaşması sonrası bazı bölgelerde %20'ye iniyor) | Android çip satışı **zorunlu** Play Billing üzerinden |
| **Apple App Store (uygulama içi)** | Yıllık 1 milyon USD altı **%15** (Small Business Program), üstü %30 | iOS çip satışı **zorunlu** Apple IAP üzerinden |
| **Kendi web siten** | iyzico/PayTR ≈ **%2-4** + işlem ücreti | Komisyon çok düşük ama trafiği/güveni sen kuracaksın |

**Önemli:** Uygulamayı mağazaya koyarsan, mağaza içindeki çip satışını **kendi ödeme sisteminle yapamazsın** — Google/Apple bunu yasaklar, uygulamayı atarlar. Yani mobil = yüksek komisyon ama hazır kitle; web = düşük komisyon ama kitleyi sıfırdan kurma.

**Pratik strateji:** Çoğu Türk okey/çip oyunu ikisini birden yapar — mobilde mağaza IAP, ayrıca web sitesinde daha ucuz "çip paketi" satışı (oyuncuyu web'e yönlendirerek). Ama mobil uygulama *içinde* web'e satın almaya yönlendirmek mağaza kuralına takılır; bunu dikkatli kurgulamak gerekir.

---

## 3. Teknik Olarak Mağazayı Nasıl Ekleriz? (aşamalı)

**Aşama 1 — Sunucu + hesap sistemi (olmazsa olmaz):**
Elimizdeki `multiplayer/server.js` iskeleti başlangıç noktası. Gerekenler: üyelik/giriş, sunucuda cüzdan (çip bakiyesi), satın alma kayıtları. İstemci **asla** kendi bakiyesini yazamamalı.

**Aşama 2 — Mağaza vitrini (UI):**
Oyun içine "çip paketleri" ekranı (ör. 100K / 500K / 1M / 5M çip). Bunu **şimdiden sahte satın alımla** çalışır hale getirebiliriz; gerçek ödeme sonra altına bağlanır. Bu, token açısından da ucuz bir ilk adım.

**Aşama 3 — Uygulamaya paketleme:**
Oyun şu an tek HTML dosyası. Mağazaya koymak için **Capacitor** ile Android (.aab) ve iOS paketine sararız. Oyun kodu aynı kalır, Capacitor bir "kabuk" ekler ve mağaza ödeme eklentisini (Play Billing / StoreKit) bağlar.

**Aşama 4 — Ödeme + sunucu doğrulaması:**
Kullanıcı çip paketi alır → mağaza makbuz üretir → makbuz **sunucuda doğrulanır** → çip sunucudan yazılır. Doğrulama olmazsa sahte makbuzla bedava çip alınır.

**Aşama 5 — Yayın:**
Kapalı test (Google'ın 12 kişi/14 gün kuralı) → yayın.

---

## 4. Türkiye Vergi Analizi

### 4.1 En avantajlı yol: GVK Mükerrer 20/B — "Mobil Uygulama Kazanç İstisnası"

Türkiye, uygulama geliştiricilerine özel bir istisna sunuyor (Gelir Vergisi Kanunu Mükerrer Madde 20/B):

- **2026 yıllık gelir sınırı ≈ 7 milyon TL** (her yıl enflasyona göre güncellenir; 2024: 3M, 2025: 4,3M TL).
- Bu sınır altındaysan: bir **istisna belgesi** alırsın, Türkiye'de **özel bir banka hesabı** açarsın, Google/Apple ödemeleri bu hesaba yatar, banka otomatik **%15 stopaj** keser, kalan %85 sana kalır. **Ek KDV yok, defter tutma yok, ayrı beyanname yok.**
- **Kapsam:** uygulama içi satın alım, uygulama indirme geliri, reklam geliri **dahil** ✓
- **Kapsam dışı:** ⚠️ **web tabanlı gelir dahil DEĞİL.** Yani çipi kendi web sitenden satarsan bu istisnadan yararlanamazsın — o gelir normal ticari kazanç olarak vergilenir.

> Bu yüzden vergisel olarak **mağaza içi satış (20/B istisnalı) + web satış (normal vergili)** ayrımı önemli. Küçük ölçekte tamamen mağaza üzerinden gitmek en az vergi/en az bürokrasi demek.

### 4.2 Şirket kurarsan: Genç Girişimci İstisnası

Şirket (şahıs) kurma yolunu seçersen ve şartları tutuyorsan:
- **Genç Girişimci Kazanç İstisnası:** yıllık **≈ 400.000 TL**'ye kadar kazanç gelir vergisinden istisna (29 yaş altı, ilk defa mükellef olma vb. şartlarla, 3 yıl boyunca).
- Ayrıca ilk yıllarda **Bağ-Kur prim desteği** olabilir.

### 4.3 Diğer kalemler
- **KDV:** Normal ticari faaliyette dijital hizmet satışı KDV'ye tabidir (genel oran %20). 20/B istisnası bu yükü kaldırır; şirketleşince KDV mükellefi olursun.
- **Bağ-Kur:** Şahıs mükellefi olursan (başka yerde SSK'lı değilsen) aylık ≈ **9.000-10.000 TL** prim (2026 tahmini).
- **Kurumlar vergisi:** Limited/A.Ş. kurarsan kurumlar vergisi + kâr dağıtımında stopaj devreye girer; küçük ölçekte şahıs şirketi genelde daha basit.

### 4.4 Özet karar tablosu

| Durum | Önerilen yapı | Vergi yükü |
|---|---|---|
| Küçük, sadece mağaza geliri, < 7M TL/yıl | Şirket yok + **20/B istisnası** | Sadece **%15 stopaj** |
| Web satışı da var / karışık gelir | Şahıs şirketi (+ genç girişimci istisnası varsa) | Gelir vergisi + KDV + Bağ-Kur |
| Büyük ölçek, yatırım, ekip | Limited / A.Ş. | Kurumlar vergisi + KDV |

---

## 5. Hukuki Risk: Çipli Oyun Kumar mıdır? (en önemli bölüm)

Türk Ceza Kanunu'na göre kumar = **"kazanç amacıyla oynanan ve kâr/zararın talihe bağlı olduğu oyun."** Suç oluşması için **iki şart birlikte** gerekir:

1. **Şans/talih unsuru**, VE
2. **Gerçek para/menfaat riski.**

**Okey neden kumar değildir?**
- **Çip paraya çevrilemez** — kullanıcı çip alır ama geri bozduramaz, gerçek para kazanamaz.
- **Esas unsur beceridir** — sonuç oyuncunun stratejisine bağlıdır.
- **Gerçek menfaat riski yoktur** — oyuncu para kaybetmez, sadece satın aldığı sanal çip azalır.

**Güvenli kalmak için kırmızı çizgiler:**
- ✅ Çip **satılabilir** (para → çip, tek yön).
- ❌ Çip **bozdurulamaz** (çip → para asla).
- ❌ Gerçek para/altın/hediye kartı **ödülü verilemez**.
- ❌ Kullanıcılar arası **gerçek-değerli çip ticareti** (para karşılığı çip devri) sistemi kurulamaz — bu "gri para" ve kumar riski yaratır. Oyun içi "hediye çip" gönderme bedelsiz olmalı.
- ⚠️ "Turnuva ödülü olarak gerçek para" gibi fikirler bu çizgiyi geçer; yapma.

Bu modeli koruduğun sürece oyunun, App Store/Google Play'in de kabul ettiği **"sosyal casino / sosyal oyun"** kategorisinde kalır. (Yine de mağazaların bu kategori için yaş sınırı, "gerçek para değildir" ibaresi gibi ek şartları olabilir; yayın öncesi mağaza politikalarını kontrol ederiz.)

---

## 6. Önerilen Yol Haritası ve Tahmini Maliyet

| Adım | İş | Tahmini maliyet |
|---|---|---|
| 1 | Oyun içi **mağaza vitrini** (sahte satın alım) — hemen yapılabilir | Sadece geliştirme |
| 2 | **Sunucu + cüzdan + üyelik** | Sunucu ≈ birkaç yüz TL/ay + geliştirme |
| 3 | **Mali müşavirle** yapı kararı (20/B mi, şahıs şirketi mi) | SMMM danışma ücreti |
| 4 | **Google Play** hesabı (25 USD) [+ istersen Apple 99 USD/yıl] | 25-124 USD |
| 5 | **Capacitor** ile paketleme + Play Billing entegrasyonu | Geliştirme |
| 6 | Sunucu tarafı makbuz doğrulama | Geliştirme |
| 7 | Kapalı test (12 kişi/14 gün) → yayın | Zaman |

**En mantıklı ilk adım:** Bir sonraki turda oyun içine **çip paketi mağaza ekranını sahte satın alımla** kuralım (ucuz, görseli hemen görürsün). Gerçek ödeme ve sunucu, sen mali müşavirle yapıyı netleştirdikten sonra altına bağlanır.

---

## 7. Aksiyon Listesi (senin yapacakların)

1. **Bir mali müşavirle (SMMM) görüş** — 20/B istisnası sana uygun mu, yoksa şahıs şirketi mi? Yaşın ve başka gelirin bu kararı belirler.
2. Sadece mağaza üzerinden mi, web'de de mi satacağına karar ver (vergi ve komisyon farkı buna bağlı).
3. Google Play geliştirici hesabı aç (25 USD). iOS'u sonraya bırakabilirsin.
4. Bana "mağaza vitrinini kur" dersen, sahte satın alımla çalışan çip paketi ekranını hazırlarım.

---

### Kaynaklar
- Google Play geliştirici ücreti ve 12-test kuralı: iconikAI (2026)
- App Store / Google Play komisyon oranları 2026: actualizatec
- Mobil uygulama vergi muafiyeti (GVK Mük. 20/B), 7M TL sınırı, %15 stopaj: Vergi Merkezi
- Genç girişimci 400.000 TL istisnası: SMMM Serhat Aydın
- Kumar vs sosyal oyun hukuki ayrımı (şans + menfaat şartı): LegalTalks
