import type { LatLngAltLike, TerrainData } from "../types";

export interface ITerrainProvider {
  fetchTerrain(anchor: LatLngAltLike, zoom: number): Promise<TerrainData>;
}
