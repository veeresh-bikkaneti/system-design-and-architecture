import { acceptDraft } from './agent';
import { sanitizeModelOutput } from './sanitize';
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
export type ModelPhase = 'idle' | 'loading' | 'ready' | 'failed' | 'cancelled';

export interface ModelStatus {
  phase: ModelPhase;
  progress: number;
  detail: string;
}

interface Engine {
  kind: EngineKind;
  /** Shown in the header once this engine is ready. */
  label: string;
  generate(system: string, user: string): Promise<string>;
  /** Release a load that finished after we had already given up on it. */
  dispose?(): void;
}

export const MODEL_LABEL = 'On-device AI';
export const MODEL_UNAVAILABLE = 'On-device model unavailable · answering from the lessons';
export const MODEL_CANCELLED = 'On-device model load stopped · answering from the lessons';

/**
 * Two-stage "no news" bound. There is deliberately NO total cap: a slow but
 * steady download (QA saw 3-6 %/min) must never be killed for being slow.
 * - Before the first progress event the load still has the WebGPU adapter
 *   request, the dynamic import and the config fetch to get through.
 * - After any progress event the next one must follow within the stall window.
 * UNVERIFIED defaults: WebLLM reports once per finished weight shard (and
 * about once a second while compiling shaders), and the shard size comes from
 * a remote manifest that is not in the installed package, so the right numbers
 * need a live throttled-network run (getLoadTiming records the data).
 */
export const FIRST_PROGRESS_TIMEOUT_MS = 120_000;
export const STALL_TIMEOUT_MS = 60_000;

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

/** Local-only load timing (ms since epoch). Numbers only: no message text, nothing is sent anywhere. */
export interface LoadTiming {
  startedAt: number | null;
  firstProgressAt: number | null;
  readyAt: number | null;
  progressEvents: number;
  errorCount: number;
}

const timing: LoadTiming = {
  startedAt: null,
  firstProgressAt: null,
  readyAt: null,
  progressEvents: 0,
  errorCount: 0,
};

export function getLoadTiming(): LoadTiming {
  return { ...timing };
}

/** What a running load may do. All of it is a no-op once the load has been abandoned. */
interface LoadContext {
  signal: AbortSignal;
  alive(): boolean;
  /** A real progress event from the library: counts it and re-arms the stall bound. */
  progress(next: ModelStatus): void;
  /** A status line that is not a library progress event (does not re-arm the bound). */
  note(next: ModelStatus): void;
}

class LoadAbandoned extends Error {}

