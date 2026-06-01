/**
 * CE.SDK Photo Translate Demo — Main Entry Point
 *
 * State machine:
 *   no API key  → onboarding screen
 *   API key set → upload screen → editor (with the uploaded image loaded,
 *                                          selected, Translate panel open)
 *
 * Reload re-enters the state machine from the top; the upload screen is the
 * editor's entry point, and there is no persistence.
 */

import CreativeEditorSDK from '@cesdk/cesdk-js';

import { initPhotoEditor } from './imgly';
import {
  findFirstImageBlockOnFirstPage,
  getApiKey,
  renderOnboardingScreen,
  setConfiguredApiKey,
  TRANSLATE_PANEL_ID
} from './imgly/plugins/translate';
import type { TranslatePipeline } from './imgly/plugins/translate';
import {
  loadImageIntoScene,
  renderUploadScreen
} from './imgly/plugins/upload';

setConfiguredApiKey(import.meta.env.VITE_AI_API_KEY ?? '');

// CE.SDK's create() rejects WITHOUT handing back the half-started engine, so a
// failed init leaves a render/retry loop running that we cannot dispose() — it
// pegs the CPU (fans spin). A full page reload is the only reliable teardown.
// We stash the error across the reload so the next bootstrap can explain what
// failed instead of silently looping.
const INIT_ERROR_STORAGE = 'imgly.translate-demo.initError';

function reportInitFailureAndReload(detail: string): void {
  try {
    window.sessionStorage.setItem(INIT_ERROR_STORAGE, detail);
  } catch {
    // sessionStorage unavailable (private mode / quota): reload anyway — the
    // license screen still renders afterwards, just without the detail text.
  }
  window.location.reload();
}

function consumeInitError(): string | null {
  try {
    const detail = window.sessionStorage.getItem(INIT_ERROR_STORAGE);
    if (detail != null) window.sessionStorage.removeItem(INIT_ERROR_STORAGE);
    return detail;
  } catch {
    return null;
  }
}

/** Guards against stacking engines if Continue is clicked more than once. */
let editorMounting = false;

const container = document.querySelector<HTMLDivElement>('#cesdk_container');
if (!container) {
  console.error('No #cesdk_container element found.');
} else {
  showCurrentScreen(container);
}

function showCurrentScreen(root: HTMLDivElement): void {
  // A previous editor init failed and we reloaded to kill the spinning
  // engine. Show what went wrong; do NOT auto-mount — mounting only resumes
  // on a fresh user action (uploading + Continue), so this state can't loop.
  const initError = consumeInitError();
  if (initError != null) {
    renderOnboardingScreen(root, { reason: 'license', detail: initError });
    return;
  }
  if (!getApiKey()) {
    renderOnboardingScreen(root, { reason: 'missing' });
    return;
  }
  renderUploadScreen(root, {
    onContinue: (file, pipeline) => {
      void mountEditor(root, file, pipeline);
    }
  });
}

async function mountEditor(
  root: HTMLDivElement,
  file: File,
  pipeline: TranslatePipeline
): Promise<void> {
  // Ignore repeat Continue clicks: a second create() would boot a second
  // engine before the first finishes.
  if (editorMounting) return;
  editorMounting = true;
  root.innerHTML = '';

  let cesdk: CreativeEditorSDK;
  try {
    cesdk = await CreativeEditorSDK.create(root, {
      license: import.meta.env.VITE_CESDK_LICENSE,
      userId: 'starterkit-photo-translate-user'
    });
  } catch (err) {
    console.error('Failed to initialize CE.SDK:', err);
    // create() failing is a CE.SDK *license*/init problem, not the AI key.
    // Reload to tear down the un-disposable half-booted engine; the license
    // screen renders after the reload with this message.
    reportInitFailureAndReload(err instanceof Error ? err.message : String(err));
    return;
  }

  // Debug access (remove in production).
  (window as any).cesdk = cesdk;

  await initPhotoEditor(cesdk, {
    onBack: () => navigateBackToUpload(root, cesdk),
    pipeline
  });

  try {
    await loadImageIntoScene(cesdk, file);
  } catch (err) {
    console.error('Failed to load image into editor:', err);
    cesdk.ui.showNotification({
      type: 'error',
      message: 'Could not load image — try a different file.',
      duration: 'medium'
    });
    navigateBackToUpload(root, cesdk);
    return;
  }

  const imageBlock = findFirstImageBlockOnFirstPage(cesdk.engine);
  if (imageBlock != null) cesdk.engine.block.select(imageBlock);
  cesdk.ui.openPanel(TRANSLATE_PANEL_ID);

  // Fit-to-page with a comfortable margin. createFromImage's default
  // zoom fills the canvas edge-to-edge; we want some breathing room so
  // the page edges read as a page, not as the canvas itself. Zoom after
  // openPanel so the calculation uses the narrowed canvas width (panel
  // already eats space on the right).
  const [firstPage] = cesdk.engine.scene.getPages();
  if (firstPage != null) {
    // requestAnimationFrame yields one frame so the panel's DOM has
    // settled and CE.SDK's camera knows the new viewport size before
    // zoomToBlock computes the fit.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve())
    );
    await cesdk.engine.scene.zoomToBlock(firstPage, { padding: 80 });
  }

  editorMounting = false;
}

function navigateBackToUpload(
  root: HTMLDivElement,
  cesdk: CreativeEditorSDK
): void {
  cesdk.dispose();
  delete (window as any).cesdk;
  editorMounting = false;
  showCurrentScreen(root);
}

