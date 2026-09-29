"use strict";
/* Mapa Sucre — app personal offline
   MapLibre GL + PMTiles (mapa.pmtiles se descarga una vez y queda guardado en el teléfono) */
(function () {
  var BASE = new URL(".", location.href).href;
  var DATA_URL = BASE + "data/mapa.pmtiles";
  var DATA_CACHE = "mapa-sucre-datos-v2"; // cambia este nombre si algún día reemplazas mapa.pmtiles
  var GLYPHS = BASE + "fonts/{fontstack}/{range}.pbf";
  var ATTR = '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener">© MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>';
  var CENTER = [-65.2594, -19.0477];
  var BOUNDS = [[-65.40, -19.13], [-65.13, -18.93]];
  var LS_SITIOS = "mapa-sucre-sitios-v1";
  var LS_TEMA = "mapa-sucre-tema-v1";
  var LS_RUTAS = "mapa-sucre-rutas-v1";

  var $ = function (id) { return document.getElementById(id); };
  // true cuando corre dentro del APK: los archivos ya están en el teléfono, no hace falta service worker ni caché
  var isApp = !!(window.Capacitor && (typeof window.Capacitor.isNativePlatform === "function" ? window.Capacitor.isNativePlatform() : true));

  /* ---------- utilidades ---------- */
  function lsGet(k, def) { try { var v = localStorage.getItem(k); return v === null ? def : v; } catch (e) { return def; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* almacenamiento no disponible */ } }
  function norm(s) { return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
  var toastTimer;
  function toast(msg) {
    var t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }

  /* ---------- carga del mapa (archivo completo en memoria) ---------- */
  function readAll(resp, onProgress) {
    var total = Number(resp.headers.get("content-length")) || 0;
    if (!resp.body || !resp.body.getReader) return resp.arrayBuffer();
    var reader = resp.body.getReader(), chunks = [], got = 0;
    function pump() {
      return reader.read().then(function (r) {
        if (r.done) {
          var out = new Uint8Array(got), off = 0;
          chunks.forEach(function (c) { out.set(c, off); off += c.length; });
          return out.buffer;
        }
        chunks.push(r.value); got += r.value.length;
        onProgress(total ? Math.min(1, got / total) : null);
        return pump();
      });
    }
    return pump();
  }

  function loadMapFile() {
    var hasCache = typeof caches !== "undefined" && !isApp;
    if (hasCache) {
      // libera el mapa viejo de 24 MB si quedó guardado en el teléfono
      caches.keys().then(function (keys) {
        keys.forEach(function (k) { if (k.indexOf("mapa-sucre-datos-") === 0 && k !== DATA_CACHE) caches.delete(k); });
      }).catch(function () {});
    }
    // pide al navegador que no borre lo guardado cuando falte espacio (si lo permite)
    try { if (!isApp && navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* no disponible */ }
    var cachePromise = hasCache ? caches.open(DATA_CACHE).catch(function () { return null; }) : Promise.resolve(null);
    return cachePromise.then(function (cache) {
      var fromCache = cache ? cache.match(DATA_URL) : Promise.resolve(undefined);
      return fromCache.then(function (hit) {
        var cached = !!hit;
        var respP = hit ? Promise.resolve(hit) : fetch(DATA_URL);
        return respP.then(function (resp) {
          if (!resp.ok) throw new Error("HTTP " + resp.status);
          return readAll(resp, function (p) {
            if (p !== null) { $("barFill").style.width = Math.round(p * 100) + "%"; $("pct").textContent = Math.round(p * 100) + "%"; }
          });
        }).then(function (buf) {
          if (cache && !cached) {
            // guardar para usarlo sin internet la próxima vez
            cache.put(DATA_URL, new Response(buf, { headers: { "Content-Type": "application/octet-stream" } })).catch(function () {});
          }
          return buf;
        });
      });
    });
  }

  function MemorySource() { this.promise = loadMapFile(); }
  MemorySource.prototype.getKey = function () { return "mapa"; };
  MemorySource.prototype.getBytes = function (offset, length) {
    return this.promise.then(function (buf) { return { data: buf.slice(offset, offset + length) }; });
  };

  /* ---------- estilo (esquema OpenMapTiles) ---------- */
  var PAL = {
    light: {
      bg: "#f2efe9", grass: "#d3e6b4", wood: "#b9d5a0", farm: "#eee8c8", resid: "#ebe7df", indus: "#e6e0e8", hosp: "#f4dcdc",
      school: "#efe6d0", cemetery: "#cfe4c6", sport: "#c9e8bd", mil: "#ead9d9", water: "#a8cdee", building: "#dcd5c9", buildingLine: "#c9c0b1",
      casing: "#c7c0b3", trunk: "#f5c25d", primary: "#f8d987", secondary: "#fae8a6", tertiary: "#ffffff", minor: "#ffffff", service: "#fbfaf7",
      track: "#b9a57a", path: "#a5735f", rail: "#9a9a9a", boundary: "#9b8fb3",
      text: "#2b3038", halo: "#ffffff", muted: "#6b7280", waterText: "#3f77a8", peak: "#7a5c3a", roadText: "#23272e", roadHalo: "rgba(255,255,255,0.85)"
    },
    dark: {
      bg: "#181d23", grass: "#1f2e24", wood: "#1b2b1f", farm: "#252a20", resid: "#1f242b", indus: "#252331", hosp: "#33252a",
      school: "#2a2720", cemetery: "#1e2d24", sport: "#203225", mil: "#2c2226", water: "#13303f", building: "#2a313a", buildingLine: "#3a434e",
      casing: "#0f1215", trunk: "#b48a3c", primary: "#96783f", secondary: "#7b6a49", tertiary: "#56616e", minor: "#46505b", service: "#3a434c",
      track: "#6b5d3a", path: "#8a6b5a", rail: "#6b7280", boundary: "#6d6485",
      text: "#dfe5ec", halo: "#14181d", muted: "#9aa4b2", waterText: "#6fa8d6", peak: "#c9a878", roadText: "#eef2f7", roadHalo: "rgba(20,24,29,0.85)"
    }
  };
  var FR = ["NotoSans-Regular"], FM = ["NotoSans-Medium"], FI = ["NotoSans-Italic"];
  var NAME = ["coalesce", ["get", "name"], ["get", "name:latin"]];

  function byClass(obj, def) {
    var a = ["match", ["get", "class"]];
    Object.keys(obj).forEach(function (k) { a.push(k.indexOf(",") > -1 ? k.split(",") : k, obj[k]); });
    a.push(def);
    return a;
  }
  function grow(obj, extra) { var o = {}; Object.keys(obj).forEach(function (k) { o[k] = obj[k] + extra; }); return o; }
  function zi() { return ["interpolate", ["exponential", 1.5], ["zoom"]].concat([].slice.call(arguments)); }

  // anchos de calle (px) por zoom: a partir de z16 la calle es lo bastante ancha para que el nombre quede DENTRO de ella
  var W10 = { trunk: 1.8, primary: 1.4, secondary: 1.2, tertiary: 0.9, minor: 0.5, service: 0.4 };
  var W13 = { trunk: 5, primary: 4.2, secondary: 3.6, tertiary: 3.0, minor: 1.9, service: 1.2 };
  var W15 = { trunk: 11, primary: 9.5, secondary: 8.5, tertiary: 7.5, minor: 6.5, service: 3.5 };
  var W165 = { trunk: 20, primary: 17, secondary: 15.5, tertiary: 14, minor: 12.5, service: 6.5 };
  var W18 = { trunk: 34, primary: 30, secondary: 27, tertiary: 25, minor: 23, service: 12 };
  function roadFillW() { return zi(10, byClass(W10, 0.5), 13, byClass(W13, 1.2), 15, byClass(W15, 3), 16.5, byClass(W165, 6), 18, byClass(W18, 12)); }
  function roadCasingW() { return zi(10, byClass(grow(W10, 0.6), 0.8), 13, byClass(grow(W13, 1.2), 2), 15, byClass(grow(W15, 1.6), 4), 16.5, byClass(grow(W165, 2), 7.5), 18, byClass(grow(W18, 3), 14)); }

  var LINE = ["==", ["geometry-type"], "LineString"];
  var MAJOR = ["trunk", "primary", "secondary", "tertiary", "motorway"];
  var isMajor = ["all", LINE, ["in", ["get", "class"], ["literal", MAJOR]]];
  var isMinor = ["all", LINE, ["in", ["get", "class"], ["literal", ["minor", "service"]]]];

  function emptyFC() { return { type: "FeatureCollection", features: [] }; }
  function sitiosFC(list) {
    return { type: "FeatureCollection", features: list.map(function (s) {
      return { type: "Feature", properties: { id: s.id, name: s.name }, geometry: { type: "Point", coordinates: [s.lon, s.lat] } };
    }) };
  }
  function pinFC(pt) {
    return pt ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: pt } }] } : emptyFC();
  }

  function buildStyle(dark, sitiosData, pinData, rutasData, tripData) {
    var c = dark ? PAL.dark : PAL.light;
    var halo = { "text-halo-color": c.halo, "text-halo-width": 1.6, "text-halo-blur": 0.3 };
    var layers = [
      { id: "bg", type: "background", paint: { "background-color": c.bg } },
      { id: "landcover", type: "fill", source: "omt", "source-layer": "landcover",
        paint: { "fill-color": byClass({ wood: c.wood, grass: c.grass, farmland: c.farm }, c.grass), "fill-opacity": 0.75 } },
      { id: "landuse", type: "fill", source: "omt", "source-layer": "landuse",
        paint: { "fill-color": byClass({ "residential,suburb,neighbourhood": c.resid, "industrial,commercial,retail,railway": c.indus, hospital: c.hosp,
          "school,university,college,kindergarten": c.school, cemetery: c.cemetery, "pitch,stadium,playground,track,theme_park,zoo": c.sport, military: c.mil }, c.resid) } },
      { id: "park", type: "fill", source: "omt", "source-layer": "park", paint: { "fill-color": c.grass, "fill-opacity": 0.8 } },
      { id: "water", type: "fill", source: "omt", "source-layer": "water", paint: { "fill-color": c.water } },
      { id: "waterway", type: "line", source: "omt", "source-layer": "waterway",
        paint: { "line-color": c.water, "line-width": zi(8, byClass({ river: 1 }, 0.4), 14, byClass({ river: 3.5 }, 1.2), 18, byClass({ river: 12 }, 3.5)) } },
      { id: "aeroway-apron", type: "fill", source: "omt", "source-layer": "aeroway", filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": dark ? "#2a313a" : "#e3e0dc" } },
      { id: "aeroway-line", type: "line", source: "omt", "source-layer": "aeroway", filter: LINE,
        paint: { "line-color": dark ? "#3a434e" : "#d5d1cb", "line-width": zi(11, 1.5, 16, 14) } },
      { id: "building", type: "fill", source: "omt", "source-layer": "building", minzoom: 13,
        paint: { "fill-color": c.building, "fill-outline-color": c.buildingLine, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0, 15, 1] } },
      { id: "boundary", type: "line", source: "omt", "source-layer": "boundary", filter: ["<=", ["to-number", ["get", "admin_level"], 99], 8],
        paint: { "line-color": c.boundary, "line-width": 1.2, "line-dasharray": [4, 3] } },
      { id: "rail", type: "line", source: "omt", "source-layer": "transportation", filter: ["all", LINE, ["==", ["get", "class"], "rail"]], minzoom: 10,
        paint: { "line-color": c.rail, "line-width": 1.1, "line-dasharray": [3, 2] } },
      { id: "track", type: "line", source: "omt", "source-layer": "transportation", filter: ["all", LINE, ["==", ["get", "class"], "track"]], minzoom: 13,
        paint: { "line-color": c.track, "line-width": zi(13, 0.8, 18, 3), "line-dasharray": [3, 2] } },
      { id: "path", type: "line", source: "omt", "source-layer": "transportation", filter: ["all", LINE, ["in", ["get", "class"], ["literal", ["path", "pedestrian"]]]], minzoom: 14,
        paint: { "line-color": c.path, "line-width": zi(14, 0.7, 18, 2.4), "line-dasharray": [2, 2] } },
      { id: "road-minor-casing", type: "line", source: "omt", "source-layer": "transportation", filter: isMinor, minzoom: 12.5,
        layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": c.casing, "line-width": roadCasingW() } },
      { id: "road-major-casing", type: "line", source: "omt", "source-layer": "transportation", filter: isMajor, minzoom: 5,
        layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": c.casing, "line-width": roadCasingW() } },
      { id: "road-minor", type: "line", source: "omt", "source-layer": "transportation", filter: isMinor, minzoom: 12.5,
        layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": byClass({ service: c.service }, c.minor), "line-width": roadFillW() } },
      { id: "road-major", type: "line", source: "omt", "source-layer": "transportation", filter: isMajor, minzoom: 5,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": byClass({ "trunk,motorway": c.trunk, primary: c.primary, secondary: c.secondary }, c.tertiary), "line-width": roadFillW() } },

      { id: "rutas-casing", type: "line", source: "rutas",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-opacity": 0.9, "line-width": zi(11, 3.4, 15, 6.5, 18, 12) } },
      { id: "rutas-a", type: "line", source: "rutas", filter: ["==", ["get", "leg"], "A"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": zi(11, 1.7, 15, 3.6, 18, 8) } },
      { id: "rutas-b", type: "line", source: "rutas", filter: ["==", ["get", "leg"], "B"],
        layout: { "line-cap": "butt", "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": zi(11, 1.7, 15, 3.6, 18, 8), "line-dasharray": [2, 1.4] } },
      { id: "trip-zone", type: "fill", source: "trip", filter: ["==", ["get", "kind"], "zone"],
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.1 } },
      { id: "trip-zone-line", type: "line", source: "trip", filter: ["==", ["get", "kind"], "zone"],
        paint: { "line-color": ["get", "color"], "line-width": 1.6, "line-dasharray": [3, 2] } },
      { id: "trip-full", type: "line", source: "trip", filter: ["==", ["get", "kind"], "full"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": zi(11, 1.8, 16, 3.5), "line-opacity": 0.6 } },
      { id: "trip-casing", type: "line", source: "trip", filter: ["==", ["get", "kind"], "ride"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": zi(11, 6, 15, 11, 18, 19) } },
      { id: "trip-ride", type: "line", source: "trip", filter: ["==", ["get", "kind"], "ride"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": zi(11, 3.6, 15, 7, 18, 13) } },
      { id: "trip-walk", type: "line", source: "trip", filter: ["==", ["get", "kind"], "walk"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": dark ? "#f3f4f6" : "#374151", "line-width": zi(11, 2.2, 18, 4.5), "line-dasharray": [0.6, 1.8] } },
      { id: "poi-dot", type: "circle", source: "omt", "source-layer": "poi", minzoom: 16,
        filter: ["all", ["==", ["geometry-type"], "Point"], ["has", "name"]],
        paint: {
          "circle-radius": zi(16, 3, 18, 6),
          "circle-color": byClass({
            "restaurant,fast_food,cafe,bar,bakery,ice_cream,pub": "#e2703a", "lodging,hotel": "#7b5ea7",
            "shop,grocery,supermarket,clothing_store,convenience,butcher,florist,alcohol_shop,stationery": "#3a7bd5",
            "hospital,pharmacy,doctors,dentist,clinic,veterinary": "#d64545", "school,college,university,kindergarten,library": "#b0863a",
            "place_of_worship": "#6a6aa5", "bank,atm": "#2e8b57"
          }, "#6b7280"),
          "circle-stroke-color": c.halo, "circle-stroke-width": 1.2
        } },
      { id: "poi-label", type: "symbol", source: "omt", "source-layer": "poi", minzoom: 16.5,
        filter: ["all", ["==", ["geometry-type"], "Point"], ["has", "name"]],
        layout: { "text-field": NAME, "text-font": FR, "text-size": 11, "text-anchor": "top", "text-offset": [0, 0.7], "text-optional": true, "text-max-width": 8,
          "symbol-sort-key": ["coalesce", ["get", "rank"], 99] },
        paint: Object.assign({ "text-color": c.text }, halo) },

      { id: "road-label-major", type: "symbol", source: "omt", "source-layer": "transportation_name", minzoom: 12,
        filter: ["in", ["get", "class"], ["literal", MAJOR]],
        layout: { "symbol-placement": "line", "text-field": NAME, "text-font": FM, "text-size": zi(12, 10, 15, 11.5, 16.5, 12.5, 18, 15), "text-max-angle": 45, "symbol-spacing": 200, "text-letter-spacing": 0.04 },
        paint: { "text-color": c.roadText, "text-halo-color": c.roadHalo, "text-halo-width": 1.1, "text-halo-blur": 0.2 } },
      { id: "road-label-minor", type: "symbol", source: "omt", "source-layer": "transportation_name", minzoom: 14.6,
        filter: ["!", ["in", ["get", "class"], ["literal", MAJOR]]],
        layout: { "symbol-placement": "line", "text-field": NAME, "text-font": FM, "text-size": zi(14.6, 9.5, 16.5, 11.5, 18, 14), "text-max-angle": 45, "symbol-spacing": 150, "text-letter-spacing": 0.04 },
        paint: { "text-color": c.roadText, "text-halo-color": c.roadHalo, "text-halo-width": 1.1, "text-halo-blur": 0.2 } },
      { id: "housenumber", type: "symbol", source: "omt", "source-layer": "housenumber", minzoom: 17.5,
        layout: { "text-field": ["get", "housenumber"], "text-font": FR, "text-size": 10 },
        paint: { "text-color": c.muted, "text-halo-color": c.halo, "text-halo-width": 1.2 } },
      { id: "water-label", type: "symbol", source: "omt", "source-layer": "water_name", minzoom: 10,
        layout: { "text-field": NAME, "text-font": FI, "text-size": zi(10, 11, 16, 15) },
        paint: Object.assign({ "text-color": c.waterText }, halo) },
      { id: "peak-label", type: "symbol", source: "omt", "source-layer": "mountain_peak", minzoom: 11,
        layout: { "text-field": ["case", ["has", "ele"], ["concat", NAME, "\n", ["to-string", ["get", "ele"]], " m"], NAME], "text-font": FR, "text-size": 11, "text-anchor": "top", "text-offset": [0, 0.3] },
        paint: Object.assign({ "text-color": c.peak }, halo) },
      { id: "aerodrome-label", type: "symbol", source: "omt", "source-layer": "aerodrome_label", minzoom: 11,
        layout: { "text-field": NAME, "text-font": FR, "text-size": 11 }, paint: Object.assign({ "text-color": c.muted }, halo) },

      { id: "place-hamlet", type: "symbol", source: "omt", "source-layer": "place", minzoom: 12,
        filter: ["in", ["get", "class"], ["literal", ["hamlet", "isolated_dwelling", "neighbourhood", "quarter"]]],
        layout: { "text-field": NAME, "text-font": FR, "text-size": zi(12, 10, 17, 14), "text-max-width": 7 },
        paint: Object.assign({ "text-color": c.muted }, halo) },
      { id: "place-village", type: "symbol", source: "omt", "source-layer": "place", minzoom: 10,
        filter: ["in", ["get", "class"], ["literal", ["village", "suburb"]]],
        layout: { "text-field": NAME, "text-font": FM, "text-size": zi(10, 11, 16, 16), "text-max-width": 7 },
        paint: Object.assign({ "text-color": c.text }, halo) },
      { id: "place-city", type: "symbol", source: "omt", "source-layer": "place", minzoom: 5,
        filter: ["in", ["get", "class"], ["literal", ["city", "town"]]],
        layout: { "text-field": NAME, "text-font": FM, "text-size": zi(8, 14, 14, 24), "text-max-width": 8, "text-letter-spacing": 0.05 },
        paint: Object.assign({ "text-color": c.text }, halo) },

      { id: "rutas-label", type: "symbol", source: "rutas", filter: ["==", ["get", "leg"], "A"], minzoom: 11,
        layout: { "symbol-placement": "line", "text-field": ["get", "label"], "text-font": FM, "text-size": 12, "symbol-spacing": 340, "text-max-angle": 40, "text-keep-upright": true },
        paint: { "text-color": ["get", "base"], "text-halo-color": "#ffffff", "text-halo-width": 2.2 } },
      { id: "trip-pts", type: "circle", source: "trip", filter: ["==", ["get", "kind"], "pt"],
        paint: { "circle-radius": 8, "circle-color": ["get", "color"], "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } },
      { id: "trip-label", type: "symbol", source: "trip", filter: ["==", ["get", "kind"], "pt"],
        layout: { "text-field": ["get", "label"], "text-font": FM, "text-size": 12.5, "text-anchor": "bottom", "text-offset": [0, -1.2], "text-max-width": 10, "text-allow-overlap": true },
        paint: { "text-color": c.text, "text-halo-color": c.halo, "text-halo-width": 2 } },
      { id: "sitios-dot", type: "circle", source: "sitios", paint: { "circle-radius": 8, "circle-color": "#e11d48", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2.5 } },
      { id: "sitios-label", type: "symbol", source: "sitios", minzoom: 11,
        layout: { "text-field": ["get", "name"], "text-font": FM, "text-size": 12, "text-anchor": "bottom", "text-offset": [0, -1.1], "text-optional": true, "text-max-width": 9 },
        paint: Object.assign({ "text-color": c.text }, halo) },
      { id: "pin", type: "circle", source: "pin", paint: { "circle-radius": 9, "circle-color": "#1f6feb", "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } }
    ];
    return {
      version: 8, name: "Sucre", glyphs: GLYPHS,
      sources: {
        omt: { type: "vector", url: "pmtiles://mapa", attribution: ATTR },
        sitios: { type: "geojson", data: sitiosData },
        pin: { type: "geojson", data: pinData },
        rutas: { type: "geojson", data: rutasData || emptyFC() },
        trip: { type: "geojson", data: tripData || emptyFC() }
      },
      layers: layers
    };
  }
  window.__buildStyle = buildStyle; // útil para depurar

  /* ---------- estado ---------- */
  var sitios = [];
  try { sitios = JSON.parse(lsGet(LS_SITIOS, "[]")) || []; } catch (e) { sitios = []; }
  var state = { sel: null, pin: null, pick: null };
  var trip = { from: null, to: null, results: [], sel: -1, fc: null, moreTransfers: false };
  var RUTAS = {}, RINDEX = [], rutasReady = false, rutasVis = {};
  try { (JSON.parse(lsGet(LS_RUTAS, "[]")) || []).forEach(function (n) { rutasVis[n] = true; }); } catch (e) { /* sin selección guardada */ }
  var dark = lsGet(LS_TEMA, null);
  dark = dark === null ? !!(window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches) : dark === "1";
  document.body.classList.toggle("dark", dark);

  /* ---------- mapa ---------- */
  var mem = new MemorySource();
  mem.promise.catch(function (err) {
    $("loading").innerHTML = '<div style="text-align:center;padding:0 24px">No se pudo cargar el mapa.<br><small>La primera vez necesitas internet. (' + (err && err.message || err) + ')</small></div>';
  });
  var protocol = new pmtiles.Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  protocol.add(new pmtiles.PMTiles(mem));

  var map = new maplibregl.Map({
    container: "map", style: buildStyle(dark, sitiosFC(sitios), pinFC(null), rutasFC(), null),
    center: CENTER, zoom: 13, minZoom: 9.5, maxZoom: 19.5, maxBounds: BOUNDS,
    attributionControl: { compact: true }, pitchWithRotate: false, dragRotate: false, touchPitch: false
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
  map.addControl(new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showAccuracyCircle: true
  }), "bottom-right");
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

  var hidden = false;
  function hideLoading() { if (hidden) return; hidden = true; $("loading").classList.add("hide"); }
  map.once("load", hideLoading);
  map.once("idle", hideLoading);
  map.on("error", function (e) { if (window.console) console.warn(e && e.error || e); });

  function setPin(pt) {
    state.pin = pt;
    var s = map.getSource("pin");
    if (s) s.setData(pinFC(pt));
  }
  function refreshSitios() {
    lsSet(LS_SITIOS, JSON.stringify(sitios));
    var s = map.getSource("sitios");
    if (s) s.setData(sitiosFC(sitios));
  }

  /* ---------- tema ---------- */
  $("btnTema").addEventListener("click", function () {
    dark = !dark;
    lsSet(LS_TEMA, dark ? "1" : "0");
    document.body.classList.toggle("dark", dark);
    document.querySelector('meta[name="theme-color"]').setAttribute("content", dark ? "#14181d" : "#1f6feb");
    map.setStyle(buildStyle(dark, sitiosFC(sitios), pinFC(state.pin), rutasFC(), trip.fc), { diff: false });
  });

  /* ---------- hoja del lugar seleccionado ---------- */
  var TIPO = {
    restaurant: "Restaurante", fast_food: "Comida rápida", cafe: "Café", bar: "Bar", bakery: "Panadería", lodging: "Alojamiento", hotel: "Hotel",
    shop: "Tienda", grocery: "Abarrotes", supermarket: "Supermercado", bank: "Banco", atm: "Cajero", hospital: "Hospital", pharmacy: "Farmacia",
    doctors: "Médico", dentist: "Dentista", clinic: "Clínica", school: "Colegio", college: "Universidad", university: "Universidad", library: "Biblioteca",
    place_of_worship: "Iglesia / templo", park: "Parque", museum: "Museo", fuel: "Gasolinera", police: "Policía", city: "Ciudad", village: "Comunidad", hamlet: "Caserío"
  };
  function findSaved(sel) {
    for (var i = 0; i < sitios.length; i++) {
      if (Math.abs(sitios[i].lon - sel.lon) < 6e-5 && Math.abs(sitios[i].lat - sel.lat) < 6e-5) return sitios[i];
    }
    return null;
  }
  function openSheet(sel) {
    state.sel = sel;
    closePanel();
    $("sheetTitle").textContent = sel.name || "Punto seleccionado";
    $("sheetSub").textContent = (sel.tipo ? sel.tipo + " · " : "") + sel.lat.toFixed(5) + ", " + sel.lon.toFixed(5);
    var saved = findSaved(sel), b = $("btnGuardar");
    b.textContent = saved ? "Quitar de mis sitios" : "Guardar sitio";
    b.className = "btn" + (saved ? " danger" : "");
    renderMicrosCerca(sel);
    $("sheet").classList.add("open");
  }
  function closeSheet() { $("sheet").classList.remove("open"); setPin(null); state.sel = null; }
  $("sheetClose").addEventListener("click", closeSheet);

  $("btnGuardar").addEventListener("click", function () {
    var sel = state.sel; if (!sel) return;
    var saved = findSaved(sel);
    if (saved) {
      sitios = sitios.filter(function (s) { return s !== saved; });
      refreshSitios(); toast("Sitio quitado"); openSheet(sel); return;
    }
    var name = window.prompt("Nombre del sitio:", sel.name || "");
    if (name === null) return;
    name = name.trim() || sel.name || "Sitio";
    sitios.push({ id: Date.now().toString(36), name: name, lon: sel.lon, lat: sel.lat, tipo: sel.tipo || "" });
    sel.name = name;
    refreshSitios(); toast("Sitio guardado"); openSheet(sel);
  });
  $("btnCopiar").addEventListener("click", function () {
    var sel = state.sel; if (!sel) return;
    var txt = sel.lat.toFixed(6) + ", " + sel.lon.toFixed(6);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(function () { toast("Coordenadas copiadas"); }, function () { window.prompt("Copia las coordenadas:", txt); });
    } else { window.prompt("Copia las coordenadas:", txt); }
  });
  $("btnMaps").addEventListener("click", function () {
    var sel = state.sel; if (!sel) return;
    window.open("https://www.google.com/maps/search/?api=1&query=" + sel.lat + "," + sel.lon, "_blank", "noopener");
  });

  var QLAYERS = ["sitios-dot", "poi-dot", "poi-label", "place-city", "place-village", "place-hamlet", "peak-label"];
  map.on("click", function (e) {
    hideResults();
    var r = 10, box = [[e.point.x - r, e.point.y - r], [e.point.x + r, e.point.y + r]];
    var fs = map.queryRenderedFeatures(box, { layers: QLAYERS });
    var sel;
    if (fs.length) {
      var f = fs[0], p = f.properties || {}, co = f.geometry && f.geometry.type === "Point" ? f.geometry.coordinates : [e.lngLat.lng, e.lngLat.lat];
      sel = { name: p.name || p["name:latin"] || "", tipo: f.layer.id === "sitios-dot" ? "Mi sitio" : (TIPO[p.class] || (p.class ? String(p.class).replace(/_/g, " ") : "")), lon: co[0], lat: co[1] };
    } else {
      sel = { name: "", tipo: "", lon: e.lngLat.lng, lat: e.lngLat.lat };
    }
    if (state.pick) {
      var which = state.pick; state.pick = null; $("pickBanner").classList.remove("show");
      q.blur(); hideResults();
      setTripPoint(which, { name: sel.name || "Punto en el mapa", lon: sel.lon, lat: sel.lat });
      openViaje();
      return;
    }
    setPin([sel.lon, sel.lat]);
    openSheet(sel);
  });
  map.on("mousemove", function (e) {
    var fs = map.queryRenderedFeatures([[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]], { layers: QLAYERS });
    map.getCanvas().style.cursor = fs.length ? "pointer" : "";
  });

  /* ---------- mis sitios ---------- */
  function closePanel() { $("panelSitios").classList.remove("open"); $("panelRutas").classList.remove("open"); $("panelViaje").classList.remove("open"); }
  function renderSitios() {
    var ul = $("listaSitios"); ul.innerHTML = "";
    if (!sitios.length) {
      var li = document.createElement("li"); li.className = "vacio"; li.style.display = "block";
      li.textContent = "Aún no tienes sitios guardados. Toca un punto del mapa y usa “Guardar sitio”.";
      ul.appendChild(li); return;
    }
    sitios.slice().sort(function (a, b) { return a.name.localeCompare(b.name, "es"); }).forEach(function (s) {
      var li = document.createElement("li");
      var info = document.createElement("div"); info.className = "info";
      var b = document.createElement("b"); b.textContent = s.name;
      var sp = document.createElement("span"); sp.textContent = s.lat.toFixed(5) + ", " + s.lon.toFixed(5);
      info.appendChild(b); info.appendChild(sp);
      info.addEventListener("click", function () {
        closePanel();
        map.flyTo({ center: [s.lon, s.lat], zoom: Math.max(map.getZoom(), 16), essential: true });
        setPin([s.lon, s.lat]);
        openSheet({ name: s.name, tipo: "Mi sitio", lon: s.lon, lat: s.lat });
      });
      var del = document.createElement("button"); del.className = "del"; del.setAttribute("aria-label", "Eliminar"); del.textContent = "🗑";
      del.addEventListener("click", function () {
        if (!window.confirm("¿Eliminar “" + s.name + "”?")) return;
        sitios = sitios.filter(function (x) { return x.id !== s.id; });
        refreshSitios(); renderSitios();
      });
      li.appendChild(info); li.appendChild(del); ul.appendChild(li);
    });
  }
  $("btnSitios").addEventListener("click", function () {
    if ($("panelSitios").classList.contains("open")) { closePanel(); return; }
    $("sheet").classList.remove("open"); $("panelRutas").classList.remove("open"); $("panelViaje").classList.remove("open"); renderSitios(); $("panelSitios").classList.add("open");
  });
  $("panelClose").addEventListener("click", closePanel);

  // Lee una lista de sitios (JSON) y agrega los que no estén repetidos
  function importSitios(text) {
    try {
      var arr = JSON.parse(text), added = 0;
      if (!Array.isArray(arr)) throw new Error("formato");
      arr.forEach(function (s) {
        if (s && typeof s.name === "string" && isFinite(s.lon) && isFinite(s.lat) && !sitios.some(function (x) { return x.id === s.id; })) {
          sitios.push({ id: s.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: s.name, lon: +s.lon, lat: +s.lat, tipo: s.tipo || "" }); added++;
        }
      });
      refreshSitios(); renderSitios(); toast(added + " sitio(s) importado(s)");
    } catch (e) { toast("Texto o archivo no válido"); }
  }
  $("btnExportar").addEventListener("click", function () {
    var json = JSON.stringify(sitios, null, 2);
    if (isApp) {
      // dentro del APK no se puede descargar un archivo: se copia el texto para pegarlo en una nota o mensaje
      var fallback = function () { window.prompt("Copia este texto y guárdalo en una nota:", json); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(json).then(function () { toast("Copia lista: pégala en una nota o mensaje"); }, fallback);
      } else { fallback(); }
      return;
    }
    var blob = new Blob([json], { type: "application/json" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "mis-sitios-sucre.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  });
  $("btnImportar").addEventListener("click", function () {
    if (isApp) {
      var txt = window.prompt("Pega aquí la copia de tus sitios:", "");
      if (txt) importSitios(txt);
      return;
    }
    $("fileImport").click();
  });
  $("fileImport").addEventListener("change", function (ev) {
    var f = ev.target.files && ev.target.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () { importSitios(rd.result); ev.target.value = ""; };
    rd.readAsText(f);
  });

  /* ---------- micros (rutas) ---------- */
  function rutaColor(n) {
    var hex = RUTAS[n].c;
    if (!dark) return hex;
    // en modo oscuro se aclaran los colores muy oscuros para que se vean sobre el mapa
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex); if (!m) return hex;
    var r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, sat = 0;
    if (mx !== mn) {
      var d = mx - mn; sat = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60;
    }
    if (l >= 0.55) return hex;
    return "hsl(" + Math.round(h) + "," + Math.round(Math.max(sat, 0.6) * 100) + "%,62%)";
  }
  window.__rutasTest = { set: function (d, names, isDark) { RUTAS = d; rutasVis = {}; names.forEach(function (n) { rutasVis[n] = true; }); dark = !!isDark; return rutasFC(); } }; // solo para pruebas
  function rutaLabel(n) { return n.replace(/^Linea /, "Línea "); }
  function rutasFC() {
    var feats = [];
    Object.keys(rutasVis).forEach(function (n) {
      var r = RUTAS[n]; if (!r) return;
      feats.push({ type: "Feature", properties: { name: n, label: rutaLabel(n), color: rutaColor(n), base: r.c, leg: "A" }, geometry: { type: "LineString", coordinates: r.a } });
      feats.push({ type: "Feature", properties: { name: n, label: rutaLabel(n), color: rutaColor(n), base: r.c, leg: "B" }, geometry: { type: "LineString", coordinates: r.b } });
    });
    return { type: "FeatureCollection", features: feats };
  }
  function updateRutas() {
    lsSet(LS_RUTAS, JSON.stringify(Object.keys(rutasVis)));
    var src = map.getSource("rutas");
    if (src) src.setData(rutasFC());
    renderRutas();
  }
  function setRutaVisible(n, on) {
    if (on) rutasVis[n] = true; else delete rutasVis[n];
    updateRutas();
  }
  function fitRuta(n) {
    var r = RUTAS[n]; if (!r) return;
    var b = new maplibregl.LngLatBounds();
    r.a.concat(r.b).forEach(function (p) { b.extend(p); });
    map.fitBounds(b, { padding: { top: 90, bottom: 150, left: 40, right: 40 }, maxZoom: 16, duration: 700 });
  }
  function sortedRutas() { return Object.keys(RUTAS).sort(function (a, b) { return a.localeCompare(b, "es", { numeric: true }); }); }
  function renderRutas() {
    var ul = $("listaRutas"); ul.innerHTML = "";
    var names = sortedRutas();
    if (!names.length) {
      var li0 = document.createElement("li"); li0.style.cursor = "default"; li0.textContent = "Cargando rutas…"; ul.appendChild(li0); return;
    }
    names.forEach(function (n) {
      var li = document.createElement("li");
      var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !!rutasVis[n];
      var sw = document.createElement("span"); sw.className = "sw"; sw.style.background = rutaColor(n);
      var nm = document.createElement("span"); nm.className = "name"; nm.textContent = rutaLabel(n);
      li.appendChild(cb); li.appendChild(sw); li.appendChild(nm);
      li.addEventListener("click", function () {
        var on = !rutasVis[n];
        setRutaVisible(n, on);
        if (on) { closePanel(); fitRuta(n); }
      });
      ul.appendChild(li);
    });
  }
  $("btnRutas").addEventListener("click", function () {
    if ($("panelRutas").classList.contains("open")) { closePanel(); return; }
    $("sheet").classList.remove("open"); $("panelSitios").classList.remove("open"); $("panelViaje").classList.remove("open"); renderRutas(); $("panelRutas").classList.add("open");
  });
  $("rutasClose").addEventListener("click", closePanel);
  $("btnOcultarRutas").addEventListener("click", function () { rutasVis = {}; updateRutas(); });

  // distancia (m) de un punto a una polilínea
  function distPolyline(coords, lon, lat) {
    var kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 110540, best = Infinity;
    var ax = (coords[0][0] - lon) * kx, ay = (coords[0][1] - lat) * ky;
    for (var i = 1; i < coords.length; i++) {
      var bx = (coords[i][0] - lon) * kx, by = (coords[i][1] - lat) * ky;
      var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      var t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
      var d = Math.hypot(ax + t * dx, ay + t * dy);
      if (d < best) best = d;
      ax = bx; ay = by;
    }
    return best;
  }
  function microsCerca(lon, lat, radio) {
    var out = [];
    Object.keys(RUTAS).forEach(function (n) {
      var d = Math.min(distPolyline(RUTAS[n].a, lon, lat), distPolyline(RUTAS[n].b, lon, lat));
      if (d <= radio) out.push({ n: n, d: d });
    });
    return out.sort(function (a, b) { return a.d - b.d; });
  }
  function renderMicrosCerca(sel) {
    var box = $("sheetMicros"), chips = $("chipsMicros"); chips.innerHTML = "";
    var list = rutasReady ? microsCerca(sel.lon, sel.lat, 150) : [];
    if (!list.length) { box.style.display = "none"; return; }
    list.forEach(function (x) {
      var b = document.createElement("button"); b.className = "chip";
      var sw = document.createElement("span"); sw.className = "sw"; sw.style.background = rutaColor(x.n);
      b.appendChild(sw); b.appendChild(document.createTextNode(rutaLabel(x.n) + " · " + Math.round(x.d) + " m"));
      b.addEventListener("click", function () { setRutaVisible(x.n, true); toast("Mostrando " + rutaLabel(x.n)); });
      chips.appendChild(b);
    });
    box.style.display = "block";
  }
  fetch(BASE + "data/rutas.json").then(function (r) { return r.json(); }).then(function (data) {
    RUTAS = data; rutasReady = true;
    Object.keys(rutasVis).forEach(function (n) { if (!RUTAS[n]) delete rutasVis[n]; });
    RINDEX = Object.keys(RUTAS).map(function (n) {
      return { n: rutaLabel(n), t: "Micro · ruta", lon: RUTAS[n].a[0][0], lat: RUTAS[n].a[0][1], w: 0.5, k: norm(n + " micro linea ruta"), ruta: n };
    });
    buildNet();
    renderRutas();
    if (map.getSource("rutas")) updateRutas();
    if (trip.from && trip.to) planTrip();
  }).catch(function () { /* sin rutas */ });
  map.on("load", function () { if (rutasReady) updateRutas(); });

  /* ---------- planificador: ¿qué micro me lleva de A a B? ---------- */
  var WALK = 80, BUS = 250, WAIT = 6;           // m/min caminando, m/min en micro (~15 km/h), min de espera en un transbordo
  var LON0 = -65.26, LAT0 = -19.03, KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KY = 110540, CELL = 100;
  var LEGS = [], GRID = {};                     // tramos (cada línea tiene sentido A y B) y cuadrícula espacial
  var tripRadius = 350;

  // Distancia en metros entre dos coordenadas (fórmula de Haversine). Se usa para las distancias que se muestran.
  function haversine(lon1, lat1, lon2, lat2) {
    var R = 6371008.8, r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  function fmtDist(m) { return m < 1000 ? (Math.round(m / 10) * 10) + " m" : (m / 1000).toFixed(1) + " km"; }
  function fmtMin(t) { var m = Math.max(1, Math.round(t)); return m < 60 ? m + " min" : Math.floor(m / 60) + " h " + (m % 60) + " min"; }
  function toXY(p) { return { x: (p.lon - LON0) * KX, y: (p.lat - LAT0) * KY, lon: p.lon, lat: p.lat }; }

  // Prepara la red: cada sentido se densifica (un punto cada ≤25 m) y se indexa en una cuadrícula de 100 m.
  function buildNet() {
    LEGS = []; GRID = {};
    Object.keys(RUTAS).forEach(function (n) {
      ["a", "b"].forEach(function (k) {
        var src = RUTAS[n][k], L = { n: n, k: k.toUpperCase(), lo: [], la: [], xs: [], ys: [], ss: [] }, acc = 0;
        var push = function (lo, la) {
          var x = (lo - LON0) * KX, y = (la - LAT0) * KY, m = L.xs.length;
          if (m) acc += Math.hypot(x - L.xs[m - 1], y - L.ys[m - 1]);
          L.lo.push(lo); L.la.push(la); L.xs.push(x); L.ys.push(y); L.ss.push(acc);   // ss = metros recorridos desde el inicio del sentido
        };
        for (var i = 0; i < src.length; i++) {
          if (i > 0) {
            var plo = src[i - 1][0], pla = src[i - 1][1], lo = src[i][0], la = src[i][1];
            var steps = Math.floor(Math.hypot((lo - plo) * KX, (la - pla) * KY) / 25);
            for (var t = 1; t <= steps; t++) { var f = t / (steps + 1); push(plo + (lo - plo) * f, pla + (la - pla) * f); }
          }
          push(src[i][0], src[i][1]);
        }
        LEGS.push(L);
        var li = LEGS.length - 1;
        for (var v = 0; v < L.xs.length; v++) {
          var key = Math.floor(L.xs[v] / CELL) + ":" + Math.floor(L.ys[v] / CELL);
          (GRID[key] = GRID[key] || []).push(li, v);
        }
      });
    });
  }

  // Para un punto: en cada tramo, los lugares (una "pasada" = un mejor vértice) que quedan a ≤ R metros.
  function nearLegs(P, R) {
    var found = {}, c0 = Math.floor((P.x - R) / CELL), c1 = Math.floor((P.x + R) / CELL), r0 = Math.floor((P.y - R) / CELL), r1 = Math.floor((P.y + R) / CELL);
    for (var cx = c0; cx <= c1; cx++) for (var cy = r0; cy <= r1; cy++) {
      var cell = GRID[cx + ":" + cy]; if (!cell) continue;
      for (var m = 0; m < cell.length; m += 2) {
        var L = LEGS[cell[m]], v = cell[m + 1], d = Math.hypot(L.xs[v] - P.x, L.ys[v] - P.y);
        if (d <= R) (found[cell[m]] = found[cell[m]] || []).push({ i: v, d: d });
      }
    }
    Object.keys(found).forEach(function (li) {
      var arr = found[li].sort(function (a, b) { return a.i - b.i; }), visits = [], cur = null;
      arr.forEach(function (p) {
        if (cur && p.i - cur.last <= 40) { cur.last = p.i; if (p.d < cur.best.d) cur.best = p; }
        else { cur = { last: p.i, best: p }; visits.push(cur); }
      });
      found[li] = visits.map(function (v) { return v.best; });
    });
    return found;
  }

  function finishSeg(li, o, d, O, D) {
    var L = LEGS[li];
    return { li: li, o: { i: o.i, dm: O ? haversine(O.lon, O.lat, L.lo[o.i], L.la[o.i]) : 0 }, d: { i: d.i, dm: D ? haversine(D.lon, D.lat, L.lo[d.i], L.la[d.i]) : 0 } };
  }

  // Micros directos: pasan a ≤ R del origen y del destino. "ok" = en ese sentido llegan de A a B; "rev" = pasan cerca de ambos pero en sentido contrario.
  function planDirect(O, D, R) {
    var no = nearLegs(O, R), nd = nearLegs(D, R), byLine = {};
    Object.keys(no).forEach(function (li) {
      if (!nd[li]) return;
      var L = LEGS[li], best = null, back = null;
      no[li].forEach(function (o) { nd[li].forEach(function (d) {
        var t = (o.d + d.d) / WALK;
        if (d.i > o.i) { var ride = L.ss[d.i] - L.ss[o.i]; t += ride / BUS; if (!best || t < best.t) best = { t: t, o: o, d: d, ride: ride }; }
        else if (!back || t < back.t) back = { t: t, o: o, d: d, ride: 0 };
      }); });
      var c = best ? { ok: true, b: best } : { ok: false, b: back };
      var e = byLine[L.n];
      if (!e || (c.ok && !e.ok) || (c.ok === e.ok && c.b.t < e.b.t)) byLine[L.n] = { ok: c.ok, li: +li, b: c.b };
    });
    var ok = [], rev = [];
    Object.keys(byLine).forEach(function (n) {
      var e = byLine[n], sg = finishSeg(e.li, e.b.o, e.b.d, O, D);
      var item = { kind: "direct", segs: [sg], t: e.b.t, walk: sg.o.dm + sg.d.dm, ride: e.b.ride };
      (e.ok ? ok : rev).push(item);
    });
    ok.sort(function (a, b) { return a.t - b.t; });
    rev.sort(function (a, b) { return a.walk - b.walk; });
    return { ok: ok, rev: rev };
  }

  // Con un transbordo: sube en una línea, baja donde pasa otra línea a ≤ T metros y sigue hasta el destino.
  function planTransfer(O, D, R, T) {
    var no = nearLegs(O, R), nd = nearLegs(D, R), best = {};
    Object.keys(no).forEach(function (lx) {
      var X = LEGS[lx];
      no[lx].forEach(function (o) {
        for (var v = o.i + 1; v < X.xs.length; v += 2) {
          var vx = X.xs[v], vy = X.ys[v], r1 = X.ss[v] - X.ss[o.i];
          if (r1 < 250) continue;
          for (var cx = Math.floor((vx - T) / CELL); cx <= Math.floor((vx + T) / CELL); cx++) for (var cy = Math.floor((vy - T) / CELL); cy <= Math.floor((vy + T) / CELL); cy++) {
            var cell = GRID[cx + ":" + cy]; if (!cell) continue;
            for (var m = 0; m < cell.length; m += 2) {
              var ly = cell[m], w = cell[m + 1], Y = LEGS[ly];
              if (Y.n === X.n || !nd[ly]) continue;
              var dt = Math.hypot(Y.xs[w] - vx, Y.ys[w] - vy); if (dt > T) continue;
              for (var q = 0; q < nd[ly].length; q++) {
                var d = nd[ly][q]; if (d.i <= w) continue;
                var r2 = Y.ss[d.i] - Y.ss[w]; if (r2 < 250) continue;
                var t = (o.d + dt + d.d) / WALK + (r1 + r2) / BUS + WAIT, key = X.n + ">" + Y.n;
                if (!best[key] || t < best[key].t) best[key] = { t: t, lx: +lx, ly: +ly, o: o, v: v, w: w, d: d, r1: r1, r2: r2 };
              }
            }
          }
        }
      });
    });
    return Object.keys(best).map(function (k) { return best[k]; }).sort(function (a, b) { return a.t - b.t; }).slice(0, 5).map(function (b) {
      var s1 = finishSeg(b.lx, b.o, { i: b.v }, O, null), s2 = finishSeg(b.ly, { i: b.w }, b.d, null, D);
      var mid = haversine(LEGS[b.lx].lo[b.v], LEGS[b.lx].la[b.v], LEGS[b.ly].lo[b.w], LEGS[b.ly].la[b.w]);
      return { kind: "transfer", segs: [s1, s2], t: b.t, walk: s1.o.dm + mid + s2.d.dm, ride: b.r1 + b.r2, xfer: mid };
    });
  }

  /* ----- estado y dibujo del viaje ----- */
  function circlePoly(lon, lat, r) {
    var ring = []; for (var i = 0; i <= 48; i++) { var a = i / 48 * 2 * Math.PI; ring.push([lon + Math.cos(a) * r / KX, lat + Math.sin(a) * r / KY]); }
    return [ring];
  }
  function tripBuildFC(item) {
    var f = [];
    function add(kind, geom, props) { props.kind = kind; f.push({ type: "Feature", properties: props, geometry: geom }); }
    function line(kind, coords, props) { add(kind, { type: "LineString", coordinates: coords }, props); }
    function pt(lon, lat, props) { add("pt", { type: "Point", coordinates: [lon, lat] }, props); }
    if (trip.from) add("zone", { type: "Polygon", coordinates: circlePoly(trip.from.lon, trip.from.lat, tripRadius) }, { color: "#16a34a" });
    if (trip.to) add("zone", { type: "Polygon", coordinates: circlePoly(trip.to.lon, trip.to.lat, tripRadius) }, { color: "#dc2626" });
    if (item && trip.from && trip.to) {
      var prev = [trip.from.lon, trip.from.lat];
      item.segs.forEach(function (sg, idx) {
        var L = LEGS[sg.li], col = rutaColor(L.n), a = [L.lo[sg.o.i], L.la[sg.o.i]], b = [L.lo[sg.d.i], L.la[sg.d.i]];
        var full = [], ride = [], i;
        for (i = 0; i < L.lo.length; i += 2) full.push([L.lo[i], L.la[i]]);
        for (i = sg.o.i; i <= sg.d.i; i++) ride.push([L.lo[i], L.la[i]]);
        line("walk", [prev, a], {});
        line("full", full, { color: col });
        line("ride", ride, { color: col });
        pt(a[0], a[1], { color: col, label: "Subir " + rutaLabel(L.n) });
        pt(b[0], b[1], { color: col, label: idx === item.segs.length - 1 ? "Bajar" : "Bajar (transbordo)" });
        prev = b;
      });
      line("walk", [prev, [trip.to.lon, trip.to.lat]], {});
    }
    if (trip.from) pt(trip.from.lon, trip.from.lat, { color: "#16a34a", label: "Origen" });
    if (trip.to) pt(trip.to.lon, trip.to.lat, { color: "#dc2626", label: "Destino" });
    return { type: "FeatureCollection", features: f };
  }
  function setTripFC() {
    trip.fc = tripBuildFC(trip.item);
    var src = map.getSource("trip"); if (src) src.setData(trip.fc);
  }
  function fitTrip(bottom) {
    var b = new maplibregl.LngLatBounds(), n = 0;
    if (trip.from) { b.extend([trip.from.lon, trip.from.lat]); n++; }
    if (trip.to) { b.extend([trip.to.lon, trip.to.lat]); n++; }
    if (trip.item) trip.item.segs.forEach(function (sg) { var L = LEGS[sg.li]; for (var i = sg.o.i; i <= sg.d.i; i += 3) b.extend([L.lo[i], L.la[i]]); });
    if (!n) return;
    var maxBottom = Math.round(map.getContainer().clientHeight * 0.5);
    map.fitBounds(b, { padding: { top: 100, bottom: Math.min(bottom || 360, maxBottom), left: 50, right: 50 }, maxZoom: 16, duration: 700 });
  }

  function tripPointText(p) { return p ? p.name + " · " + p.lat.toFixed(4) + ", " + p.lon.toFixed(4) : "Sin marcar"; }
  function setTripPoint(which, p) {
    trip[which] = p; trip.item = null;
    planTrip(); setTripFC();
  }
  function planTrip() {
    $("tripFromTxt").textContent = tripPointText(trip.from);
    $("tripToTxt").textContent = tripPointText(trip.to);
    trip.res = null;
    if (trip.from && trip.to && LEGS.length) {
      var O = toXY(trip.from), D = toXY(trip.to), d = planDirect(O, D, tripRadius);
      trip.res = { direct: d.ok, rev: d.rev, trans: (d.ok.length === 0 || trip.moreTransfers) ? planTransfer(O, D, tripRadius, 150) : null,
        near: haversine(trip.from.lon, trip.from.lat, trip.to.lon, trip.to.lat) };
    }
    renderTrip();
  }
  function cardFor(item) {
    var card = document.createElement("div"); card.className = "card";
    var top = document.createElement("div"); top.className = "top";
    item.segs.forEach(function (sg, i) {
      if (i) top.appendChild(document.createTextNode("→"));
      var sw = document.createElement("span"); sw.className = "sw"; sw.style.background = rutaColor(LEGS[sg.li].n);
      var nm = document.createElement("span"); nm.textContent = rutaLabel(LEGS[sg.li].n);
      top.appendChild(sw); top.appendChild(nm);
    });
    var tt = document.createElement("span"); tt.className = "t"; tt.textContent = item.kind === "direct" && item.reverse ? "" : "~" + fmtMin(item.t);
    top.appendChild(tt);
    var d = document.createElement("div"); d.className = "d";
    if (item.kind === "transfer") {
      d.textContent = "Caminas " + fmtDist(item.segs[0].o.dm) + " · " + fmtDist(item.ride) + " en micro · transbordo (" + fmtDist(item.xfer) + " a pie) · caminas " + fmtDist(item.segs[1].d.dm);
    } else if (item.reverse) {
      d.textContent = "Caminas " + fmtDist(item.segs[0].o.dm) + " al inicio y " + fmtDist(item.segs[0].d.dm) + " al final, pero esta línea va de B hacia A";
    } else {
      d.textContent = "Caminas " + fmtDist(item.segs[0].o.dm) + " → viajas " + fmtDist(item.ride) + " → caminas " + fmtDist(item.segs[0].d.dm) + " · sentido " + LEGS[item.segs[0].li].k;
    }
    card.appendChild(top); card.appendChild(d);
    card.addEventListener("click", function () {
      if (item.reverse) { var n = LEGS[item.segs[0].li].n; closePanel(); setRutaVisible(n, true); fitRuta(n); toast(rutaLabel(n) + " va de B hacia A"); return; }
      showTripItem(item);
    });
    return card;
  }
  function group(box, text) { var g = document.createElement("div"); g.className = "tgroup"; g.textContent = text; box.appendChild(g); }
  function note(box, text) { var n = document.createElement("div"); n.className = "note"; n.textContent = text; box.appendChild(n); }
  function renderTrip() {
    var box = $("tripResults"); box.innerHTML = "";
    if (!trip.from || !trip.to) { note(box, "Marca el origen (A) y el destino (B): toca “Marcar en el mapa” y luego toca el punto, o usa “Micro desde/hasta aquí” al tocar un lugar."); return; }
    if (!rutasReady || !LEGS.length) { note(box, "Cargando rutas…"); return; }
    var r = trip.res; if (!r) return;
    if (r.near < 250) note(box, "El origen y el destino están a solo " + fmtDist(r.near) + ": conviene ir caminando.");
    if (r.direct.length) {
      group(box, "Micros directos (" + r.direct.length + ")");
      r.direct.forEach(function (it) { box.appendChild(cardFor(it)); });
    } else {
      group(box, "Micros directos");
      note(box, "Ninguna línea pasa a menos de " + tripRadius + " m de ambos puntos yendo de A hacia B.");
    }
    if (r.trans && r.trans.length) {
      group(box, "Con un transbordo");
      r.trans.forEach(function (it) { box.appendChild(cardFor(it)); });
    } else if (r.trans && !r.trans.length) {
      note(box, "Tampoco encontré combinaciones con un transbordo. Prueba con un radio de caminata mayor.");
    } else if (r.direct.length) {
      var more = document.createElement("button"); more.className = "btn"; more.style.marginBottom = "8px"; more.textContent = "Ver también con transbordo";
      more.addEventListener("click", function () { trip.moreTransfers = true; planTrip(); trip.moreTransfers = false; });
      box.appendChild(more);
    }
    if (r.rev.length) {
      group(box, "Pasan cerca de ambos, pero en sentido contrario (" + r.rev.length + ")");
      r.rev.forEach(function (it) { it.reverse = true; box.appendChild(cardFor(it)); });
    }
    note(box, "Tiempos aproximados (a pie 5 km/h, micro 15 km/h, sin esperar). Solo incluye las 26 líneas de la app original; los micros pueden parar en cualquier punto de su recorrido.");
  }
  function showTripItem(item) {
    trip.item = item; setTripFC(); closePanel();
    var names = item.segs.map(function (sg) { return rutaLabel(LEGS[sg.li].n); }).join(" → ");
    $("tripBarTitle").textContent = names + (item.reverse ? "" : " · ~" + fmtMin(item.t));
    $("tripBarSub").textContent = item.reverse ? "Esta línea pasa cerca de ambos puntos pero va de B hacia A." :
      "Sube en “Subir”, baja en “Bajar”. Caminas " + fmtDist(item.walk) + " en total y viajas " + fmtDist(item.ride) + ".";
    $("tripBar").classList.add("open");
    fitTrip(230);
  }
  function openViaje() {
    closePanel(); $("sheet").classList.remove("open"); $("tripBar").classList.remove("open");
    state.pick = null; $("pickBanner").classList.remove("show"); hideResults();
    planTrip(); $("panelViaje").classList.add("open");
    if (trip.from && trip.to) fitTrip(380); else if (trip.from) map.easeTo({ center: [trip.from.lon, trip.from.lat] });
  }
  function startPick(which) {
    state.pick = which; $("panelViaje").classList.remove("open"); $("tripBar").classList.remove("open");
    $("pickText").textContent = "Busca un lugar o toca el mapa: " + (which === "from" ? "origen" : "destino");
    $("pickBanner").classList.add("show");
    q.focus();
  }
  $("btnViaje").addEventListener("click", function () { if ($("panelViaje").classList.contains("open")) closePanel(); else openViaje(); });
  $("viajeClose").addEventListener("click", closePanel);
  $("tripPickFrom").addEventListener("click", function () { startPick("from"); });
  $("tripPickTo").addEventListener("click", function () { startPick("to"); });
  $("pickCancel").addEventListener("click", function () { state.pick = null; $("pickBanner").classList.remove("show"); q.blur(); hideResults(); openViaje(); });
  $("tripGps").addEventListener("click", function () {
    if (!navigator.geolocation) { toast("Este dispositivo no tiene GPS disponible"); return; }
    toast("Buscando tu ubicación…");
    navigator.geolocation.getCurrentPosition(function (pos) {
      setTripPoint("from", { name: "Mi ubicación", lon: pos.coords.longitude, lat: pos.coords.latitude });
      if (trip.from && trip.to) fitTrip(380); else map.easeTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 15 });
    }, function () { toast("No se pudo obtener tu ubicación"); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 });
  });
  $("tripSwap").addEventListener("click", function () { var a = trip.from; trip.from = trip.to; trip.to = a; trip.item = null; planTrip(); setTripFC(); });
  $("tripClear").addEventListener("click", function () { trip.from = null; trip.to = null; trip.item = null; trip.res = null; planTrip(); setTripFC(); $("tripBar").classList.remove("open"); });
  Array.prototype.forEach.call($("tripRadius").querySelectorAll("button"), function (b) {
    b.addEventListener("click", function () {
      tripRadius = +b.getAttribute("data-r");
      Array.prototype.forEach.call($("tripRadius").querySelectorAll("button"), function (x) { x.classList.toggle("on", x === b); });
      trip.item = null; planTrip(); setTripFC();
    });
  });
  $("tripBarBack").addEventListener("click", function () { openViaje(); });
  $("tripBarOff").addEventListener("click", function () { trip.item = null; setTripFC(); $("tripBar").classList.remove("open"); });
  $("tripBarClose").addEventListener("click", function () { trip.item = null; setTripFC(); $("tripBar").classList.remove("open"); });
  // desde la hoja de un lugar
  $("btnDesde").addEventListener("click", function () { var s = state.sel; if (!s) return; setTripPoint("from", { name: s.name || "Punto en el mapa", lon: s.lon, lat: s.lat }); closeSheet(); openViaje(); });
  $("btnHasta").addEventListener("click", function () { var s = state.sel; if (!s) return; setTripPoint("to", { name: s.name || "Punto en el mapa", lon: s.lon, lat: s.lat }); closeSheet(); openViaje(); });
  window.__mapaTest = { // solo para pruebas
    plan: function (from, to, R, more) { tripRadius = R; trip.from = from; trip.to = to; trip.moreTransfers = !!more; planTrip(); trip.moreTransfers = false; return trip.res; },
    fc: function (item) { trip.item = item; return tripBuildFC(item); }, legs: function () { return LEGS; }
  };

  /* ---------- búsqueda (100% offline) ---------- */
  var INDEX = [];
  fetch(BASE + "data/search.json").then(function (r) { return r.json(); }).then(function (arr) {
    INDEX = arr.map(function (e) { return { n: e[0], t: e[1], lon: e[2], lat: e[3], w: e[4], k: norm(e[0]) }; });
  }).catch(function () { /* sin índice: la búsqueda queda vacía */ });

  var q = $("q"), results = $("results");
  function hideResults() { results.style.display = "none"; }
  function search(text) {
    var toks = norm(text).split(/\s+/).filter(Boolean);
    if (!toks.length) return null;
    var out = [], ALL = INDEX.concat(RINDEX);
    for (var i = 0; i < ALL.length; i++) {
      var e = ALL[i], ok = true;
      for (var j = 0; j < toks.length; j++) { if (e.k.indexOf(toks[j]) === -1) { ok = false; break; } }
      if (!ok) continue;
      var pos = e.k.indexOf(toks[0]);
      var rank = (pos === 0 ? 0 : e.k.indexOf(" " + toks[0]) > -1 ? 1 : 2) * 10 + e.w + e.k.length / 1000;
      out.push({ e: e, r: rank });
    }
    out.sort(function (a, b) { return a.r - b.r; });
    return out.slice(0, 8).map(function (x) { return x.e; });
  }
  function showResults(list) {
    results.innerHTML = "";
    if (list === null) { hideResults(); return; }
    if (!list.length) {
      var li = document.createElement("li"); li.className = "empty"; li.textContent = INDEX.length ? "Sin resultados" : "Cargando búsqueda…";
      results.appendChild(li);
    }
    list.forEach(function (e) {
      var li = document.createElement("li");
      var n = document.createElement("div"); n.className = "n"; n.textContent = e.n;
      var t = document.createElement("div"); t.className = "t"; t.textContent = e.t;
      li.appendChild(n); li.appendChild(t);
      li.addEventListener("click", function () { goTo(e); });
      results.appendChild(li);
    });
    results.style.display = "block";
  }
  function goTo(e) {
    q.blur(); hideResults();
    if (state.pick) {
      var which = state.pick; state.pick = null; $("pickBanner").classList.remove("show");
      q.value = ""; $("btnClear").style.display = "none";
      if (e.ruta) { toast("Elige un lugar, no una línea de micro"); startPick(which); return; }
      setTripPoint(which, { name: e.n, lon: e.lon, lat: e.lat });
      map.flyTo({ center: [e.lon, e.lat], zoom: Math.max(map.getZoom(), 14), essential: true });
      openViaje();
      return;
    }
    q.value = e.n; $("btnClear").style.display = "block";
    if (e.ruta) { closeSheet(); closePanel(); setRutaVisible(e.ruta, true); fitRuta(e.ruta); return; }
    map.flyTo({ center: [e.lon, e.lat], zoom: e.w === 1 ? 14 : 16.5, essential: true });
    setPin([e.lon, e.lat]);
    openSheet({ name: e.n, tipo: e.t, lon: e.lon, lat: e.lat });
  }
  q.addEventListener("input", function () {
    $("btnClear").style.display = q.value ? "block" : "none";
    showResults(search(q.value));
  });
  q.addEventListener("focus", function () { if (q.value) showResults(search(q.value)); });
  q.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") { var l = search(q.value); if (l && l.length) goTo(l[0]); }
  });
  $("btnClear").addEventListener("click", function () { q.value = ""; $("btnClear").style.display = "none"; hideResults(); q.focus(); });
  document.addEventListener("click", function (ev) { if (!$("topbar").contains(ev.target)) hideResults(); });

  /* ---------- offline: service worker ---------- */
  if ("serviceWorker" in navigator && location.protocol !== "file:" && !isApp) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }
})();
