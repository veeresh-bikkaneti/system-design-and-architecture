/**
 * Ambient types for Chrome's built-in AI (the Prompt API), not yet in lib.dom.
 * Minimal surface: only what inference.ts actually calls.
 * https://developer.chrome.com/docs/ai/prompt-api
 */
type LanguageModelAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface LanguageModelDownloadProgressEvent extends Event {
  loaded: number;
}

interface LanguageModelCreateMonitor extends EventTarget {
  addEventListener(
    type: 'downloadprogress',
    listener: (event: LanguageModelDownloadProgressEvent) => void,
  ): void;
}

interface LanguageModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LanguageModelCreateOptions {
  initialPrompts?: LanguageModelMessage[];
  temperature?: number;
  topK?: number;
  monitor?: (monitor: LanguageModelCreateMonitor) => void;
}

interface LanguageModelSession {
  prompt(input: string): Promise<string>;
  destroy(): void;
}

interface LanguageModelStatic {
  availability(): Promise<LanguageModelAvailability>;
  create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>;
}

// eslint-disable-next-line no-var
declare var LanguageModel: LanguageModelStatic | undefined;
