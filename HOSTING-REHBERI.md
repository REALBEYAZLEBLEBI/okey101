# 101 Okey — Oyunu İnternete Koyma Rehberi (arkadaşınla test edebilmen için)

Bu rehber, oyun sunucusunu internete koyup **sana tıklanabilir bir link** çıkarmanı sağlar. O linki arkadaşına yollarsın, ikiniz de girip gerçekten karşılıklı oynarsınız. **Node.js kurmana, komut satırı kullanmana gerek yok.**

---

## Önce dürüst birkaç not

- **Ücretsiz** başlayacağız (Render adlı platformla). Kredi kartı gerekmez.
- Süre: yaklaşık **10-15 dakika**, tek seferlik kurulum.
- Ücretsiz pakette iki küçük "normal" durum var, korkma:
  1. **Uzun süre kimse girmezse sunucu "uykuya" dalar.** İlk tıklamada uyanması ~30-60 saniye sürer (sayfa geç açılır). Sen ya da arkadaşın girince uyanır ve akıcı çalışır. Oyun sırasında uyumaz.
  2. **Test verileri (çip, hesap) ara sıra sıfırlanabilir.** Bu, ücretsiz paketin normalidir; sadece test için sorun değil. Gerçek yayında bunu kalıcı hale getireceğiz (veritabanı ekleyerek — sonraki aşama).
- Ben senin yerine hesap açamam / tıklayamam (sana ait bir işlem), ama her adımı net yazdım. Takılırsan sor, çözeriz.

---

## ADIM 1 — Yeni dosyaları GitHub'a yükle

Sana yolladığım son zip'in içinde artık bir **`server`** klasörü ve **`package.json`** dosyası var. Bunlar hosting için şart. Daha önce GitHub'a yüklediğin repoyu bu yeni dosyalarla güncelle:

1. Zip'i bilgisayarında aç (klasörün içinde şunlar olmalı: `okey101.html`, `engine.js`, `package.json`, bir `server` klasörü).
2. GitHub'da reponu aç → **Add file → Upload files**.
3. Zip'ten çıkan **tüm dosyaları ve `server` klasörünü** sürükleyip bırak.
4. Alttaki yeşil **Commit changes** ile kaydet.

> Önemli: `package.json` dosyası ve `server` klasörü reponun **ana dizininde** (en üstte) olmalı. `okey101.html` de en üstte kalsın.

---

## ADIM 2 — Render'a ücretsiz kayıt ol

1. Tarayıcında **render.com** adresine git.
2. **Get Started / Sign Up** de. En kolayı: **"GitHub ile devam et"** — böylece reponu otomatik görür.

---

## ADIM 3 — Sunucuyu oluştur

1. Render panelinde **New +** → **Web Service**.
2. GitHub reponu seç (okey oyununu yüklediğin repo). Görünmüyorsa "Configure account" ile Render'a repoya erişim izni ver.
3. Karşına ayar sayfası gelir. Şunları kontrol et:
   - **Language / Runtime:** Node (otomatik algılar).
   - **Build Command:** boş bırak (ya da `npm install` — bizim ek paketimiz yok, hızlı geçer).
   - **Start Command:** `npm start` yazıyor olmalı (bu, sunucuyu başlatır). Yazmıyorsa elle `npm start` yaz.
   - **Instance Type:** **Free** seç.
4. **Create Web Service** / **Deploy** de.

---

## ADIM 4 — Linkini al ve oyna

1. Render birkaç dakika kurar (loglarda "Live" ya da "ayakta" yazısını görürsün).
2. Sayfanın üstünde sana bir adres verir, şuna benzer:
   **`https://okey101-xxxx.onrender.com`**
3. Bu linke tıkla → oyun açılır. Ana menüde **OYNA** de.
4. **Aynı linki arkadaşına yolla.** O da açsın, OYNA desin. Aynı bahsi seçerseniz **aynı masada** buluşursunuz. (Masa dolmazsa botlar tamamlar.)

📱 Telefondan da aynı linkle girebilirsin — "Ana ekrana ekle" yaparsan uygulama gibi açılır.

---

## Takılırsan

- **Sayfa ilk açılışta çok yavaş / açılmıyor:** Sunucu uykudan uyanıyordur, 30-60 sn bekle, yenile.
- **"Deploy failed" / hata:** Genelde Start Command yanlıştır. Render → Settings → Start Command'ın `npm start` olduğundan emin ol, sonra "Manual Deploy → Deploy latest".
- **Oyun açılıyor ama "OYNA" bağlanmıyor:** Repoya `server` klasörünün ve `package.json`'ın doğru (ana dizinde) yüklendiğini kontrol et.
- Ne olursa olsun bana ekran görüntüsüyle yaz, birlikte çözeriz.

---

## ADIM 5 (FAZ C) — Verileri KALICI yap (çipler bir daha sıfırlanmasın)

Oyun artık PostgreSQL destekliyor. Render'da 5 dakikada kurulur:

1. Render panelinde **New +** → **PostgreSQL** → isim ver → **Free** plan → Create.
2. Oluşunca veritabanının sayfasında **"Internal Database URL"** değerini kopyala (postgres://... diye başlar).
3. Oyun sunucunun (Web Service) sayfasına dön → **Environment** sekmesi → **Add Environment Variable**:
   - Key: `DATABASE_URL`
   - Value: az önce kopyaladığın adres
4. Kaydet — Render otomatik yeniden kurar. Loglarda şunu görürsen tamamdır:
   **`[db] PostgreSQL bağlı — hesaplar ve çipler KALICI.`**

Artık güncelleme atsan da, sunucu uyusa da hesaplar/çipler/seriler durur.
(Not: Render'ın ücretsiz Postgres'i 90 gün sonra sona erer — yayına yaklaşınca
küçük bir ücretli plana geçeriz; şimdilik test için ideal.)

## Sırada ne var

Bu link "arkadaşınla test" için birebir. Gerçek yayına geçerken (herkese açmadan önce) ekleyeceklerimiz:
- **Kalıcı veritabanı** — çip/hesap asla sıfırlanmasın.
- **Kendi alan adın** (ör. `okeyoyunum.com`) — `onrender.com` yerine.
- **Uyumayan (ücretli, aylık birkaç dolar) paket** — ilk tıklama hep hızlı olsun.
- Ve konuştuğumuz **görünmez bot** düzeni (tek "OYNA" butonu, gerçekçi isim/resimli botlar, "bot" ibaresi hiç görünmeden).

Bunları, sen linki eline alıp "çalışıyor" dedikten sonra sırayla yaparız.
