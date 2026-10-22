# HalfTone Studio

[English](README.md) | [简体中文](README.zh-CN.md)

HalfTone Studio is a browser-based editor for procedural halftone artwork. Combine dot patterns, scalar fields, full-color images, and image contours, then export SVG or PNG artwork or save an editable project.

Image processing, rendering, exports, and project storage happen locally in the browser. There is no backend, and source images are not uploaded.

## Features

- Circle, square, diamond, and custom SVG or transparent PNG pattern cells.
- Uniform, linear, radial, wave, ring, and noise fields, with independent strength and blending.
- Square and staggered grids, with controls for spacing, rotation, size, and tone.
- Reproducible position, rotation, and size variation using a random seed.
- Full-color PNG, JPEG, and WebP image layers with on-canvas movement and resizing.
- Image contours for halftone backings and alpha-clipped overlays.
- Layer reordering, duplication, visibility, opacity, and blending; image locking and export inclusion.
- SVG and PNG export, self-contained JSON projects, autosave, undo, and redo.
- English and Simplified Chinese interfaces, with a saved language preference.
- Collapsible desktop panels, a compact layout for narrow screens, and keyboard navigation.

## Getting Started

Use Node.js 24.x (or Node.js 22.x, version 22.12 or later) and npm.

```sh
npm ci
npm run dev
```

Open the local URL shown in the terminal, normally <http://127.0.0.1:5173/>.

To create a production build:

```sh
npm run build
```

The static site is written to `dist/`. Serve that directory with a static web server. For hosting under a subdirectory, set Vite's base path to match the deployment URL.

## Language

Open **File → Language** and choose **English** or **简体中文**. English is the default. The interface updates immediately without reloading, and the preference is remembered in the same browser for this site.

Menus, controls, tooltips, notifications, errors, presets, and built-in default names follow the selected language. Recognized default names from older projects also display in the selected language without rewriting the saved names. User-defined names and imported filenames retain their original text.

## Workspace and Basic Workflow

1. Choose **Presets**, or use **File → New project**. Applying a preset replaces the current composition and can be undone.
2. Select a layer in the left panel. Its **Fields** section lists only the fields belonging to that layer; use **Add field** to add another.
3. In the inspector's **Selection** tab, adjust **Pattern**, **Grid**, and **Appearance**. Select a field to edit its distribution, strength, and blend mode; use **Back to layer** to return.
4. Expand **Pattern library** to import a custom pattern, or **Random variation** to vary individual cells.
5. Use **Add layer → Image layer** to import source artwork. Optionally create an image contour.
6. Open the inspector's **Canvas** tab to set dimensions, aspect ratio, background color, and transparency.
7. Choose **Export** for SVG or PNG, or **File → Save project** for an editable copy.

Desktop toolbar buttons toggle the layers and inspector panels. On narrow screens, the bottom **Layers**, **Artwork**, and **Inspector** controls switch panels while keeping the artwork above the editing area.

Use Tab to move between controls. With a layer or field selection row focused, Up/Down and Home/End navigate the list. Use **Ctrl/Cmd+Z** to undo and **Ctrl/Cmd+Shift+Z** to redo when focus is outside an input. Dialogs contain keyboard focus and return it to their trigger when closed.

## Saving and Exporting

The editor automatically saves the current project in this browser's local storage and restores it on reopening. This is local to the browser and site address; it is not cloud synchronization. Use **File → Save project** to download a portable `.halftone.json` backup, and **File → Open project** to restore it in another browser or device. Imported assets are embedded in the project.

| Format       | Result                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Project JSON | Editable layers, fields, settings, and embedded assets.                                                                         |
| SVG          | Vector dots and SVG pattern cells; PNG patterns and full-color images remain embedded raster images.                            |
| PNG          | Raster artwork at 1×, 2×, or 4× scale, within export limits. Enable **Canvas → Transparent background** to omit the background. |

Hidden layers are excluded from artwork exports. An image's **Include in export** setting can keep a reference image in the project while omitting it from SVG and PNG. SVG blending can look different in other editors.

## Image Layers

Image layers preserve the source color and alpha channel. When an unlocked image is selected with the selection tool:

- Drag the image to move it.
- Drag an edge handle to stretch its width or height.
- Drag a corner handle to resize proportionally, or hold Shift while dragging an edge.
- Press Escape during resizing to cancel that resize.
- Use the inspector for exact position, dimensions, rotation, opacity, and blending.
- Use **Reset size** to restore the original aspect ratio and canvas-fit dimensions while keeping position and rotation.
- Use **Center image**, **Fit canvas**, or **Fill canvas** to adjust placement.

