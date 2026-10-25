import { canonicalPath } from "./canonical";

/* GoatCounter counts only on the production host. count.js already skips
 * localhost and private ranges for pageviews; this also keeps deploy
 * previews (*.netlify.app) and hand-fired events out of the stats. */
export const COUNTED_HOST = "johnkferguson.com";

export function shouldCount(hostname: string): boolean {
	return hostname.replace(/^www\./, "") === COUNTED_HOST;
}

export type LabEventKind = "seen" | "used";

/* lab/<post>/<lab>/<kind>, from the page path and the .labwrap anchor id.
 * Lab ids default to lab-<slugged title>, so a retitled lab starts a new
 * series in the dashboard. */
export function labEventPath(
	pathname: string,
	labId: string,
	kind: LabEventKind,
): string {
	const page = canonicalPath(pathname).replace(/^\//, "") || "home";
	const lab = labId.replace(/^lab-/, "");
	return `lab/${page}/${lab}/${kind}`;
}
