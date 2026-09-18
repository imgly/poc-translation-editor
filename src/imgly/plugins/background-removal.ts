/**
 * Background Removal Plugin
 *
 * Adds AI-powered background removal using @imgly/background-removal.
 * Creates an "Apps" dock entry with the remove background action.
 *
 * ## Installation
 *
 * ```bash
 * npm install @imgly/background-removal onnxruntime-web
 * ```
 *
 * ## Usage
 *
 * ```typescript
 * import { setupBackgroundRemovalPlugin } from './plugins/background-removal';
 *
 * // After cesdk initialization
 * setupBackgroundRemovalPlugin(cesdk);
 * ```
 *
 * @see https://img.ly/docs/cesdk/js/edit-image/remove-bg-9dfcf7/
 */

import type { AssetDefinition, CreativeEngine } from '@cesdk/cesdk-js';
import type CreativeEditorSDK from '@cesdk/cesdk-js';
import { removeBackground } from '@imgly/background-removal';
import { resolveAssetPath } from '../resolveAssetPath';

const SOURCE_ID = 'ly.img.apps';

/**
 * Sets up the background removal plugin with Apps dock entry.
 *
 * @param cesdk - The CreativeEditorSDK instance
 */
export function setupBackgroundRemovalPlugin(cesdk: CreativeEditorSDK): void {
  const engine = cesdk.engine;

  // Add translations
  cesdk.i18n.setTranslations({
    en: {
      'libraries.ly.img.apps.label': 'Apps'
    }
  });

  // Register asset source with apply handler
  engine.asset.addLocalSource(SOURCE_ID, undefined, async (asset) => {
    if (asset.id === 'remove-bg') {
      await applyBackgroundRemoval(cesdk);
    }
    return undefined;
  });

  // Define the remove background asset
  const removeBackgroundAsset: AssetDefinition = {
    id: 'remove-bg',
    label: { en: 'Remove Background' },
    meta: {
      width: 80,
      height: 120,
      thumbUri: resolveAssetPath('/assets/remove-bg.png')
    }
  };

  engine.asset.addAssetToSource(SOURCE_ID, removeBackgroundAsset);

  // Configure asset library entry
  cesdk.ui.addAssetLibraryEntry({
    id: 'ly.img.apps',
    sourceIds: ['ly.img.apps'],
    previewLength: 3,
    gridColumns: 3,
    gridItemHeight: 'auto',
    previewBackgroundType: 'contain',
    gridBackgroundType: 'cover',
    cardLabel: (assetResult) => assetResult.label,
    cardLabelPosition: () => 'below'
  });

  // Add Apps button to dock
  cesdk.ui.insertOrderComponent({ in: 'ly.img.dock' }, [
    'ly.img.spacer',
    {
      id: 'ly.img.assetLibrary.dock',
      key: 'ly.img.apps',
      icon: '@imgly/Apps',
      label: 'libraries.ly.img.apps.label',
      entries: ['ly.img.apps']
    }
  ]);
}

/**
 * True if the engine is still alive and the block still exists. Used after
 * awaits: the user may delete the block, or dispose the whole engine via
 * the Back button, while the removal model is running (isValid itself
 * throws on a disposed engine, hence the try/catch).
 */
function blockStillValid(engine: CreativeEngine, block: number): boolean {
  try {
    return engine.block.isValid(block);
  } catch {
    return false;
  }
}

/**
 * Converts buffer:// URI to Blob for processing.
 */
async function convertUriToBlob(
  uri: string,
  engine: CreativeEngine
): Promise<string | Blob> {
  if (uri.startsWith('buffer://')) {
    const mimeType = await engine.editor.getMimeType(uri);
    const bufferLength = engine.editor.getBufferLength(uri);
    const bufferData = engine.editor.getBufferData(uri, 0, bufferLength);
    return new Blob([bufferData as BlobPart], { type: mimeType });
  }
  return uri;
}

/**
 * Applies background removal to the selected image block.
 */
async function applyBackgroundRemoval(cesdk: CreativeEditorSDK): Promise<void> {
  const engine = cesdk.engine;

  // 1. Check selection - must have exactly one block selected
  const selectedBlocks = engine.block.findAllSelected();

  if (selectedBlocks.length === 0) {
    cesdk.ui.showNotification({
      type: 'error',
      message: 'Please select an image block',
      duration: 'medium'
    });
    return;
  }

  if (selectedBlocks.length > 1) {
    cesdk.ui.showNotification({
      type: 'error',
      message: 'Please select only one block',
      duration: 'medium'
    });
    return;
  }

  const block = selectedBlocks[0];

  // Already removing on this block (first run also downloads the ONNX
  // model, which takes a while) — a second click would start a second
  // concurrent removal racing the first one's setSourceSet.
  if (engine.block.getState(block).type === 'Pending') {
    return;
  }

  // 2. Check if block supports fill
  if (!engine.block.supportsFill(block)) {
    cesdk.ui.showNotification({
      type: 'error',
      message: 'Selected block does not support fills',
      duration: 'medium'
    });
    return;
  }

  const fill = engine.block.getFill(block);

  // 3. Check if fill is an image fill
  const fillType = engine.block.isValid(fill)
    ? engine.block.getType(fill)
    : null;
  if (fillType !== '//ly.img.ubq/fill/image') {
    cesdk.ui.showNotification({
      type: 'error',
      message: 'Selected block is not an image',
      duration: 'medium'
    });
    return;
  }

  // Get image URI
  const sourceSet = engine.block.getSourceSet(fill, 'fill/image/sourceSet');
  const imageUri =
    sourceSet?.[0]?.uri ||
    engine.block.getString(fill, 'fill/image/imageFileURI');

  if (!imageUri) {
    cesdk.ui.showNotification({
      type: 'error',
      message: 'No image found in selection',
      duration: 'medium'
    });
    return;
  }

  // Show loading state
  engine.block.setState(block, { type: 'Pending', progress: 0 });

  try {
    const imageInput = await convertUriToBlob(imageUri, engine);
    const removedBackgroundBlob = await removeBackground(imageInput);

    // The block may be gone by now: deleted by the user, or the whole
    // engine disposed via the Back button while the model was running.
    if (!blockStillValid(engine, block)) return;

    // NOTE: this object URL is intentionally never revoked — the undo
    // stack may restore the fill that references it at any later point.
    // Acceptable for this demo (one leak per removal); a production app
    // would track URLs and revoke them when the scene is torn down.
    const newImageUri = URL.createObjectURL(removedBackgroundBlob);

    // Update image
    if (sourceSet && sourceSet.length > 0) {
      engine.block.setSourceSet(fill, 'fill/image/sourceSet', [
        { ...sourceSet[0], uri: newImageUri }
      ]);
    } else {
      engine.block.setString(fill, 'fill/image/imageFileURI', newImageUri);
    }

    engine.block.setState(block, { type: 'Ready' });
    engine.editor.addUndoStep();
  } catch (error) {
    console.error('Failed to remove background:', error);
    // Block deleted / engine disposed mid-run: nothing left to reset or
    // notify — the editor this notification belonged to is gone.
    if (!blockStillValid(engine, block)) return;
    engine.block.setState(block, { type: 'Ready' });
    cesdk.ui.showNotification({
      type: 'error',
      message: 'Failed to remove background',
      duration: 'medium'
    });
  }
}