**Lock image** prevents placement edits. **Include in export** controls whether a visible image appears in artwork exports. Both settings remain part of the saved project.

## Custom Patterns

Expand **Pattern library → Import pattern** to choose an SVG or transparent PNG. SVG cells remain vector-based in SVG exports. PNG cells use their alpha channel as a mask and are tinted with the layer color.

For SVG import, convert text to paths and avoid external images, external style sheets, filters, and unsupported masks. PNG files should have a transparent background unless the entire rectangle is intended to form the pattern.

Use **Trim transparent padding** to crop empty margins. The change applies to all layers using that asset; **Restore** removes the crop.

## Image Contours

Select an image and choose **Create contour layer** to add a pink halftone backing below it. To link an existing halftone layer, expand **Image contour** and select a **Source image**.

- **Outer halo** retains dots inside the silhouette and shrinks surrounding dots across the falloff range. Adjust **Spread** and **Falloff**, and place the image above the dots to reveal the backing. Scalar fields still modulate dot sizes.
- **Clip inside** clips the full pattern to the source image's alpha, preserving partial transparency. Place the dots above the image for an overlay.
- The silhouette follows image translation, rotation, and nonuniform scaling; the dot grid stays anchored to the canvas.
- **Contour offset X/Y** moves the silhouette independently of the image and grid, in canvas pixels. Positive X moves right; positive Y moves down. Offsets apply in both modes, are saved with the project, and default to zero in older projects. Use **Reset contour offset** to reset both axes.
- Hidden or export-excluded source images still supply their alpha. Deleting a source hides its attached dots until the image is relinked or **None** is selected; undo restores the relationship.

Use a transparent PNG or WebP for an irregular silhouette. Opaque images produce a rectangular contour; this feature does not remove backgrounds. Halo distances use a cached approximation capped at 2048 pixels on its longest side, shared by preview and export. SVG halo dots remain vectors; inside mode embeds an alpha image mask.

## Limits and Browser Support

| Item                  | Limit                                                       |
| --------------------- | ----------------------------------------------------------- |
| Canvas                | 64–4096 pixels per side                                     |
| Layers                | 8 total                                                     |
| Fields                | 8 per halftone layer                                        |
| Stored assets         | 32 per project                                              |
| Candidate grid cells  | 50,000                                                      |
| Custom pattern import | 5 MB; PNG patterns also limited to 16 megapixels            |
| Source image import   | 20 MB and 16 megapixels; decoded image size is also checked |
| Project file import   | 64 MB                                                       |
| PNG export            | 8192 pixels per side and 16 megapixels                      |

Image imports also enforce a combined encoded asset budget of 48 MB. If a preview exceeds the cell limit, increase grid spacing or hide layers.

Browser workflows are tested in desktop Chrome and Edge, including compact and touch layouts. Safari and iOS devices have not been verified.

## Development

The application uses React, TypeScript, Vite, and plain CSS. Chrome and Edge must be installed locally to run both browser test projects.

```sh
npm test
npm run test:e2e
npm run build
```

- `npm test` checks generation, random variation, contours, image transforms, project data, and localization.
- `npm run test:e2e` checks editing, persistence, import/export, keyboard behavior, responsive layouts, and language switching. Playwright starts or reuses the local dev server.
- `npm run build` performs TypeScript checks and creates the production bundle.

Generated output such as `dist/`, `test-results/`, Playwright reports, and TypeScript caches is excluded from version control.

## Project Structure

| Path                       | Purpose                                                                   |
| -------------------------- | ------------------------------------------------------------------------- |
| `src/model.ts`             | Project data and presets                                                  |
| `src/engine.ts`            | Halftone geometry generation                                              |
| `src/assets.ts`            | Asset import and preparation                                              |
| `src/contour.ts`           | Image alpha contours and distance calculations                            |
| `src/picture-transform.ts` | Image resizing and transform helpers                                      |
| `src/render.ts`            | Canvas rendering and SVG/PNG export                                       |
| `src/storage.ts`           | Project validation and local persistence                                  |
| `src/main.tsx`             | Editor state and interface                                                |
| `src/ui.tsx`               | Dialogs, file menu, disclosures, and navigation helpers                   |
| `src/style.css`            | Theme, controls, and responsive layouts                                   |
| `src/i18n.ts`              | Language preference, interpolation, errors, and default-name localization |
| `src/messages.ts`          | English message keys and Simplified Chinese translations                  |
| `src/*.test.ts`            | Unit tests                                                                |
| `tests/`                   | Browser workflow tests                                                    |
