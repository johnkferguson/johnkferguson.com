/**
 * Hover copy buttons on code and math blocks.
 *
 * Math blocks copy their TeX source rather than the rendered output:
 * KaTeX keeps the source in the MathML annotation, and selecting rendered
 * KaTeX by hand yields garbled text. Code blocks copy their text.
 *
 * Each block is moved into a positioning wrapper first, because `pre` and
 * `.katex-display` are horizontal scroll containers and a button inside
 * one would scroll away with the content.
 *
 * Lives beside the components rather than in src/lib/, which is DOM-free
 * pure modules by convention. The copy-confirm-revert cycle itself comes
 * from copy-link.ts, so these buttons and the heading anchors cannot
 * drift apart.
 */

import { attachCopyButton, CHECK_SVG } from "./copy-link";

const COPY_SVG =
	'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>';

/** Reads the copyable text out of one block. */
function blockText(block: HTMLElement, isMath: boolean): string {
	if (isMath) {
		return (
			block.querySelector('annotation[encoding="application/x-tex"]')
				?.textContent ?? ""
		);
	}
	return block.querySelector("code")?.textContent ?? block.textContent ?? "";
}

/** Wraps every code and math block under `root` and adds its copy button. */
export function attachBlockCopyButtons(root: ParentNode): void {
	for (const block of root.querySelectorAll<HTMLElement>(
		"pre, .katex-display",
	)) {
		const isMath = block.classList.contains("katex-display");
		const textOf = () => blockText(block, isMath);
		/* nothing to copy, so no affordance promising otherwise */
		if (!textOf().trim()) continue;

		const wrap = document.createElement("div");
		wrap.className = "block-copy-wrap";
		block.before(wrap);
		wrap.append(block);

		const btn = document.createElement("button");
		btn.className = "block-copy";
		btn.type = "button";
		btn.dataset.tip = isMath ? "Copy LaTeX" : "Copy code";
		btn.setAttribute(
			"aria-label",
			isMath ? "Copy this formula's LaTeX source" : "Copy this code block",
		);
		btn.innerHTML = COPY_SVG;
		attachCopyButton(btn, {
			url: textOf,
			announcement: "Copied",
			idle: () => {
				btn.innerHTML = COPY_SVG;
				btn.classList.remove("copied");
			},
			copied: () => {
				btn.innerHTML = CHECK_SVG;
				btn.classList.add("copied");
			},
		});
		wrap.append(btn);
	}
}
