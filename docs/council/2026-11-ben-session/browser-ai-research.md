# Browser on-device AI a web page can call (as of 2026-11-01)

Method: primary pages fetched via WebFetch (summarised by a small model, so verbatim quotes are only as good as that summary). AIDefence scan tool was not available in this session, so `screened` = false. No repo marker file written (task was read-only). Fetch-text quoted here is paraphrase, not instructions.

## Common API (W3C Web ML CG "Prompt API"), global `LanguageModel`
Feature detect (secure context; create() needs transient user activation):
```js
if (!window.isSecureContext || !("LanguageModel" in window)) return fallback();
const a = await LanguageModel.availability(); // same options you will pass to create()
if (a === "unavailable") return fallback();
// "downloadable" | "downloading" | "available"
const s = await LanguageModel.create({ monitor: m =>
  m.addEventListener("downloadprogress", e => setPct(e.loaded / e.total * 100)) }); // call from a click
```
Edge docs show `if (!LanguageModel)` which throws ReferenceError when undefined; use `"LanguageModel" in window`.
Permissions-Policy `language-model`: if disallowed, availability() = "unavailable", other methods throw NotAllowedError (MDN Prompt_API).

## Table
| Browser | Page-callable? | Status / gate | HW / OS | Ctx / output | Cross-origin iframe |
|---|---|---|---|---|---|
| Chrome (Gemini Nano) | `LanguageModel` YES. Intent to Ship, desktop 148 (blink-dev, thread Apr 2026; "ship enabled for all users"). Chrome docs page still says "web version still being developed"; sampling params (topK/temp) need origin trial on web. Docs stable-badge for extensions since 138. CONFLICT: docs vs blink-dev, see below | No flag stated for 148 web; model downloads on first create() | Win10/11, macOS 13+, Linux, ChromeOS Chromebook Plus. No Android/iOS/WebView. 22 GB free disk (deleted if <10 GB), >4 GB VRAM, 16 GB RAM + 4 cores, unmetered net. Langs: en, es, ja (M140) | No number published; read `session.contextWindow` / `contextUsage`. Overflow drops oldest pairs (not system prompt), fires `contextoverflow`; else QuotaExceededError | Top-level + same-origin only; cross-origin needs `allow="language-model"`. Not in Web Workers |
| Edge (Phi-4-mini) | `LanguageModel` YES, but "developer preview", Canary/Dev only (>=138.0.3309.2); flag `edge://flags` "Prompt API for on-device language model". Docs updated 2026-10-19 still say this; stable Edge NOT confirmed | Blink-dev: Edge "will ship with a different model". Edge 150.0.4070+ also has prerelease Aion-1.0-Instruct (flag "Enable prerelease on-device language model"; CPU-capable, for Medium/Low perf class) | Win10/11, macOS 13.3+, 20 GB free (deleted <10 GB), 5.5 GB VRAM, unmetered. Check `edge://on-device-internals` perf class High+ | Not stated | Not stated in Edge doc (UNVERIFIED; assume Chromium policy) |
| Firefox | NO. Mozilla position on Prompt API: negative (standards-positions #1213, re-affirmed 2026-04-29). Mozilla blog (2026-09-02): only browser features (AI controls toggle, translations, PDF alt text, tab-group suggestions, link-preview key points, chatbot sidebar for Claude/ChatGPT/Gemini/Le Chat, Smart Window beta). None exposed to pages per that post (post silent on APIs) | n/a | n/a | n/a | n/a |
| Safari | NO. WebKit position on ML Prompt API: oppose (standards-positions #495, label 2026-05-27). No web LLM API found | n/a. Apple Foundation Models is a native Swift API, not web-exposed (UNVERIFIED, not fetched) | n/a | n/a | n/a |
| Opera | UNVERIFIED. Searches found only Aria / older AI features; no primary doc for a page-callable API | - | - | - | - |
| Brave | UNVERIFIED. Only Leo (browser assistant) found; no primary doc for LanguageModel | Chromium-based, so API may be present or stripped; test at runtime | - | - | - |

Conflict (Chrome): docs (developer.chrome.com/docs/ai/prompt-api and built-in-apis) show the web row as Chrome 148 but say "still being developed"; blink-dev says shipping 148. Treat as "ships in 148, may be gated/rolling out"; always runtime-detect. Whether 148 shipped unflagged for plain web pages: UNVERIFIED (a DEV.to secondary post says shipped 2026-05-05).
MDN: LanguageModel "Limited availability", not Baseline.

## Fallback (not re-verified this session)
WebLLM (mlc-ai) / Transformers.js on WebGPU: works in Chrome/Edge/Firefox/Safari with WebGPU, needs user download of weights (hundreds of MB to GB), cached in browser storage. Check `navigator.gpu` and `await navigator.gpu.requestAdapter()`. UNVERIFIED here (no fetch). Edge docs themselves name WebNN / ONNX Runtime Web as alternatives.

## robots.txt token claim `__usage_ai-training`
Verdict: PARTLY TRUE, "OpenAI/Google/Microsoft/Anthropic back it" NOT confirmed.
Confirmed from primary (datatracker.ietf.org/doc/draft-kelley-aipref-training-preference-signal/ and ietf.org/archive/id/draft-kelley-aipref-training-preference-signal-00.txt):
- Name: draft-kelley-aipref-training-preference-signal-00, "Machine-Readable Training Preference Signal", 10 pages, dated 2026-10-30, expires 2027-05-03. Active individual I-D, intended status Standards Track, NOT IETF-endorsed, no formal standing; discussed on AI Preferences WG list.
- Sole author: Kevin Kelley, affiliated with Anthropic. Not a multi-vendor draft.
- Contributors table (~50 individuals, "for identification only", participating as individuals) lists people at Anthropic, Google, Microsoft, OpenAI, Meta, Cloudflare, Common Crawl, News Corp, Elsevier, Adobe, EFF. That is acknowledgment, not employer endorsement. Draft names no vendor that implements/honors the token.
- Token defined in section 4.1: `__usage_ai-training`.
Exact syntax (Figure 1):
```
User-Agent: __usage_ai-training
Disallow: /
Allow: /press-kit/
```
Meaning: preference against AI training for all paths except /press-kit/ (in favour). No new directives/grammar; uses RFC 9309 [ROBOTS] longest-match lookup. `User-Agent: *` MUST NOT match the token. No group with the token = no preference expressed. A group may list several tokens, mixed with ordinary product tokens.
Secondary-only / not found: any vendor blog or announcement of support by OpenAI, Google, Microsoft or Anthropic (none located; I did not search news for it). Treat the claim as UNVERIFIED.

## Ladder recommendation
1. Probe `"LanguageModel" in window` + `await LanguageModel.availability()`; "available" -> use it silently; never block the app on it.
2. "downloadable"/"downloading" -> show opt-in button ("Download tutor model, ~GB"), call create() on click with downloadprogress monitor; handle NotAllowedError, QuotaExceededError.
3. "unavailable"/absent (Firefox, Safari, Edge stable, low-spec) -> WebGPU path (WebLLM small model) behind an explicit opt-in, gated on `navigator.gpu.requestAdapter()`.
4. No WebGPU -> existing rule-based Ben / retrieval answers (no LLM), plus optional BYO cloud link; never silently send data off-device.
5. Don't embed tutor in a cross-origin iframe (needs `allow="language-model"`), keep it top-level on GitHub Pages; keep output defensible since model differs per browser (Gemini Nano vs Phi-4-mini): test prompts on both.
