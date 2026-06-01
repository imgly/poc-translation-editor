# Magic Layers — missing-glyph font fallback

**Date:** 2026-06-01
**Status:** Approved design, pending implementation
**Scope:** Magic Layers pipeline only (the Direct pipeline bakes text into a
bitmap and has no editable text blocks, so it is unaffected).

## Problem

In the Magic Layers pipeline, translating an image into Russian or Chinese
produces unreadable text: the translated characters render as tofu boxes
(`□□□`). German/French/Spanish/English are unaffected.

## Root cause (empirically verified)

The pipeline is `photo → Layerize.app (OCR + font identification) → gateway
wraps the result into a CE.SDK scene → engine.scene.loadFromArchiveURL`. A
diagnostic added to [magicLayers.ts](../../../src/imgly/plugins/translate/magicLayers.ts)
logged, per text block, its typeface and resolved `text/fontFileUri`, plus the
engine's font settings. Running one Magic Layers translation showed:

- `fallbackFontUri` is **empty** — there is **no missing-glyph fallback
  configured at all**, so any glyph absent from a block's font renders as tofu.
- `useSystemFontFallback` is `false`.
- Every text block's `fontFileUri` is `buffer://N` — the gateway **embeds real
  font files** (Great Vibes, Montserrat, Playfair Display) into the scene
  archive as engine buffer resources. The fonts are genuine, not bare names.
- The embedded fonts are effectively **subset to the original image's Latin
  glyphs**: the Russian translation of the Montserrat blocks (`МАРТИН`, `АВГ`)
  rendered as tofu even though full Montserrat ships Cyrillic. So *any*
  translated character not present in the source text — Cyrillic and Han alike
  — has no glyph in the embedded font.

`engine.block.replaceText` (used at
[magicLayers.ts](../../../src/imgly/plugins/translate/magicLayers.ts)) only
changes `text/text`; it leaves `text/fontFileUri`/`text/typeface` untouched.
With no engine fallback, the missing glyphs have nowhere to resolve to.

## Decision

Set the engine's global `fallbackFontUri` to a single font covering Latin +
Cyrillic + Simplified Chinese. The engine resolves missing glyphs at draw time,
**per glyph**: it keeps each block's embedded design font for every glyph that
font can render, and substitutes *only* the genuinely-missing glyphs from the
fallback. This is the finest-grained behavior available and the smallest change.

**Verified live.** On an already-translated scene, setting
`fallbackFontUri` to Noto Sans CJK SC via the live engine turned the Russian and
Chinese tofu into correctly-rendered text in one step, with a single font file
covering both scripts. On the Chinese page, the untranslated `MARTIN & CHLOE`
(original Latin) stayed in its embedded Montserrat while only `保存日期` / `8月`
fell back to Noto — confirming per-glyph substitution preserves the design font
where it still applies.

### Rejected alternatives

- **Per-block font swap** (detect missing glyphs, replace the whole block's
  font): more code, and *worse* at preserving the design — it discards the
  embedded font for the entire block even when only one glyph is missing. There
  is also no glyph-coverage API and no font parser available, so detection would
  rely on coarse Unicode-script heuristics.
- **Hard-coded font per target language**: per-language rather than per-glyph;
  always swaps even when unnecessary; doesn't generalize to other scripts.
- **LLM returns a font name**: the `openai/gpt-5.4-mini` call only returns
  translated strings and has no knowledge of which fonts are hosted; it would
  require an allow-list + name→URI mapping + hallucination handling, i.e. strictly
  more work than the fallback with no benefit.
- **`useSystemFontFallback: true`**: zero hosting, but fidelity varies per
  viewer machine and it is unreliable under export/headless rendering.

## Implementation

1. **Define the fallback font URI as a named constant** in
   [providers.ts](../../../src/imgly/plugins/translate/providers.ts):
   ```ts
   /**
    * Missing-glyph fallback font for translated text. Covers Latin + Cyrillic +
    * Simplified Chinese in a single file, so it backs both Russian and Chinese
    * targets. Sourced from jsdelivr (CORS-enabled) for a clone-and-run demo;
    * self-host this for production (see README).
    */
   export const FALLBACK_FONT_URI =
     'https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf';
   ```

2. **Set it once at editor init** in `initPhotoEditor`
   ([src/imgly/index.ts](../../../src/imgly/index.ts)):
   ```ts
   cesdk.engine.editor.setSettingString('fallbackFontUri', FALLBACK_FONT_URI);
   ```
   Set unconditionally (both pipelines). It is harmless for Direct (no text
   blocks) and keeps the setup in one place. The ~16 MB font is fetched lazily by
   the engine on the first missing glyph, not at init.

3. **Remove the temporary diagnostic logging** from
   [magicLayers.ts](../../../src/imgly/plugins/translate/magicLayers.ts) (the
   `[magicLayers diagnostic]` block added during investigation).

4. **README note**: document that the fallback font is loaded from jsdelivr for
   local development and should be self-hosted in production — mirroring the
   existing `dangerouslyExposeApiKey` "local dev only" framing.

## Known limitations (acceptable for a demo)

- The fallback is a single **regular-weight** file. Bold or decorative
  non-Latin text falls back to regular Noto Sans (e.g. a calligraphic Great
  Vibes title in Russian becomes plain Noto). Per-weight or style-matched
  fallback fonts are out of scope (YAGNI).
- Within a mixed line, the design font and the fallback can both appear (design
  font for retained Latin, Noto for substituted glyphs). This is the intended
  trade-off and generally reads well.

## Verification

- **Manual (already performed):** the live before/after on a translated scene
  confirmed Russian + Chinese render correctly with the setting applied.
- **Regression after implementation:** run the Magic Layers pipeline with
  Russian + Chinese checked; confirm no tofu on a fresh clone (no extra setup
  steps); confirm the diagnostic logs are gone; confirm `tsc --noEmit` passes.

## Out of scope

- Direct pipeline (no editable text).
- Right-to-left scripts, Japanese/Korean, or other CJK regional variants (the
  demo's language list is fixed to German/English/French/Spanish/Russian/
  Simplified Chinese).
- Matching the fallback's style/weight to each design font.
