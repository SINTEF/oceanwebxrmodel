import type { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { TerrainData } from "../data/types";
import type { TemperatureGrid } from "../data/adapters/norkystTemperatureAdapter";
import { TEMP_MIN_C, TEMP_MAX_C } from "../data/adapters/norkystTemperatureAdapter";

// ---------------------------------------------------------------------------
// Colormap
// ---------------------------------------------------------------------------

/**
 * Maps a normalised value [0, 1] to an RGBA tuple using a cool→warm ramp:
 * deep blue (cold) → cyan → green → yellow → red (warm).
 *
 * Exported so callers can reuse the same colourmap for legends or UI.
 */
export function tempToRgba(t: number): [number, number, number, number] {
  const stops: [number, number, number][] = [
    [  0,   0, 180],  // cold blue
    [  0, 200, 220],  // cyan
    [  0, 180,  60],  // green
    [220, 200,   0],  // yellow
    [220,  30,   0],  // warm red
  ];
  const scaled = t * (stops.length - 1);
  const lo     = Math.floor(scaled);
  const hi     = Math.min(lo + 1, stops.length - 1);
  const frac   = scaled - lo;
  const lerp   = (a: number, b: number) => Math.round(a + (b - a) * frac);
  return [lerp(stops[lo][0], stops[hi][0]), lerp(stops[lo][1], stops[hi][1]), lerp(stops[lo][2], stops[hi][2]), 225];
}

// ---------------------------------------------------------------------------

/**
 * Paints a TemperatureGrid into a DynamicTexture using `tempToRgba`.
 * NaN pixels (land / outside model domain) are left fully transparent.
 */
function buildTemperatureTexture(grid: TemperatureGrid, scene: Scene): DynamicTexture {
  const { values, width, height, minTemp, maxTemp } = grid;
  const lo    = Math.min(minTemp, TEMP_MIN_C);
  const hi    = Math.max(maxTemp, TEMP_MAX_C);
  const range = hi - lo || 1;

  const tex = new DynamicTexture("temp-texture", { width, height }, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const imageData = ctx.createImageData(width, height);
  const px  = imageData.data;

  for (let i = 0; i < width * height; i++) {
    const v = values[i];
    const [r, g, b, a] = isNaN(v) ? [0, 0, 0, 0] : tempToRgba((v - lo) / range);
    px[i * 4 + 0] = r;
    px[i * 4 + 1] = g;
    px[i * 4 + 2] = b;
    px[i * 4 + 3] = a;
  }
  ctx.putImageData(imageData, 0, 0);
  tex.update();

  console.log(`TemperatureLayer texture: ${width}×${height} px, ${lo.toFixed(1)}–${hi.toFixed(1)} °C`);
  return tex;
}

// ---------------------------------------------------------------------------

/**
 * A semi-transparent PBR plane placed just below the WaterMaterial ocean
 * surface, showing sea-surface temperature from the Norkyst800 ocean model.
 *
 * Sitting beneath the wave mesh means the temperature colours show through
 * WaterMaterial's semi-transparent water without interfering with its
 * reflection/refraction render targets.
 */
export class TemperatureLayer {
  private _mesh: Mesh | null = null;

  /**
   * Creates the temperature plane and attaches it to the scene.
   * Call `dispose()` to remove it.
   */
  create(
    scene: Scene,
    terrainData: TerrainData,
    grid: TemperatureGrid,
    meshScale: number
  ): Mesh {
    const { planeSizeX, planeSizeZ } = terrainData;

    const tempTex = buildTemperatureTexture(grid, scene);
    tempTex.hasAlpha = true; // alpha=0 for land pixels → fully transparent

    const mat = new PBRMaterial("temp-layer-mat", scene);
    mat.albedoTexture             = tempTex;
    mat.useAlphaFromAlbedoTexture = true;
    mat.metallic                  = 0.0;
    mat.roughness                 = 1.0;   // flat, no specular — let WaterMaterial handle sheen
    mat.disableLighting           = false;
    mat.backFaceCulling           = false;

    const mesh = MeshBuilder.CreateGround(
      "temp-layer",
      { width: planeSizeX * meshScale, height: planeSizeZ * meshScale },
      scene
    );
    // Sit just below the WaterMaterial plane (waterMesh.position.y = meshScale * 0.5)
    // so the temperature shows through the semi-transparent water.
    mesh.position.y = meshScale * 0.4 - 0.01;
    mesh.material   = mat;

    this._mesh = mesh;
    return mesh;
  }

  dispose(): void {
    this._mesh?.material?.dispose();
    this._mesh?.dispose();
    this._mesh = null;
  }
}
