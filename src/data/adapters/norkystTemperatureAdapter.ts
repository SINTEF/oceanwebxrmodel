import { fromBlob } from "geotiff";
import { lngLatToUTM33N } from "../geo";
import { tileBoundsLngLat } from "./mapboxTerrainAdapter";

// ---------------------------------------------------------------------------

const WCS_BASE = "https://kart.hi.no/data/oseanografi/ows";

/** Coverage ID for the Norkyst800 surface temperature (5 m depth). */
const COVERAGE_ID = "oseanografi__Norkyst_temperatur_005m";

/** Typical Norwegian coastal temperature range (°C). Used for colormap scaling. */
export const TEMP_MIN_C = 6.7;
export const TEMP_MAX_C = 8.6;

// ---------------------------------------------------------------------------

export interface TemperatureGrid {
  /** Temperature values in °C, row-major, top-left origin. */
  values: Float32Array;
  width: number;
  height: number;
  /** Actual minimum temperature found in the grid (non-NaN pixels). */
  minTemp: number;
  /** Actual maximum temperature found in the grid (non-NaN pixels). */
  maxTemp: number;
}

// ---------------------------------------------------------------------------

/**
 * Fetches sea surface temperature from the Havforskningsinstituttet Norkyst800
 * ocean model via WCS 2.0.1, decodes the GeoTIFF response, and returns a
 * Float32Array of temperatures in °C.
 *
 * The WCS service uses EPSG:32633 (WGS84 UTM Zone 33N) for its bounding box.
 * EPSG:25833 (ETRS89 UTM Zone 33N) differs by only a few centimetres in Norway,
 * so the same lngLatToUTM33N conversion is used — the error is negligible.
 *
 * Returns undefined when outside model coverage or the request fails.
 */
export class NorkystTemperatureAdapter {
  async fetchTemperatureGrid(
    tx: number,
    ty: number,
    tz: number,
    /** Pixel resolution of the returned grid (default 256×256). */
    size = 256
  ): Promise<TemperatureGrid | undefined> {
    const { north, south, east, west } = tileBoundsLngLat(tx, ty, tz);

    // Convert tile corners from WGS84 to UTM Zone 33N (EPSG:25833).
    const sw = lngLatToUTM33N(west, south);
    const ne = lngLatToUTM33N(east, north);

    const params = new URLSearchParams({
      SERVICE:    "WCS",
      VERSION:    "2.0.1",
      REQUEST:    "GetCoverage",
      COVERAGEID: COVERAGE_ID,
      FORMAT:     "image/tiff",
      // SUBSET parameters use axis labels E and N (UTM easting/northing).
      SUBSET:     `E(${sw.easting},${ne.easting})`,
      // The second SUBSET param must be appended separately — URLSearchParams
      // deduplicates keys, so we build the URL string manually below.
    });

    // Append duplicate SUBSET key for northing (WCS 2.0 requires two SUBSET params).
    const url =
      `${WCS_BASE}?${params.toString()}` +
      `&SUBSET=N(${sw.northing},${ne.northing})` +
      // SCALESIZE uses grid axis labels (i, j) — not the geographic envelope labels (E, N).
      // Confirmed from DescribeCoverage: <gml:axisLabels>i j</gml:axisLabels>
      `&SCALESIZE=i(${size}),j(${size})`;

    console.log(`Norkyst WCS request: ${url}`);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`Norkyst WCS returned HTTP ${response.status} — skipping temperature overlay`);
        return undefined;
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("tiff") && !contentType.includes("octet-stream")) {
        // Service sometimes returns XML error bodies with a 200 status.
        const text = await response.text();
        console.warn("Norkyst WCS: unexpected content-type:", contentType, text.slice(0, 200));
        return undefined;
      }

      const blob = await response.blob();
      const tiff = await fromBlob(blob);
      const image = await tiff.getImage();
      // readRasters returns one TypedArray per band; temperature is band 0.
      const rasters = await image.readRasters();
      const raw = rasters[0] as Float32Array;

      // Collect stats and replace NaN / fill values with NaN sentinel.
      let minTemp = Infinity;
      let maxTemp = -Infinity;
      const values = new Float32Array(raw.length);
      for (let i = 0; i < raw.length; i++) {
        const v = raw[i];
        if (!isFinite(v) || v < -100 || v > 100) {
          values[i] = NaN; // land / outside Norkyst domain
        } else {
          values[i] = v;
          if (v < minTemp) minTemp = v;
          if (v > maxTemp) maxTemp = v;
        }
      }

      console.log(
        `Norkyst temperature grid: ${image.getWidth()}×${image.getHeight()}, ` +
        `range ${minTemp.toFixed(1)}–${maxTemp.toFixed(1)} °C`
      );

      return {
        values,
        width:   image.getWidth(),
        height:  image.getHeight(),
        minTemp: isFinite(minTemp) ? minTemp : TEMP_MIN_C,
        maxTemp: isFinite(maxTemp) ? maxTemp : TEMP_MAX_C,
      };
    } catch (err) {
      console.warn("Norkyst temperature fetch failed:", err);
      return undefined;
    }
  }
}
