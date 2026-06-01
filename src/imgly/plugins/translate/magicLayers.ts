/**
 * Magic Layers translation pipeline.
 *
 * One `imgly/image-to-scene` gateway call turns the source image into a
 * full, editable CE.SDK *scene* (the model returns a scene archive, not
 * loose blocks). Because a scene archive can only be loaded via
 * `engine.scene.loadFromArchiveURL` — which replaces the active document —
 * we make that scene the document and build the pages inside it:
 *
 *   - page 1, "Original", is the flat source image (rebuilt from the bytes we
 *     uploaded — the scene swap destroyed the source-image page we started
 *     from) so the user can compare against the untouched original;
 *   - page 2, "Original (Layers)", is the untranslated, editable scene;
 *   - for each target language we duplicate the layers page, batch-translate
 *     its text blocks via the text gateway adapter, and rename it.
 *
 * Result: the flat original, the editable layers, then a translated page per
 * language. Text translation runs per language
 * via `Promise.allSettled` (a failure in one language doesn't block the
 * others); the scene mutations are applied sequentially on the single
 * shared scene.
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

import { getGatewayClient } from './translate';
import { insertImagePage } from './pages';
import { translateTexts } from './translateTexts';
import { MAGIC_LAYERS_MODEL_ID, type TargetLanguage } from './providers';
import { readOriginalImageBlob } from './sourceImage';

export interface RunMagicLayersTranslationArgs {
  cesdk: CreativeEditorSDK;
  /** The source image block the user selected (or the fallback). */
  block: number;
  languages: readonly TargetLanguage[];
}

