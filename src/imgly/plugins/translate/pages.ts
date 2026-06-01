/**
 * Scene mutation helpers for the Translate feature.
 *
 * Pure CE.SDK side: takes a Blob, builds a new page containing only that
 * image. Knows nothing about LLMs or HTTP.
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

type Engine = CreativeEditorSDK['engine'];

/** Position and size of an image block on its page, in the design unit. */
export interface ImagePlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface InsertImagePageArgs {
  engine: Engine;
  /** Parent that holds the page order (page stack / scene root). */
  parent: number;
  /** Position among `parent`'s children; 0 prepends as the first page. */
  index: number;
  /** Page name shown in the page list. */
  label: string;
  /** Image bytes to place on the page. */
  blob: Blob;
  /** Page dimensions, in the scene's design unit. */
  width: number;
  height: number;
  /**
   * Position and size of the image block on the page. Defaults to
   * full-bleed (origin, page-sized) when omitted.
   */
  placement?: ImagePlacement;
}

/**
 * Build a page that holds a single image block and insert it at `index`
 * among `parent`'s children. The page → graphic-block-with-image-fill shape
 * matches the upload flow's `loadImageIntoScene`, so every image page in the
 * document shares one structure.
 *
 * The bytes are staged as a transient `buffer://` URI: these live inside the
 * running engine but are NOT serialized into scene exports / saves. If the
 * user saves and reloads, the image fills will be broken. For a starter-kit
 * demo this is acceptable; to persist, upload the blob to a CDN and
 * substitute an `https://` URI here.
 *
 * Caller owns the `engine.editor.addUndoStep()`.
 *
 * @returns the created page and image-block ids, so callers can position them.
 */
export async function insertImagePage(
  args: InsertImagePageArgs
): Promise<{ page: number; imageBlock: number }> {
  const { engine, parent, index, label, blob, width, height } = args;
  const placement = args.placement ?? { x: 0, y: 0, width, height };

  // CE.SDK 1.75.x: createBuffer() is the correct method (not createBufferURI).
  // setBufferData requires an offset argument; there is no setMimeType on the
  // editor namespace — MIME type is inferred from the buffer content.
  const bufferUri = engine.editor.createBuffer();
  const arrayBuffer = await blob.arrayBuffer();
  engine.editor.setBufferData(bufferUri, 0, new Uint8Array(arrayBuffer));

  const page = engine.block.create('page');
  engine.block.setName(page, label);
  engine.block.setWidth(page, width);
  engine.block.setHeight(page, height);
  engine.block.insertChild(parent, page, index);

  const imageBlock = engine.block.create('graphic');
  engine.block.setShape(imageBlock, engine.block.createShape('rect'));
  const fill = engine.block.createFill('image');
  engine.block.setSourceSet(fill, 'fill/image/sourceSet', [
    { uri: bufferUri, width: placement.width, height: placement.height }
  ]);
  engine.block.setFill(imageBlock, fill);

  // Pin absolute pixel coordinates (CE.SDK's default for graphic blocks
  // today, but pinning removes any silent breakage on future versions).
  engine.block.setPositionXMode(imageBlock, 'Absolute');
  engine.block.setPositionYMode(imageBlock, 'Absolute');
  engine.block.setWidthMode(imageBlock, 'Absolute');
  engine.block.setHeightMode(imageBlock, 'Absolute');
  engine.block.setPositionX(imageBlock, placement.x);
  engine.block.setPositionY(imageBlock, placement.y);
  engine.block.setWidth(imageBlock, placement.width);
  engine.block.setHeight(imageBlock, placement.height);

  engine.block.appendChild(page, imageBlock);

  return { page, imageBlock };
}

export interface AppendTranslatedPageArgs {
  cesdk: CreativeEditorSDK;
  /** Page that contains `sourceBlockId`. Sets the new page's dimensions. */
  sourcePageId: number;
  /** Source image block. Sets the new image block's position and size. */
  sourceBlockId: number;
  translated: Blob;
  /** Used as the new page's name (e.g. "German"). */
  label: string;
}

/**
 * Append a new page (after the existing pages) in the same scene as
 * `sourcePageId`, matching its dimensions, with one image block whose
 * position and size mirror those of `sourceBlockId` on the original page —
 * so the translated image lands at the exact same spot rather than being
 * stretched to fill the page.
 *
 * Caller is responsible for `engine.editor.addUndoStep()` after batching
 * multiple appends — we don't add one per page.
 */
export async function appendTranslatedPage(
  args: AppendTranslatedPageArgs
): Promise<void> {
  const { cesdk, sourcePageId, sourceBlockId, translated, label } = args;
  const engine = cesdk.engine;

  const parent = engine.block.getParent(sourcePageId);
  if (parent == null) {
    throw new Error('Source page has no parent — cannot append new page.');
  }

  await insertImagePage({
    engine,
    parent,
    // Append after the existing pages so the new page lands last in order.
    index: engine.block.getChildren(parent).length,
    label,
    blob: translated,
    width: engine.block.getFrameWidth(sourcePageId),
    height: engine.block.getFrameHeight(sourcePageId),
    placement: {
      x: engine.block.getFrameX(sourceBlockId),
      y: engine.block.getFrameY(sourceBlockId),
      width: engine.block.getFrameWidth(sourceBlockId),
      height: engine.block.getFrameHeight(sourceBlockId)
    }
  });
}
