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
  map: null,
};

const MAP_STYLES = {
  light: "https://tiles.openfreemap.org/styles/liberty",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

const THEME_STORAGE_KEY = "kochi-monuments-theme";

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

function createMonumentMarkerElement(monument, color) {
  const el = document.createElement("div");
  el.className = "monument-marker";

  const dot = document.createElement("span");
  dot.className = "monument-dot";
  dot.style.background = color;

  const label = document.createElement("span");
  label.className = "monument-label";
  label.textContent = monument.name;

  el.appendChild(dot);
  el.appendChild(label);
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
      applyFilter();
    }
  });
}

function applyFilter() {
  state.markers.forEach(({ marker, monument }) => {
    const visible = state.activeEras.has(monument.era);
    marker.getElement().style.display = visible ? "" : "none";
  });
  document.querySelectorAll(".monument-card").forEach((card) => {
    const era = card.dataset.era;
    card.style.display = state.activeEras.has(era) ? "" : "none";
  });
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
  applyFilter();
}

function openDetail(monument) {
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
    <a class="directions-link" href="${monument.mapsUrl}" target="_blank" rel="noopener">Get directions</a>
  `;
  overlay.hidden = false;
}

function closeDetail() {
  document.getElementById("detail-overlay").hidden = true;
}

function buildMonumentList(monuments) {
  const list = document.getElementById("monument-list");
  list.innerHTML = "";
  monuments.forEach((m) => {
    const li = document.createElement("li");
    li.className = "monument-card";
    li.dataset.era = m.era;
    li.innerHTML = `<h3>${m.name}</h3><div class="era-tag">${m.eraLabel}</div>`;
    li.addEventListener("click", () => openDetail(m));
    list.appendChild(li);
  });
}

async function init() {
  const res = await fetch("monuments.json");
  const data = await res.json();
  state.monuments = data.monuments;

  const eraOrder = [...new Set(state.monuments.map((m) => m.era))].map((era) => {
    const match = state.monuments.find((m) => m.era === era);
    return { era, eraLabel: match.eraLabel };
  });
  eraOrder.forEach(({ era }) => state.activeEras.add(era));

  buildFilterList(eraOrder);
  buildMonumentList(state.monuments);

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

  map.on("load", () => {
    // Marker elements are plain DOM overlays, independent of the style, so they
    // survive the setStyle() calls used to switch between light/dark tiles.
    state.monuments.forEach((m) => {
      const el = createMonumentMarkerElement(m, ERA_COLORS[m.era] || "#999");
      el.addEventListener("click", () => openDetail(m));
      const marker = new maplibregl.Marker({ element: el, anchor: "left" })
        .setLngLat([m.lng, m.lat])
        .addTo(map);
      state.markers.push({ marker, monument: m });
    });
    applyFilter();
  });

  document.getElementById("select-all").addEventListener("click", () => setAllCheckboxes(true));
  document.getElementById("deselect-all").addEventListener("click", () => setAllCheckboxes(false));
  document.getElementById("detail-close").addEventListener("click", closeDetail);
  document.getElementById("detail-overlay").addEventListener("click", (e) => {
    if (e.target.id === "detail-overlay") closeDetail();
  });
  document.getElementById("theme-toggle").addEventListener("click", () => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
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
