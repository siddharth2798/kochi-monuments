const ERA_COLORS = {
  "pre-cochin": "#8d6e63",
  "kingdom-of-cochin": "#c62828",
  "portuguese": "#1565c0",
  "dutch": "#ef6c00",
  "mysorean": "#6a1b9a",
  "princely-state": "#2e7d32",
  "jewish-heritage": "#00838f",
  "post-independence": "#455a64",
};

const state = {
  monuments: [],
  markers: [],
  activeEras: new Set(),
  searchQuery: "",
  map: null,
  territories: null,
  activeTerritoryEra: null,
  mode: "timeline", // "timeline" (guided, dims non-relevant monuments) or "browse" (free multi-select)
};

const MAP_STYLES = {
  light: "https://tiles.openfreemap.org/styles/liberty",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

// Territory polygons in territories.json are hand-drawn illustrative approximations, not
// surveyed boundaries — medieval Kerala polities didn't have any. `confidence` (1 = no fixed
// borders at all, 2 = a real but loosely-documented sphere of influence, 3 = an administratively
// defined area, e.g. an 1866+ municipality) drives solid-vs-dashed line styling below.
const TERRITORY_ERAS = [
  {
    id: "chera-unified",
    label: "Before 1102",
    caption: "Kodungallur (Mahodayapuram) governs the whole region as the Chera dynasty's capital — no separate Cochin polity exists yet.",
  },
  {
    id: "fragmentation",
    label: "1102–1341",
    caption: "The Chera line fragments into swaroopams. Edappally Swaroopam holds Kochi and Vypin; the Perumpadappu Swaroopam, based far north near Ponnani, is repeatedly pushed south by the Zamorin of Calicut.",
  },
  {
    id: "cochin-formed",
    label: "1341–1632",
    caption: "Edappally cedes Kochi and Vypin to the Perumpadappu family through marriage alliances — they become the Cochin Rajas, just as a 1341 flood silts up Kodungallur's harbor and opens a new one at Kochi.",
  },
  {
    id: "paliam-era",
    label: "1632–1809",
    caption: "The Paliath Achans serve as hereditary Prime Ministers of Cochin from Chendamangalam — holding so much land that a saying held “half of Cochin belongs to the Paliam family.”",
  },
  {
    id: "colonial-dual",
    label: "1503–1947",
    caption: "Fort Kochi becomes a directly-ruled colonial enclave — Portuguese, then Dutch, then a British municipality from 1866 — while Mattancherry, Ernakulam, and Tripunithura remain the semi-autonomous princely State of Cochin.",
  },
  {
    id: "unification-1967",
    label: "1967",
    caption: "Kochi Corporation forms on 1 November 1967, merging the Fort Cochin, Mattancherry, and Ernakulam municipalities with Willingdon Island and four panchayats — Palluruthy, Vennala, Vyttila, and Edappally. Fort Kochi's own council opposed the merger; the state legislature overrode it.",
  },
];

const TERRITORY_ENTITY_COLORS = {
  "chera-kingdom": "#8d6e63",
  "edappally-swaroopam": "#0288d1",
  "kodungallur-remnant": "#8d6e63",
  "kingdom-of-cochin": "#c62828",
  "paliam-fief": "#6a1b9a",
  "fort-kochi-enclave": "#1565c0",
  "princely-state-cochin": "#2e7d32",
  "fort-cochin-muni": "#1565c0",
  "mattancherry-muni": "#c62828",
  "ernakulam-muni": "#00838f",
  "willingdon-island": "#2e7d32",
  "palluruthy-panch": "#ef6c00",
  "vennala-panch": "#6a1b9a",
  "vyttila-panch": "#455a64",
  "edappally-panch": "#0288d1",
};

// Which of the 8 monument-era tags are relevant to each of the 6 territory eras. The two
// taxonomies were never designed to align 1:1 (e.g. "Kingdom of Cochin" as a monument era spans
// both the "cochin-formed" and "paliam-era" territory steps) — this mapping drives dimming
// (visual emphasis), not hard filtering, precisely because it's an approximate correspondence.
const TERRITORY_TO_MONUMENT_ERAS = {
  "chera-unified": ["pre-cochin"],
  "fragmentation": ["pre-cochin"],
  "cochin-formed": ["kingdom-of-cochin"],
  "paliam-era": ["kingdom-of-cochin"],
  "colonial-dual": ["portuguese", "dutch", "princely-state", "jewish-heritage", "mysorean"],
  "unification-1967": ["post-independence"],
};

// Below this zoom, marker name labels are hidden (dots only) to avoid label collisions
// when several monuments sit close together (e.g. the Kodungallur cluster).
const LABEL_MIN_ZOOM = 12;

// The initial map view frames just the dense Fort Kochi / Mattancherry / Willingdon Island /
// Ernakulam / Tripunithura cluster rather than the full extent — Kodungallur/Muziris (~30km
// north) and the northern Vypin sites are still reachable by panning/zooming out, up to maxBounds.
const CORE_CLUSTER_IDS = new Set([
  "st-francis-church", "chinese-fishing-nets", "fort-immanuel", "bishops-house-indo-portuguese-museum",
  "santa-cruz-basilica", "dutch-cemetery-fort-kochi", "david-hall",
  "mattancherry-palace", "paradesi-synagogue", "kadavumbagam-synagogue",
  "willingdon-island-cochin-port", "durbar-hall-ernakulam",
  "hill-palace-tripunithura", "sree-poornathrayeesa-temple", "tripunithura-hill-palace-predecessor",
]);

const THEME_STORAGE_KEY = "kochi-monuments-theme";
const FILTER_STORAGE_KEY = "kochi-monuments-filters";

function getStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch (e) {
    return null; // localStorage unavailable (private browsing, etc.)
  }
}

