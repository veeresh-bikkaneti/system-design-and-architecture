// Course Q&A agent: the LangGraph.js StateGraph.
//
// triage -> retrieve -> reasonAct -> answer. triage and retrieve are still
// P0 stubs (triage always passes, retrieve returns no chunks); P1 replaces
// retrieve with the real lesson-chunk search and triage with the real scope
// gate. reasonAct is P2: it calls the cloud model (model.ts) with the tutor
// persona (systemPrompt.ts) and the session transcript -- the graph shape
// and the checkpointer contract below do NOT change.
//
// Memory: there is no separate "memory subsystem". runQaTurn() loads the
// session's saved graph state from D1 (see checkpointer.ts), feeds it plus
// the new user turn into the graph, and saves the resulting state back.
// The checkpointer IS the session memory.

import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import type { Env } from '../index';
import { loadCheckpoint, saveCheckpoint } from './checkpointer';
import { callAnthropic, type AnswerModel } from './model';

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

// P0 stub: no retrieval index yet. P1 returns top-k lesson chunks here.
async function retrieveNode(): Promise<Partial<QaGraphState>> {
  return { sources: [] };
}

// P2: calls the cloud model (model.ts) with the tutor persona and the
// session transcript. env and callModel arrive via LangGraph's context
// mechanism (see runQaTurn and QaContextAnnotation below) rather than a
// closure, so the compiled qaGraph stays a stateless singleton and tests
// can swap in a fake AnswerModel without a real network call.
const QaContextAnnotation = Annotation.Root({
  env: Annotation<Env>(),
  callModel: Annotation<AnswerModel | undefined>(),
});

async function reasonActNode(
  state: typeof QaStateAnnotation.State,
  config: LangGraphRunnableConfig<typeof QaContextAnnotation.State>,
): Promise<Partial<QaGraphState>> {
  const { env, callModel = callAnthropic } = config.configurable ?? ({} as typeof QaContextAnnotation.State);
  const draft = await callModel(env, state.messages);
  return { draft };
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

const qaGraph = new StateGraph(QaStateAnnotation, QaContextAnnotation)
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
 *
 * callModel overrides reasonAct's cloud call -- tests pass a deterministic
 * fake here instead of hitting the network; production omits it and gets
 * model.ts's callAnthropic.
 */
export async function runQaTurn(
  env: Env,
  sessionId: string,
  userMessage: string,
  callModel?: AnswerModel,
): Promise<QaTurnResult> {
  const db = env.DB;
  const prev = await loadCheckpoint(db, sessionId);
  const previousMessages = prev?.state.messages ?? [];
  const result = await qaGraph.invoke(
    {
      ...(prev?.state ?? {}),
      messages: [...previousMessages, { role: 'user', content: userMessage }],
    },
    { configurable: { env, callModel } },
  );
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
