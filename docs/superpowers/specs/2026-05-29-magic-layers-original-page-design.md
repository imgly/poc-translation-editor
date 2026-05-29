# Magic Layers: prepend flat original-image page

## Goal

Let the user see the untouched original image side-by-side with the
layerized and translated results. Change the Magic Layers output order to:

1. `Original` — flat source image (un-layerized)
2. `Original (Layers)` — editable layerized scene (the model's scene, page 1 today)
3. … — translated layerized pages, one per language (`German`, `French`, …)

## Why

Today page 1 is the layerized "Original"; there is no flat reference image to
compare the translations against. `engine.scene.loadFromArchiveURL` replaces the
active document, so the source-image page the user started from is destroyed when
the layerized scene loads. We already hold the original bytes (`sourceBlob`,
read in Phase 1 for the gateway upload), so we rebuild a flat-image page from
those bytes after the scene loads and insert it at the front.

## Changes — all in `src/imgly/plugins/translate/magicLayers.ts` + `pages.ts`

1. **Hoist `sourceBlob`** out of the Phase 1 `try` block so Phase 2 can reuse the
   original bytes.

2. **Phase 2**: rename the model's first page to `Original (Layers)` (was
   `Original`). After it is identified, build a flat-image page from `sourceBlob`,
   sized to that page's frame width/height, and insert it at index 0 of the page
   parent (`engine.block.insertChild(parent, newPage, 0)`). Name it `Original`.

3. **Extract a helper** in `pages.ts` for building an image page (page + single
   graphic block, rect shape, image fill from a `buffer://` URI covering the
   page) so the source-image-page construction reuses the existing structure
   shared by `appendTranslatedPage` / `loadImageIntoScene`.

## Decisions

- The flat image is **stretched to the layerized page dimensions**. Since the
  layerized scene derives from the same image, aspect ratios should match; minor
  distortion if the model returns a differently-proportioned page is acceptable.
- The `Original` + `Original (Layers)` pages are shown **even if all translations
  fail** — they are still useful on their own.

## Error handling / undo

- The flat-page build runs inside the existing Phase 2 `try`; failures surface
  via the existing "could not build the translated scene" notification.
- The original-page insert and translated-page additions remain covered by the
  single existing `engine.editor.addUndoStep()`.