function getPreferredTheme() {
  // Default to light regardless of system preference; dark mode is opt-in via the toggle.
  return getStoredTheme() || "light";
}

function applyThemeDom(theme) {
  document.documentElement.dataset.theme = theme;
  const toggle = document.getElementById("theme-toggle");
  if (toggle) toggle.textContent = theme === "dark" ? "☀️" : "🌙";
}

function setTheme(theme) {
  applyThemeDom(theme);
  if (state.map) state.map.setStyle(MAP_STYLES[theme]);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (e) {
    // ignore if storage is unavailable
  }
}

function getStoredEras(validEras) {
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const valid = parsed.filter((era) => validEras.includes(era));
    return valid.length ? valid : null;
  } catch (e) {
    return null;
  }
}

function storeActiveEras() {
  try {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify([...state.activeEras]));
  } catch (e) {
    // ignore if storage is unavailable
  }
}

function createMonumentMarkerElement(monument, color) {
  const el = document.createElement("div");
  el.className = "monument-marker";
  el.tabIndex = 0;
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", `${monument.name} — view details`);

  el.innerHTML = `
    <svg class="monument-pin-svg" width="34" height="44" viewBox="0 0 24 30" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 0C6.48 0 2 4.48 2 10c0 7.5 10 20 10 20s10-12.5 10-20C22 4.48 17.52 0 12 0z" fill="${color}" stroke="#fff" stroke-width="1.5"></path>
      <circle cx="12" cy="10" r="4.2" fill="#fff"></circle>
    </svg>
    <span class="monument-label">${monument.name}</span>
  `;

  const activate = () => openDetail(monument);
  el.addEventListener("click", activate);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate();
    }
  });
  return el;
}

function computeBounds(monuments, padding = 0) {
  const lats = monuments.map((m) => m.lat);
  const lngs = monuments.map((m) => m.lng);
  return [
    [Math.min(...lngs) - padding, Math.min(...lats) - padding],
    [Math.max(...lngs) + padding, Math.max(...lats) + padding],
  ];
}

