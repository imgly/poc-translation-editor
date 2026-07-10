/**
 * Dock Configuration — Translate + Uploads only.
 *
 * Both entries are structured `ly.img.assetLibrary.dock` items with their
 * own `isSelected` predicate (reactive — re-evaluated by CE.SDK on every
 * dock render) and `onClick` that closes other panels before opening
 * its own. This matches the photo starter kit's Crop / Filter / Text /
 * Shapes / Stickers pattern, and ensures exactly one dock item is active
 * at a time.
 *
 * The default `ly.img.assetLibrary.dock` behavior (used when you only
 * supply `entries`) opens the asset library panel without closing other
 * open panels, which lets two dock entries appear active at once.
 * Custom onClick + isSelected fixes that.
 *
 * @see https://img.ly/docs/cesdk/js/user-interface/customization/dock-cb916c/
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

import type { PhotoEditorConfigOpts } from '../plugin';

const ASSET_LIBRARY_PANEL_ID = '//ly.img.panel/assetLibrary';

/**
 * Payload that identifies the Uploads asset-library panel.
 *
 * `ly.img.upload` is the **asset library entry id** (UI layer) that
 * UploadAssetSources binds the `ly.img.image.upload` source to. Using
 * the source id here would render an empty panel without the "Add"
 * button — the asset library only renders upload controls for entries
 * it recognises as upload-enabled.
 */
const UPLOAD_PANEL_PAYLOAD = {
  entries: ['ly.img.upload'],
  title: 'libraries.ly.img.upload.label'
};

export function setupDock(
  cesdk: CreativeEditorSDK,
  translate: PhotoEditorConfigOpts['translate']
): void {
  const { engine, ui } = cesdk;

  engine.editor.setSetting('dock/hideLabels', false);
  engine.editor.setSetting('dock/iconSize', 'large');

  ui.setComponentOrder({ in: 'ly.img.dock' }, [
    {
      id: 'ly.img.assetLibrary.dock',
      key: 'ly.img.translate',
      icon: translate.iconId,
      label: translate.labelKey,
      entries: [],
      isSelected: () => ui.isPanelOpen(translate.panelId),
      onClick: () => {
        if (ui.isPanelOpen(translate.panelId)) {
          ui.closePanel(translate.panelId);
          return;
        }
        ui.closePanel('*');
        ui.openPanel(translate.panelId);
      }
    },
    {
      id: 'ly.img.assetLibrary.dock',
      key: 'ly.img.upload',
      icon: '@imgly/Upload',
      label: 'libraries.ly.img.upload.label',
      entries: UPLOAD_PANEL_PAYLOAD.entries,
      isSelected: () =>
        ui.isPanelOpen(ASSET_LIBRARY_PANEL_ID, {
          payload: UPLOAD_PANEL_PAYLOAD
        }),
      onClick: () => {
        if (
          ui.isPanelOpen(ASSET_LIBRARY_PANEL_ID, {
            payload: UPLOAD_PANEL_PAYLOAD
          })
        ) {
          ui.closePanel(ASSET_LIBRARY_PANEL_ID);
          return;
        }
        ui.closePanel('*');
        ui.openPanel(ASSET_LIBRARY_PANEL_ID, {
          payload: UPLOAD_PANEL_PAYLOAD
        });
      }
    }
  ]);
}
