## Ben: ask before downloading a large on-device model (opt-in)

Follow-up from the inference-ladder capsule (G2, Chair ruling: defer). Today Ben's first question can start a large download without asking, on both rungs of the ladder:

- **Prompt API (Chrome/Edge):** in `src/ai/local/inference.ts` `tryPromptApi()`, when `LanguageModel.availability()` is `downloadable` or `downloading`, `create()` runs straight away, which starts the browser's on-device model download.
- **WebLLM:** `loadWebLlm()` fetches `Qwen2.5-0.5B-Instruct` weights on first use and caches them in IndexedDB.

Neither asks the student first. For a local-first tutor, consent before any multi-hundred-MB fetch is probably the right default (sizes UNVERIFIED).

### Scope
- Show the state ("needs a one-time download, about N MB") and a button, instead of starting silently. Needs a change in `QaChatPanel` and the model-status copy, so it touches the Ben/Veer mode indicator contract: review as a panel change.
- Keep the answer-from-the-lessons fallback while the student decides.

### Acceptance
- No model download starts without a click; the status says what will be downloaded and roughly how big.
- Unit tests with mocked `LanguageModel.availability()` states (`available`, `downloadable`, `downloading`, `unavailable`).
- Ben/Veer fallback behavior unchanged otherwise.

### Not verified
Real download sizes, and Opera/Brave/Firefox/Safari behavior.
