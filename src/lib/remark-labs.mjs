/**
 * remark-labs: build-time discovery of <Lab> embeds in MDX posts.
 *
 * Walks the MDX tree in document order, counting every heading, and
 * records each <Lab title="..."> element with the index of the heading
 * whose territory it sits in. The result rides the standard remark
 * frontmatter channel, so pages read it from render(post) alongside
 * `headings` and the TOC can merge lab entries into its tree.
 *
 * Plain .mjs (not .ts) so astro.config.mjs can import it directly;
 * Lab.astro shares labSlug so the rendered anchor id and the TOC link
 * can never disagree.
 */

/** @param {string} title */
export function labSlug(title) {
	return title
		.toLowerCase()
		.replace(/['’]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function remarkLabs() {
	/**
	 * @param {{children?: any[]}} tree
	 * @param {{data: any}} file
	 */
	return (tree, file) => {
		const labs = [];
		let heading = -1;
		/** @param {any[]} nodes */
		const walk = (nodes) => {
			for (const node of nodes) {
				if (node.type === "heading") heading += 1;
				else if (
					(node.type === "mdxJsxFlowElement" ||
						node.type === "mdxJsxTextElement") &&
					node.name === "Lab"
				) {
					/** @param {string} name */
					const attr = (name) => {
						const a = node.attributes?.find(
							(x) => x.type === "mdxJsxAttribute" && x.name === name,
						);
						return typeof a?.value === "string" ? a.value : undefined;
					};
					const title = attr("title");
					if (title) {
						labs.push({
							title,
							id: attr("id") ?? `lab-${labSlug(title)}`,
							afterHeading: heading,
						});
					}
				}
				if (node.children) walk(node.children);
			}
		};
		walk(tree.children ?? []);
		file.data.astro = file.data.astro ?? {};
		const astro = file.data.astro;
		astro.frontmatter = astro.frontmatter ?? {};
		astro.frontmatter.labs = labs;
	};
}
