# 101 Okey — Çok Oyunculu Prototip

Bu klasör, tek oyunculu `okey101.html` oyununun üzerine gerçek çok oyunculu
mod eklemek için hazırlanmış **çalışan bir prototip iskeletidir**.

## İçindekiler

| Dosya | Açıklama |
|---|---|
| `server.js` | Sıfır bağımlılıklı Node.js sunucusu: statik dosya sunumu + el yazımı WebSocket (RFC 6455) + oda/lobi yönetimi. `npm install` gerekmez. |
| `mp-test.html` | Tarayıcı test istemcisi: odaya katıl, odadaki oyuncuları gör, sohbet ve test aksiyonları gönder. |

## Çalıştırma

```bash
node server.js          # varsayılan port 8101
node server.js 9000     # farklı port
```

Sonra iki ayrı tarayıcı sekmesinde (veya iki ayrı cihazda, aynı ağda):

```
http://localhost:8101/mp-test.html
```

Aynı oda koduyla katılın — oyuncu listesi ve mesajlar anında senkronize olur.

## Mimari

Prototip **röle (relay) mimarisi** kullanır:

```
İstemci A ──┐
İstemci B ──┼── WebSocket ──> server.js (oda yönetimi, mesaj rölesi)
İstemci C ──┘
```

- `join` → odaya katılım, koltuk (seat) ataması, oda durumu yayını
- `chat` → odaya sohbet mesajı
- `action` / `state` → oyun aksiyonları odadaki diğer herkese iletilir
  (gönderen koltuk numarası sunucu tarafından damgalanır)

## Tam oyuna giden yol haritası

Oyunun tüm kuralları `../engine.js` içinde **saf (DOM'suz) modül** olarak
yazıldığı için sunucuda da aynen çalışır:

```js
const E = require('../engine.js');
const g = E.newGame({ names: [...], rounds: 5 });
E.startRound(g);
// E.drawFromDeck / E.takeDiscard / E.openHand / E.layMeld /
// E.attachTile / E.discardTile — hepsi kural doğrulaması yapar
```

Önerilen adımlar:

1. **Sunucu-otoriter oyun döngüsü:** `start` mesajında sunucu `newGame` +
   `startRound` çağırır; her oyuncuya *yalnızca kendi elini* ve açık masa
   durumunu gönderir (hile koruması).
2. **Aksiyon doğrulama:** İstemciden gelen `action` mesajları sunucuda motor
   fonksiyonlarıyla uygulanır; motor zaten geçersiz hamleleri reddeder
   (`{ ok:false, err }`). Sonuç durumu odaya yayınlanır.
3. **Boş koltuklara bot:** eksik oyuncular için sunucuda `E.aiTakeTurn(g)`
   çağrılır — tek oyunculu moddaki botların aynısı.
4. **İstemci:** `okey101.html` arayüzündeki motor çağrıları (`E.*`) WebSocket
   mesajlarıyla değiştirilir; render kodu olduğu gibi kullanılabilir.
5. **Kopmalara dayanıklılık:** yeniden bağlanan oyuncuya tam durum anlık
   görüntüsü (state snapshot) gönderilir.

## Notlar

- Sunucu üretim için değil, geliştirme prototipi olarak yazılmıştır
  (TLS yok, kimlik doğrulama yok).
- Tek oyunculu oyunu da bu sunucudan servis edebilirsiniz: `okey101.html`
  dosyasını bu klasöre kopyalayıp `http://localhost:8101/okey101.html`
  adresini açın.
