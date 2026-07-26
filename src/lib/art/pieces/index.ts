/**
 * Registry of bespoke per-post pieces. Each post's artwork is its own
 * small deterministic program; the machinery (core, primitives) grows as
 * new concepts demand it rather than being designed up front.
 */

import type { ArtPiece } from "../core";
import { refactoringWithLove } from "./refactoring-with-love";

export const PIECES: Record<string, ArtPiece> = {
	[refactoringWithLove.name]: refactoringWithLove,
};

export function getPiece(name: string): ArtPiece | undefined {
	return PIECES[name];
}
