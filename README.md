# Ocean Model — Vesterålen

A 3D interactive ocean and terrain model of the Vesterålen archipelago in northern Norway, built with BabylonJS and Mapbox terrain data. 

Demo can be found at: https://resist.hcilab.no/oceanmodel/

✅ Tested in Brave broweser and in Quest 3.

## Overview

The application renders a table-top scale 3D terrain from Mapbox Terrain-RGB tiles and overlays geographic data such as aquaculture site locations. It supports both standard browser (2D/3D) and WebXR (VR headset) modes.

### Tech stack:
- [Vite](https://vite.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/) — utility-first styling
- [BabylonJS](https://www.babylonjs.com/) v8 — 3D rendering engine + WebXR support
- [Mapbox](https://docs.mapbox.com/) — DEM tiles for terrain elevation and texture
- [Martini RTIN](https://github.com/mapbox/martini) — adaptive mesh simplification from elevation data

### Features

- Real terrain geometry decoded from Mapbox Terrain-RGB DEM tiles with adaptive mesh simplification via
- Satellite texture overlay
- GeoJSON point layer — Norwegian Aquaculture Registry sites (colour-coded by status)
- WebXR support (VR headset with motion controllers)
- Hexagonal/ports-and-adapters architecture (data layer has zero BabylonJS dependency)

## Getting Started

1. Install dependencies:
   ```sh
   npm install
   ```

2. Set up your environment file:
   ```sh
   cp .env.template .env
   ```

3. Add your Mapbox access token to `.env`:
   ```
   VITE_MAPBOX_TOKEN=pk.your_token_here
   ```
   See the [Mapbox access tokens guide](https://docs.mapbox.com/help/dive-deeper/access-tokens/) if you need one.

4. Start the dev server:
   ```sh
   npm run dev
   ```

5. Open the local URL shown in the terminal.

## Build

```sh
npm run build
```

Package and publish the build to cpanel (if ssh is set-up)
```sh
scp -r ./dist/* cpanel:~/public_html/resist/oceanmodel
```

## WebXR

When a compatible VR headset is connected, a "headset" button will appear on the lower right corner, press it to enter VR mode.

### Run localhost on Quest 3 for testing
- Install [Android SDK Platform Tools](https://developer.android.com/studio/releases/platform-tools) to get `adb`
- Connect with USB-C
- Run `adb devices` to see if the device is connected
- Enable port forwarding with `adb reverse tcp:5173 tcp:5173` if `http://localhost:5173`

### Simulate Quest 3 in the browser
Using Immersive Web Emulator ([IWE](https://github.com/meta-quest/immersive-web-emulator))
- Install Chromium-based browser
- Install IWE [browser extension](https://chrome.google.com/webstore/detail/immersive-web-emulator/cgffilbpcibhmcfbgggfhfolhkfbhmik)
- Launch the desktop browser’s developer tool panel
- Navigate to the “WebXR” tab to control the emulated device

## Architecture

```
src/
├── main.ts                              <- composition root only
├── data/
│   ├── types.ts                         <- LatLngAltLike, TerrainData, TerrainGeometry
│   ├── geo.ts                           <- pure coordinate math (no BabylonJS)
│   ├── ports/terrainProvider.ts         <- ITerrainProvider interface
│   ├── adapters/mapboxTerrainAdapter.ts <- Mapbox tile fetch + DEM decode
│   ├── TerrainBuilder.ts                <- Martini RTIN geometry builder
│   └── loaders/geojsonLoader.ts         <- generic GeoJSON point loader
├── scene/
│   ├── SceneManager.ts                  <- Engine + Scene factory
│   ├── TerrainMesh.ts                   <- BabylonJS mesh + coordinate API
│   └── PointLayer.ts                    <- sphere markers for GeoJSON points
├── xr/XRManager.ts                      <- WebXRDefaultExperience setup
└── public/data/
    └── Akvakulturregisteret150.geojson  <- 150 aquaculture sites, Vesterålen
```

**Layer rule:** `data/` never imports BabylonJS. Concrete adapters are wired only in `main.ts`.

### GeoJSON Data

Static data files live in `public/data/` (served by Vite, not bundled).

`Akvakulturregisteret150.geojson` — 150 aquaculture localities from the Norwegian Aquaculture Registry covering the Vesterålen area