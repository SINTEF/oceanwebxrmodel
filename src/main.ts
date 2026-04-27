// Side-effect: registers glTF loader
import "@babylonjs/loaders/glTF/2.0";
// Side-effect: patches Scene.prototype.beginAnimation/stopAnimation etc. (required by WebXRDefaultExperience)
import "@babylonjs/core/Animations/animatable";
// Side-effect: registers all Node Material block classes so WebXRDefaultExperience can deserialize
// hand/controller shader snippets downloaded from the Babylon.js snippet server at runtime.
import "@babylonjs/core/Materials/Node/Blocks";

import { Color3 } from "@babylonjs/core/Maths/math.color";
import { WebXRState } from "@babylonjs/core/XR/webXRTypes";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { GUI3DManager } from "@babylonjs/gui/3D/gui3DManager";

import { createScene } from "./scene/SceneManager";
import { TerrainMesh } from "./scene/TerrainMesh";
import { MapboxTerrainAdapter } from "./data/adapters/mapboxTerrainAdapter";
import { GeonorgeDepthAdapter } from "./data/adapters/geonorgeDepthAdapter";
import { buildGeometry } from "./data/TerrainBuilder";
import { createOceanSurface } from "./scene/OceanSurface";
import { TemperatureLayer } from "./scene/TemperatureLayer";
import { NorkystTemperatureAdapter } from "./data/adapters/norkystTemperatureAdapter";
import { lngLatToTile } from "./data/adapters/mapboxTerrainAdapter";
import { initXR } from "./xr/XRManager";
import { loadPointFeatures, type AquacultureProperties } from "./data/loaders/geojsonLoader";
import { createPointLayer } from "./scene/PointLayer";
import { createDebugOverlay, createSceneDebugHelpers, pinLatLng } from "./scene/DebugHelpers";
import { dataUrl } from "./utils";

import "./style.css";

const DEBUG = import.meta.env.DEV;

const ANCHOR = { lat: 69.1, lng: 15.7997522, zoom: 7 }; // Vesterålen, Norway
const ELEV_EXAGGERATION = 2;
const MESH_SCALE = 0.00005;
const MAX_ERROR = 20;
const TERRAIN_COUNT = 3;

// ---------------------------------------------------------------------------
// 1. BabylonJS — canvas, WebGL context, render loop
// ---------------------------------------------------------------------------

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const { scene } = createScene(canvas);

const gui2D = AdvancedDynamicTexture.CreateFullscreenUI("ui", true, scene);
const gui3D = new GUI3DManager(scene);

// ---------------------------------------------------------------------------
// 2. Data pipeline
// ---------------------------------------------------------------------------

const adapter = new MapboxTerrainAdapter(
  (import.meta as { env: Record<string, string> }).env.VITE_MAPBOX_TOKEN,
  { debug: DEBUG, depthAdapter: new GeonorgeDepthAdapter() }
);

const terrainData = await adapter.fetchTerrain(ANCHOR);
const geometry = buildGeometry(terrainData, { maxError: MAX_ERROR, elevExaggeration: ELEV_EXAGGERATION });

// ---------------------------------------------------------------------------
// 3. Terrain — original mesh + clones spread side by side
// ---------------------------------------------------------------------------

const terrainMesh = new TerrainMesh(scene);
const groundMesh = terrainMesh.createMesh(geometry, { meshScale: MESH_SCALE });

const terrainMeshes = [groundMesh];
for (let i = 1; i < TERRAIN_COUNT; i++) {
  const clone = groundMesh.clone(`terrain-${i}`);
  if (clone) terrainMeshes.push(clone);
}

const terrainWidth = groundMesh.getBoundingInfo().boundingBox.extendSize.x * 2 * MESH_SCALE;
const terrainStep  = terrainWidth * 1.05; // 5 % gap between tiles
const centerOffset = (TERRAIN_COUNT - 1) / 2;
terrainMeshes.forEach((mesh, i) => {
  mesh.position.x = (i - centerOffset) * terrainStep;
});

// The center terrain sits at x=0 — this is where the ocean/temperature overlays live.
const centerTerrain = terrainMeshes[Math.floor(TERRAIN_COUNT / 2)];

// ---------------------------------------------------------------------------
// 4. Ocean surface — WaterMaterial waves, centered on middle terrain
// ---------------------------------------------------------------------------

const oceanMesh = createOceanSurface(scene, terrainData, {
  meshScale: MESH_SCALE,
  terrainMesh: centerTerrain,
});

// Temperature layer sits just below the wave surface and shows through it.
const { x: tx, y: ty, z: tz } = lngLatToTile(ANCHOR.lng, ANCHOR.lat, ANCHOR.zoom);
const tempGrid = await new NorkystTemperatureAdapter().fetchTemperatureGrid(tx, ty, tz);
if (tempGrid) {
  const tempMesh = new TemperatureLayer().create(scene, terrainData, tempGrid, MESH_SCALE);
  // Add the temperature plane to the water's RTT render lists so its colours
  // also appear in wave reflections and refractions.
  const { WaterMaterial } = await import("@babylonjs/materials/water/waterMaterial");
  if (oceanMesh.material instanceof WaterMaterial) {
    oceanMesh.material.addToRenderList(tempMesh);
  }
}

// ---------------------------------------------------------------------------
// 5. Debug helpers
// ---------------------------------------------------------------------------

if (DEBUG) {
  createSceneDebugHelpers(scene, gui2D, groundMesh);
  createDebugOverlay(gui2D, groundMesh, scene);

  const centre = terrainMesh.meshCenter;
  pinLatLng(centre.lat, centre.lng, terrainMesh, scene, { color: new Color3(1, 1, 1), label: "tile centre" });
  pinLatLng(ANCHOR.lat, ANCHOR.lng, terrainMesh, scene, { color: new Color3(1, 1, 0), label: "ANCHOR" });
  pinLatLng(69.3142957, 16.0601352, terrainMesh, scene, { color: new Color3(1, 0.2, 0.2), label: "Andenes" });
  pinLatLng(68.6938756, 15.3958381, terrainMesh, scene, { color: new Color3(1, 0.2, 0.2), label: "Sortland" });

  console.log("[debug] worldToLatLng(0,0) =", terrainMesh.worldToLatLng(0, 0), "(should match tile centre)");
}

// ---------------------------------------------------------------------------
// 6. WebXR — all terrain tiles usable as floor
// ---------------------------------------------------------------------------

const xrHelper = await initXR(scene, terrainMeshes);
if (xrHelper) {
  xrHelper.baseExperience.onStateChangedObservable.add((state) => {
    if (state === WebXRState.IN_XR) {
      xrHelper.baseExperience.camera.position.y = 1;
    }
  });
}

// ---------------------------------------------------------------------------
// 7. GeoJSON point layer — Norwegian Aquaculture Registry
// ---------------------------------------------------------------------------

const aquacultureFeatures = await loadPointFeatures<AquacultureProperties>(
  dataUrl("Akvakulturregisteret150.geojson")
);
createPointLayer(aquacultureFeatures, terrainMesh, scene, {
  colorFn: (p) =>
    p.status_lokalitet === "KLARERT"
      ? new Color3(0.1, 0.85, 0.2)
      : new Color3(1.0, 0.5, 0.0),
  labelFn: (p) => `${p.navn} · ${p.status_lokalitet}`,
});
console.log(`Loaded ${aquacultureFeatures.length} aquaculture sites`);
