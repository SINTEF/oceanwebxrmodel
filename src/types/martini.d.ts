declare module '@mapbox/martini' {
  export default class Martini {
    constructor(gridSize?: number);
    createTile(terrain: Float32Array): {
      getMesh(maxError?: number): { vertices: Uint16Array; triangles: Uint32Array };
    };
  }
}
