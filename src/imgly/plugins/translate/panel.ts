/**
 * Custom Translate panel + dock entry.
 *
 * The model dropdown is the hard-coded TRANSLATE_MODELS allow-list.
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

import { getApiKey } from './credentials';
import { TARGET_LANGUAGES, TRANSLATE_MODELS } from './providers';
import type { TranslatePipeline } from './providers';
import { translateImage, TranslateError } from './translate';
import { appendTranslatedPage, zoomToScene } from './pages';
import { MAGIC_LAYERS_STEPS, runMagicLayersTranslation } from './magicLayers';
import type { MagicLayersProgress } from './magicLayers';
import { readOriginalImageBlob } from './sourceImage';

type PanelBuilder = Parameters<
  Parameters<CreativeEditorSDK['ui']['registerPanel']>[1]
>[0]['builder'];

export const TRANSLATE_PANEL_ID = '//ly.img.panel/translate';
const TRANSLATE_ICON_SET_ID = 'ly.img.translate';
export const TRANSLATE_ICON_ID = `@${TRANSLATE_ICON_SET_ID}/translate`;

const TRANSLATE_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg">
  <symbol id="${TRANSLATE_ICON_ID}" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
  </symbol>
</svg>`;

export interface SetupTranslatePanelOpts {
  gatewayUrl: string;
  /** Pipeline chosen on the upload screen. */
  pipeline: TranslatePipeline;
}

export function setupTranslatePanel(
  cesdk: CreativeEditorSDK,
  opts: SetupTranslatePanelOpts
): void {
  cesdk.ui.addIconSet(TRANSLATE_ICON_SET_ID, TRANSLATE_ICON_SVG);
  registerTranslations(cesdk);
  registerPanel(cesdk, opts);
  // Dock placement is the host config's responsibility (see
  // photo-editor/ui/dock.ts), which uses a structured dock entry with a
  // reactive isSelected predicate.
}

function registerTranslations(cesdk: CreativeEditorSDK): void {
  cesdk.i18n.setTranslations({
    en: {
      [`panel.${TRANSLATE_PANEL_ID}`]: 'Translate Image',
      'panel.translate.model': 'Model',
      'panel.translate.translate': 'Translate',
      'panel.translate.hint.noSelection':
        'Select an image block containing text to translate.',
      'panel.translate.hint.noLanguages':
        'Choose at least one target language.',
      'panel.translate.hint.noApiKey':
        'AI API key not configured. Set VITE_AI_API_KEY in .env.',
      'panel.translate.progress.upload': 'Uploading image',
      'panel.translate.progress.layers':
        'Converting image into editable layers',
      'panel.translate.progress.scene': 'Loading the layered scene',
      'panel.translate.progress.translate': 'Translating text',
      'panel.translate.progress.pages': 'Building translated pages',
      'panel.translate.progress.slowHint':
        'This is the longest step and can take a minute or more.',
      'libraries.ly.img.translate.label': 'Translate'
    }
  });
}

