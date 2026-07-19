import { describe, expect, test } from "bun:test";
import { countProseWords, readingTimeMinutes } from "./reading-time";

describe("countProseWords", () => {
	test("counts plain words", () => {
		expect(countProseWords("one two three four")).toBe(4);
	});

	test("ignores code fences", () => {
		expect(
			countProseWords("before\n```\nconst a = 1;\nlet b = 2;\n```\nafter"),
		).toBe(2);
	});

	test("ignores display and inline math", () => {
		expect(countProseWords("the mark $M$ and $$x = y + z$$ done")).toBe(4);
	});

	test("keeps link text, drops urls", () => {
		expect(countProseWords("see [the paper](https://example.com/x) here")).toBe(
			4,
		);
	});

	test("strips import lines and component tags", () => {
		const body =
			'import Lab from "./Lab";\n\n<Lab client:load />\n\nreal words here';
		expect(countProseWords(body)).toBe(3);
	});

	test("markdown syntax is not words", () => {
		expect(countProseWords("## Heading\n\n> quote text\n\n- item one")).toBe(6);
	});
});

describe("readingTimeMinutes", () => {
	const words = (n: number) =>
		Array.from({ length: n }, () => "word").join(" ");

	test("mixed pace is 220 wpm, ceiled", () => {
		expect(readingTimeMinutes(words(220))).toBe(1);
		expect(readingTimeMinutes(words(221))).toBe(2);
	});

	test("pace changes the estimate", () => {
		expect(readingTimeMinutes(words(400), "technical")).toBe(3);
		expect(readingTimeMinutes(words(400), "mixed")).toBe(2);
		expect(readingTimeMinutes(words(400), "non-technical")).toBe(2);
	});

	test("never below one minute", () => {
		expect(readingTimeMinutes("tiny")).toBe(1);
	});
});
