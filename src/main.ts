// Side-effect: registers glTF loader
import "@babylonjs/loaders/glTF/2.0";
// Side-effect: patches Scene.prototype.beginAnimation/stopAnimation etc. (required by WebXRDefaultExperience)
import "@babylonjs/core/Animations/animatable";
// Side-effect: registers all Node Material block classes so WebXRDefaultExperience can deserialize
// hand/controller shader snippets downloaded from the Babylon.js snippet server at runtime.
import "@babylonjs/core/Materials/Node/Blocks";

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
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
import { createDebugOverlay } from "./ui/DebugOverlay";
import { createHolographicPanel } from "./ui/HolographicPanel";
import { dataUrl } from "./utils";

import "./style.css";

const ANCHOR = { lat: 68.8855387, lng: 15, altitude: 8.08 }; // Vesterålen, Norway
//const ANCHOR = { lat: 35.3606583, lng: 138.7067638, altitude: 14 }; // Mount Fuji
const ELEV_EXAGGERATION = 1;
// meshScale: zoom-10 tile ≈ 39 km wide; 0.00005 → ~2 m across (table-top)
const MESH_SCALE = 0.00005;
const ZOOM = 8;
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

const terrainData = await adapter.fetchTerrain(ANCHOR, ZOOM);
const geometry = buildGeometry(terrainData, { maxError: MAX_ERROR, elevExaggeration: ELEV_EXAGGERATION });

// ---------------------------------------------------------------------------
// 3. Scene — render the geometry as a BabylonJS mesh with satellite texture
// ---------------------------------------------------------------------------

const terrainMesh = new TerrainMesh(scene);
const groundMesh = terrainMesh.createMesh(geometry, { meshScale: MESH_SCALE });
createDebugOverlay(gui2D, groundMesh);

const panelPos = terrainMesh.latLngToScaledWorld(ANCHOR);
panelPos.y += 0.3; // float above the terrain surface
panelPos.z += 10.6;
createHolographicPanel(gui3D, panelPos);

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

// ---------------------------------------------------------------------------
// 6. Test scene — objects placed at geographic coordinates
// ---------------------------------------------------------------------------

const sphere = CreateSphere("sphere", { diameter: 10 }, scene);
const sphereMat = new StandardMaterial("sphere-material", scene);
sphereMat.diffuseColor = new Color3(0, 0, 1);
sphere.material = sphereMat;
// Start position — will be overwritten by the animation below
sphere.position = terrainMesh.latLngToWorld(ANCHOR);

const box = CreateBox("box", { size: 10 }, scene);
const boxMat = new StandardMaterial("box-material", scene);
boxMat.diffuseColor = new Color3(1, 1, 0);
box.material = boxMat;
box.position = terrainMesh.latLngToWorld({ lat: ANCHOR.lat, lng: ANCHOR.lng, altitude: ANCHOR.altitude + 20 });
box.rotation = new Vector3(Math.PI / 4, Math.PI / 4, 0);

let i = 0;
scene.onBeforeRenderObservable.add(() => {
  sphere.position.x = Math.sin(i) * 50;
  sphere.position.z = Math.cos(i) * 50;
  i += 0.1 * scene.getAnimationRatio();
});
