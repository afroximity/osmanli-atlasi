# Osmanlı Atlası

Altı yüzyıl, tek bir harita. Bir yıl seç; Osmanlı'nın ve komşularının tuttuğu topraklar o yıla göre çizilir. Yıl değişince yeni topraklar eski sınırdan gelgit gibi dolar, kaybedilenler kalan sınıra doğru çekilir.

```sh
npm install
npm run data:fetch   # bir kez: Natural Earth + Cliopatria → .cache/
npm run data         # public/data/ altındaki her şeyi yeniden üretir (~25 sn)
npm run dev          # http://localhost:5173
```

## Mimari

```
data/               editoryal kaynak — elle düzenlenir, sürümlenir
  content/*.json      padişahlar, kişiler, olaylar, dönemler, topluluklar, kaynaklar
  polities.json       Cliopatria adlarına Türkçe ad / renk / gizleme
  relations.json      bağlılık ilişkileri (Eflak, Kırım, Cezayir …): hangi yıllarda Osmanlı'ya bağlı ya da özerk
  regions.source.json editoryal bölgeler (anlatı birimleri) — kaba çizimler
pipeline/           veri hattı (TypeScript, mapshaper, turf) → public/data/
public/data/        çalışma anında yüklenen, üretilmiş dosyalar (elle düzenlemeyin)
src/engine/         çerçevesiz harita motoru
  AtlasMap.ts         MapLibre + katmanlar + kamera; arayüz yalnızca bununla konuşur
  basemap.ts          fizikî harita stili (deniz, kara, rölyef, nehir, batimetri)
  territory/          siyasî zemin: zaman çizelgesi verisi + WebGL2 çizici
  PolityLabels.ts     devlet adları, çakışmasız
src/app/            React arayüzü — prototipin tasarımı ve ekranları
  store.ts            durum + eylemler (padişah/olay/kişi seçimi, oynatma, hikâye kamerası)
  model.ts            editoryal model: bölge statüleri, saltanatlar, alan, zirve
  MapView.tsx         motor + haritaya iğnelenmiş katmanlar (şehirler, odak, topluluklar, ipucu)
  Stage.tsx           üst çubuk, başlık kartı, mercekler, lejant, altyazı
  Folio.tsx           kâğıt dosya: padişah / kişi / bölge / olay
  Dock.tsx            zaman şeridi: alan, dönüm noktaları, 36 portre, dönemler
  Overlays.tsx        Silsile, Kişiler, Düello, Kaynaklar / Rehber
  Prologue.tsx        perde, ön yükleme, açılış
src/styles/         classical.css (tasarım sistemi), atlas.css (prototipin stilleri), stage.css (harita katmanları)
legacy/             ilk prototip; yalnızca referans
```

### Veri: kim neresiydi, ne zaman

- **Sınırlar**: [Seshat Cliopatria](https://github.com/Seshat-Global-History-Databank/cliopatria) (CC BY 4.0). Her kayıt bir devletin bir yıl aralığındaki toprağıdır; Osmanlı için 1305–1923 arası 138 kayıt var. Hat bunları atlas çerçevesine ve Natural Earth 1:10m kıyısına kırpar, tek bir TopoJSON'a yazar (ortak kenarlar bir kez saklanır).
- **Statü**: Cliopatria bağlı devletleri ayrı devlet olarak çizer. `data/relations.json` hangi yıllarda Osmanlı'ya bağlı (vassal) ya da özerk (autonomy) olduklarını söyler; çizici onları taralı gösterir.
- **Bölgeler** (`regions.json`): tıklanan, anlatılan, olayların bağlandığı editoryal birimler. Sınır çizmezler.
- **İçerik**: `data/content/` — TDV İslâm Ansiklopedisi maddelerine bağlı kısa metinler; görseller Wikipedia/Wikimedia Commons'tan çalışma anında gelir.

Yeni bir veri kaynağı eklemek için hattın çıktısını aynı biçime getirmek yeterlidir: `territories.topo.json` (her geometri `{i: devlet, f: ilk yıl, t: son yıl, a: km²}`) + `polities.json`. Motor yalnızca bunu bilir.

### Motor: gelgit nasıl çalışır

`TerritoryLayer` bir MapLibre özel katmanıdır, karanın üstüne ve rölyefin altına çizer, yani tutulan topraklar dağlarını gösterir. Her karede:

1. **Maskeler**: önceki (P) ve sonraki (N) durumun devletleri piksel başına sınıf kimliğine çizilir (0 boş, 1 doğrudan, 2 bağlı, 3 özerk, 4+ komşular). Ayrıca bir kara maskesi.
2. **Alan** (geçiş başına bir kez, dünya uzayında): değişen bölgenin çevresinde, P'deki ve N'deki Osmanlı toprağına uzaklık *jump flooding* ile GPU'da hesaplanır.
3. **Anlık durum**: kazanılan piksel, eski sınırdan gelen dalga ona ulaştığında el değiştirir; kaybedilen piksel, kalan sınıra doğru çekilen dalga geçtiğinde. Kenar, gürültüyle hafifçe yırtılır.
4. **Bulanıklaştırma**: "sınır alanı" (tutulan toprak ya da deniz) iki ölçekte bulanıklaştırılır. Böylece sınır yalnızca karada oluşur, kıyıda oluşmaz.
5. **Boyama**: yıkama renk, sınırın iç tarafında koyu bir şerit (elle boyanmış atlas gibi), tam sınırda yaldız bir kıl çizgisi, dışında yumuşak gölge, bağlılar için tarama, komşular için soluk renk ve ince mürekkep sınır; ilerleyen cephede hafif sıcak ışık.

Sınır ayrı bir çizgi değildir, her karede gösterilen dolgudan türetilir. Bu yüzden önden zıplamaz, dolguyla birlikte yürür.

## Lisanslar ve atıf

- Sınırlar: Seshat Global History Databank, *Cliopatria* (CC BY 4.0). Değiştirildi: kırpıldı, kıyıya oturtuldu, sadeleştirildi.
- Fizikî harita: Natural Earth (kamu malı). Rölyef: Mapzen/AWS Terrain Tiles.
- Harita motoru: MapLibre GL JS (BSD-3).
