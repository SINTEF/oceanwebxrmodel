import type { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector2 } from "@babylonjs/core/Maths/math.vector";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { WaterMaterial } from "@babylonjs/materials/water/waterMaterial";
import type { TerrainData } from "../data/types";
import type { TemperatureGrid } from "../data/adapters/norkystTemperatureAdapter";
import { TEMP_MIN_C, TEMP_MAX_C } from "../data/adapters/norkystTemperatureAdapter";

export interface OceanSurfaceOptions {
  /** Uniform scene scale — must match TerrainMesh's meshScale. */
  meshScale: number;
  /** The terrain ground mesh — added to the water's reflection and refraction
   *  render lists so the seabed is visible through the water surface. */
  terrainMesh?: Mesh;
}

/**
 * Creates an animated water surface at sea level (scene Y=0) using BabylonJS
 * WaterMaterial: bump-mapped wave animation, reflection RTT, refraction RTT.
 *
 * All geometry wave parameters (waveHeight, waveLength) are scaled by meshScale
 * so the waves feel proportional at table-top scale (MESH_SCALE = 0.00005).
 *
 * Sea level = 0 m ASL = scene Y=0 — no offset arithmetic needed.
 */
export function createOceanSurface(
  scene: Scene,
  terrainData: TerrainData,
  options: OceanSurfaceOptions
): Mesh {
  const { meshScale, terrainMesh } = options;
  const { planeSizeX, planeSizeZ } = terrainData;

  const width = planeSizeX * meshScale;
  const height = planeSizeZ * meshScale;

  console.log(
    `OceanSurface: Y=0 (sea level), plane ${width.toFixed(3)} × ${height.toFixed(3)} scene units`
  );

  // subdivisions: 32 gives the shader vertices to deform into wave geometry.
  // Without subdivisions the default flat quad shows no geometric wave motion.
  const waterMesh = MeshBuilder.CreateGround(
    "ocean-surface",
    { width, height, subdivisions: 32 },
    scene
  );
  // Tiny epsilon above Y=0 prevents z-fighting with coastal terrain vertices
  // that sit exactly at sea level.
  waterMesh.position.y = meshScale * 0.5-0.005;

  const waterMat = new WaterMaterial("ocean-water", scene);

  // Bump map provides the high-frequency normal perturbation (sparkle/ripple detail).
  // This is separate from the geometry deformation controlled by waveHeight.
  waterMat.bumpTexture = new Texture(
    "https://assets.babylonjs.com/textures/waterbump.png",
    scene
  );

  // Wave geometry — scale to meshScale so waves feel physically proportional.
  // waveHeight: ~1.5 m real-world wave amplitude
  // waveLength: ~200 m real-world wavelength (long ocean swell)
  waterMat.waveHeight  = meshScale * 1.5 *10;
  waterMat.waveLength  = meshScale * 200 *5;
  waterMat.waveSpeed   = 0.05;    // slow, calm Norwegian Sea
  waterMat.windForce   = 3;       // default 6 is too choppy at this scale
  waterMat.windDirection = new Vector2(1, 1); // diagonal swell direction

  // Bump-map intensity — controls the sparkle/refraction sharpness.
  // Intentionally decoupled from waveHeight; can be tuned independently.
  waterMat.bumpHeight = 0.25;

  // Colour — match the scene's existing dark ocean blue.
  //waterMat.waterColor       = new Color3(0.02, 0.12, 0.28);
  waterMat.waterColor       = new Color3(0.02, 0.12, 0.0);
  waterMat.colorBlendFactor = 0.5; // subtle tint; let reflections dominate

  // Add the terrain to the reflection and refraction render target lists so
  // the seabed (and satellite texture) appear through/in the water surface.
  if (terrainMesh) {
    waterMat.addToRenderList(terrainMesh);
  }

  waterMesh.material = waterMat;
  return waterMesh;
}

// ---------------------------------------------------------------------------
// Temperature colormap
// ---------------------------------------------------------------------------

/**
 * Maps a normalised value [0, 1] to an RGBA colour using a cool→warm ramp:
 * deep blue (cold) → cyan → green → yellow → red (warm).
 */
function tempToRgba(t: number): [number, number, number, number] {
  // Five-stop gradient: 0=blue, 0.25=cyan, 0.5=green, 0.75=yellow, 1=red
  const stops: [number, number, number][] = [
    [0,   0,   180],  // cold blue
    [0,   200, 220],  // cyan
    [0,   180,  60],  // green
    [220, 200,   0],  // yellow
    [220,  30,   0],  // warm red
  ];
  
  const scaled = t * (stops.length - 1);
  const lo = Math.floor(scaled);
  const hi = Math.min(lo + 1, stops.length - 1);
  const frac = scaled - lo;
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * frac);
  return [lerp(stops[lo][0], stops[hi][0]), lerp(stops[lo][1], stops[hi][1]), lerp(stops[lo][2], stops[hi][2]), 200];
}

// ---------------------------------------------------------------------------

/**
 * Creates a semi-transparent temperature heatmap overlay on top of the ocean
 * surface using a DynamicTexture painted with a cool→warm colour ramp.
 *
 * The overlay sits slightly above the water plane so it is always visible even
 * when the WaterMaterial's wave deformation lifts vertices above Y=0.
 *
 * Returns the overlay mesh (can be disposed to remove the visualisation).
 */
export function applyTemperatureOverlay(
  scene: Scene,
  terrainData: TerrainData,
  temperatureGrid: TemperatureGrid,
  meshScale: number
): Mesh {
  const { planeSizeX, planeSizeZ } = terrainData;
  const { values, width, height, minTemp, maxTemp } = temperatureGrid;

  // Use the grid's actual range if it's wider than the default; otherwise fall
  // back to the climatological range so the colourmap is consistent across tiles.
  const lo = Math.min(minTemp, TEMP_MIN_C);
  const hi = Math.max(maxTemp, TEMP_MAX_C);
  const range = hi - lo || 1;

  // Paint temperature values onto a DynamicTexture.
  const tex = new DynamicTexture("temp-texture", { width, height }, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const imageData = ctx.createImageData(width, height);
  const px = imageData.data;

  for (let i = 0; i < width * height; i++) {
    const v = values[i];
    const [r, g, b, a] = isNaN(v)
      ? [0, 0, 0, 0]                          // transparent over land
      : tempToRgba((v - lo) / range);
    px[i * 4 + 0] = r;
    px[i * 4 + 1] = g;
    px[i * 4 + 2] = b;
    px[i * 4 + 3] = a;
  }
  ctx.putImageData(imageData, 0, 0);
  tex.update();

  // Overlay mesh — same footprint as the water plane, placed just above it.
  const overlayMesh = MeshBuilder.CreateGround(
    "temp-overlay",
    { width: planeSizeX * meshScale, height: planeSizeZ * meshScale },
    scene
  );
  overlayMesh.position.y = meshScale * 2+0.01;

  const mat = new StandardMaterial("temp-overlay-mat", scene);
  mat.diffuseTexture = tex;
  mat.opacityTexture = tex; // uses alpha channel for transparent land pixels
  mat.useAlphaFromDiffuseTexture = false;
  mat.backFaceCulling = false;
  mat.disableLighting = false;
  overlayMesh.material = mat;

  console.log(
    `Temperature overlay: ${width}×${height} px, ` +
    `range ${lo.toFixed(1)}–${hi.toFixed(1)} °C, colormap cool→warm`
  );

  return overlayMesh;
}