export async function runMagicLayersTranslation(
  args: RunMagicLayersTranslationArgs
): Promise<void> {
  const { cesdk, block, languages } = args;
  const engine = cesdk.engine;

  const client = getGatewayClient();
  if (!client) {
    cesdk.ui.showNotification({
      type: 'error',
      message: 'AI gateway is not configured.',
      duration: 'medium'
    });
    return;
  }

  // --- Phase 1: source image → scene archive --------------------------------
  //
  // `archiveObjectUrl` is a blob: object URL holding the scene archive.
  // The gateway hands back the archive as a `data:` URL, which the engine's
  // resource loader does not fetch — so we materialise it as a blob: URL,
  // the same scheme the rest of the app uses to feed the engine bytes.
  let archiveObjectUrl: string;
  // The user's original bytes, read once in Phase 1 for the gateway upload and
  // reused in Phase 2 to rebuild a flat "Original" page (loadFromArchiveURL
  // replaces the document, destroying the source-image page we started from).
  let sourceBlob: Blob;
  try {
    // Send the user's *original* bytes. The upload path stashes the
    // original file as an engine buffer (see upload/scene.ts), so we read
    // those exact bytes straight back. Fall back to a PNG export only if the
    // fill isn't a readable engine buffer.
    //
    // Acquire the source while the block is still 'Ready': the export
    // fallback performs an internal layout update and will not return for a
    // 'Pending' block — so mark Pending only AFTER reading (the Direct
    // pipeline does the same; reversing the order deadlocks the fallback
    // before any request is sent).
    sourceBlob =
      readOriginalImageBlob(engine, block) ??
      (await engine.block.export(block, { mimeType: 'image/png' }));
    engine.block.setState(block, { type: 'Pending', progress: 0 });

    const upload = await client.upload(
      sourceBlob,
      sourceBlob.type || 'image/png'
    );
    const sceneArchiveUrl = await client.generate(
      MAGIC_LAYERS_MODEL_ID,
      {
        image_urls: [upload.asset_url]
      },
      {}
    );

    const archiveBlob = await (await fetch(sceneArchiveUrl)).blob();
    archiveObjectUrl = URL.createObjectURL(archiveBlob);
  } catch (err) {
    console.error('Magic Layers: image-to-scene failed:', err);
    if (engine.block.isValid(block)) {
      engine.block.setState(block, { type: 'Ready' });
    }
    cesdk.ui.showNotification({
      type: 'error',
      message: 'Magic Layers: scene generation failed.',
      duration: 'medium'
    });
    return;
  }

  // --- Phase 2: load the scene + build a translated page per language -------
  try {
    // Replace the current (source-image) document with the model's editable
    // scene. `overrideEditorConfig: false` keeps our dock/panel setup.
    await engine.scene.loadFromArchiveURL(archiveObjectUrl, false);

    const templatePage = engine.scene.getPages()[0];
    if (templatePage == null) {
      throw new Error('Loaded scene has no pages.');
    }
    // The model's editable scene becomes the "layers" reference page; the flat
    // source image is prepended as page 1 below so the user can compare.
    engine.block.setName(templatePage, 'Original (Layers)');

    // Prepend a flat page holding the untouched source image, sized to the
    // layerized page so both share the document's page dimensions. Inserted at
    // index 0 of the page parent so it lands before the layerized page.
    const pageParent = engine.block.getParent(templatePage);
    if (pageParent == null) {
      throw new Error('Layerized page has no parent — cannot prepend Original.');
    }
    const flatWidth = engine.block.getFrameWidth(templatePage);
    const flatHeight = engine.block.getFrameHeight(templatePage);
    const { page: originalPage } = await insertImagePage({
      engine,
      parent: pageParent,
      index: 0,
      label: 'Original',
      blob: sourceBlob,
      width: flatWidth,
      height: flatHeight
    });

    // Child-index 0 already makes "Original" first in engine.scene.getPages()
    // (and the page list). But a model archive is typically a `Free`-layout
    // scene where pages also float on a canvas and read left-to-right by
    // position — and a freshly created page has no canvas position, so it
    // lands beside/after the layerized page. Pin it to the left of the
    // layerized page so it is unambiguously the first page both ways. In stack
    // layouts page positions are managed by the layout, so we skip this.
    if (engine.scene.getLayout() === 'Free') {
      const layersX = engine.block.getGlobalBoundingBoxX(templatePage);
      const layersY = engine.block.getGlobalBoundingBoxY(templatePage);
      engine.block.setPositionXMode(originalPage, 'Absolute');
      engine.block.setPositionYMode(originalPage, 'Absolute');
      engine.block.setPositionX(originalPage, layersX - flatWidth - flatWidth * 0.1);
      engine.block.setPositionY(originalPage, layersY);
    }

    // Snapshot the template's text once — this is the translation source.
    // DFS order is stable, so a duplicate's text blocks line up by index.
    const templateTextBlocks: number[] = [];
    collectTextBlocks(engine, templatePage, templateTextBlocks);
    const originals = templateTextBlocks.map((tb) =>
      engine.block.getString(tb, 'text/text')
    );

    // Translate every language in parallel (the gateway calls are the slow
    // part); apply the results to the scene sequentially below.
    const results = await Promise.allSettled(
      languages.map((lang) =>
        translateTexts({
          texts: originals,
          targetLanguagePromptName: lang.promptName
        })
      )
    );

    const failedLangs: string[] = [];
    let added = 0;
    for (let i = 0; i < results.length; i++) {
      const lang = languages[i];
      const result = results[i];
      if (result.status !== 'fulfilled') {
        console.error(`Magic Layers failed for ${lang.label}:`, result.reason);
        failedLangs.push(lang.label);
        continue;
      }

      const translated = result.value;
      // Duplicate the editable Original page (attaches to its parent, so it
      // becomes the next page) and replace its text with this language's.
      const page = engine.block.duplicate(templatePage);
      const pageTextBlocks: number[] = [];
      collectTextBlocks(engine, page, pageTextBlocks);
      const n = Math.min(pageTextBlocks.length, translated.length);
      for (let j = 0; j < n; j++) {
        engine.block.replaceText(pageTextBlocks[j], translated[j]);
      }
      engine.block.setName(page, lang.label);
      added++;
    }

    // Always commit one undo step: even with zero successful translations we
    // mutated the scene (renamed the layers page, prepended the Original page).
    engine.editor.addUndoStep();

    if (failedLangs.length === 0) {
      cesdk.ui.showNotification({
        type: 'success',
        message: `${added} translated page${added === 1 ? '' : 's'} added.`,
        duration: 'medium'
      });
    } else {
      const failed = failedLangs.join(', ');
      cesdk.ui.showNotification({
        type: added > 0 ? 'warning' : 'error',
        message:
          added > 0
            ? `${added} page${added === 1 ? '' : 's'} added; ${failed} failed.`
            : `Magic Layers translation failed for ${failed}.`,
        duration: 'long'
      });
    }
  } catch (err) {
    console.error('Magic Layers: building translated pages failed:', err);
    cesdk.ui.showNotification({
      type: 'error',
      message: 'Magic Layers: could not build the translated scene.',
      duration: 'medium'
    });
  } finally {
    URL.revokeObjectURL(archiveObjectUrl);
    // The source block belongs to the document we replaced; only touch it
    // if the scene swap never happened (e.g. loadFromArchiveURL threw).
    if (engine.block.isValid(block)) {
      engine.block.setState(block, { type: 'Ready' });
    }
  }
}

/**
 * Depth-first collect of every text block under `root` (inclusive). Text
 * blocks can be nested inside groups, so we recurse. The traversal order is
 * deterministic, which is what lets a duplicated page's text blocks line up
 * with the template's by index.
 */
function collectTextBlocks(
  engine: CreativeEditorSDK['engine'],
  root: number,
  acc: number[]
): void {
  if (engine.block.getType(root).endsWith('/text')) {
    acc.push(root);
  }
  for (const child of engine.block.getChildren(root)) {
    collectTextBlocks(engine, child, acc);
  }
}
