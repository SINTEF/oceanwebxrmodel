import type { LatLngZoomLike, TerrainData } from "../types";

export interface ITerrainProvider {
  fetchTerrain(anchor: LatLngZoomLike): Promise<TerrainData>;
}
