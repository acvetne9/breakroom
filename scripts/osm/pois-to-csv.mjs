#!/usr/bin/env node
// Convert an `osmium export -f geojsonseq` dump of OSM POIs into the CSV shape
// used by public.businesses_chicago:
//   source_id,name,business_type,lat,lng,address,website
//
//   node scripts/osm/pois-to-csv.mjs [--bbox W,S,E,N] <in.geojsonseq> <out.csv>
//
// No npm dependencies. Streams the input line by line, so memory stays flat.
import { createReadStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

// ------------------------------------------------------------------ args
const args = process.argv.slice(2);
let bbox = null;
const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--bbox") bbox = args[++i].split(",").map(Number);
  else positional.push(args[i]);
}
const [inPath, outPath] = positional;
if (!inPath || !outPath) {
  console.error("usage: pois-to-csv.mjs [--bbox W,S,E,N] <in.geojsonseq> <out.csv>");
  process.exit(2);
}
const [W, S, E, N] = bbox ?? [-180, -90, 180, 90];

// ------------------------------------------------------------------ exclusions
// Places where nobody works. Anything matching is dropped before categorising.
const EXCLUDE = {
  amenity: new Set([
    "bench", "parking", "parking_entrance", "parking_space", "bicycle_parking", "bicycle_rental",
    "waste_basket", "waste_disposal", "recycling", "atm", "vending_machine", "drinking_water",
    "toilets", "post_box", "charging_station", "fountain", "shelter", "telephone", "grave_yard",
    "public_bookcase", "clock", "bbq", "dog_toilet", "hunting_stand", "loading_dock",
    "motorcycle_parking", "compressed_air", "water_point", "letter_box", "bicycle_repair_station",
    "taxi", "car_sharing", "boat_storage", "lounger", "grit_bin", "sanitary_dump_station",
    "trolley_bay", "ticket_validator", "payment_terminal", "smoking_area", "bicycle_wash",
    "device_charging_station", "photo_booth", "parcel_locker", "vacuum_cleaner", "weighbridge",
    "lavoir", "shower", "bus_stop", "traffic_park", "dressing_room", "locker", "parking_exit", "give_box",
    "lounger", "bicycle_wash",
  ]),
  leisure: new Set([
    "park", "pitch", "playground", "garden", "picnic_table", "slipway", "nature_reserve",
    "dog_park", "track", "swimming_area", "bleachers", "firepit", "common", "bandstand",
    "outdoor_seating", "fishing", "bird_hide", "wildlife_hide", "disc_golf_course", "trampoline_park",
    "horse_riding", "sunbathing", "mixed-use_track", "picnic", "proposed", "beach", "slipway",
  ]),
  tourism: new Set(["information", "viewpoint", "artwork", "picnic_site", "camp_pitch", "wilderness_hut"]),
};
const EXCLUDED_SHOP = new Set(["vacant", "no", "yes"]);
const CATEGORY_KEYS = ["shop", "amenity", "office", "craft", "healthcare", "tourism", "leisure", "club"];

