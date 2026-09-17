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
};

const MAP_STYLES = {
  light: "https://tiles.openfreemap.org/styles/liberty",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

// Below this zoom, marker name labels are hidden (dots only) to avoid label collisions
// when several monuments sit close together (e.g. the Kodungallur cluster).
const LABEL_MIN_ZOOM = 12;

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
  return getStoredTheme() || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
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

  const dot = document.createElement("span");
  dot.className = "monument-dot";
  dot.style.background = color;

  const label = document.createElement("span");
  label.className = "monument-label";
  label.textContent = monument.name;

  el.appendChild(dot);
  el.appendChild(label);

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

  state.markers.forEach(({ marker, monument }) => {
    const visible = state.activeEras.has(monument.era) && (!query || monument.name.toLowerCase().includes(query));
    marker.getElement().style.display = visible ? "" : "none";
  });

  document.querySelectorAll(".monument-card").forEach((card) => {
    const visible = state.activeEras.has(card.dataset.era) && (!query || card.dataset.name.includes(query));
    card.style.display = visible ? "" : "none";
    if (visible) anyVisible = true;
  });

  const emptyState = document.getElementById("empty-state");
  if (emptyState) emptyState.hidden = anyVisible;
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
  const res = await fetch("monuments.json");
  const data = await res.json();
  state.monuments = data.monuments;

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

  const initialTheme = getPreferredTheme();
  applyThemeDom(initialTheme);

  const map = new maplibregl.Map({
    container: "map",
    style: MAP_STYLES[initialTheme],
    bounds: computeBounds(state.monuments, 0.03),
    fitBoundsOptions: { padding: 40 },
    maxBounds: computeBounds(state.monuments, 0.12),
  });
  state.map = map;

  // Markers are plain DOM overlays independent of the style/tiles, so they don't need to wait
  // for map "load" — added immediately, they also survive the setStyle() calls used to switch
  // between light/dark tiles. Waiting on "load" here previously meant a backgrounded or
  // throttled tab (e.g. a link opened in a new background tab) could leave the loading
  // overlay — and the markers/list — stuck indefinitely even once the tab was brought forward.
  state.monuments.forEach((m) => {
    const el = createMonumentMarkerElement(m, ERA_COLORS[m.era] || "#999");
    const marker = new maplibregl.Marker({ element: el, anchor: "left" })
      .setLngLat([m.lng, m.lat])
      .addTo(map);
    state.markers.push({ marker, monument: m });
  });
  applyFilter();
  updateMarkerLabelVisibility();
  map.on("zoom", updateMarkerLabelVisibility);

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

  if (!getStoredTheme()) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
      const theme = e.matches ? "dark" : "light";
      applyThemeDom(theme);
      map.setStyle(MAP_STYLES[theme]);
    });
  }
}

init();
