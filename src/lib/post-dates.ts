/**
 * Frontmatter date validation for posts. Rule: an `updated` date may not
 * precede `date`. A post that claims otherwise emits an
 * article:modified_time before its article:published_time, and a
 * schema.org dateModified before its datePublished, which structured
 * data validators flag.
 *
 * This lives in a test rather than a Zod .refine() on the collection
 * schema deliberately. The build script ends with a draft-inclusive
 * `astro sync`, so a schema error in an UNPUBLISHED draft fails
 * `bun run build` — and therefore the Netlify deploy — after the real
 * build has already printed "Complete!", for a file that never ships.
 * As a test it fails in the PR gate instead, where it belongs, with
 * identical coverage (the sweep walks into drafts/ too).
 */

export interface PostDateViolation {
	message: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;

/** Top-level scalar from a frontmatter block. Anchored to column zero so
 * indented keys nested under `art:` can never be mistaken for one. */
function topLevelField(frontmatter: string, name: string): string | null {
	const m = new RegExp(`^${name}:[ \\t]*(.+?)[ \\t]*$`, "m").exec(frontmatter);
	return m ? m[1].replace(/^["']|["']$/g, "") : null;
}

export function validatePostDates(raw: string): PostDateViolation[] {
	const fm = FRONTMATTER.exec(raw);
	/* no frontmatter at all is someone else's error to report */
	if (!fm) return [];

	const rawUpdated = topLevelField(fm[1], "updated");
	if (rawUpdated === null) return [];

	const rawDate = topLevelField(fm[1], "date");
	if (rawDate === null) {
		return [{ message: "has an updated date but no date to compare it to" }];
	}

	const updated = Date.parse(rawUpdated);
	const date = Date.parse(rawDate);
	if (Number.isNaN(updated)) {
		return [{ message: `updated "${rawUpdated}" is not a readable date` }];
	}
	if (Number.isNaN(date)) {
		return [{ message: `date "${rawDate}" is not a readable date` }];
	}

	if (updated < date) {
		return [
			{
				message: `updated (${rawUpdated}) is earlier than date (${rawDate})`,
			},
		];
	}
	return [];
}
