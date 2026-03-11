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
