# HalfTone Studio

HalfTone Studio is a browser-based tool for creating procedural halftone artwork. It supports built-in dot shapes, custom pattern cells, layered scalar fields, image layers, deterministic random variation, and SVG or PNG export.

All image processing and project storage happen locally in the browser. The application has no backend and does not upload source images.

## Features

- Generate circle, square, and diamond patterns.
- Import custom pattern cells from SVG or transparent PNG files.
- Combine uniform, linear, radial, wave, ring, and noise fields.
- Use square or staggered grids with independent spacing and rotation.
- Add seeded position, rotation, and size variation to each pattern cell.
- Add full-color PNG, JPEG, or WebP image layers.
- Move, rotate, stretch, and proportionally resize image layers on the canvas.
- Reset an image to its original aspect ratio and canvas-fit size.
- Reorder, duplicate, hide, lock, and blend layers.
- Export artwork as SVG or transparent PNG at 1x, 2x, or 4x scale.
- Save and reopen self-contained JSON project files.
- Undo and redo edits, with automatic local browser storage.

## Getting Started

Node.js 22.12 or newer and npm are recommended.

```sh
npm install
npm run dev
```

Open the local URL shown in the terminal. The default address is <http://127.0.0.1:5173/>.

To create a production build:

```sh
npm run build
```

The generated static site is written to `dist/` and can be served by any static web server.

## Basic Workflow

1. Start with a preset or create a new project.
2. Select a halftone layer and configure its pattern, grid, size, color, and fields.
3. Import an SVG or transparent PNG to use a custom repeating pattern.
4. Enable random variation when individual pattern instances need more visual variety.
5. Add image layers to preview the halftone with source artwork or a background.
6. Export the result as SVG or PNG, or save the editable project as JSON.

## Image Layers

Image layers preserve their original color and alpha channel. They do not participate in halftone generation and can be excluded from the final export.

When an unlocked image layer is selected:

- Drag the image to move it.
- Drag a side handle to change width or height.
- Drag a corner handle to resize proportionally.
- Hold Shift while dragging a side handle to resize proportionally.
- Press Escape during a drag to restore the previous size.
- Use the inspector for exact position, dimensions, rotation, opacity, and blending.
- Use **Reset Size** to restore the original aspect ratio and canvas-fit dimensions while keeping the current position and rotation.

Imported images are stored inside the project file, so reopening a project does not require the original files.

## Custom Patterns

SVG pattern cells remain vector-based in SVG exports. Transparent PNG cells use their alpha channel as a mask and are tinted with the layer color.

For predictable SVG import results, convert text to paths and avoid external images, external style sheets, filters, and unsupported masks. PNG files should already have a transparent background when the rectangular image area is not intended to become part of the pattern.

## Limits

- Canvas dimensions: 64 to 4096 pixels per side.
- Maximum combined layer count: 8.
- Maximum scalar fields per halftone layer: 8.
- Maximum stored assets per project: 32.
- Maximum candidate grid cells: 50,000.
- Maximum custom pattern file size: 5 MB.
- Maximum source image size: 20 MB and 16 megapixels.
- Maximum PNG export size: 8192 pixels on the longest side and 16 megapixels.

The editor is designed primarily for current desktop versions of Chrome and Edge.

## Development

```sh
npm test
npm run test:e2e
npm run build
```

- `npm test` runs the unit tests for generation, random variation, image transforms, and project data.
- `npm run test:e2e` runs the browser workflows in locally installed Chrome and Edge.
- `npm run build` performs TypeScript checks and creates the production bundle.

Generated files such as `dist/`, `test-results/`, Playwright reports, and TypeScript build caches are excluded from version control.

## Project Structure

- `src/model.ts` defines project data and presets.
- `src/engine.ts` generates halftone instances.
- `src/assets.ts` imports and prepares user assets.
- `src/render.ts` renders the canvas and export files.
- `src/storage.ts` validates and stores projects.
- `src/main.tsx` implements the editor interface.
- `tests/` contains browser-level workflow tests.
