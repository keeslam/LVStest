/**
 * A-11-1 (audit 2026-10-09, module 11): the only vehicle diagram on the test database was a
 * 1198 x 24 pixel strip - a damage cannot be marked on it, and nothing said so. One rule, used by
 * the upload routes (refuse) and by the damage check (warn about a diagram already stored).
 *
 * The numbers are deliberately loose: a top view of a van is about 2:1, a side view up to 3:1.
 * Anything flatter than 5:1, or with a side under 150 px, is a mistake, not a diagram.
 */
export const MIN_DIAGRAM_SIDE_PX = 150;
export const MAX_DIAGRAM_ASPECT_RATIO = 5;

export type DiagramImageProblem = "too_small" | "too_flat";

export function diagramImageProblem(width: number, height: number): DiagramImageProblem | null {
  if (!(width > 0) || !(height > 0)) return "too_small";
  // Checked first: the 1198 x 24 strip is flat AND short; "flat" is the more useful word for it.
  if (Math.max(width, height) / Math.min(width, height) > MAX_DIAGRAM_ASPECT_RATIO) return "too_flat";
  if (Math.min(width, height) < MIN_DIAGRAM_SIDE_PX) return "too_small";
  return null;
}