function registerPanel(
  cesdk: CreativeEditorSDK,
  opts: SetupTranslatePanelOpts
): void {
  cesdk.ui.registerPanel(TRANSLATE_PANEL_ID, ({ builder, engine, state }) => {
    // Resolved on every render, not frozen at setup: on a deployed bundle
    // the key arrives via localStorage (onboarding screen) rather than the
    // env, and may be pasted after the plugin was set up.
    const apiKeyConfigured = getApiKey().length > 0;
    const isMagicLayers = opts.pipeline === 'magic-layers';

    const modelId = state<string>('translate.modelId', TRANSLATE_MODELS[0].id);
    const checked = state<Record<string, boolean>>(
      'translate.languages',
      {}
    );
    const isRunning = state('translate.isRunning', false);
    // Current Magic Layers stage; null when idle (and for Direct runs).
    const progress = state<MagicLayersProgress | null>(
      'translate.progress',
      null
    );

    const selection = engine.block.findAllSelected();
    // Selection wins; if the user hasn't selected an image block (or has
    // selected something else, like a page or text), fall back to the
    // first-page image — the original upload — so a stray click outside
    // the image doesn't break the workflow.
    const selectedImageBlock =
      pickImageFillBlock(engine, selection) ??
      findFirstImageBlockOnFirstPage(engine);
    const selectedLanguages = TARGET_LANGUAGES.filter(
      (lang) => checked.value[lang.id]
    );

    const dropdownValues = TRANSLATE_MODELS.map((m) => ({
      id: m.id,
      label: m.label
    }));
    const selectValue =
      dropdownValues.find((v) => v.id === modelId.value) ?? dropdownValues[0];
    const effectiveModelId = selectValue.id;

    builder.Section('translate.section', {
      children: () => {
        if (!apiKeyConfigured) {
          builder.Text('translate.hint', {
            content: cesdk.i18n.translate('panel.translate.hint.noApiKey')
          });
          return;
        }
        if (selectedImageBlock == null) {
          builder.Text('translate.hint', {
            content: cesdk.i18n.translate('panel.translate.hint.noSelection')
          });
          return;
        }

        // Model selector — Direct pipeline only. Magic Layers exposes
        // a single image-to-scene model on the gateway; no UI choice.
        if (!isMagicLayers) {
          builder.Select('translate.model', {
            inputLabel: 'panel.translate.model',
            values: dropdownValues,
            value: selectValue,
            setValue: (v) => modelId.setValue(v.id)
          });
        }

        for (const lang of TARGET_LANGUAGES) {
          builder.Checkbox(`translate.lang.${lang.id}`, {
            inputLabel: lang.label,
            // 'right' = label on the right side of the checkbox, i.e.
            // checkbox sits on the left. CheckboxOptions extends
            // InputOptions<boolean, 'left' | 'right'>; default is 'left'.
            inputLabelPosition: 'right',
            value: !!checked.value[lang.id],
            setValue: (v: boolean) =>
              checked.setValue({ ...checked.value, [lang.id]: v })
          });
        }

        if (selectedLanguages.length === 0) {
          builder.Text('translate.hint', {
            content: cesdk.i18n.translate('panel.translate.hint.noLanguages')
          });
        }

        builder.Button('translate.go', {
          label: 'panel.translate.translate',
          color: 'accent',
          isLoading: isRunning.value,
          isDisabled: isRunning.value || selectedLanguages.length === 0,
          onClick: () => {
            const block = selectedImageBlock;
            if (!block) return;
            isRunning.setValue(true);
            // One frame between setting isRunning and starting the actual
            // work, so the button's spinner paints before the run's first
            // synchronous chunk (image export) blocks the main thread.
            requestAnimationFrame(() => {
              const run = isMagicLayers
                ? runMagicLayersTranslation({
                    cesdk,
                    block,
                    languages: selectedLanguages,
                    onProgress: (p) => progress.setValue(p)
                  })
                : runTranslation({
                    cesdk,
                    modelId: effectiveModelId,
                    block,
                    languages: selectedLanguages
                  });
              run
                .catch((err) => {
                  // Both runners handle their expected failures internally
                  // and resolve; this is the backstop for unexpected throws
                  // (e.g. engine calls after a Back-navigation dispose) so
                  // they don't surface as unhandled rejections.
                  console.error('Translation run failed:', err);
                })
                .finally(() => {
                  progress.setValue(null);
                  isRunning.setValue(false);
                });
            });
          }
        });

        if (isRunning.value && progress.value != null) {
          renderMagicLayersProgress(cesdk, builder, progress.value);
        }
      }
    });
  });
}

/**
 * Checklist of the Magic Layers stages below the Translate button:
 * finished steps are ticked, the current one is marked (with a language
 * counter while translating), upcoming ones are dimmed by an empty marker.
 */
function renderMagicLayersProgress(
  cesdk: CreativeEditorSDK,
  builder: PanelBuilder,
  progress: MagicLayersProgress
): void {
  const currentIndex = MAGIC_LAYERS_STEPS.indexOf(progress.step);
  MAGIC_LAYERS_STEPS.forEach((step, index) => {
    let content = cesdk.i18n.translate(`panel.translate.progress.${step}`);
    if (index < currentIndex) {
      content = `✓ ${content}`;
    } else if (index === currentIndex) {
      if (progress.total != null) {
        content += ` (${progress.done ?? 0}/${progress.total})`;
      }
      content = `● ${content}…`;
    } else {
      content = `○ ${content}`;
    }
    builder.Text(`translate.progress.${step}`, { content });
    if (step === 'layers' && index === currentIndex) {
      builder.Text('translate.progress.slowHint', {
        content: cesdk.i18n.translate('panel.translate.progress.slowHint')
      });
    }
  });
}

/**
 * Blocks can support fills without having one assigned (e.g. a page with
 * no fill, which is what gets selected when clicking the empty canvas of
 * a newly added page). `getFill` then returns an invalid handle, and
 * `getType` on it throws BLOCK.UNKNOWN — so check validity first.
 */
function hasImageFill(
  engine: CreativeEditorSDK['engine'],
  block: number
): boolean {
  const fill = engine.block.getFill(block);
  if (!engine.block.isValid(fill)) return false;
  return engine.block.getType(fill) === '//ly.img.ubq/fill/image';
}

function pickImageFillBlock(
  engine: CreativeEditorSDK['engine'],
  selection: number[]
): number | null {
  if (selection.length !== 1) return null;
  const block = selection[0];
  if (!engine.block.supportsFill(block)) return null;
  if (!hasImageFill(engine, block)) return null;
  return block;
}

/**
 * The first image-fill graphic block on the document's first page —
 * which, in this app, is always the originally uploaded source image.
 * Used as the fallback "source" when the user hasn't selected anything
 * specific, and exported so the bootstrap (src/index.ts) can pre-select
 * it on editor mount with the same predicate.
 */
