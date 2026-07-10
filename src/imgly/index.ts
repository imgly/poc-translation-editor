/**
 * CE.SDK Photo Translate Demo - Initialization Module
 *
 * This module provides the main entry point for initializing the editor.
 * Import and call `initPhotoEditor()` to configure a CE.SDK instance with
 * the photo editor UI, background removal, and the custom Translate plugin.
 *
 * Scene loading is the caller's responsibility (src/index.ts uses the
 * upload-screen helper `loadImageIntoScene`).
 *
 * @see https://img.ly/docs/cesdk/js/get-started/overview-e18f40/
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

import {
  BlurAssetSource,
  ImageColorsAssetSource,
  ColorPaletteAssetSource,
  CropPresetsAssetSource,
  EffectsAssetSource,
  FiltersAssetSource,
  PagePresetsAssetSource,
  StickerAssetSource,
  TextAssetSource,
  TextComponentAssetSource,
  TypefaceAssetSource,
  UploadAssetSources,
  VectorShapeAssetSource
} from '@cesdk/cesdk-js/plugins';

import { PhotoEditorConfig } from '../../photo-editor/plugin';
import { setupBackgroundRemovalPlugin } from './plugins/background-removal';
import { setupTranslatePlugin } from './plugins/translate';
import type { TranslatePipeline } from './plugins/translate';
import { DEFAULT_GATEWAY_URL, FALLBACK_FONT_URI } from './plugins/translate/providers';

export { PhotoEditorConfig } from '../../photo-editor/plugin';
export { setupBackgroundRemovalPlugin } from './plugins/background-removal';

export interface InitPhotoEditorOpts {
  /** Click handler for the navigation-bar Back button. */
  onBack: () => void;
  /** Pipeline chosen on the upload screen. */
  pipeline: TranslatePipeline;
}

/**
 * Initialize the CE.SDK Photo Editor with this demo's configuration.
 *
 * @param cesdk - The CreativeEditorSDK instance to configure
 * @param opts.onBack - Back-button handler (returns to the upload screen)
 */
export async function initPhotoEditor(
  cesdk: CreativeEditorSDK,
  opts: InitPhotoEditorOpts
): Promise<void> {
  // Missing-glyph fallback: translated Russian/Chinese text uses characters that
  // the scene's embedded (Latin-subset) fonts don't contain. Without a fallback
  // the engine renders those as tofu. Set unconditionally — harmless for the
  // Direct pipeline (no editable text blocks) — and the font is fetched lazily by
  // the engine only when a missing glyph is first encountered. See FALLBACK_FONT_URI.
  cesdk.engine.editor.setSettingString('fallbackFontUri', FALLBACK_FONT_URI);

  // Configuration plugin (dock, navigation bar, features, etc.).
  await cesdk.addPlugin(new PhotoEditorConfig({ onBack: opts.onBack }));

  // Background removal (works on the loaded photo).
  setupBackgroundRemovalPlugin(cesdk);

  // Translate plugin (dock entry + panel + AI gateway credentials). The
  // API key is resolved inside the plugin via credentials.ts (env key
  // seeded by src/index.ts, or a user-pasted key from onboarding).
  const gatewayUrl =
    import.meta.env.VITE_AI_GATEWAY_URL ?? DEFAULT_GATEWAY_URL;
  setupTranslatePlugin(cesdk, { gatewayUrl, pipeline: opts.pipeline });

  // Asset source plugins.
  //
  // UploadAssetSources is added FIRST so the Uploads dock entry's
  // `ly.img.upload` library entry is bound to the `ly.img.image.upload`
  // source before the user can click the dock. The other plugins fetch
  // CDN JSON in their initialize() — registering them after means the
  // dock isn't waiting on those network round-trips to enable uploads.
  await cesdk.addPlugin(
    new UploadAssetSources({ include: ['ly.img.image.upload'] })
  );

  // Remaining asset source plugins — same set as the photo starter kit.
  // These power inspector tools (Filters / Effects / Crop / etc.).
  await cesdk.addPlugin(new BlurAssetSource());
  await cesdk.addPlugin(new ImageColorsAssetSource());
  await cesdk.addPlugin(new ColorPaletteAssetSource());
  await cesdk.addPlugin(new CropPresetsAssetSource());
  await cesdk.addPlugin(new EffectsAssetSource());
  await cesdk.addPlugin(new FiltersAssetSource());
  await cesdk.addPlugin(new PagePresetsAssetSource());
  await cesdk.addPlugin(new StickerAssetSource());
  await cesdk.addPlugin(new TextAssetSource());
  await cesdk.addPlugin(new TextComponentAssetSource());
  await cesdk.addPlugin(new TypefaceAssetSource());
  await cesdk.addPlugin(new VectorShapeAssetSource());
}
