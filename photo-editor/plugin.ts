/**
 * Photo Editor Plugin - Complete Photo Editing Configuration for CE.SDK
 *
 * This plugin provides a production-ready photo editor configuration optimized
 * for single-image editing with crop, adjustments, filters, and effects.
 *
 * @example Basic usage
 * ```typescript
 * import CreativeEditorSDK from '@cesdk/cesdk-js';
 * import { PhotoEditorConfig } from './plugin';
 *
 * const cesdk = await CreativeEditorSDK.create('#editor', config);
 * await cesdk.addPlugin(new PhotoEditorConfig({ onBack: () => {} }));
 * ```
 *
 * @see https://img.ly/docs/cesdk/js/user-interface/customization/disable-or-enable-f058e2/
 * @see https://img.ly/docs/cesdk/js/configuration-2c1c3d/
 */

import type { EditorPlugin, EditorPluginContext } from '@cesdk/cesdk-js';
import CreativeEditorSDK from '@cesdk/cesdk-js';

import { setupActions } from './actions';
import { setupFeatures } from './features';
import { setupTranslations } from './i18n';
import { setupSettings } from './settings';
import { setupUI } from './ui';

export interface PhotoEditorConfigOpts {
  /** Handler for the navigation-bar Back button. */
  onBack: () => void;
  /**
   * Dock entry for the host app's translate panel. Passed in (rather than
   * imported from the translate plugin) so this config layer stays free of
   * dependencies on app code and can be reused as-is.
   */
  translate: {
    /** Icon id registered by the translate plugin's icon set. */
    iconId: string;
    /** Panel id the dock entry opens/closes. */
    panelId: string;
    /** i18n key for the dock entry label. */
    labelKey: string;
  };
}

/**
 * Photo Editor configuration plugin.
 *
 * @public
 */
export class PhotoEditorConfig implements EditorPlugin {
  name = 'cesdk-photo-editor';
  version = CreativeEditorSDK.version;

  private opts: PhotoEditorConfigOpts;

  constructor(opts: PhotoEditorConfigOpts) {
    this.opts = opts;
  }

  async initialize(ctx: EditorPluginContext) {
    const { cesdk, engine } = ctx;
    if (cesdk) {
      cesdk.resetEditor();
      setupFeatures(cesdk);
      setupUI(cesdk, this.opts);
      setupActions(cesdk);
      setupTranslations(cesdk);
      setupSettings(engine);
      // Intentional backward-compat shim.
      cesdk.reapplyLegacyUserConfiguration();
    }
  }
}
