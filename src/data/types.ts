export type LatLngAltLike = {
  lat: number;
  lng: number;
  altitude: number;
};

/** Geographic anchor with a map zoom level — used for tile fetching and as the terrain origin. */
export type LatLngZoomLike = {
  lat: number;
  lng: number;
  zoom: number;
};

/** Raw terrain data returned by ITerrainProvider. No BabylonJS. */
export interface TerrainData {
  /** 257×257 elevation grid in metres, normalized so the minimum value is 0. */
  elevation: Float32Array;
  /** Raw elevation of the lowest point in metres ASL (before normalization). */
  minElev: number;
  /** Raw elevation of the highest point in metres ASL (before normalization). */
  maxElev: number;
  /** blob: URL for the satellite image — pass directly to BabylonJS Texture. */
  satelliteUrl: string;
  /** Geographic width of the tile in metres at the anchor latitude. */
  planeSize: number;
  /** Geographic reference point used to anchor the mesh in world space. */
  anchor: LatLngZoomLike;
}

/** Computed geometry ready for a 3D renderer. Produced by TerrainBuilder. No BabylonJS. */
export interface TerrainGeometry {
  /** Flat XYZ triples in BabylonJS world space (X=east, Y=altitude, Z=north), in metres. */
  positions: Float32Array;
  /** Triangle indices (three indices per triangle). */
  indices: number[];
  /** Flat UV pairs (U=west→east, V=south→north after BabylonJS flip). */
  uvs: Float32Array;
  /** Passed through from TerrainData — blob: URL for satellite texture. */
  satelliteUrl: string;
  /** Passed through from TerrainData — used by scene layer for coordinate conversions. */
  anchor: LatLngZoomLike;
}
