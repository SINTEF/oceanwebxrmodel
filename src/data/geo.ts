import type { LatLngAltLike, LatLngZoomLike } from "./types";

export type { LatLngAltLike, LatLngZoomLike };

export const EARTH_RADIUS = 6371010.0;

function latLngToXY(position: { lat: number; lng: number }): [number, number] {
  const lat = position.lat * (Math.PI / 180);
  const lng = position.lng * (Math.PI / 180);
  return [
    EARTH_RADIUS * lng,
    EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + lat / 2)),
  ];
}

/**
 * Converts a geographic coordinate to a Z-up GIS offset vector relative to a
 * reference origin (x=east, y=north, z=altitude). The caller is responsible for
 * remapping axes to the target coordinate system (e.g. BabylonJS Y-up: swap y↔z).
 *
 * The spherical Mercator scale-factor at the reference latitude is applied so
 * east-west distances are accurate away from the equator.
 */
export function latLngToOffset(
  point: { lat: number; lng: number; altitude?: number },
  reference: { lat: number; lng: number; altitude?: number }
): { x: number; y: number; z: number } {
  const [px, py] = latLngToXY(point);
  const [rx, ry] = latLngToXY(reference);

  // Scale factor corrects east-west Mercator distortion at the reference latitude.
  const scale = Math.cos(reference.lat * (Math.PI / 180));

  return {
    x: (px - rx) * scale,
    y: (py - ry) * scale,
    z: (point.altitude ?? 0) - (reference.altitude ?? 0),
  };
}

/**
 * Converts BabylonJS world-space offsets (in metres) back to latitude/longitude,
 * relative to a geographic origin. Useful for translating ray-pick hit points into lat/lng.
 *
 * @param x            World X (east-west offset in metres from origin)
 * @param y            World Z in BabylonJS → north-south offset in metres from origin
 * @param originLatLng The geographic coordinate used as the world origin
 */
// ---------------------------------------------------------------------------
// UTM Zone 33N (EPSG:25833) conversion
// Used to build WCS SUBSET parameters for Norwegian ocean model services.
// ---------------------------------------------------------------------------

const _a  = 6378137.0;          // WGS84 semi-major axis (m)
const _f  = 1 / 298.257223563;  // WGS84 flattening
const _e2 = 2 * _f - _f * _f;   // first eccentricity squared
const _k0 = 0.9996;             // UTM scale factor
const _lon0 = 15 * (Math.PI / 180); // Zone 33 central meridian

/**
 * Converts WGS84 lat/lng to UTM Zone 33N (EPSG:25833) easting/northing in metres.
 * Accurate to sub-metre over the range of Norwegian latitudes (57–82°N).
 */
export function lngLatToUTM33N(lng: number, lat: number): { easting: number; northing: number } {
  const φ = lat * (Math.PI / 180);
  const λ = lng * (Math.PI / 180) - _lon0;

  const N = _a / Math.sqrt(1 - _e2 * Math.sin(φ) ** 2);
  const T = Math.tan(φ) ** 2;
  const C = (_e2 / (1 - _e2)) * Math.cos(φ) ** 2;
  const A = Math.cos(φ) * λ;

  // Meridional arc
  const e4 = _e2 * _e2, e6 = e4 * _e2;
  const M = _a * (
    (1 - _e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * φ
    - (3 * _e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * φ)
    + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * φ)
    - (35 * e6 / 3072) * Math.sin(6 * φ)
  );

  const easting = _k0 * N * (
    A + (1 - T + C) * A ** 3 / 6
    + (5 - 18 * T + T * T + 72 * C - 58 * (_e2 / (1 - _e2))) * A ** 5 / 120
  ) + 500000;

  const northing = _k0 * (M + N * Math.tan(φ) * (
    A * A / 2
    + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24
    + (61 - 58 * T + T * T + 600 * C - 330 * (_e2 / (1 - _e2))) * A ** 6 / 720
  ));

  return { easting, northing };
}

// ---------------------------------------------------------------------------

export function worldOffsetToLatLng(
  x: number,
  y: number,
  originLatLng: { lat: number; lng: number }
): { lat: number; lng: number } {
  const latPerMeter = 1 / ((Math.PI * EARTH_RADIUS) / 180);
  const lngPerMeter =
    1 /
    (((Math.PI * EARTH_RADIUS) / 180) *
      Math.cos(originLatLng.lat * (Math.PI / 180)));

  return {
    lat: originLatLng.lat + y * latPerMeter,
    lng: originLatLng.lng + x * lngPerMeter,
  };
}