function flyToMonument(monument) {
  if (!state.map) return;
  state.map.flyTo({
    center: [monument.lng, monument.lat],
    zoom: Math.max(state.map.getZoom(), 15),
    duration: 800,
  });
}

function updateMarkerLabelVisibility() {
  if (!state.map) return;
  const show = state.map.getZoom() >= LABEL_MIN_ZOOM;
  state.markers.forEach(({ marker }) => {
    marker.getElement().classList.toggle("show-label", show);
  });
}

function territoryColorExpression() {
  const expr = ["match", ["get", "entity_id"]];
  Object.entries(TERRITORY_ENTITY_COLORS).forEach(([id, color]) => {
    expr.push(id, color);
  });
  expr.push("#999999"); // fallback for any untagged entity
  return expr;
}

// Adds the territories source + fill/line layers if not already present on the current style.
// Must be called on every "style.load" (not just the first) — setStyle() (used by the dark-mode
// toggle) wipes all custom sources/layers, so a theme switch would otherwise silently drop them.
function ensureTerritoryLayers(map) {
  if (!state.territories || map.getSource("territories")) return;

  map.addSource("territories", { type: "geojson", data: state.territories });

  // Insert below the base style's own labels/roads (the first symbol layer) so town/road
  // names stay legible on top of the territory tint, instead of the tint drawing over them.
  const firstSymbolLayer = map.getStyle().layers.find((l) => l.type === "symbol");
  const beforeId = firstSymbolLayer ? firstSymbolLayer.id : undefined;

  const eraFilter = ["==", ["get", "era"], state.activeTerritoryEra];
  const colorExpr = territoryColorExpression();

  map.addLayer({
    id: "territories-fill",
    type: "fill",
    source: "territories",
    filter: eraFilter,
    paint: { "fill-color": colorExpr, "fill-opacity": 0.4 },
  }, beforeId);

  // Two line layers instead of one, rather than a data-driven line-dasharray (unreliable
  // support for expressions on that property) — confidence 1-2 (no real surveyed border) get
  // a dashed outline, confidence 3 (an administratively defined area) gets a solid one.
  map.addLayer({
    id: "territories-line-approx",
    type: "line",
    source: "territories",
    filter: ["all", eraFilter, ["<", ["get", "confidence"], 3]],
    paint: { "line-color": colorExpr, "line-width": 2.5, "line-dasharray": [3, 2] },
  }, beforeId);

  map.addLayer({
    id: "territories-line-solid",
    type: "line",
    source: "territories",
    filter: ["all", eraFilter, ["==", ["get", "confidence"], 3]],
    paint: { "line-color": colorExpr, "line-width": 2.5 },
  }, beforeId);

  // Our territory polygons are hand-drawn approximations with no awareness of the real
  // coastline, so their edges routinely cut across open water. Rather than trying to clip
  // them ourselves, redraw the basemap's own (accurate) water layer again on top of our tint —
  // cloning its exact source/source-layer/filter/color from the current style — which visually
  // "erases" the tint back to water wherever it doesn't actually correspond to land.
  const baseWaterLayer = map.getStyle().layers.find((l) => l.id === "water" && l.type === "fill");
  if (baseWaterLayer) {
    map.addLayer({
      id: "territories-water-mask",
      type: "fill",
      source: baseWaterLayer.source,
      "source-layer": baseWaterLayer["source-layer"],
      filter: baseWaterLayer.filter,
      paint: { "fill-color": baseWaterLayer.paint["fill-color"] },
    }, beforeId);
  }

  // Name each territory on the map itself (in its period-appropriate name, e.g. "Cochin
  // (English)" for the colonial Fort Kochi enclave) rather than only in the caption text below.
  map.addLayer({
    id: "territories-label",
    type: "symbol",
    source: "territories",
    filter: eraFilter,
    layout: {
      "text-field": ["get", "entity"],
      "text-font": ["Noto Sans Bold"],
      "text-size": 13,
      "text-max-width": 8,
    },
    paint: {
      "text-color": colorExpr,
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.5,
    },
  }, beforeId);
}

