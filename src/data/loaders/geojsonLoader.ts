import type { LatLngAltLike } from "../types";

/** A single point feature extracted from a GeoJSON FeatureCollection. */
export interface PointFeature<P = Record<string, unknown>> {
  position: LatLngAltLike;
  properties: P;
}

/** Properties from the Norwegian Aquaculture Registry (Akvakulturregisteret). */
export interface AquacultureProperties {
  loknr: number;
  navn: string;
  status_lokalitet: string;
  kapasitet_lok: number;
  kapasitet_unittype: string;
  plassering: string;
  vannmiljo: string;
  fylke: string;
  kommune: string;
  til_arter: string;
  til_innehavere: string;
  lokalitet_url_ekstern: string;
}

/**
 * Fetches a GeoJSON FeatureCollection and extracts Point features.
 * Features with non-Point geometry are silently skipped.
 * Altitude defaults to 0 if not present in the coordinate tuple.
 */
export async function loadPointFeatures<P = Record<string, unknown>>(
  url: string
): Promise<PointFeature<P>[]> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch GeoJSON: ${response.statusText}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const collection = (await response.json()) as { features: any[] };
  const results: PointFeature<P>[] = [];

  for (const feature of collection.features) {
    if (feature.geometry?.type !== "Point") continue;
    const [lng, lat, altitude = 0] = feature.geometry.coordinates as number[];
    results.push({ position: { lat, lng, altitude }, properties: feature.properties as P });
  }

  return results;
}
