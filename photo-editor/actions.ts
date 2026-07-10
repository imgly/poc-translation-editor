/**
 * Photo Editor Actions Configuration - Override Default Actions and Add Custom Actions
 *
 * This file shows how to override CE.SDK's default actions with your own
 * implementations, and how to register custom actions specifically for photo editing.
 *
 * ## Actions API
 *
 * The Actions API allows you to register custom handlers that can be triggered from
 * the UI or programmatically. Actions are the primary way to extend CE.SDK functionality.
 *
 * - `cesdk.actions.register(id, handler)` - Register or override an action
 * - `cesdk.actions.run(id, ...args)` - Execute an action (async, throws if not found)
 * - `cesdk.actions.get(id)` - Get action handler (returns undefined if not found)
 * - `cesdk.actions.list()` - List all registered action IDs
 *
 * ## Built-in Utility Functions
 *
 * CE.SDK provides utilities for common operations that you can use in your actions:
 *
 * - `cesdk.utils.export(options)` - Export current design to various formats
 *   - Options: mimeType, targetWidth, targetHeight, jpegQuality, pngCompressionLevel
 *   - Returns: { blobs: Blob[], options: ExportOptions }
 *
 * - `cesdk.utils.downloadFile(data, mimeType, filename?)` - Trigger browser file download
 *   - data: Blob, string, or ArrayBuffer
 *   - mimeType: MIME type (e.g., 'image/png', 'application/json')
 *   - filename: Optional filename (auto-generated if not provided)
 *
 * - `cesdk.utils.loadFile(options)` - Open browser file picker
 *   - Options: accept (file extensions), returnType ('text', 'arrayBuffer', 'objectURL')
 *   - Returns: Promise<string | ArrayBuffer | string> based on returnType
 *
 * - `cesdk.utils.localUpload(file, context)` - Create local blob URL for uploads
 *   - file: File object from input or drag-drop
 *   - context: Upload context ('image', 'video', 'audio', etc.)
 *   - Returns: Promise<string> - Blob URL that can be used with engine
 *
 * @see https://img.ly/docs/cesdk/js/actions-6ch24x
 * @see https://img.ly/docs/cesdk/js/export-save-publish/export/overview-9ed3a8/
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

/**
 * Register actions for the photo editor.
 *
 * This function overrides default CE.SDK actions and registers custom actions
 * for photo editing workflows. Actions can be triggered from the UI (via buttons,
 * menu items) or programmatically via `cesdk.actions.run()`.
 *
 * @param cesdk - The CreativeEditorSDK instance to configure
 *
 * @example Running actions programmatically
 * ```typescript
 * await cesdk.actions.run('exportDesign', { mimeType: 'image/png' });
 * await cesdk.actions.run('zoom.toPage', { page: 'current' });
 * ```
 *
 * @example Integrating with backend
 * ```typescript
 * // Override export to send to your backend
 * cesdk.actions.register('exportDesign', async (exportOptions) => {
 *   const { blobs, options } = await cesdk.utils.export(exportOptions);
 *   const formData = new FormData();
 *   formData.append('image', blobs[0], 'edited-photo.png');
 *
 *   const response = await fetch('/api/upload', {
 *     method: 'POST',
 *     body: formData
 *   });
 *
 *   const { url } = await response.json();
 *   console.log('Uploaded to:', url);
 * });
 * ```
 */
export function setupActions(cesdk: CreativeEditorSDK): void {
  // Export the edited photo as PNG, JPEG, or other formats.
  // This overrides the default export action to use browser download;
  // triggered by the export button in the navigation bar
  // (see photo-editor/ui/navigationBar.ts).
  cesdk.actions.register('exportDesign', async (exportOptions) => {
    // Export with specified options (mimeType, targetWidth, targetHeight, etc.)
    const { blobs, options } = await cesdk.utils.export(exportOptions);

    // Trigger browser download
    await cesdk.utils.downloadFile(blobs[0], options.mimeType);
  });
}