const TERRITORY_LAYER_IDS = ["territories-fill", "territories-line-approx", "territories-line-solid", "territories-water-mask", "territories-label"];

function setTerritoryLayersVisible(map, visible) {
  const visibility = visible ? "visible" : "none";
  TERRITORY_LAYER_IDS.forEach((id) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility);
  });
}

function setTerritoryEra(eraId) {
  state.activeTerritoryEra = eraId;

  const map = state.map;
  // Self-heal: "style.load" doesn't always fire reliably after a runtime setStyle() call (the
  // dark-mode toggle) — if the territory layers went missing because of that, recreate them
  // right here rather than leaving the overlay silently blank until something else happens to
  // trigger ensureTerritoryLayers again.
  if (map && map.isStyleLoaded() && !map.getSource("territories")) ensureTerritoryLayers(map);
  if (map && map.getSource("territories")) {
    const eraFilter = ["==", ["get", "era"], eraId];
    map.setFilter("territories-fill", eraFilter);
    map.setFilter("territories-line-approx", ["all", eraFilter, ["<", ["get", "confidence"], 3]]);
    map.setFilter("territories-line-solid", ["all", eraFilter, ["==", ["get", "confidence"], 3]]);
    map.setFilter("territories-label", eraFilter);
  }

  document.querySelectorAll(".timeline-chip").forEach((chip) => {
    chip.setAttribute("aria-selected", String(chip.dataset.eraId === eraId));
  });
  const caption = document.getElementById("timeline-caption");
  const era = TERRITORY_ERAS.find((e) => e.id === eraId);
  if (caption && era) caption.textContent = era.caption;

  if (state.mode === "timeline") applyFilter();
}

function buildTimelineChips() {
  const container = document.getElementById("timeline-chips");
  container.innerHTML = "";
  TERRITORY_ERAS.forEach((era) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "timeline-chip";
    chip.textContent = era.label;
    chip.dataset.eraId = era.id;
    chip.setAttribute("role", "tab");
    chip.setAttribute("aria-selected", String(era.id === state.activeTerritoryEra));
    chip.addEventListener("click", () => setTerritoryEra(era.id));
    container.appendChild(chip);
  });
}

function buildFilterList(eras) {
  const list = document.getElementById("filter-list");
  list.innerHTML = "";
  eras.forEach(({ era, eraLabel }) => {
    const li = document.createElement("li");
    const id = `filter-${era}`;
    li.innerHTML = `
      <input type="checkbox" id="${id}" checked data-era="${era}">
      <span class="era-swatch" style="background:${ERA_COLORS[era] || "#999"}"></span>
      <label for="${id}">${eraLabel}</label>
    `;
    list.appendChild(li);
  });
  list.addEventListener("change", (e) => {
    if (e.target.matches("input[type=checkbox]")) {
      const era = e.target.dataset.era;
      if (e.target.checked) {
        state.activeEras.add(era);
      } else {
        state.activeEras.delete(era);
      }
      storeActiveEras();
      applyFilter();
    }
  });
}

