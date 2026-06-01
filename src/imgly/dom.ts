/**
 * Tiny DOM helpers shared by the pre-editor screens (onboarding, upload)
 * that render plain HTML rather than CE.SDK UI.
 */

/**
 * Create an element with an optional class name. Typed so the return value
 * is the concrete `HTMLElement` subtype for `tag` (e.g. `el('input')`
 * yields an `HTMLInputElement`).
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