async function tryPromptApi(ctx: LoadContext): Promise<Engine | null> {
  if (typeof LanguageModel === 'undefined') return null;
  const languageModel = LanguageModel;
  try {
    const availability = await languageModel.availability();
    if (availability === 'unavailable') return null;

    ctx.note({ phase: 'loading', progress: 0, detail: "Starting the browser's built-in AI" });
    // `signal` is part of the Prompt API's create() options; the ambient type in
    // promptApi.d.ts predates it, so it is added here.
    const options: LanguageModelCreateOptions & { signal?: AbortSignal } = {
      signal: ctx.signal,
      monitor(monitor) {
        monitor.addEventListener('downloadprogress', (event) => {
          ctx.progress({
            phase: 'loading',
            progress: Math.round(event.loaded * 100),
            detail: "Downloading the browser's built-in AI",
          });
        });
      },
    };
    const probe = await languageModel.create(options);
    probe.destroy();

    return {
      kind: 'prompt-api',
      label: 'Built-in browser AI',
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

/**
 * The WebLLM ladder pins (ADR 0001, Ben increment). Exact IDs — a lookup
 * that finds neither pin fails loudly; the old `startsWith('Qwen2.5-0.5B…')`
 * prefix match was a silent-disable fragility (F9) and is retired.
 *
 * DEFERRED TIER (Seat C trigger): Qwen3's output hygiene under WebLLM
 * cannot be verified in-branch, so these pins are implemented and
 * unit-tested but NOT loaded in production yet — `loadWebLlm` keeps
 * CURRENT_WEBLLM_MODEL_ID until a real-device pass verifies the tier.
 */
export const WEBLLM_MODEL_IDS = {
  normal: 'Qwen3-1.7B-q4f16_1-MLC',
  weak: 'Qwen3-0.6B-q4f16_1-MLC',
} as const;

/** The model the production WebLLM load still runs (see the deferral note above). */
export const CURRENT_WEBLLM_MODEL_ID = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';

/** Pick the ladder rung's exact model ID from a WebLLM config list. Throws on a miss. */
export function pickWebLlmModelId(modelList: readonly { model_id: string }[], weakDevice: boolean): string {
  const wanted = weakDevice ? WEBLLM_MODEL_IDS.weak : WEBLLM_MODEL_IDS.normal;
  if (!modelList.some((entry) => entry.model_id === wanted)) {
    throw new Error(`WebLLM model ${wanted} is not registered in the app config.`);
  }
  return wanted;
}

/** Weak-device rung from hardware signals (never the user agent). Unknown signals ⇒ normal rung. */
export function isWeakDevice(caps: { deviceMemory?: number; hardwareConcurrency?: number }): boolean {
  return (caps.deviceMemory !== undefined && caps.deviceMemory <= 4) ||
    (caps.hardwareConcurrency !== undefined && caps.hardwareConcurrency <= 4);
}

async function loadWebLlm(ctx: LoadContext): Promise<Engine> {
  // No GPU, no point: skip the big import and the weights download and fail now
  // instead of after a long wait. We only ask for an adapter (fallback ones are
  // fine) and never a device, so this costs next to nothing.
  let adapter: unknown = null;
  try {
    adapter = await navigator.gpu?.requestAdapter();
  } catch {
    // A GPU that throws is a GPU we cannot use.
  }
  if (!adapter) throw new Error('No WebGPU adapter on this device.');

  ctx.note({ phase: 'loading', progress: 0, detail: 'Fetching WebLLM' });
  const webllm = await import('@mlc-ai/web-llm');
  if (!ctx.alive()) throw new LoadAbandoned();
  const candidate = webllm.prebuiltAppConfig.model_list.find(
    (entry) => entry.model_id === CURRENT_WEBLLM_MODEL_ID,
  );
  if (!candidate) throw new Error(`WebLLM model ${CURRENT_WEBLLM_MODEL_ID} is not registered.`);

  // CreateMLCEngine has no abort option and only hands back the engine once it
  // has finished loading. Abandoning the wait therefore cannot stop the download
  // (it may continue in the background); a late result is discarded via dispose().
  const engine = await webllm.CreateMLCEngine(candidate.model_id, {
    initProgressCallback: (report: { progress: number; text: string }) => {
      ctx.progress({
        phase: 'loading',
        progress: Math.round(report.progress * 100),
        detail: report.text || 'Downloading weights',
      });
    },
  });

  return {
    kind: 'webllm',
    label: `${MODEL_LABEL} (WebLLM) on this device`,
    dispose() {
      // unload() exists on real engines; stubs in tests may not have it.
      void (engine as { unload?: () => Promise<void> }).unload?.();
    },
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
let generation = 0;
/** Ends the load in flight (if any) as failed or cancelled. */
let endActiveLoad: ((phase: 'failed' | 'cancelled', error: Error) => void) | null = null;

function startLoad(): Promise<Engine> {
  const mine = ++generation;
  const abort = new AbortController();
  let done = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  timing.startedAt = Date.now();
  timing.firstProgressAt = null;
  timing.readyAt = null;
  timing.progressEvents = 0;

  const promise = new Promise<Engine>((resolve, reject) => {
    const alive = () => !done && mine === generation;
    const end = (phase: 'failed' | 'cancelled', error: Error) => {
      if (!alive()) return;
      done = true;
      clearTimeout(timer);
      endActiveLoad = null;
      // Abandon the wait. The Prompt API create() honours the signal; WebLLM's
      // download may carry on in the background and is discarded if it lands.
      abort.abort();
      if (phase === 'failed') {
        timing.errorCount++;
        console.error(error); // the message stays in the console, never in getLoadTiming()
      }
      publish({
        phase,
        progress: 0,
        detail: phase === 'failed' ? MODEL_UNAVAILABLE : MODEL_CANCELLED,
      });
      reject(error);
    };
    const arm = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(
        () => end('failed', new Error(`No model progress for ${ms / 1000} s.`)),
        ms,
      );
    };
    const ctx: LoadContext = {
      signal: abort.signal,
      alive,
      note(next) {
        if (alive()) publish(next);
      },
      progress(next) {
        if (!alive()) return;
        timing.progressEvents++;
        timing.firstProgressAt ??= Date.now();
        arm(STALL_TIMEOUT_MS);
        publish(next);
      },
    };

    endActiveLoad = end;
    publish({ phase: 'loading', progress: 0, detail: 'Getting the on-device AI ready' });
    arm(FIRST_PROGRESS_TIMEOUT_MS);
    void (async () => {
      const promptApi = await tryPromptApi(ctx);
      if (promptApi) return promptApi;
      if (!alive()) throw new LoadAbandoned();
      return loadWebLlm(ctx);
    })().then(
      (engine) => {
        if (!alive()) {
          engine.dispose?.(); // late arrival after cancel/fail/retry: throw it away
          return;
        }
        done = true;
        clearTimeout(timer);
        endActiveLoad = null;
        timing.readyAt = Date.now();
        publish({ phase: 'ready', progress: 100, detail: engine.label });
        resolve(engine);
      },
      (error: unknown) => end('failed', error instanceof Error ? error : new Error(String(error))),
    );
  });
  // Waiting callers handle the rejection; this just keeps an unwatched one quiet.
  promise.catch(() => {});
  return promise;
}

function loadEngine(): Promise<Engine> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('The local model only runs in the browser.'));
  }
  // The settled promise is kept on purpose: failed and cancelled loads stay that
  // way, so a later wording call never refetches Hub weights (S8).
  enginePromise ??= startLoad();
  return enginePromise;
}

/** Stop waiting for the model. Waiting callers resolve null; later questions do not restart it. */
export function cancelModelLoad(): void {
  if (status.phase === 'loading') endActiveLoad?.('cancelled', new Error('Model load cancelled.'));
}

/** Explicit "try again", allowed only after a cancel. A failed load stays failed until reload. */
export function retryModelLoad(): void {
  if (status.phase !== 'cancelled') return;
  enginePromise = null;
  void loadEngine().catch(() => {});
}

export const SYSTEM_PROMPT =
  'You are Ben, a patient tutor talking with a beginner. Stay in that role. Sound like a person: warm, short sentences, everyday words. Two to five sentences. You do not call tools yourself. The page already looked up the lesson or the published page in the material. Explain that material. Never say "I only answer from", "scope", "search_lessons", "OKF", or "notes". If the material names a source, keep that source. Do not invent a lesson that is not in the material.';

/**
 * QA R-01 output gate. A rejected draft becomes null: the parametric caller then
 * shows the deterministic NO_SOURCE line, and the rewrite caller keeps the card
 * answer. Runs before acceptDraft, which stays as the second check.
 */
function gated(draft: string): string | null {
  const result = sanitizeModelOutput(draft, {
    systemPrompts: [SYSTEM_PROMPT, PARAMETRIC_SYSTEM_PROMPT],
    fallback: '',
  });
  return result.rejected ? null : draft;
}

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
    if (gated(draft) === null || !acceptDraft(draft, question)) return null;
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

export const LOOP_SYNTHESIS_PROMPT =
  'You are Ben, a patient tutor talking with a beginner. The material below was retrieved for this question from the course lessons and, where named, Wikipedia. Explain it in your own warm, short sentences. Use only the material. Name the source when you state a step or a fact from it. Do not invent steps, commands, or sources that are not in the material.';

/**
 * The tool loop's synthesis entry (ADR 0001, Ben increment): the browser's
 * built-in model only, found by feature detection. Returns null when the
 * API is absent, unavailable, or merely downloadable — the loop NEVER
 * triggers a browser-model download; consent for downloads lives in the
 * model-load flow the header already owns. The WebLLM tier is deferred
 * (see WEBLLM_MODEL_IDS), so it is not a synthesis path here.
 */
export async function synthesizeWithPromptApi(system: string, user: string): Promise<string | null> {
  if (typeof LanguageModel === 'undefined') return null;
  try {
    if ((await LanguageModel.availability()) !== 'available') return null;
    const session = await LanguageModel.create({
      initialPrompts: [{ role: 'system', content: system }],
    });
    try {
      const draft = (await session.prompt(user)).trim();
      return draft && gated(draft) !== null ? draft : null;
    } finally {
      session.destroy();
    }
  } catch {
    return null;
  }
}

export const PARAMETRIC_SYSTEM_PROMPT =
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
    if (gated(draft) === null || !acceptDraft(draft, question)) return null;
    return draft;
  } catch {
    return null;
  }
}
