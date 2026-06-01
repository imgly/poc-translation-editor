# Magic Layers Font Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make translated Russian/Chinese text in the Magic Layers pipeline render correctly instead of as tofu boxes, by configuring the CE.SDK engine's missing-glyph fallback font.

**Architecture:** Set the engine-global `fallbackFontUri` once at editor init to a single font (Noto Sans CJK SC) covering Latin + Cyrillic + Simplified Chinese. The engine resolves missing glyphs per-glyph at draw time, keeping each text block's embedded design font where it has the glyph and substituting only the genuinely-missing ones. No per-block logic, no prompt changes.

**Tech Stack:** TypeScript, Vite, `@cesdk/cesdk-js` / `@cesdk/engine` v1.75.

**Reference spec:** [docs/superpowers/specs/2026-06-01-magic-layers-font-fallback-design.md](../specs/2026-06-01-magic-layers-font-fallback-design.md)

**Testing reality:** This repo has no unit-test framework (no test runner in `package.json`, no test files). The automated gate is `npm run check:syntax` (`tsc --noEmit`). Behavioral verification is manual, via the dev server — the spec's live before/after has already been proven; Task 4 re-confirms it on a clean build.

---

## File Structure

- `src/imgly/plugins/translate/providers.ts` — add the `FALLBACK_FONT_URI` constant (this file is the home for translate-feature constants).
- `src/imgly/index.ts` — `initPhotoEditor`: import the constant and apply the engine setting once at init.
- `src/imgly/plugins/translate/magicLayers.ts` — remove the temporary diagnostic logging block.
- `README.md` — add a short note that the fallback font is loaded from jsdelivr for local dev and should be self-hosted in production.

---

### Task 1: Add the fallback font constant

**Files:**
- Modify: `src/imgly/plugins/translate/providers.ts` (after the `MAGIC_LAYERS_MODEL_ID` declaration, around line 49)

- [ ] **Step 1: Add the constant**

In `src/imgly/plugins/translate/providers.ts`, immediately after the `MAGIC_LAYERS_MODEL_ID` export (the `export const MAGIC_LAYERS_MODEL_ID = 'imgly/image-to-scene';` line and its preceding doc comment), add:

```ts
/**
 * Missing-glyph fallback font for translated text.
 *
 * The Magic Layers scene embeds the fonts Layerize identified, subset to the
 * source image's (Latin) glyphs — so translated Cyrillic/Han characters have no
 * glyph and would render as tofu. Setting this as the engine's `fallbackFontUri`
 * makes the engine substitute only the missing glyphs, per glyph, while keeping
 * each block's design font for everything it can render.
 *
 * Noto Sans CJK SC covers Latin + Cyrillic + Simplified Chinese in one file, so
 * it backs both the Russian and Chinese targets. Loaded from jsdelivr
 * (CORS-enabled) so the demo runs on clone with no extra setup; for production,
 * self-host this font and point `basePath`/this URI at your own asset host.
 */
export const FALLBACK_FONT_URI =
  'https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf';
```

- [ ] **Step 2: Typecheck**

Run: `npm run check:syntax`
Expected: PASS (no output, exit 0). The constant is unused so far — TypeScript does not error on unused exports.

- [ ] **Step 3: Commit**

```bash
git add src/imgly/plugins/translate/providers.ts
git commit -m "Add Noto Sans CJK SC fallback font constant"
```

---

### Task 2: Apply the fallback font at editor init

**Files:**
- Modify: `src/imgly/index.ts` (import on line ~36; apply inside `initPhotoEditor`, body starts ~line 58)

- [ ] **Step 1: Extend the providers import**

In `src/imgly/index.ts`, the existing import is:

```ts
import { DEFAULT_GATEWAY_URL } from './plugins/translate/providers';
```

Change it to also import the new constant:

```ts
import { DEFAULT_GATEWAY_URL, FALLBACK_FONT_URI } from './plugins/translate/providers';
```

- [ ] **Step 2: Set the engine fallback font**

In `initPhotoEditor`, the body currently begins:

```ts
  // Configuration plugin (dock, navigation bar, features, etc.).
  await cesdk.addPlugin(new PhotoEditorConfig({ onBack: opts.onBack }));
```

Insert the fallback-font setting immediately **before** that `addPlugin` call, as the first statement in the function body:

```ts
  // Missing-glyph fallback: translated Russian/Chinese text uses characters that
  // the scene's embedded (Latin-subset) fonts don't contain. Without a fallback
  // the engine renders those as tofu. Set unconditionally — harmless for the
  // Direct pipeline (no editable text blocks) — and the font is fetched lazily by
  // the engine only when a missing glyph is first encountered. See FALLBACK_FONT_URI.
  cesdk.engine.editor.setSettingString('fallbackFontUri', FALLBACK_FONT_URI);

  // Configuration plugin (dock, navigation bar, features, etc.).
  await cesdk.addPlugin(new PhotoEditorConfig({ onBack: opts.onBack }));
```

- [ ] **Step 3: Typecheck**

Run: `npm run check:syntax`
Expected: PASS (exit 0). Confirms `setSettingString`/`fallbackFontUri` and the import resolve.

- [ ] **Step 4: Commit**

```bash
git add src/imgly/index.ts
git commit -m "Set engine fallbackFontUri so translated text isn't tofu"
```

---

### Task 3: Remove the temporary diagnostic logging

**Files:**
- Modify: `src/imgly/plugins/translate/magicLayers.ts` (the `[magicLayers diagnostic]` block, inserted after `const originals = ...`)

- [ ] **Step 1: Delete the diagnostic block**

In `src/imgly/plugins/translate/magicLayers.ts`, find this exact block (it sits between the `originals` snapshot and the "Translate every language in parallel" comment) and delete it entirely:

```ts

    // --- DIAGNOSTIC (temporary): inspect the fonts Layerize/gateway emitted ---
    // Logs, per text block, the typeface name + the resolved font file URI the
    // engine actually renders with, plus the engine-wide font fallback config.
    // This tells us where the scene's fonts come from (real CDN file vs. a name
    // with no backing file) before we wire up the missing-glyph fallback.
    /* eslint-disable no-console */
    console.log('[magicLayers diagnostic] engine font settings:', {
      defaultFontFileUri: engine.editor.getSettingString('defaultFontFileUri'),
      fallbackFontUri: engine.editor.getSettingString('fallbackFontUri'),
      useSystemFontFallback: engine.editor.getSettingBool('useSystemFontFallback')
    });
    templateTextBlocks.forEach((tb, i) => {
      let typefaceName = '<unavailable>';
      try {
        typefaceName = engine.block.getTypeface(tb).name;
      } catch (e) {
        typefaceName = `<error: ${(e as Error).message}>`;
      }
      console.log(`[magicLayers diagnostic] text block #${i} (id ${tb}):`, {
        text: engine.block.getString(tb, 'text/text'),
        typeface: typefaceName,
        fontFileUri: engine.block.getString(tb, 'text/fontFileUri')
      });
    });
    /* eslint-enable no-console */
```

After deletion, the code should read directly from the `originals` declaration to the "Translate every language in parallel" comment:

```ts
    const originals = templateTextBlocks.map((tb) =>
      engine.block.getString(tb, 'text/text')
    );

    // Translate every language in parallel (the gateway calls are the slow
    // part); apply the results to the scene sequentially below.
    const results = await Promise.allSettled(
```

- [ ] **Step 2: Confirm no diagnostic remnants**

Run: `grep -rn "magicLayers diagnostic" src/`
Expected: no matches (exit 1, no output).

- [ ] **Step 3: Typecheck**

Run: `npm run check:syntax`
Expected: PASS (exit 0).

- [ ] **Step 4: Commit**

```bash
git add src/imgly/plugins/translate/magicLayers.ts
git commit -m "Remove temporary font-diagnostic logging"
```

---

### Task 4: Behavioral verification on a clean build

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: Vite serves on `http://localhost:5173` with no startup errors.

- [ ] **Step 2: Run a Magic Layers translation**

In the browser:
1. Upload a photo containing text (e.g. a wedding-invite style image).
2. Pick **IMG.LY Magic Layers** → **Continue to editor**.
3. Check **Russian** and **Chinese (Simplified)**.
4. Click **Translate**.

- [ ] **Step 3: Confirm the fix**

Expected, with **no extra setup beyond a normal clone**:
- The Russian page renders Cyrillic correctly (e.g. `Сохраните дату`, `МАРТИН И ХЛОИ`) — no `□□□`.
- The Chinese page renders Han correctly (e.g. `保存日期`, `8月`) — no `□□□`.
- Untranslated original-Latin runs that remain (e.g. `MARTIN & CHLOE`) keep their embedded design font.
- The browser console shows **no** `[magicLayers diagnostic]` lines.

If tofu still appears, give the ~16 MB fallback font a few seconds to load on the first missing glyph, then re-check. If it persists, confirm `fallbackFontUri` is set: in the console run `window.cesdk.engine.editor.getSettingString('fallbackFontUri')` — it must equal `FALLBACK_FONT_URI`.

- [ ] **Step 4: Stop the dev server** (Ctrl-C)

---

### Task 5: Document the fallback font in the README

**Files:**
- Modify: `README.md` (in the Magic Layers / Configuration area — see Step 1 for the anchor)

- [ ] **Step 1: Add a note after the Magic Layers pipeline description**

In `README.md`, locate the `> **Note:**` block in the **Pipelines** section that begins "because the model returns a whole scene". Immediately after that block (before the `### Models (Direct pipeline)` heading), add:

```markdown
> **Fonts in translated pages:** the scene embeds the fonts Layerize
> identified, subset to the source image's glyphs — so a translation into a
> different script (Russian, Chinese) has no glyph in the original font. The
> editor sets the engine's `fallbackFontUri` to **Noto Sans CJK SC** (Latin +
> Cyrillic + Simplified Chinese in one file), so the engine substitutes only
> the missing glyphs while keeping each block's design font where it applies.
> For convenience this font loads from jsdelivr; **for production, self-host it**
> and point the URI at your own asset host (see `FALLBACK_FONT_URI` in
> `src/imgly/plugins/translate/providers.ts`).
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Document the translated-text fallback font in the README"
```

---

## Self-Review

**Spec coverage:**
- Define `FALLBACK_FONT_URI` constant in `providers.ts` → Task 1. ✓
- Set `fallbackFontUri` once at init in `initPhotoEditor` → Task 2. ✓
- Remove diagnostic logging → Task 3. ✓
- README note (jsdelivr / self-host for production) → Task 5. ✓
- Verification (manual regression, no extra setup, diagnostics gone, typecheck) → Tasks 2/3 typecheck + Task 4. ✓
- Known limitations (single-weight fallback; mixed-font lines) → documented in spec; no code action required. ✓
- Out of scope (Direct pipeline, other scripts, weight-matching) → not implemented, by design. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N". Every code step shows the exact code. ✓

**Type consistency:** `FALLBACK_FONT_URI` is the single name used in Tasks 1, 2, 4, 5. The engine call is `cesdk.engine.editor.setSettingString('fallbackFontUri', FALLBACK_FONT_URI)` — both the method (`setSettingString`) and the setting key (`fallbackFontUri`) match the `@cesdk/engine` API verified during brainstorming. ✓
