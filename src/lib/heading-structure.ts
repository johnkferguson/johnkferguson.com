/**
 * Heading hierarchy validation for post bodies. Rule: heading levels may
 * only step down one at a time (h2 -> h3 -> h4); a level-N heading with
 * no intervening parent (e.g. an h4 directly under an h2) is a violation.
 * The TOC nesting relies on this structure.
 */

export interface HeadingViolation {
	line: number;
	heading: string;
	message: string;
}

export function validateHeadingStructure(body: string): HeadingViolation[] {
	const violations: HeadingViolation[] = [];
	let inFence = false;
	let prevLevel = 1;
	const lines = body.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (/^(```|~~~)/.test(line.trim())) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		const m = /^(#{2,6})\s+(.*)$/.exec(line);
		if (!m) continue;
		const level = m[1].length;
		if (level > prevLevel + 1) {
			violations.push({
				line: i + 1,
				heading: m[2].trim(),
				message: `h${level} "${m[2].trim()}" skips a level (previous heading was h${prevLevel})`,
			});
		}
		prevLevel = level;
	}
	return violations;
}
