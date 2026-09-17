#!/usr/bin/env python3
"""Validate monuments.json before publishing. Run with --write to refresh generatedAt."""
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parent.parent / "monuments.json"

REQUIRED_FIELDS = ["id", "name", "lat", "lng", "era", "eraLabel", "description", "mapsUrl"]

TAXONOMY = {
    "pre-cochin",
    "kingdom-of-cochin",
    "portuguese",
    "dutch",
    "mysorean",
    "princely-state",
    "jewish-heritage",
    "post-independence",
}

# Greater Kochi + Kodungallur/Muziris bounding box
LAT_RANGE = (9.85, 10.25)
LNG_RANGE = (76.15, 76.40)

CITATION_RE = re.compile(r"Citations:\s*\S")


def fail(msg: str) -> None:
    print(f"FAIL: {msg}")
    sys.exit(1)


def main() -> None:
    write = "--write" in sys.argv

    try:
        raw = DATA_PATH.read_text(encoding="utf-8")
    except FileNotFoundError:
        fail(f"{DATA_PATH} not found")

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        fail(f"invalid JSON: {e}")

    monuments = data.get("monuments")
    if not isinstance(monuments, list) or not monuments:
        fail("'monuments' must be a non-empty array")

    seen_ids = set()
    era_counts = {era: 0 for era in TAXONOMY}
    errors = []

    for i, m in enumerate(monuments):
        label = m.get("name", f"entry #{i}")

        for field in REQUIRED_FIELDS:
            if field not in m or m[field] in (None, ""):
                errors.append(f"{label}: missing required field '{field}'")

        mid = m.get("id")
        if mid:
            if mid in seen_ids:
                errors.append(f"{label}: duplicate id '{mid}'")
            seen_ids.add(mid)

        lat, lng = m.get("lat"), m.get("lng")
        if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
            if not (LAT_RANGE[0] <= lat <= LAT_RANGE[1]):
                errors.append(f"{label}: lat {lat} outside expected range {LAT_RANGE}")
            if not (LNG_RANGE[0] <= lng <= LNG_RANGE[1]):
                errors.append(f"{label}: lng {lng} outside expected range {LNG_RANGE}")

        era = m.get("era")
        if era not in TAXONOMY:
            errors.append(f"{label}: unknown era '{era}'")
        else:
            era_counts[era] += 1

        images = m.get("images")
        if images is not None and not isinstance(images, list):
            errors.append(f"{label}: 'images' must be a list")

        description = m.get("description", "")
        if not CITATION_RE.search(description):
            errors.append(f"{label}: description missing a 'Citations: ...' clause")

    if errors:
        for e in errors:
            print(f"FAIL: {e}")
        sys.exit(1)

    print(f"OK: {len(monuments)} monuments validated.")
    print("Coverage by era:")
    for era in sorted(era_counts):
        count = era_counts[era]
        flag = "  <-- zero entries" if count == 0 else ""
        print(f"  {era:<20} {count}{flag}")

    if write:
        data["generatedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        DATA_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Updated generatedAt -> {data['generatedAt']}")


if __name__ == "__main__":
    main()