function applyFilter() {
  const query = state.searchQuery.trim().toLowerCase();
  let anyVisible = false;

  if (state.mode === "browse") {
    // Free multi-select: era checkboxes + search both hard-filter (hide non-matching).
    state.markers.forEach(({ marker, monument }) => {
      const visible = state.activeEras.has(monument.era) && (!query || monument.name.toLowerCase().includes(query));
      const el = marker.getElement();
      el.style.display = visible ? "" : "none";
      el.classList.remove("dimmed");
    });
    document.querySelectorAll(".monument-card").forEach((card) => {
      const visible = state.activeEras.has(card.dataset.era) && (!query || card.dataset.name.includes(query));
      card.style.display = visible ? "" : "none";
      card.classList.remove("dimmed");
      if (visible) anyVisible = true;
    });
  } else {
    // Timeline: search still hides non-matches, but era-relevance only dims (never hides) —
    // the territory/monument era taxonomies are an approximate correspondence, not a strict
    // filter, so a monument outside the "relevant" set stays reachable, just visually secondary.
    const relevant = new Set(TERRITORY_TO_MONUMENT_ERAS[state.activeTerritoryEra] || []);
    state.markers.forEach(({ marker, monument }) => {
      const matchesSearch = !query || monument.name.toLowerCase().includes(query);
      const el = marker.getElement();
      el.style.display = matchesSearch ? "" : "none";
      el.classList.toggle("dimmed", matchesSearch && !relevant.has(monument.era));
    });
    document.querySelectorAll(".monument-card").forEach((card) => {
      const matchesSearch = !query || card.dataset.name.includes(query);
      card.style.display = matchesSearch ? "" : "none";
      card.classList.toggle("dimmed", matchesSearch && !relevant.has(card.dataset.era));
      if (matchesSearch) anyVisible = true;
    });
  }

  const emptyState = document.getElementById("empty-state");
  if (emptyState) emptyState.hidden = anyVisible;
}

function setMode(mode) {
  state.mode = mode;
  document.getElementById("mode-timeline-btn").setAttribute("aria-selected", String(mode === "timeline"));
  document.getElementById("mode-browse-btn").setAttribute("aria-selected", String(mode === "browse"));
  document.querySelector(".timeline-bar").dataset.mode = mode;
  document.getElementById("browse-controls").hidden = mode !== "browse";

  if (state.map) setTerritoryLayersVisible(state.map, mode === "timeline");

  applyFilter();
}

function setAllCheckboxes(checked) {
  document.querySelectorAll("#filter-list input[type=checkbox]").forEach((cb) => {
    cb.checked = checked;
    const era = cb.dataset.era;
    if (checked) {
      state.activeEras.add(era);
    } else {
      state.activeEras.delete(era);
    }
  });
  storeActiveEras();
  applyFilter();
}

const OSM_NAVIGATOR_BASE = "https://osm-navigator.siddharthshiv2798.workers.dev/";

// osm-navigator resolves a pasted/shared Google Maps link into a destination search-field pick
// (see its lib/google-maps-url.js: parseGoogleMapsUrl looks for an "@lat,lon," pattern in the URL).
// Building a URL in that exact shape lets it resolve the coordinates entirely client-side, with no
// server round-trip, then hands off to osm-navigator's own "Get directions" / current-location flow.
function buildDirectionsUrl(monument) {
  const gmapsUrl = `https://www.google.com/maps/place/${encodeURIComponent(monument.name)}/@${monument.lat},${monument.lng},17z`;
  return `${OSM_NAVIGATOR_BASE}?url=${encodeURIComponent(gmapsUrl)}`;
}

function setMonumentUrlParam(id) {
  const url = new URL(location.href);
  if (id) {
    url.searchParams.set("monument", id);
  } else {
    url.searchParams.delete("monument");
  }
  history.replaceState(null, "", url);
}

