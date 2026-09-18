// P0 (course Q&A agent): the LangGraph.js StateGraph.
//
// triage -> retrieve -> reasonAct -> answer. In P0 every node is a stub:
// triage always passes, retrieve returns no chunks, reasonAct echoes the
// user's message, answer formats the final text. P1 replaces retrieve with
// the real lesson-chunk search, P2 replaces reasonAct with the Workers AI
// tool-calling loop and triage with the real scope gate -- the graph shape
// and the checkpointer contract below do NOT change.
//
// Memory: there is no separate "memory subsystem". runQaTurn() loads the
// session's saved graph state from D1 (see checkpointer.ts), feeds it plus
// the new user turn into the graph, and saves the resulting state back.
// The checkpointer IS the session memory.

import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { loadCheckpoint, saveCheckpoint } from './checkpointer';
import { QA_INDEX } from './qa-index';
import { searchLessons, uniqueSources } from './retrieval';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface QaGraphState {
  /** Full transcript window (trimmed to MAX_TRANSCRIPT_TURNS on save). */
  messages: ChatTurn[];
  /** Triage verdict for this turn. P0 stub: always true. */
  inScope: boolean;
  /** Lesson slugs backing the answer. P0 stub: always empty. */
  sources: string[];
  /** reasonAct's working text. */
  draft: string;
  /** Final text streamed to the learner. */
  finalAnswer: string;
}

/** Bounded context: the last 10 turns (20 messages) verbatim, per the arch. */
export const MAX_TRANSCRIPT_TURNS = 20;

const QaStateAnnotation = Annotation.Root({
  messages: Annotation<ChatTurn[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  inScope: Annotation<boolean>({
    reducer: (_left, right) => right,
    default: () => true,
  }),
  sources: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  draft: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => '',
  }),
  finalAnswer: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => '',
  }),
});

// P0 stub: everything is in scope. P2 replaces this with the real scope
// gate (course-topic classifier + constitution prompt).
async function triageNode(): Promise<Partial<QaGraphState>> {
  return { inScope: true };
}

// P1: real keyword retrieval over the build-time lesson chunk index.
// Returns the top-k chunks' lesson slugs as citations; P2's reasonAct will
// additionally consume the chunk texts. Sources feed the citation chips in
// the chat UI via the `sources` SSE event.
async function retrieveNode(
  state: typeof QaStateAnnotation.State,
): Promise<Partial<QaGraphState>> {
  const lastUser = [...state.messages].reverse().find((m) => m.role === 'user');
  const results = searchLessons(QA_INDEX, lastUser?.content ?? '', 5);
  return { sources: uniqueSources(results).map((s) => s.slug) };
}

// P0 stub: echo. P2 runs the Workers AI tool-calling loop here (max 4
// tool rounds), with tool outputs wrapped as data-not-instructions.
async function reasonActNode(state: typeof QaStateAnnotation.State): Promise<Partial<QaGraphState>> {
  const lastUser = [...state.messages].reverse().find((m) => m.role === 'user');
  return { draft: `P0 stub \u2014 you said: ${lastUser?.content ?? ''}` };
}

// Formats the final answer and appends the assistant turn to the
// transcript, so the NEXT turn's checkpoint carries full context.
async function answerNode(state: typeof QaStateAnnotation.State): Promise<Partial<QaGraphState>> {
  const finalAnswer = state.inScope
    ? state.draft
    : 'I can only answer questions about the system design course. Try asking about one of the lessons!';
  return {
    messages: [{ role: 'assistant', content: finalAnswer }],
    finalAnswer,
  };
}

const qaGraph = new StateGraph(QaStateAnnotation)
  .addNode('triage', triageNode)
  .addNode('retrieve', retrieveNode)
  .addNode('reasonAct', reasonActNode)
  .addNode('answer', answerNode)
  .addEdge(START, 'triage')
  .addEdge('triage', 'retrieve')
  .addEdge('retrieve', 'reasonAct')
  .addEdge('reasonAct', 'answer')
  .addEdge('answer', END)
  .compile();

export interface QaTurnResult {
  finalAnswer: string;
  sources: string[];
}

/**
 * Runs one conversational turn for a session: loads the D1 checkpoint,
 * invokes the graph with the previous state + the new user turn, trims the
 * transcript window, and saves the checkpoint back.
 */
export async function runQaTurn(
  db: D1Database,
  sessionId: string,
  userMessage: string,
): Promise<QaTurnResult> {
  const prev = await loadCheckpoint(db, sessionId);
  const previousMessages = prev?.state.messages ?? [];
  const result = await qaGraph.invoke({
    ...(prev?.state ?? {}),
    messages: [...previousMessages, { role: 'user', content: userMessage }],
  });
  const state: QaGraphState = {
    messages: result.messages.slice(-MAX_TRANSCRIPT_TURNS),
    inScope: result.inScope,
    sources: result.sources,
    draft: result.draft,
    finalAnswer: result.finalAnswer,
  };
  await saveCheckpoint(db, sessionId, state);
  return { finalAnswer: state.finalAnswer, sources: state.sources };
}
