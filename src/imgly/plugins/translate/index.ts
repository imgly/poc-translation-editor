/**
 * Translate plugin — public entry point.
 *
 * Registers the `ly.img.ai.getToken` credential action and wires the
 * custom Translate panel. Dock placement is the host config's
 * responsibility — see `photo-editor/ui/dock.ts`.
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

import { setupTranslatePanel } from './panel';
import { getApiKey, installAiCredentials } from './credentials';
import { DEFAULT_GATEWAY_URL } from './providers';
import type { TranslatePipeline } from './providers';
import { configureTranslate } from './translate';

export interface SetupTranslatePluginOpts {
  /** Gateway URL. Defaults to https://gateway.img.ly. */
  gatewayUrl?: string;
  /** Pipeline chosen on the upload screen. */
  pipeline: TranslatePipeline;
}

/**
 * The API key is NOT passed in here: `credentials.ts` is the single
 * source of truth (env key seeded once by the bootstrap via
 * `setConfiguredApiKey`, user-pasted key read from localStorage). The
 * panel and the gateway client both resolve through `getApiKey()` so a
 * key pasted on the deployed onboarding screen works everywhere.
 */
export function setupTranslatePlugin(
  cesdk: CreativeEditorSDK,
  opts: SetupTranslatePluginOpts
): void {
  const gatewayUrl = opts.gatewayUrl ?? DEFAULT_GATEWAY_URL;
  if (!getApiKey()) {
    console.warn(
      '[translate] No API key configured. Set VITE_AI_API_KEY in .env.'
    );
  }
  installAiCredentials(cesdk);
  configureTranslate({ gatewayUrl });
  setupTranslatePanel(cesdk, {
    gatewayUrl,
    pipeline: opts.pipeline
  });
}

export {
  TRANSLATE_PANEL_ID,
  TRANSLATE_ICON_ID,
  findFirstImageBlockOnFirstPage
} from './panel';
export {
  TARGET_LANGUAGES,
  TRANSLATE_PIPELINES,
  DEFAULT_TRANSLATE_PIPELINE,
  DEFAULT_GATEWAY_URL
} from './providers';
export type { TranslatePipeline, TranslatePipelineSpec } from './providers';
export { getApiKey, setConfiguredApiKey } from './credentials';
export {
  renderOnboardingScreen,
  type OnboardingReason,
  type RenderOnboardingScreenOpts
} from './onboarding';
