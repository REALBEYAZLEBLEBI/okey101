# 101 Okey — Çip, Seviye ve Lobi Sistemi Tasarımı (v1)

Bu doküman, oyuna kademeli olarak eklenecek meta-oyun (ekonomi) sisteminin
detaylı tasarımıdır. **v1 olarak işaretlenen bölümler bu sürümde oyunda
çalışır durumdadır**; diğerleri yol haritasıdır.

---

## 1. Çip Ekonomisi

### 1.1 Temel para birimi: Çip 🪙
- Tek para birimi çiptir. Gerçek para YOKTUR (ileride isteğe bağlı).
- Yeni oyuncu başlangıç bakiyesi: **25.000 çip**. *(v1 ✓)*
- Bakiye cihazda saklanır; tarayıcı izin vermezse oturumluk çalışır. *(v1 ✓)*

### 1.2 Masa bedeli ve ödeme (zero-sum havuz)
Her masada 4 oyuncu masa bedelini (stake) havuza koyar. Havuz = 4 × bedel.
El sonu sıralamasına göre dağıtım:

| Sıra | Alınan       | Net kazanç |
|------|--------------|-----------|
| 1.   | bedel × 3    | **+2×bedel** |
| 2.   | bedel × 1    | 0 (bedelini kurtarır) |
| 3.   | 0            | −bedel |
| 4.   | 0            | −bedel |

Örnek (kullanıcının verdiği): 5.000'lik masa → 1. oyuncu 15.000 alır,
2. oyuncu 5.000 alır, 3. ve 4. bedellerini kaybeder. Havuz tam dağıtılır;
sistemde çip yaratılmaz/yok edilmez (enflasyon kontrolü). *(v1 ✓)*

Eşitlik durumu: toplam puanı eşit olanlar arasında önce daha çok el
kazanan, o da eşitse oturuş sırası önceliklidir. *(v1: puan sıralaması ✓,
detaylı eşitlik kırıcı v2)*

### 1.3 Lobiler *(v1 ✓ — 3 lobi)*

| Lobi    | Masa bedeli | Hedef kitle | Giriş şartı |
|---------|-------------|-------------|-------------|
| Çaylak  | 1.000       | Yeni oyuncular | — |
| Orta    | 5.000       | Düzenli oyuncular | bakiye ≥ 5.000 |
| Usta    | 25.000      | Yüksek bahis | bakiye ≥ 25.000 |
| **v2:** VIP | 100.000 | Seviye 15+ | bakiye + seviye şartı |
| **v2:** Turnuva | katılım bileti | herkese | bilet |

Lobi seçimi ana menüdedir; bakiyesi yetmeyen lobi kilitli görünür. *(v1 ✓)*

### 1.4 Batmayı önleme (güvenlik ağı)
- Oyun sonu bakiye 1.000'in altına düşerse **1.000'e tamamlanır**
  ("çip yardımı"). Böylece oyuncu asla oynayamaz duruma düşmez. *(v1 ✓)*
- **v2:** Günlük giriş bonusu (ör. 2.500), 4 saatte bir küçük bonus (500),
  reklam/başarım karşılığı bonus. Günlük toplam bonus tavanı: 10.000
  (ekonomiyi şişirmemek için).

---

## 2. Seviye (Level) Sistemi

### 2.1 XP kazanımı *(v1 ✓)*
Oyun sonunda: `XP = el_sayısı × 25 + sıralama bonusu`
Sıralama bonusu: 1. → 100 · 2. → 50 · 3. → 20 · 4. → 10.
(5 elli bir oyunda birinci olan: 125 + 100 = 225 XP.)

**v2 ek XP kaynakları:** elden bitme +50, okeyle bitirme +30, hiç ceza
yemeden bitirme +20, günlük ilk oyun ×2 çarpanı.

### 2.2 Seviye eğrisi
- v1: doğrusal — her **250 XP** = 1 seviye. Menüde rozet + ilerleme çubuğu. *(v1 ✓)*
- v2: artan eğri — `gerekli_xp(n) = 200 + 50×n` (5. seviye ~450 XP ister).
  Üst seviyeler yavaşlar, bağlılığı ödüllendirir.

### 2.3 Seviye ödülleri *(v2)*
| Seviye | Ödül |
|--------|------|
| 2–10 arası her seviye | +2.000 çip |
| 5 | Yeni avatar seti |
| 10 | Masa teması (yeşil çuha) |
| 15 | VIP lobi erişimi |
| 20 | Özel taş sırtı deseni |

---

## 3. Ana Menü Akışı
```
Ana Menü (v1 ✓: bakiye, seviye, lobi, el sayısı, isim)
 ├─ Lobi seç → Masa ayarları (el sayısı) → Oyna (bot masası)
 ├─ v2: Profil (istatistik: oyun, kazanma %, elden bitme sayısı…)
 ├─ v2: Mağaza (temalar, avatarlar — çiple)
 └─ v3: Çok oyunculu lobi listesi (gerçek oyuncular, multiplayer/server.js üzerine)
```

## 4. Teknik Notlar
- Kalıcılık: `store` adaptörü — `localStorage` erişilebilirse kullanır,
  değilse bellek içi çalışır (artifact/önizleme ortamlarında güvenli). *(v1 ✓)*
- Tüm ekonomi işlemleri tek noktadan (`showFinal` içindeki settlement)
  yapılır; v3 multiplayer'da bu mantık sunucuya taşınır (istemci asla kendi
  bakiyesini yazamaz — anti-cheat).
- Çipler tam sayıdır; tüm dağıtımlar tamsayı kalır (bedel × 3 / × 1 / 0).

## 5. Yol Haritası Özeti
1. **v1 (bu sürüm):** bakiye, 3 lobi, zero-sum ödeme, XP + doğrusal seviye,
   güvenlik ağı, menü.
2. **v2:** günlük bonuslar, seviye ödülleri, mağaza, profil istatistikleri,
   artan seviye eğrisi, eşitlik kırıcılar.
3. **v3:** sunucu tabanlı cüzdan + gerçek çok oyunculu masalar (mevcut
   `multiplayer/server.js` iskeleti üzerine), turnuvalar, sezonlar ve lig.