// ------------------------------------------------------------------ categorisation
// Ordered: the first rule that matches wins. The set of names is exactly the
// business_type vocabulary already used by the NYC data.
const RULES = [
  ["Restaurant", { amenity: ["restaurant", "fast_food", "food_court"] }],
  ["Cafe", { amenity: ["cafe", "ice_cream", "bubble_tea", "juice_bar", "internet_cafe"], shop: ["coffee", "tea", "bakery", "pastry", "ice_cream", "bubble_tea"] }],
  ["Bar", { amenity: ["bar", "pub", "nightclub", "biergarten", "hookah_lounge", "stripclub", "lounge"] }],
  ["Grocery Store", { shop: ["supermarket", "convenience", "greengrocer", "deli", "grocery", "butcher", "seafood", "health_food", "wholesale", "frozen_food", "dairy", "farm"] }],
  ["Healthcare", { amenity: ["hospital", "clinic", "doctors", "dentist", "pharmacy", "veterinary", "nursing_home"], healthcare: "*", shop: ["chemist", "medical_supply", "optician", "hearing_aids"] }],
  ["Education", { amenity: ["school", "university", "college", "kindergarten", "library", "language_school", "music_school", "driving_school", "childcare", "prep_school", "research_institute", "training", "dancing_school", "flight_school"], office: ["educational_institution"] }],
  ["Financial", { amenity: ["bank", "bureau_de_change", "money_transfer", "payment_centre"], office: ["financial", "insurance", "accountant", "financial_advisor", "tax_advisor", "mortgage"], shop: ["money_lender", "pawnbroker"] }],
  ["Legal", { office: ["lawyer", "notary", "bail_bond_agent"] }],
  ["Hospitality", { tourism: ["hotel", "motel", "hostel", "guest_house", "apartment", "chalet", "resort", "camp_site", "caravan_site"] }],
  ["Automotive", { shop: ["car", "car_repair", "car_parts", "tyres", "motorcycle", "motorcycle_repair", "truck", "truck_repair", "caravan", "boat", "trailer", "car_wash"], amenity: ["fuel", "car_wash", "car_rental", "vehicle_inspection", "motorcycle_rental", "boat_rental_shop"] }],
  ["Fitness", { leisure: ["fitness_centre", "sports_centre", "swimming_pool", "fitness_station", "sports_hall"], shop: ["fitness"], amenity: ["gym", "dojo"] }],
  ["Recreation", { leisure: ["bowling_alley", "escape_game", "ice_rink", "golf_course", "miniature_golf", "amusement_arcade", "dance", "stadium", "marina", "water_park", "adult_gaming_centre", "hackerspace", "resort", "beach_resort", "horse_riding", "trampoline_park", "indoor_play"], amenity: ["cinema", "theatre", "casino", "community_centre", "gambling", "events_venue", "conference_centre", "exhibition_centre", "music_venue", "planetarium", "social_centre", "boat_rental"] }],
  ["Cultural", { tourism: ["museum", "gallery"], amenity: ["arts_centre", "studio"], leisure: ["arts_centre"] }],
  ["Tourist Attraction", { tourism: ["attraction", "zoo", "aquarium", "theme_park"] }],
  ["Religious", { amenity: ["place_of_worship", "monastery"], office: ["religion"] }],
  ["Transportation", { amenity: ["bus_station", "ferry_terminal"], office: ["logistics", "moving_company", "courier"] }],
  ["Government", { amenity: ["townhall", "courthouse", "police", "fire_station", "post_office", "social_facility", "public_building", "prison", "ranger_station", "animal_shelter", "post_depot", "lost_property_office"], office: ["government", "administrative"] }],
  ["Wellness", { shop: ["beauty", "hairdresser", "massage", "tattoo", "cosmetics", "nutrition_supplements", "perfumery"], amenity: ["spa", "public_bath", "salon"], leisure: ["sauna", "spa"] }],
  ["Business", { shop: ["funeral_directors", "storage_rental", "pet_grooming"], amenity: ["animal_boarding", "animal_training", "animal_breeding", "waste_transfer_station", "coworking_space", "crematorium", "mortuary", "funeral_hall", "recycling_centre"] }],
  ["Retail", { shop: "*", amenity: ["marketplace", "freeshop", "gift shop"] }],
  ["Business", { office: "*", craft: "*", club: "*" }],
];

function categorise(p) {
  for (const [type, spec] of RULES) {
    for (const [key, values] of Object.entries(spec)) {
      const v = p[key];
      if (v == null) continue;
      if (values === "*") return type;
      // OSM allows "a;b" multi-values — match on any part.
      const parts = v.split(";").map((s) => s.trim());
      if (parts.some((part) => values.includes(part))) return type;
    }
  }
  return "Other";
}

function isExcluded(p) {
  for (const [key, set] of Object.entries(EXCLUDE)) {
    const v = p[key];
    if (v && v.split(";").some((part) => set.has(part.trim()))) {
      // ...unless another tag makes it a workplace (e.g. a park with a shop tag).
      const otherKeys = CATEGORY_KEYS.filter((k) => k !== key && p[k]);
      if (otherKeys.length === 0) return true;
      // If every other tag is also excluded, drop it.
      const allExcluded = otherKeys.every((k) => EXCLUDE[k]?.has(p[k]));
      if (allExcluded) return true;
    }
  }
  if (p.shop && EXCLUDED_SHOP.has(p.shop) && !p.amenity && !p.office && !p.craft && !p.healthcare && !p.tourism && !p.leisure && !p.club) return true;
  return false;
}

// ------------------------------------------------------------------ geometry
function ringCentroid(ring) {
  // Shoelace centroid; falls back to vertex average for degenerate rings.
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i], [x1, y1] = ring[i + 1];
    const f = x0 * y1 - x1 * y0;
    a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-14) {
    const n = ring.length;
    return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
  }
  a *= 0.5;
  return [cx / (6 * a), cy / (6 * a)];
}
function ringArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return Math.abs(a / 2);
}
function centroid(geom) {
  switch (geom.type) {
    case "Point": return geom.coordinates;
    case "Polygon": return ringCentroid(geom.coordinates[0]);
    case "MultiPolygon": {
      let best = null, bestArea = -1;
      for (const poly of geom.coordinates) {
        const area = ringArea(poly[0]);
        if (area > bestArea) { bestArea = area; best = poly[0]; }
      }
      return best ? ringCentroid(best) : null;
    }
    case "LineString": {
      const c = geom.coordinates;
      return c[Math.floor(c.length / 2)];
    }
    default: return null;
  }
}

