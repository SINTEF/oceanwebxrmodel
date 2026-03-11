import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { AxesViewer } from "@babylonjs/core/Debug/axesViewer";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { GridMaterial } from "@babylonjs/materials/grid/gridMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { Control } from "@babylonjs/gui/2D/controls/control";

/**
 * Adds a top-left debug label to an existing fullscreen GUI texture.
 * Updates FPS each frame via scene.onAfterRenderObservable.
 */
export function createDebugOverlay(ui: AdvancedDynamicTexture, terrainMesh: Mesh, scene: Scene): void {
  const triangleCount = terrainMesh.getTotalIndices() / 3;

  const bg = new Rectangle("debug-bg");
  bg.width = "200px";
  bg.height = "52px";
  bg.cornerRadius = 4;
  bg.color = "transparent";
  bg.background = "rgba(0,0,0,0.5)";
  bg.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  bg.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  bg.left = "12px";
  bg.top = "12px";
  ui.addControl(bg);

  const triLabel = new TextBlock("debug-tri", `Triangles: ${triangleCount.toLocaleString()}\nSize: `);
  triLabel.color = "white";
  triLabel.fontSize = 13;
  triLabel.fontFamily = "monospace";
  triLabel.top = "-9px";
  bg.addControl(triLabel);

  const fpsLabel = new TextBlock("debug-fps", "FPS: --");
  fpsLabel.color = "white";
  fpsLabel.fontSize = 13;
  fpsLabel.fontFamily = "monospace";
  fpsLabel.top = "9px";
  bg.addControl(fpsLabel);

  scene.onAfterRenderObservable.add(() => {
    fpsLabel.text = `FPS: ${scene.getEngine().getFps().toFixed(0)}`;
  });
}

/**
 * Adds all debug helpers: HUD overlay, world-origin axes, and an XZ grid.
 * Only call this when DEBUG is true — these meshes are never disposed.
 */
export function createSceneDebugHelpers(scene: Scene, ui: AdvancedDynamicTexture, terrainMesh: Mesh): void {
  createDebugOverlay(ui, terrainMesh, scene);

  // Grid: 100×100 cells, each cell is 0.1 units wide → total extent is 10 units.
  const cellSize = 0.1;
  const divisions = 50;
  const gridSize = cellSize * divisions;

  // X = red (east), Y = green (up), Z = blue (north)
  new AxesViewer(scene, 0.25);

  // GridMaterial renders the grid procedurally in a shader — a single plane mesh,
  // far cheaper than thousands of line segments.
  const ground = CreateGround("debug-grid", { width: gridSize, height: gridSize }, scene);
  const mat = new GridMaterial("debug-grid-mat", scene);
  mat.gridRatio = cellSize;
  mat.mainColor = new Color3(0.2, 0.2, 0.2);
  mat.lineColor = new Color3(0.6, 0.6, 0.6);
  mat.opacity = 0.7;
  mat.backFaceCulling = false;
  // Render in group 1 so it always draws on top of terrain (group 0), eliminating z-fighting.
  ground.renderingGroupId = 1;
  ground.material = mat;
}