function openDetail(monument, { updateUrl = true } = {}) {
  const overlay = document.getElementById("detail-overlay");
  const content = document.getElementById("detail-content");
  const image = monument.images && monument.images.length
    ? `<img src="${monument.images[0]}" alt="${monument.name}">`
    : "";
  content.innerHTML = `
    <h2>${monument.name}</h2>
    <div class="era-tag">${monument.eraLabel}</div>
    <div class="address">${monument.address}</div>
    ${image}
    <p>${monument.description}</p>
    <div class="detail-actions">
      <a class="directions-link" href="${buildDirectionsUrl(monument)}" target="_blank" rel="noopener">Get directions</a>
      <button type="button" class="secondary-btn" id="copy-citation-btn">Copy citation</button>
      <button type="button" class="secondary-btn" id="copy-link-btn">Copy link</button>
    </div>
  `;
  overlay.hidden = false;

  const citationMatch = monument.description.match(/Citations:[\s\S]*$/);
  const citeBtn = document.getElementById("copy-citation-btn");
  if (citeBtn) {
    citeBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(citationMatch ? citationMatch[0] : monument.description);
        citeBtn.textContent = "Copied!";
        setTimeout(() => { citeBtn.textContent = "Copy citation"; }, 1500);
      } catch (e) {
        citeBtn.textContent = "Could not copy";
      }
    });
  }

  const linkBtn = document.getElementById("copy-link-btn");
  if (linkBtn) {
    linkBtn.addEventListener("click", async () => {
      const url = new URL(location.href);
      url.searchParams.set("monument", monument.id);
      try {
        await navigator.clipboard.writeText(url.toString());
        linkBtn.textContent = "Copied!";
        setTimeout(() => { linkBtn.textContent = "Copy link"; }, 1500);
      } catch (e) {
        linkBtn.textContent = "Could not copy";
      }
    });
  }

  if (updateUrl) setMonumentUrlParam(monument.id);
}

function closeDetail() {
  document.getElementById("detail-overlay").hidden = true;
  setMonumentUrlParam(null);
}

function buildMonumentList(monuments) {
  const list = document.getElementById("monument-list");
  list.innerHTML = "";
  monuments.forEach((m) => {
    const li = document.createElement("li");
    li.className = "monument-card";
    li.dataset.era = m.era;
    li.dataset.name = m.name.toLowerCase();
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.innerHTML = `<h3>${m.name}</h3><div class="era-tag">${m.eraLabel}</div>`;
    const activate = () => {
      flyToMonument(m);
      openDetail(m);
    };
    li.addEventListener("click", activate);
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate();
      }
    });
    list.appendChild(li);
  });
}

function injectStructuredData(monuments) {
  const data = monuments.map((m) => ({
    "@context": "https://schema.org",
    "@type": "LandmarksOrHistoricalBuildings",
    name: m.name,
    description: m.description,
    address: m.address,
    geo: { "@type": "GeoCoordinates", latitude: m.lat, longitude: m.lng },
  }));
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}

function hideLoadingOverlay() {
  const overlay = document.getElementById("loading-overlay");
  if (overlay) overlay.hidden = true;
}

