/**
 * Prose-only reading time. The body is reduced to readable prose first:
 * MDX imports/components and lab embeds go through the same sanitizer
 * as the LLM endpoints, then code blocks, math, images, and markdown
 * syntax are stripped. Labs deliberately contribute nothing (reading
 * time means prose by convention).
 *
 * Pace comes from frontmatter: technical prose reads slower.
 */
import { mdxBodyToMarkdown } from "./mdx-plain";

export type PostPace = "technical" | "mixed" | "non-technical";

export const WPM: Record<PostPace, number> = {
	technical: 180,
	mixed: 220,
	"non-technical": 260,
};

export function countProseWords(body: string): number {
	let s = mdxBodyToMarkdown(body);
	s = s.replace(/```[\s\S]*?```/g, " ");
	s = s.replace(/\$\$[\s\S]*?\$\$/g, " ");
	s = s.replace(/\$[^$\n]+\$/g, " ");
	s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
	s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
	s = s.replace(/[#>*_`~]/g, " ");
	return s.split(/\s+/).filter(Boolean).length;
}

export function readingTimeMinutes(
	body: string,
	pace: PostPace = "mixed",
): number {
	return Math.max(1, Math.ceil(countProseWords(body) / WPM[pace]));
}
