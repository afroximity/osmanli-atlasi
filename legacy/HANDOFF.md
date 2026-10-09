# Osmanlı Atlası — sahne arayüzü

Statik HTML/CSS/JS; tek çalışma zamanı bağımlılığı `vendor/` altındaki MapLibre GL JS 5.24. Herhangi bir statik sunucuyla açılır (`file://` ile açılmaz, `assets/*.json` fetch edilir):

```sh
python3 -m http.server 8000
# http://localhost:8000/Osmanli%20Atlasi.html
```

## Dosyalar

- `Osmanli Atlasi.html` — iskelet (harita, dock, folio, overlay'ler, perde).
- `classical.css` — Classical tasarım sistemi token'ları (renk, font, `.btn`).
- `atlas.css` — atlasın kendi stilleri.
- `data.js`, `model.js` — repodaki `dist/data.js` ve `dist/model.js`'in **aynısı**; yalnızca `export` yerine `window`'a yazıyorlar.
- `geography.js` — bölge hücreleri, `tools/build-geography.mjs` üretir (elle düzenlemeyin).
- `assets/` — altlık: Natural Earth 1:10m kara, göl, nehir, batimetri (`land.json`, `lakes.json`, `rivers.json`, `bathymetry.json`) 
- `vendor/` — MapLibre GL JS 5.24 (BSD-3), earcut 3 (ISC).
- `tools/` — coğrafya üretim hattı (aşağıda).
- `core.js` — ortak state, yardımcılar, Wikipedia başlık eşlemeleri (`A.WIKI`).
- `loader.js` — prolog: fontlar + Wikipedia API'den portre/olay görselleri, yıl sayacı.
- `stage.js` — MapLibre altlığı (gölgeli rölyef, kıyı çizgileri, nehirler), onun kamerasını izleyen SVG bölge katmanı, kamera (`A.flyTo`, `A.focusRegion`, `A.setCam`), dış sınır (frontier), yayılma animasyonu, etiketler, başlık kartı, mercekler.
- `dock.js` — alan şeridi, olay işaretleri, yüz şeridi, oynatma + hikâye kamerası.
- `folio.js` — sağdaki kâğıt dosya (padişah / kişi / bölge / olay).
- `overlays.js` — Silsile, Kişiler, Düello, bilgi pencereleri.
- `main.js` — seçim mantığı (repodaki `app.js`'ten), aksiyonlar, klavye, açılış.

## Harita

Coğrafî her şey **tek bir MapLibre (WebGL) tuvalinde** çizilir; ayrı bir SVG bölge katmanı yoktur, bu yüzden zoom ve kaydırmada kayma olmaz. Katman sırası (`stage.js` → `STYLE`):

deniz → graticule → kıyı su çizgileri → kara → **hücreler** (renk) → desenler (bağlı / işgal / kayıp) → **yayılma** (özel WebGL katmanı) → **rölyef** → batimetri → göller → nehirler → kıyı → hücre kenarları → dış sınır → seçim/hover.

- Rölyef hücrelerin *üstünde*: tutulan topraklar dağlarını gösterir. Yükseklik verisi AWS/Mapzen Terrain Tiles'tan gelir (anahtar gerekmez; çevrimdışıyken rölyef olmadan çizilir).
- Hücre sınıfı (`direct`, `vassal`, `gain` …) MapLibre **feature-state**'inde tutulur (`cls`, `hide`, `hover`, `sel`). Durum değişimi yeniden karolama yapmaz, oynatmada ucuzdur.
- Desenler çalışma anında kanvasa çizilip `addImage` ile eklenir; her zoomda ekran boyutunda ve keskin kalırlar.
- **Dış sınır**: iki tutulan hücrenin paylaştığı kenarlar birbirini götürür, kalanlar `frontier` kaynağına yazılır. Komşu hücrelerin kenarlarının birebir aynı köşeleri paylaşmasına dayanır; üretim hattındaki mapshaper `snap`/`clean` bunu sağlar.
- **Yayılma**: el değiştiren hücre için `spreadLayer` (özel WebGL katmanı, earcut ile üçgenlenir) ortak sınır noktasından (`contacts`) büyüyen ya da ona doğru küçülen, mürekkep kenarlı bir daire çizer. Kazanımda gerçek dolgu (`hide`) dalga bitene kadar gizlenir. Kare durursa (gizli sekme) bir zamanlayıcı dalgayı yine bitirir. `prefers-reduced-motion` açıksa ve 80 yıldan büyük sıçramalarda çalışmaz.
- Açılış sekansı her yılı değil kilometre taşı yıllarını (`main.js` → `STEPS`) gösterir; her fethin yayılacak zamanı olur.
- Yalnızca ekran-uzayı etiketleri (şehirler, deniz adları, odak işareti, topluluk kutuları) `#labels` SVG'sinde. Klavye ve ekran okuyucu için hücreler `#region-list` içinde gizli düğmeler olarak da var.

Kamera tek kaynaklıdır: `A.cam = {k, tx, ty}` atlas birimlerinde. `A.setCam` MapLibre'ye `jumpTo` yapar, sonra kabul edileni geri okur; kullanıcı sürükleyince `move` olayı `A.cam`'i günceller. `k = 512·2^zoom / 5940`. Projeksiyon gerçek Web Mercator, boylamın derecesi başına 16,5 birim, orijin 12°B / 55°K (`core.js` → `A.project` / `A.unproject`).

## Harita veri sözleşmesi

```js
{ projection: { world: 5940, lon0: -12, lat0: 55 },
  regions: [{ id, name, areaKm2,
              geom: [[[[lon,lat], …]]],            // MultiPolygon
              center:[x,y], bounds:[x0,y0,x1,y1],   // atlas birimleri (kamera için)
              contacts: { komşuId: [lon,lat], … },  // ortak sınırdan bir nokta
              periods: [[başlangıç, bitiş, 'direct'|'vassal'|'autonomy'|'occupied'|'national'], …],
              groups: [...], source, hint }] }
```

`statusAt`, `statsAt`, `changesBetween` ve tüm arayüz bu sözleşmeyle değişmeden çalışır.

## Coğrafyayı yeniden üretmek

`tools/README.md`. Kısaca: eski hücreler (`tools/geography.v1.js`) lon/lat'e çevrilir; her Natural Earth il parçası hücrelerle kesiştirilir. Büyük kısmı (%70+) bir hücrede olan parçalar ve adalar bütün olarak alınır, böylece kenarlar gerçek kıyılara ve il sınırlarına oturur; ikiye bölünen parçalar eski hücre çizgisiyle kesilir. Eski hücreler önce yumuşak, deterministik bir düzlem bükülmesinden geçer (±15 km): bir ili kesen cetvel düz çizgiler düzensiz bir sınıra döner, ama bütün hücreler aynı alanla büküldüğü için ortak kenarlar ortak kalır. Küçük hücreler (İstanbul, Söğüt, Gelibolu, Batı Trakya, Selânik, Belgrad) eski şekilleriyle oyulur. Alanlar jeodezik olarak yeniden hesaplanır (toplam ≈ %5 arttı; Mora gerçek yüzölçümüne indi, Macaristan ve Podolya il sınırları yüzünden büyüdü). Dönemler, gruplar ve kaynaklar dokunulmadan kopyalanır.

## Repoya taşırken

- `data.js` / `model.js`'i kopyalamak yerine `dist/` içindekileri ES modülü olarak import etmek daha temiz (tek kaynak).
- `tests/ui.mjs` eski arayüzün ID'lerini (`map-year`, `.roster-row`, `inspector-body` …) kullanıyor; yeni arayüzle güncellenmesi gerekir.
- WebMCP araçları (`configure_ottoman_atlas`) henüz bu arayüze bağlanmadı; `main.js`'teki `A.selectSultan` / `A.setYear` üzerinden kolayca eklenir.
- Lucide ikonları CDN'den geliyor; çevrimdışı için vendor'layın.
- MapLibre 6 (Temmuz 2026) yalnızca ESM; burada UMD paketi olduğu için 5.24 kullanıldı. ES modüllerine geçerken 6'ya yükseltin.