// ------------------------------------------------------------------ text helpers
function address(p) {
  const city = p["addr:city"] || "Chicago";
  const state = p["addr:state"] || "IL";
  const zip = p["addr:postcode"] ? ` ${p["addr:postcode"]}` : "";
  if (p["addr:housenumber"] && p["addr:street"]) {
    return `${p["addr:housenumber"]} ${p["addr:street"]}, ${city}, ${state}${zip}, USA`;
  }
  if (p["addr:street"]) return `${p["addr:street"]}, ${city}, ${state}${zip}, USA`;
  if (p["addr:city"] || p["addr:postcode"]) return `${city}, ${state}${zip}, USA`;
  return "";
}
function website(p) {
  const w = (p.website || p["contact:website"] || "").trim();
  if (!w) return "";
  return /^https?:\/\//i.test(w) ? w : `https://${w}`;
}
function normName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function csvField(v) {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ------------------------------------------------------------------ main
const rows = [];
const seenIds = new Set();
let total = 0, unnamed = 0, outside = 0, excluded = 0, noGeom = 0, dupIds = 0;

const rl = createInterface({ input: createReadStream(inPath), crlfDelay: Infinity });
for await (const rawLine of rl) {
  const line = rawLine.replace(/^\x1e/, "").trim(); // RFC 8142 record separator
  if (!line) continue;
  total++;
  const f = JSON.parse(line);
  const p = f.properties ?? {};
  // Strip zero-width / variation-selector characters, collapse whitespace.
  const name = (p.name ?? "").replace(/[\u200B-\u200F\u2060\uFE0E\uFE0F\uFEFF]/g, "").replace(/\s+/g, " ").trim();
  // Unnamed, single-character or purely numeric names are not businesses.
  if (!name || name.length < 2 || /^[\d\s.#-]+$/.test(name)) { unnamed++; continue; }
  if (!CATEGORY_KEYS.some((k) => p[k])) { excluded++; continue; }
  if (isExcluded(p)) { excluded++; continue; }
  const c = centroid(f.geometry ?? {});
  if (!c) { noGeom++; continue; }
  const [lng, lat] = c;
  if (lng < W || lng > E || lat < S || lat > N) { outside++; continue; }
  const sourceId = p["@type"] && p["@id"] != null ? `${p["@type"]}/${p["@id"]}` : `feature/${rows.length}`;
  if (seenIds.has(sourceId)) { dupIds++; continue; }
  seenIds.add(sourceId);
  rows.push({
    source_id: sourceId,
    name,
    business_type: categorise(p),
    lat: +lat.toFixed(6),
    lng: +lng.toFixed(6),
    address: address(p),
    website: website(p),
    // scoring helpers for dedupe
    _tags: Object.keys(p).filter((k) => !k.startsWith("@")).length,
    _norm: normName(name),
  });
}

// Dedupe: same normalised name within ~40 m → keep the richer row.
// Grid-bucket by ~40 m cells and compare neighbours.
const CELL_LAT = 40 / 111_320;
const CELL_LNG = 40 / (111_320 * Math.cos((41.85 * Math.PI) / 180));
const buckets = new Map();
const keyOf = (r, di = 0, dj = 0) => `${r._norm}|${Math.floor(r.lat / CELL_LAT) + di}|${Math.floor(r.lng / CELL_LNG) + dj}`;
const score = (r) => r._tags * 10 + (r.address ? 100 : 0) + (r.website ? 50 : 0) + (r.source_id.startsWith("way/") || r.source_id.startsWith("relation/") ? 1 : 0);
const distM = (a, b) => {
  const dLat = (a.lat - b.lat) * 111_320;
  const dLng = (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
};
// Richer rows first, so the survivor is always the one already in the bucket.
rows.sort((a, b) => score(b) - score(a));
const kept = [];
let dropped = 0;
for (const r of rows) {
  let dup = false;
  outer: for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      const list = buckets.get(keyOf(r, di, dj));
      if (!list) continue;
      for (const other of list) {
        if (distM(r, other) <= 40) { dup = true; break outer; }
      }
    }
  }
  if (dup) { dropped++; continue; }
  const k = keyOf(r);
  if (!buckets.has(k)) buckets.set(k, []);
  buckets.get(k).push(r);
  kept.push(r);
}
kept.sort((a, b) => a.name.localeCompare(b.name) || a.source_id.localeCompare(b.source_id));

const header = ["source_id", "name", "business_type", "lat", "lng", "address", "website"];
const out = [header.join(",")];
for (const r of kept) out.push(header.map((h) => csvField(r[h])).join(","));
writeFileSync(outPath, out.join("\r\n") + "\r\n");

// ------------------------------------------------------------------ summary
const byType = new Map();
for (const r of kept) byType.set(r.business_type, (byType.get(r.business_type) ?? 0) + 1);
const withAddr = kept.filter((r) => r.address).length;
const withWeb = kept.filter((r) => r.website).length;
console.log(`   input features:     ${total}`);
console.log(`   dropped (no name):  ${unnamed}`);
console.log(`   dropped (excluded): ${excluded}`);
console.log(`   dropped (no geom):  ${noGeom}`);
console.log(`   dropped (outside):  ${outside}`);
console.log(`   dropped (dup id):   ${dupIds}`);
console.log(`   dropped (dedupe):   ${dropped}  (same name within 40 m)`);
console.log(`   rows written:       ${kept.length}  → ${outPath}`);
console.log(`   with address:       ${withAddr} (${((100 * withAddr) / kept.length).toFixed(1)}%)`);
console.log(`   with website:       ${withWeb} (${((100 * withWeb) / kept.length).toFixed(1)}%)`);
console.log("   business_type (top 20):");
[...byType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([t, n]) => console.log(`     ${t.padEnd(20)} ${n}`));
