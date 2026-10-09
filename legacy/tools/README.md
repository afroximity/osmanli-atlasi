# tools — coğrafya üretim hattı

Gerekenler: Node 20+, `npm install` (mapshaper, turf, polylabel, maplibre-gl).

1. Natural Earth 1:10m verisini indir (kamu malı), ör. `naciscdn.org/naturalearth/10m/…`:
   `cultural/ne_10m_admin_1_states_provinces`, `physical/ne_10m_lakes`, `physical/ne_10m_rivers_lake_centerlines`,
   `physical/ne_10m_bathymetry_{K_200,J_1000,I_2000}`.
2. Kırp ve sadeleştir (`NE` indirilen klasör, `BB=-25,-2,75,62`):

```sh
npx mapshaper -i $NE/ne_10m_admin_1_states_provinces/*.shp -clip bbox=$BB -simplify 15% keep-shapes \
  -filter-fields adm1_code,name,admin -o adm1.json format=geojson precision=0.0001 \
  -dissolve2 -filter-slivers min-area=1km2 -o ../assets/land.json format=geojson precision=0.0001
npx mapshaper -i $NE/ne_10m_lakes/*.shp -clip bbox=$BB -filter 'scalerank<=8' -simplify 20% keep-shapes \
  -filter-fields name,scalerank -o ../assets/lakes.json format=geojson precision=0.0001
npx mapshaper -i $NE/ne_10m_rivers_lake_centerlines/*.shp -clip bbox=$BB -filter 'featurecla!="Lake Centerline"' \
  -simplify 25% -filter-fields name,scalerank,min_zoom -o ../assets/rivers.json format=geojson precision=0.0001
```

   Kara, il sınırlarından çözülerek üretilir; böylece altlığın kıyısı ile hücrelerin kıyısı aynı çizgidir.
3. Hücreleri üret: `node build-geography.mjs adm1.json` → `../geography.js`.
   Kaynak olarak `geography.v1.js` (ilk sürümün editoryal hücreleri) okunur; dönemleri/hint'leri değiştirmek için orayı düzenleyip yeniden çalıştırın.

`stage.v1.js` eski SVG motorunun yedeğidir; karşılaştırma için tutuldu, silinebilir.
