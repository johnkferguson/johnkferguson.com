/**
 * Guard against unescaped literal dollar signs in post prose.
 *
 * remark-math pairs ANY two unescaped $ within a paragraph (soft line
 * breaks included), so "costs $5 and $10" renders "5 and" as a math chip
 * with "10" dangling, and a lone money "$5" garbles legitimate math
 * elsewhere in the same paragraph. Site convention: literal dollars are
 * written \$ ; every unescaped $ must be a math delimiter.
 *
 * Detection is heuristic (perfect money-vs-math classification is
 * impossible). Rules, tuned against the real posts:
 * - an odd number of unescaped $ in a paragraph is always a violation
 *   (an unpaired delimiter is a landmine for future edits even when it
 *   happens to render fine today)
 * - a paired span whose content has whitespace but no TeX-ish characters
 *   is prose swallowed as math ("5 and")
 * - a paired span of digits with a trailing hyphen is the "$5-$10"
 *   range shape
 * Bare numeric chips like $10$ are deliberately allowed (valid math).
 */

export interface DollarViolation {
	line: number;
	snippet: string;
	message: string;
}

const UNESCAPED_DOLLAR = /(?<!\\)\$/g;
const TEXISH = /[\\^_{}=+*/<>|~]/;

function spanViolation(content: string): string | null {
	if (/\s/.test(content) && !TEXISH.test(content)) {
		return "prose swallowed as inline math";
	}
	if (/^\d[\d,.]*-$/.test(content)) {
		return 'money range ("$a-$b") read as inline math';
	}
	return null;
}

function checkParagraph(
	text: string,
	line: number,
	violations: DollarViolation[],
): void {
	/* inline code first (backticks may hold shell $), then inline/display
	 * $$ spans (double-dollar math is legitimate anywhere) */
	let s = text.replace(/`[^`]*`/g, "");
	s = s.replace(/(?<!\\)\$\$[\s\S]*?(?<!\\)\$\$/g, "");
	const marks = [...s.matchAll(UNESCAPED_DOLLAR)].map((m) => m.index);
	if (marks.length % 2 === 1) {
		violations.push({
			line,
			snippet: s.slice(Math.max(0, marks[marks.length - 1] - 20)).slice(0, 40),
			message:
				"odd number of unescaped $ in paragraph (escape literal dollars as \\$)",
		});
		return;
	}
	for (let i = 0; i < marks.length; i += 2) {
		const content = s.slice(marks[i] + 1, marks[i + 1]);
		const why = spanViolation(content);
		if (why) {
			violations.push({
				line,
				snippet: `$${content}$`,
				message: `${why} (escape literal dollars as \\$)`,
			});
		}
	}
}

/**
 * Whether a post body contains math for remark-math to render. Same walk
 * as validateLiteralDollars (frontmatter, fences, display blocks, inline
 * code); since that validator keeps every post free of stray dollars,
 * any unescaped $ that survives the stripping IS a math delimiter. The
 * layout gates the KaTeX stylesheet on this.
 */
export function containsMath(body: string): boolean {
	const lines = body.split("\n");
	let i = 0;
	if (lines[0]?.trim() === "---") {
		i = 1;
		while (i < lines.length && lines[i].trim() !== "---") i++;
		i++;
	}
	let inFence = false;
	for (; i < lines.length; i++) {
		const trimmed = lines[i].trim();
		if (/^(```|~~~)/.test(trimmed)) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		/* a display-math fence is math outright */
		if (trimmed === "$$") return true;
		const stripped = lines[i].replace(/`[^`]*`/g, "");
		if (/(?<!\\)\$/.test(stripped)) return true;
	}
	return false;
}

export function validateLiteralDollars(body: string): DollarViolation[] {
	const violations: DollarViolation[] = [];
	const lines = body.split("\n");
	let i = 0;
	/* skip YAML frontmatter (not processed by remark-math) */
	if (lines[0]?.trim() === "---") {
		i = 1;
		while (i < lines.length && lines[i].trim() !== "---") i++;
		i++;
	}
	let inFence = false;
	let inDisplay = false;
	let para: string[] = [];
	let paraStart = 0;
	const flush = () => {
		if (para.length) checkParagraph(para.join("\n"), paraStart, violations);
		para = [];
	};
	for (; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.trim();
		if (/^(```|~~~)/.test(trimmed)) {
			inFence = !inFence;
			flush();
			continue;
		}
		if (inFence) continue;
		if (trimmed === "$$") {
			inDisplay = !inDisplay;
			flush();
			continue;
		}
		if (inDisplay) continue;
		if (trimmed === "") {
			flush();
			continue;
		}
		if (!para.length) paraStart = i + 1;
		para.push(line);
	}
	flush();
	return violations;
}
