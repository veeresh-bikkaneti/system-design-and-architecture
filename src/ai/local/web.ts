/**
 * Confidence labelling for Ben's replies. No network calls live here: a
 * grounded reply comes from the lesson index (semantic/router.ts,
 * semantic/turn.ts); an ungrounded one comes from the model's own trained
 * knowledge (inference.ts's answerParametrically), never from a web fetch.
 */
export type ConfidenceLevel = "high" | "medium" | "low" | "general";

export function grounding(options: { aboutMe: boolean; inScope: boolean; offCourse?: boolean }): {
  level: ConfidenceLevel;
  label: string;
} {
  if (options.aboutMe) return { level: "high", label: "High confidence · I'm Ben" };
  if (options.offCourse) return { level: "low", label: "Off topic · outside this course" };
  if (options.inScope) return { level: "high", label: "High confidence · from the course lesson" };
  return { level: "low", label: "Low confidence · I could not find a source, so I will not guess" };
}

/**
 * Label for a reply drawn from the model's own trained weights, not the
 * lesson index -- shown instead of a source pill, since there is no citable
 * URL for what the model already knows.
 */
export const GENERAL_KNOWLEDGE_CONFIDENCE: { level: ConfidenceLevel; label: string } = {
  level: "general",
  label: "General knowledge overview — not in current lesson plan",
};
