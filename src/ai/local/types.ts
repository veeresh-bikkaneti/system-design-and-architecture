export type OkfType = "Lesson" | "Guide";

export interface OkfCard {
  id: string;
  type: OkfType;
  title: string;
  order: number;
  tags: string[];
  summary: string;
  /** Short teaching text. This is the only prose the model is allowed to use. */
  body: string;
}

export interface ScoredCard {
  card: OkfCard;
  score: number;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ToolTrace {
  name: "search_lessons" | "read_concept" | "web_search";
  input: string;
  output: string;
}

export interface TutorTurn {
  inScope: boolean;
  answer: string;
  sources: { id: string; title: string }[];
  traces: ToolTrace[];
  context: string;
  /** True means: ask the model directly instead of using `answer`. See agent.ts's prepareTurn. */
  parametric?: boolean;
}
