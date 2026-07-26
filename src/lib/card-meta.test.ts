import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
	OG_SIZE,
	POST_CARD_PREFIX,
	SITE_CARD_PATH,
	SITE_NAME,
} from "../consts";
import { cardMeta } from "./card-meta";

describe("cardMeta", () => {
	test("a post card is described by its title and carries dimensions", () => {
		const m = cardMeta("/assets/og/refactoring-with-love.png", {
			title: "Refactoring with Love",
		});
		expect(m).not.toBeNull();
		expect(m?.alt).toBe(
			'Title card reading "Refactoring with Love" over generated artwork',
		);
		expect(m?.width).toBe(OG_SIZE.width);
		expect(m?.height).toBe(OG_SIZE.height);
	});

	test("the site card is described by the site identity, not the page title", () => {
		const m = cardMeta(SITE_CARD_PATH, { title: "About" });
		expect(m?.alt).toContain(SITE_NAME);
		expect(m?.alt).not.toContain("About");
	});

	test("an image we did not draw gets nothing rather than a guess", () => {
		expect(
			cardMeta("/images/posts/foo/diagram.png", { title: "T" }),
		).toBeNull();
	});

	test("the prefix does not swallow lookalike paths", () => {
		/* the reason the two routes are matched separately instead of by a
		 * shared "/assets/og" prefix */
		expect(cardMeta("/assets/ogre.png", { title: "T" })).toBeNull();
		expect(cardMeta("/assets/og-diagram.png", { title: "T" })).toBeNull();
	});

	test("the site card is an exact match, not a prefix", () => {
		expect(cardMeta(`${SITE_CARD_PATH}.bak`, { title: "T" })).toBeNull();
	});
});

describe("card route constants", () => {
	/* the constants exist to stop a renamed route silently dropping alt
	 * and dimensions; that only holds if they still point at real routes */
	const pages = join(import.meta.dir, "../pages");

	test("SITE_CARD_PATH resolves to a route file", () => {
		expect(existsSync(join(pages, `${SITE_CARD_PATH}.ts`))).toBe(true);
	});

	test("POST_CARD_PREFIX resolves to a route directory", () => {
		expect(existsSync(join(pages, POST_CARD_PREFIX, "[slug].png.ts"))).toBe(
			true,
		);
	});
});
