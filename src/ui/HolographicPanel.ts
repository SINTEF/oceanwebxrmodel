import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Vector2 } from "@babylonjs/core/Maths/math.vector";
import type { GUI3DManager } from "@babylonjs/gui/3D/gui3DManager";
import { HolographicSlate } from "@babylonjs/gui/3D/controls/holographicSlate";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { StackPanel } from "@babylonjs/gui/2D/controls/stackPanel";
import { Control } from "@babylonjs/gui/2D/controls/control";

/**
 * Adds a compact holographic slate to an existing GUI3DManager.
 * The slate is a real 3D object — VR controllers can interact with it without extra code.
 *
 * @param position Scene-space position (use terrainMesh.latLngToScaledWorld for geographic placement).
 */
export function createHolographicPanel(manager: GUI3DManager, position: Vector3): void {
  const slate = new HolographicSlate("info-panel");
  manager.addControl(slate);

  slate.title = "Ocean Model";
  slate.dimensions = new Vector2(0.18, 0.08); // compact: width × height in scene units
  slate.node!.position = position;

  const stack = new StackPanel("stack");
  stack.isVertical = true;
  stack.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  stack.paddingTopInPixels = 8;
  stack.paddingLeftInPixels = 10;

  const addLine = (text: string, fontSize: number, color = "white"): void => {
    const block = new TextBlock();
    block.text = text;
    block.color = color;
    block.fontSize = fontSize;
    block.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    block.heightInPixels = fontSize * 1.6;
    block.resizeToFit = false;
    stack.addControl(block);
  };

  addLine("Vesterålen, Norway", 18);
  addLine("68.9°N  15.1°E", 14, "#a0cfff");
  addLine("Mapbox Terrain-RGB  ·  Zoom 8", 12, "#888888");

  slate.content = stack;
}
