import { acceptDraft } from './agent';
import { tokenize } from './retrieve';

/**
 * Ben's generation engine: 100% client-side, two tiers, no server and no API key.
 *
 * 1. Chrome's built-in Prompt API (`LanguageModel`) -- the browser's own on-device
 *    model, when the browser ships one. Nothing to download from us, nothing to run
 *    on our infrastructure.
 * 2. WebLLM (`@mlc-ai/web-llm`), dynamically imported so the static bundle stays
 *    small -- runs a small model on WebGPU, weights cached to IndexedDB after the
 *    first download. Used only when the Prompt API is missing or unavailable.
 *
 * Whichever engine answers, generation is a single stateless call per turn (system
 * + the grounded context + the question) -- the running transcript lives in
 * useQaHistory's localStorage array, not in engine-side session state, so a
 * mid-conversation fallback from one engine to the other is invisible to the user.
 */

export type EngineKind = 'prompt-api' | 'webllm';
export type ModelPhase = 'idle' | 'loading' | 'ready' | 'failed';

export interface ModelStatus {
  phase: ModelPhase;
  progress: number;
  detail: string;
}

interface Engine {
  kind: EngineKind;
  generate(system: string, user: string): Promise<string>;
}

export const MODEL_LABEL = 'On-device AI';

let status: ModelStatus = { phase: 'idle', progress: 0, detail: 'Not loaded' };
const listeners = new Set<(next: ModelStatus) => void>();

function publish(next: ModelStatus) {
  status = next;
  for (const listener of listeners) listener(next);
}

export function getModelStatus(): ModelStatus {
  return status;
}

export function subscribeModel(listener: (next: ModelStatus) => void): () => void {
  listeners.add(listener);
  listener(status);
  return () => listeners.delete(listener);
}

async function tryPromptApi(): Promise<Engine | null> {
  if (typeof LanguageModel === 'undefined') return null;
  const languageModel = LanguageModel;
  try {
    const availability = await languageModel.availability();
    if (availability === 'unavailable') return null;

    publish({ phase: 'loading', progress: 0, detail: "Starting the browser's built-in AI" });
    const probe = await languageModel.create({
      monitor(monitor) {
        monitor.addEventListener('downloadprogress', (event) => {
          publish({
            phase: 'loading',
            progress: Math.round(event.loaded * 100),
            detail: "Downloading the browser's built-in AI",
          });
        });
      },
    });
    probe.destroy();

    publish({ phase: 'ready', progress: 100, detail: "Built-in browser AI" });
    return {
      kind: 'prompt-api',
      async generate(system, user) {
        // A fresh session per turn: the grounded context (system) changes on
        // every call, so nothing should carry over from the previous question.
        const session = await languageModel.create({
          initialPrompts: [{ role: 'system', content: system }],
        });
        try {
          return await session.prompt(user);
        } finally {
          session.destroy();
        }
      },
    };
  } catch {
    return null;
  }
}

async function loadWebLlm(): Promise<Engine> {
  publish({ phase: 'loading', progress: 0, detail: 'Fetching WebLLM' });
  const webllm = await import('@mlc-ai/web-llm');
  const candidate = webllm.prebuiltAppConfig.model_list.find((entry) =>
    entry.model_id.startsWith('Qwen2.5-0.5B-Instruct'),
  );
  if (!candidate) throw new Error('No small WebLLM model is registered.');

  const engine = await webllm.CreateMLCEngine(candidate.model_id, {
    initProgressCallback: (report: { progress: number; text: string }) => {
      publish({
        phase: 'loading',
        progress: Math.round(report.progress * 100),
        detail: report.text || 'Downloading weights',
      });
    },
  });

  publish({ phase: 'ready', progress: 100, detail: `${MODEL_LABEL} (WebLLM) on this device` });
  return {
    kind: 'webllm',
    async generate(system, user) {
      const reply = await engine.chat.completions.create({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.5,
        max_tokens: 220,
      });
      return reply.choices[0]?.message.content ?? '';
    },
  };
}

let enginePromise: Promise<Engine> | null = null;

function loadEngine(): Promise<Engine> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('The local model only runs in the browser.'));
  }
  if (!enginePromise) {
    enginePromise = (async () => {
      const promptApi = await tryPromptApi();
      if (promptApi) return promptApi;
      return loadWebLlm();
    })().catch((error: unknown) => {
      enginePromise = null;
      const message = error instanceof Error ? error.message : 'Could not load the model';
      publish({ phase: 'failed', progress: 0, detail: message });
      throw error;
    });
  }
  return enginePromise;
}

export function preloadModel(): Promise<void> {
  return loadEngine().then(() => undefined);
}

const SYSTEM_PROMPT =
  'You are Ben, a patient tutor talking with a beginner. Stay in that role. Sound like a person: warm, short sentences, everyday words. Two to five sentences. You do not call tools yourself. The page already looked up the lesson or the published page in the material. Explain that material. Never say "I only answer from", "scope", "search_lessons", "OKF", or "notes". If the material names a source, keep that source. Do not invent a lesson that is not in the material.';

/** Returns null when no engine is available or the draft fails the sanity check. */
export async function rewriteWithModel(
  question: string,
  context: string,
  prior: string,
): Promise<string | null> {
  try {
    const engine = await loadEngine();
    const history = prior ? `What you already said:\n${prior}\n\n` : '';
    const material = context.trim()
      ? context
      : 'None. This question is not covered by a lesson.';
    const output = await engine.generate(
      SYSTEM_PROMPT,
      `${history}Lesson material:\n${material}\n\nStudent: ${question}`,
    );
    const draft = output.replace(/^answer:\s*/i, '').trim();
    if (!acceptDraft(draft, question)) return null;
    if (/\bi don't have a lesson\b/i.test(draft) && context.trim().length > 0) return null;
    const sourceTokens = tokenize(context);
    if (sourceTokens.length > 12) {
      const draftTokens = new Set(tokenize(draft));
      const shared = sourceTokens.filter((token) => draftTokens.has(token)).length / sourceTokens.length;
      if (shared > 0.82) return null;
    }
    return draft;
  } catch {
    return null;
  }
}

const PARAMETRIC_SYSTEM_PROMPT =
  'You are an expert system design tutor. The user has asked a general software architecture question that falls outside the specific coursework. Explain the concept concisely using your internal knowledge. Do not hallucinate external sources.';

/**
 * No lesson covers this question, and there is no web lookup: the model
 * answers from its own trained knowledge instead. Unlike rewriteWithModel
 * there is no grounded material to check the draft against, so this skips
 * the context-overlap and embedding-drift checks entirely -- the caller
 * (QaWidget) is responsible for labelling the reply as general knowledge,
 * not lesson content.
 */
export async function answerParametrically(question: string, prior: string): Promise<string | null> {
  try {
    const engine = await loadEngine();
    const history = prior ? `What you already said:\n${prior}\n\n` : '';
    const output = await engine.generate(PARAMETRIC_SYSTEM_PROMPT, `${history}Student: ${question}`);
    const draft = output.trim();
    if (!acceptDraft(draft, question)) return null;
    return draft;
  } catch {
    return null;
  }
}