async function init() {
  const [monumentsRes, territoriesRes] = await Promise.all([
    fetch("monuments.json"),
    fetch("territories.json"),
  ]);
  const data = await monumentsRes.json();
  state.monuments = data.monuments;
  state.territories = await territoriesRes.json();

  const eraOrder = [...new Set(state.monuments.map((m) => m.era))].map((era) => {
    const match = state.monuments.find((m) => m.era === era);
    return { era, eraLabel: match.eraLabel };
  });
  const allEraKeys = eraOrder.map((e) => e.era);
  const storedEras = getStoredEras(allEraKeys);
  (storedEras || allEraKeys).forEach((era) => state.activeEras.add(era));

  buildFilterList(eraOrder);
  document.querySelectorAll("#filter-list input[type=checkbox]").forEach((cb) => {
    cb.checked = state.activeEras.has(cb.dataset.era);
  });
  buildMonumentList(state.monuments);
  injectStructuredData(state.monuments);

  state.activeTerritoryEra = TERRITORY_ERAS[0].id;
  buildTimelineChips();
  setTerritoryEra(state.activeTerritoryEra);

  const initialTheme = getPreferredTheme();
  applyThemeDom(initialTheme);

  const coreMonuments = state.monuments.filter((m) => CORE_CLUSTER_IDS.has(m.id));

  const map = new maplibregl.Map({
    container: "map",
    style: MAP_STYLES[initialTheme],
    bounds: computeBounds(coreMonuments.length ? coreMonuments : state.monuments, 0.02),
    fitBoundsOptions: { padding: 40 },
    maxBounds: computeBounds(state.monuments, 0.12),
  });
  state.map = map;

  // "style.load" fires for the initial style AND every subsequent setStyle() (the dark-mode
  // toggle), which wipes custom sources/layers — re-adding them here every time keeps the
  // territory overlay working across a theme switch, not just on first load. It doesn't always
  // fire reliably after a runtime setStyle() call, though, so also retry on "styledata" (fires
  // much more often) guarded by isStyleLoaded() — ensureTerritoryLayers is idempotent either way.
  const restoreTerritoryLayers = () => {
    if (!map.isStyleLoaded() || map.getSource("territories")) return;
    ensureTerritoryLayers(map);
    // A theme switch re-adds these layers at their default (visible) layout state — re-sync to
    // whatever mode is actually active, in case it happened to be "browse" (territories hidden).
    setTerritoryLayersVisible(map, state.mode === "timeline");
  };
  map.on("style.load", restoreTerritoryLayers);
  map.on("styledata", restoreTerritoryLayers);

  // Markers are plain DOM overlays independent of the style/tiles, so they don't need to wait
  // for map "load" — added immediately, they also survive the setStyle() calls used to switch
  // between light/dark tiles. Waiting on "load" here previously meant a backgrounded or
  // throttled tab (e.g. a link opened in a new background tab) could leave the loading
  // overlay — and the markers/list — stuck indefinitely even once the tab was brought forward.
  state.monuments.forEach((m) => {
    const el = createMonumentMarkerElement(m, ERA_COLORS[m.era] || "#999");
    const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
      .setLngLat([m.lng, m.lat])
      .addTo(map);
    state.markers.push({ marker, monument: m });
  });
  applyFilter();
  updateMarkerLabelVisibility();
  map.on("zoom", updateMarkerLabelVisibility);

  // Re-assert every marker's position once the camera settles. MapLibre repositions markers
  // reactively off its own render loop, which can fall behind (or apply a stale intermediate
  // position) during the initial fitBounds animation or on a throttled/backgrounded tab —
  // visible as pins sitting in the wrong place after a zoom/pan. setLngLat forces an immediate,
  // authoritative recompute rather than waiting on that loop to catch up.
  map.on("moveend", () => {
    state.markers.forEach(({ marker, monument }) => marker.setLngLat([monument.lng, monument.lat]));
  });

  const deepLinkedId = new URLSearchParams(location.search).get("monument");
  const deepLinked = deepLinkedId && state.monuments.find((m) => m.id === deepLinkedId);
  if (deepLinked) {
    flyToMonument(deepLinked);
    openDetail(deepLinked, { updateUrl: false });
  }

  // Hide the spinner once the map reports itself ready, but never wait forever — a
  // backgrounded/throttled tab can delay "load" well past what's reasonable to show a spinner for.
  map.once("load", hideLoadingOverlay);
  setTimeout(hideLoadingOverlay, 6000);

  document.getElementById("select-all").addEventListener("click", () => setAllCheckboxes(true));
  document.getElementById("deselect-all").addEventListener("click", () => setAllCheckboxes(false));
  document.getElementById("detail-close").addEventListener("click", closeDetail);
  document.getElementById("detail-overlay").addEventListener("click", (e) => {
    if (e.target.id === "detail-overlay") closeDetail();
  });
  document.getElementById("theme-toggle").addEventListener("click", () => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });
  document.getElementById("monument-search").addEventListener("input", (e) => {
    state.searchQuery = e.target.value;
    applyFilter();
  });
  document.getElementById("mode-timeline-btn").addEventListener("click", () => setMode("timeline"));
  document.getElementById("mode-browse-btn").addEventListener("click", () => setMode("browse"));
}

init();