export function findFirstImageBlockOnFirstPage(
  engine: CreativeEditorSDK['engine']
): number | null {
  const pages = engine.scene.getPages();
  const firstPage = pages[0];
  if (firstPage == null) return null;
  for (const child of engine.block.getChildren(firstPage)) {
    if (!engine.block.supportsFill(child)) continue;
    if (hasImageFill(engine, child)) return child;
  }
  return null;
}

interface RunArgs {
  cesdk: CreativeEditorSDK;
  modelId: string;
  block: number;
  languages: typeof TARGET_LANGUAGES;
}

async function runTranslation(args: RunArgs): Promise<void> {
  const { cesdk, modelId, block, languages } = args;
  const engine = cesdk.engine;

  const sourcePageId = findParentPage(engine, block);
  if (sourcePageId == null) {
    cesdk.ui.showNotification({
      type: 'error',
      message: 'Could not find the source page.',
      duration: 'medium'
    });
    return;
  }

  // Prefer the user's original, unmodified bytes (stored as an engine buffer
  // at upload time) over a PNG re-export, which re-encodes the photo
  // losslessly and balloons a source JPEG several-fold for no quality gain.
  // Fall back to export if the fill isn't a readable engine buffer.
  // `translateImage` uploads with `image.type`, so the recovered MIME type
  // flows through.
  let sourceBlob: Blob;
  try {
    sourceBlob =
      readOriginalImageBlob(engine, block) ??
      (await engine.block.export(block, { mimeType: 'image/png' }));
  } catch (err) {
    console.error('Failed to export source image:', err);
    cesdk.ui.showNotification({
      type: 'error',
      message: 'Failed to read the source image.',
      duration: 'medium'
    });
    return;
  }

  engine.block.setState(block, { type: 'Pending', progress: 0 });

  try {
    const results = await Promise.allSettled(
      languages.map((lang) =>
        translateImage({
          image: sourceBlob,
          targetLanguageId: lang.id,
          targetLanguagePromptName: lang.promptName,
          modelId
        }).then((blob) => ({ lang, blob }))
      )
    );

    const failures: { lang: string; error: unknown }[] = [];
    let added = 0;
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const lang = languages[i];
      if (r.status === 'fulfilled') {
        try {
          await appendTranslatedPage({
            cesdk,
            sourcePageId,
            sourceBlockId: block,
            translated: r.value.blob,
            label: lang.label
          });
          added++;
        } catch (err) {
          console.error(`Failed to append page for ${lang.label}:`, err);
          failures.push({ lang: lang.label, error: err });
        }
      } else {
        const err = r.reason;
        console.error(
          `Translation failed for ${lang.label}:`,
          err instanceof TranslateError ? err.cause ?? err : err
        );
        failures.push({ lang: lang.label, error: err });
      }
    }

    if (added > 0) {
      engine.editor.addUndoStep();
      // Clear the source block's Pending spinner BEFORE zooming — while a
      // block is Pending the engine defers laying out the freshly appended
      // pages, so they have no canvas position yet and zoomToBlock(scene)
      // frames only the source page (verified empirically: with Pending the
      // zoom lands at a single-page fit; with Ready it fits all pages). The
      // guarded reset in the finally below stays as the error-path backstop.
      if (engine.block.isValid(block)) {
        engine.block.setState(block, { type: 'Ready' });
      }
      // The new pages were appended to the right of the source page,
      // outside the current view. Zoom out (animated) so the user sees
      // the source and every translation side by side. Best-effort: a
      // zoom failure must not suppress the success notification below —
      // the pages were added either way.
      try {
        await zoomToScene(engine, { animate: true });
      } catch (err) {
        console.error('Zoom to fit pages failed:', err);
      }
    }

    if (failures.length === 0) {
      cesdk.ui.showNotification({
        type: 'success',
        message: `${added} translated page${added === 1 ? '' : 's'} added.`,
        duration: 'medium'
      });
    } else {
      const failedLangs = failures.map((f) => f.lang).join(', ');
      cesdk.ui.showNotification({
        type: added > 0 ? 'warning' : 'error',
        message:
          added > 0
            ? `${added} page${added === 1 ? '' : 's'} added; ${failedLangs} failed.`
            : `Translation failed for ${failedLangs}.`,
        duration: 'long'
      });
    }
  } finally {
    // The source block may be gone: deleted by the user, or the whole
    // engine disposed via Back navigation while requests were in flight
    // (isValid itself throws on a disposed engine, hence the try/catch).
    try {
      if (engine.block.isValid(block)) {
        engine.block.setState(block, { type: 'Ready' });
      }
    } catch {
      // Engine disposed — nothing left to reset.
    }
  }
}

function findParentPage(
  engine: CreativeEditorSDK['engine'],
  block: number
): number | null {
  let cur: number | null = block;
  while (cur != null) {
    if (engine.block.getType(cur) === '//ly.img.ubq/page') return cur;
    cur = engine.block.getParent(cur);
  }
  return null;
}
