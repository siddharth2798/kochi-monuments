# The Many Cities of Kochi

An interactive map of monuments and historic sites across Greater Kochi — from the ancient Chera-era port of Muziris to the Kingdom of Cochin, Portuguese, Dutch and British Cochin, and Kochi's integration into Kerala — each site tagged to the era that shaped it, with citations to published historical sources.

Inspired by [The Many Cities of Delhi](https://kaustubh-misra.github.io/delhi-monuments/) by Kaustubh Misra (GPLv3), which mapped Delhi's monuments through its succession of ruling kingdoms.

## Coverage

Fort Kochi, Mattancherry/Jew Town, Willingdon Island, Tripunithura, Vypin, and the Kodungallur/Muziris region (~30km north, Thrissur District), spanning eight historical layers:

- Chera / Muziris-adjacent Era (pre-1341)
- Kingdom of Cochin (Perumpadappu Swaroopam)
- Portuguese Cochin (1503–1663)
- Dutch Cochin (1663–1795)
- Mysorean Invasion / Tipu Sultan Era (1776–1792)
- British Paramountcy / Princely State of Cochin (1795–1947)
- Jewish Heritage (Paradesi & Malabar Jews)
- Integration into Kerala (1947–1956 onward)

The map is locked to this region (`maxBounds` in `app.js`) — panning and zooming out are clamped so the tiles shown never wander outside Greater Kochi and Kodungallur. A dark-mode toggle (top right) follows the system theme by default and switches the map between OpenFreeMap's `liberty` (light) and `dark` styles; the choice persists in `localStorage`.

"Get directions" opens [osm-navigator](https://osm-navigator.siddharthshiv2798.workers.dev/), a companion turn-by-turn routing app, with the monument pre-filled as the destination. It works by building a Google-Maps-shaped URL (`.../maps/place/<name>/@<lat>,<lng>,17z`) and passing it via `?url=`, the same mechanism osm-navigator uses to resolve a pasted or shared Google Maps link — it parses the coordinates client-side and sets them as the destination search pick. The starting point isn't set by this site; osm-navigator handles that itself (its own current-location prompt or manual entry).

Other UX details: a search box filters the monument list by name; marker name labels are hidden below zoom 12 to avoid overlapping near dense clusters (e.g. Kodungallur); clicking a list card flies the map to that marker; era filters persist in `localStorage` across reloads; every monument has a shareable `?monument=<id>` URL that reopens its detail card on load; the detail card has "Copy citation" and "Copy link" buttons; list cards and markers are keyboard-operable (Tab + Enter/Space).

## How Kochi Grew (territorial history timeline)

A second, complementary way to browse the site: a timeline bar with six era steps tracing how the region's political geography changed — Chera-era unified administration, fragmentation into swaroopams (Edappally holding Kochi/Vypin), the Kingdom of Cochin's formation, the Paliam family's fief at Chendamangalam, Fort Kochi's colonial-enclave/princely-state split, and the 1967 municipal merger that formed the modern Kochi Corporation. See `territories.json` for the underlying polygons and `README.md`'s citations for the historical sourcing behind each step (also documented inline as `TERRITORY_ERAS` captions in `app.js`).

These are **hand-drawn illustrative approximations, not surveyed boundaries** — medieval Kerala polities didn't have any. Low-confidence eras render with a dashed outline; the 1967 merger (a real administrative record) renders solid. A **Timeline / Browse all eras** toggle switches between two modes:
- **Timeline** (default): shows the selected era's territory overlay, and dims (not hides) monuments whose era tag isn't relevant to that period — relevance is a many-to-many mapping (`TERRITORY_TO_MONUMENT_ERAS`) since the two era taxonomies were never designed to align 1:1.
- **Browse all eras**: today's original free multi-select checkbox browsing, territory overlay hidden, no dimming.

Since the polygons are hand-drawn without any awareness of the real coastline, an early version's edges routinely cut across open water. Fixed by redrawing the basemap's own accurate `water` layer (cloned live from the current MapLibre style, so it matches both the light and dark themes automatically) on top of the territory tint — any part of a polygon that doesn't actually correspond to land gets visually erased back to water. Willingdon Island and Vypin also now use their real OSM geometry (fetched via Overpass, simplified, baked into `territories.json`) instead of a generated shape, for the two entities where a real one exists — most other named places here (Fort Kochi, Mattancherry, Ernakulam, Edappally, Palluruthy, Vyttila) only exist as single point nodes in OSM, not boundary polygons, so the rest stay hand-drawn approximations.

## Running locally

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`. (Opening `index.html` directly via `file://` will not work — the browser blocks `fetch()` of `monuments.json` under the `file://` scheme.)

## Validating the data

```
python3 scripts/validate_monuments.py
```

Checks schema completeness, coordinate sanity for the Greater Kochi/Kodungallur bounding box, duplicate IDs, presence of a citation clause in every description, and per-era coverage. Pass `--write` to refresh the `generatedAt` timestamp after an edit.

## Historical sources

Every monument's description ends with its own citations. The works drawn on across the dataset include:

- K.P. Padmanabha Menon, *History of Kerala* (1924–1937)
- A. Sreedhara Menon, *A Survey of Kerala History* (1967); Kerala District Gazetteers (Ernakulam & Thrissur)
- C. Achyutha Menon, *The Cochin State Manual* (1911, Government of Cochin)
- William Logan, *Malabar Manual* (1887)
- Pius Malekandathil, *Portuguese Cochin and the Maritime Trade of India, 1500–1663* (2001)
- Robert Bristow, *Cochin Saga* (1959)
- Roland E. Miller, *Mappila Muslims of Kerala: A Study in Islamic Trends* (1976)
- J.B. Segal, *A History of the Jews of Cochin* (1993)
- Nathan Katz, *Who Are the Jews of India?* (2000)
- Ruby Daniel & Barbara C. Johnson, *Ruby of Cochin: An Indian Jewish Woman Remembers* (1995)
- P.J. Cherian (ed.), *Pattanam Excavations: Interim Reports*, Kerala Council for Historical Research (2007–2015)
- Roberta Tomber, *Indo-Roman Trade: From Pots to Pepper* (2008)
- Pliny the Elder, *Natural History* (c. 77 CE); *Periplus Maris Erythraei* (1st century CE), trans. Lionel Casson (1989)

This list is a starting bibliography, not exhaustive — contributions of better or additional sources for any entry are welcome.

## Data notes

Coordinates were originally placed from general geographic knowledge, then cross-checked against OpenStreetMap Nominatim and Wikipedia/Wikidata coordinates and corrected where those sources gave a materially different, named-POI location — this caught several meaningful errors (e.g. Paradesi Synagogue previously sat ~190m off, over water; Vypin Lighthouse and Kottapuram Fort were off by 3km+). Sites without a confidently-matched named source (e.g. Fort Immanuel, largely demolished) are still best-effort estimates. Further corrections are welcome via pull request. The `mysorean` era currently has no monument tagged to it directly — the 1776 Mysorean invasion is referenced within the Kingdom of Cochin and Hill Palace entries instead of a fabricated standalone site, since no discrete surviving structure could be confidently identified.

## Tech

Static HTML/CSS/JS, no build step. Map rendering by [MapLibre GL JS](https://maplibre.org), tiles from [OpenFreeMap](https://openfreemap.org), map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). No API key required.

## License

GNU General Public License v3.0 — see [LICENSE](LICENSE). Following the license of the project this one is modeled on.
