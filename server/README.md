# 101 Okey — FAZ A Oyun Sunucusu

Sıfır bağımlılıklı (npm gerekmez), sunucu-otoriter gerçek çok oyunculu sunucu.
Kural motoru olarak oyunla AYNI `../engine.js` dosyasını kullanır — tek gerçek otorite sunucudur.

## Çalıştırma (yerel)

```bash
cd server
node okey-server.js            # http://localhost:8101
```

- `http://localhost:8101/` → oyunun kendisi (okey101.html) buradan da servis edilir.
- Veriler `server/data.json` dosyasında kalıcıdır (hesaplar, cüzdanlar, ledger).
- Hızlı test modu: `OKEY_FAST=1 node okey-server.js` (kısa süreler, hızlı botlar).

## Ne kanıtlandı (otomatik testler)

```bash
node test-online.js    # 9 doğrulama
node test-online2.js   # 6 doğrulama
```

**test-online.js — 4 gerçek istemci, gerçek soketler:**
- Cihaz-tabanlı kimlik + hoşgeldin bakiyesi + token
- Eşleştirme: 4 istemci aynı masada oynadı, oyun finale ulaştı
- **Sanitizasyon:** hiçbir istemci başkasının elini GÖREMEDİ
- **Anti-hile:** elinde olmayan taşı atma denemesi sunucuda reddedildi
- **Escrow + dağıtım:** havuz (4×bahis) tam dağıtıldı, tüm cüzdanlar birebir tuttu
- **Ledger:** her çip hareketi kayıtlı (4 stake, win toplamı = havuz, bakiye izi)

**test-online2.js — tek insan + botlar + kopma:**
- Masa botlarla dolduruldu, oyun başladı
- Oyun ORTASINDA bağlantı koparıldı → token ile **aynı koltuğa geri dönüldü**
- Oyun finale ulaştı; kopukken biterse final dönüşte teslim edilir
- Cüzdan: 100.000 − bahis + alınan, kuruşu kuruşuna

## Protokol (özet)

İstemci → Sunucu (JSON, WebSocket):
- `{t:'hello', deviceId, name}` ya da `{t:'hello', token}` → `welcome {token, user}`
- `{t:'join', stake, rounds}` → eşleştirme; `{t:'fill'}` → botlarla hemen başlat
- `{t:'act', a:'draw'|'take'|'return'|'discard'|'open'|'lay'|'layPair'|'attach'|'swap'|'undo', ...}`
- `{t:'chat', text}` · `{t:'leave'}` · `{t:'me'}` · `{t:'ping'}`

Sunucu → İstemci:
- `state {v}` — koltuğa özel görüş (SADECE kendi elin; rakiplerde sayı)
- `ev {seat, events}` — animasyon olayları (başkasının çektiği taş gizli)
- `roundEnd {s}` · `final {rows, me}` · `chat` · `err` · `timeout`

## Mimari notları

- **Cüzdan:** bakiye asla doğrudan yazılmaz; her hareket `ledger`a işlenir
  (stake/win/bonus, işlem sonrası bakiye izi ile). Üretimde bu katman PostgreSQL'e taşınır.
- **Masa:** bahis oturunca escrow'a alınır; ayrılan/kopan geri alamaz. Kopanın
  turlarını bot oynar; dönerse kaldığı yerden devam eder.
- **Süreler:** insan turu 30 sn (açış turunda 60), işlem yapana 30 sn tazelenir;
  süre dolarsa sunucu güvenli hamleyi oynar.

## FAZ A3 tamam: ONLİNE OYNA ✓

Oyun istemcisi bu sunucuya bağlı. Ana menüde **🌐 ONLİNE OYNA** ile:
sunucuya bağlanır (cihaz kimliği + token), bahis/el seçer, eşleşir; masa
dolmazsa botlarla tamamlanır. Oyun tamamen sunucu-otoriterdir: istemci niyet
gönderir, koltuk-özel görüntü alır (rakip elleri hiç inmez), süreler ve
dağıtım sunucudadır; gerçek masa sohbeti çalışır; kopan token'la aynı koltuğa döner.

**Kendi bilgisayarında dene:**
```bash
cd server && node okey-server.js
# İki FARKLI tarayıcı (veya normal + gizli pencere) → http://localhost:8101
# İkisinde de ONLİNE OYNA → aynı bahis → aynı masada karşılıklı oynayın.
# (Aynı tarayıcının iki sekmesi aynı hesaba bağlanır — farklı tarayıcı/profil kullan.)
# Ev ağındaki telefonla: http://BILGISAYAR-IP:8101
```

## Sırada (FAZ B): eşleştirme lobisi, çoklu masa listesi, hosting'e taşıma.
