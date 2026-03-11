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
import { buildGeometry } from "./data/TerrainBuilder";
import { initXR } from "./xr/XRManager";
import { loadPointFeatures, type AquacultureProperties } from "./data/loaders/geojsonLoader";
import { createPointLayer } from "./scene/PointLayer";
import { createHolographicPanel } from "./ui/HolographicPanel";
import { createSceneDebugHelpers, pinLatLng } from "./scene/DebugHelpers";
import { dataUrl } from "./utils";

import "./style.css";

const DEBUG = true;

const ANCHOR = { lat: 68.8855387, lng: 15, zoom: 8 }; // Vesterålen, Norway
//const ANCHOR = { lat: 35.3606583, lng: 138.7067638, zoom: 8 }; // Mount Fuji
const ELEV_EXAGGERATION = 1;
// meshScale: zoom-10 tile ≈ 39 km wide; 0.00005 → ~2 m across (table-top)
const MESH_SCALE = 0.00005;
const MAX_ERROR = 20; // RTIN max error in metres — lower = more triangles, higher = more aggressive simplification

// ---------------------------------------------------------------------------
// 1. BabylonJS — owns the canvas, WebGL context (xr-compatible) and render loop
// ---------------------------------------------------------------------------

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const { scene } = createScene(canvas);

// Shared GUI managers — one instance per scene, passed into all UI functions.
const gui2D = AdvancedDynamicTexture.CreateFullscreenUI("ui", true, scene);
const gui3D = new GUI3DManager(scene);

// ---------------------------------------------------------------------------
// 2. Data pipeline — fetch tiles, decode DEM, build RTIN geometry
//    No BabylonJS involved; concrete adapter wired here at the composition root.
// ---------------------------------------------------------------------------

const adapter = new MapboxTerrainAdapter(
  (import.meta as { env: Record<string, string> }).env.VITE_MAPBOX_TOKEN,
  { debug: true }
);

const terrainData = await adapter.fetchTerrain(ANCHOR);
const geometry = buildGeometry(terrainData, { maxError: MAX_ERROR, elevExaggeration: ELEV_EXAGGERATION });

// ---------------------------------------------------------------------------
// 3. Scene — render the geometry as a BabylonJS mesh with satellite texture
// ---------------------------------------------------------------------------

const terrainMesh = new TerrainMesh(scene);
const groundMesh = terrainMesh.createMesh(geometry, { meshScale: MESH_SCALE });
if (DEBUG) {
  createSceneDebugHelpers(scene, gui2D, groundMesh);

  // Tile centre → should appear at the exact mesh centre (world-space 0, y, 0).
  const centre = terrainMesh.meshCenter;
  pinLatLng(centre.lat, centre.lng, terrainMesh, scene, { color: new Color3(1, 1, 1), label: "tile centre" });

  // ANCHOR → the user-supplied reference point; will be offset from centre unless ANCHOR == tile centre.
  pinLatLng(ANCHOR.lat, ANCHOR.lng, terrainMesh, scene, { color: new Color3(1, 1, 0), label: "ANCHOR" });

  // Known landmark — Svolvær harbour, Lofoten (verifiable against satellite imagery).
  pinLatLng(68.2346, 14.5681, terrainMesh, scene, { color: new Color3(1, 0.2, 0.2), label: "Svolvær" });

  console.log("[debug] worldToLatLng(0,0) =", terrainMesh.worldToLatLng(0, 0), "(should match tile centre)");
}

const panelPos = terrainMesh.latLngToScaledWorld(ANCHOR);
// panelPos.y += 0.0; // float above the terrain surface
// panelPos.z += 0.0;
//createHolographicPanel(gui3D, panelPos);

// ---------------------------------------------------------------------------
// 4. WebXR
// ---------------------------------------------------------------------------

const xrHelper = await initXR(scene, groundMesh);
if (xrHelper) {
  // When entering VR, offset the reference space so the user starts above the terrain.
  xrHelper.baseExperience.onStateChangedObservable.add((state) => {
    if (state === WebXRState.IN_XR) {
      xrHelper.baseExperience.camera.position.y = 1;
    }
  });
}

// ---------------------------------------------------------------------------
// 5. GeoJSON point layer — Norwegian Aquaculture Registry
// ---------------------------------------------------------------------------

const aquacultureFeatures = await loadPointFeatures<AquacultureProperties>(
  dataUrl("Akvakulturregisteret150.geojson")
);
createPointLayer(aquacultureFeatures, terrainMesh, scene, {
  // Green for active (KLARERT) sites, orange for others
  colorFn: (p) =>
    p.status_lokalitet === "KLARERT"
      ? new Color3(0.1, 0.85, 0.2)
      : new Color3(1.0, 0.5, 0.0),
});
console.log(`Loaded ${aquacultureFeatures.length} aquaculture sites`);
