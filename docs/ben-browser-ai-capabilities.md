# Browser-local AI capabilities for Ben: Chrome, Edge, and Firefox

**Sources checked: 2026-11-06.** Browser APIs, release channels, model requirements, and preview status change quickly. Treat the version and hardware details below as a dated snapshot; always check runtime availability before selecting an inference path.

## At a glance

| Browser | What websites can call | Current status in primary sources | What Ben should assume |
|---|---|---|---|
| Chrome | The Prompt API (`LanguageModel`) can call a browser-provided on-device model from a website. | Chromium’s feature tracker says the desktop Web API ships in Chrome 148; Chrome Extensions shipped earlier. Model and hardware availability still vary. | Try the API only after feature detection and its availability check; otherwise use Ben’s existing local fallback. |
| Microsoft Edge | The experimental Prompt API lets site or extension JavaScript prompt Edge’s built-in small language model. | Developer preview in Edge Canary/Dev from version 138.0.3309.2; additional prerelease model support is documented for version 150.0.4070+. | Treat as preview-only, hardware-gated, and subject to model download or failure. |
| Firefox | Mozilla documents selected on-device browser features and user-facing AI experiences, not a general page-callable Prompt API in the sources below. | On-device models power particular features; Smart Window is a separate beta browser experience, and the sidebar chatbot can use third-party providers. | Do not infer a website-callable model API from Firefox’s consumer AI features; use Ben’s own local fallback unless Mozilla documents a compatible API. |

## Chrome

Chrome’s Prompt API gives a website access to Chrome’s browser-managed on-device language model (Gemini Nano). The Chrome developer guide, updated 2026-10-21, lists the web API at Chrome 148 and the Extensions API at Chrome 138. Chromium’s feature tracker says the desktop Web API is shipping in Chrome 148, while the specification is still being incubated in a Community Group. A separate origin trial covers sampling parameters; API options and rollout are still evolving. [Prompt API guide](https://developer.chrome.com/docs/ai/prompt-api) · [Chromium feature tracker](https://chromestatus.com/feature/5134603979063296)

The API is not universal merely because Chrome is installed. The current guide lists Windows 10/11, macOS 13+, Linux, and ChromeOS 16389+ on Chromebook Plus. Chrome for Android, iOS, and non-Chromebook-Plus ChromeOS are not listed as supported for foundation-model APIs. It requires at least 22 GB free profile-volume storage and either a GPU with more than 4 GB of VRAM or a CPU with at least 16 GB RAM and four cores; the initial model download requires an unmetered connection. The model is downloaded separately on first use. The guide says prompts and outputs stay on-device and that subsequent use does not need a network connection. Check the API and model availability at runtime and handle unavailable, downloading, and failed states. [Chrome hardware and setup documentation](https://developer.chrome.com/docs/ai/prompt-api)

## Microsoft Edge

Microsoft describes Edge’s Prompt API as an **experimental web API** available to websites and browser extensions in Edge Canary and Edge Dev from version 138.0.3309.2. The default Phi-4-mini model has substantial hardware requirements: Windows 10/11 or macOS 13.3+, 20 GB free profile-volume storage, at least 5.5 GB GPU VRAM, and an unmetered connection for the initial download. The docs also describe a prerelease Aion-1.0-Instruct option in Canary/Dev from version 150.0.4070, enabled by a flag, which can run on CPU on devices without a capable GPU. It is not a stable, everywhere-available production contract. [Edge Prompt API documentation](https://learn.microsoft.com/en-us/microsoft-edge/web-platform/prompt-api)

The Writing Assistance APIs are a distinct surface: the Summarizer API is enabled by default in the documented preview, while Writer and Rewriter remain developer-preview APIs in Canary/Dev. They have their own availability and hardware conditions, and should not be conflated with the general Prompt API. [Edge Writing Assistance APIs](https://learn.microsoft.com/en-us/microsoft-edge/web-platform/writing-assistance-apis)

## Firefox

Mozilla documents **specific on-device Firefox features**, including alt-text generation for images added to PDFs and AI-assisted tab grouping. Models used by these features can be inspected or removed through Firefox’s `about:addons` On-Device AI page. This is evidence of browser-managed local inference for those features, not evidence that websites can prompt the same model. [Mozilla Support: On-device AI models in Firefox](https://support.mozilla.org/en-US/kb/on-device-models)

Mozilla’s “AI on your terms” article describes user controls, optional AI features, a sidebar that can connect to selected third-party chatbot providers, and Smart Window. Mozilla says Smart Window is in beta and currently available in English to users in the U.S. and Canada; it can use permitted tab/history context and display sources for web information. These are browser experiences, not a general JavaScript model API for a site. The sources cited here do not document a Firefox equivalent to Chrome’s `LanguageModel` or Edge’s Prompt API; this is a scoped finding about these sources, not a claim that no future Firefox API could exist. [Mozilla: AI on your terms](https://blog.mozilla.org/en/firefox/firefox-ai-on-your-terms/)

## Implications for Ben

1. Keep inference browser-local: feature-detect a supported browser API, check whether its model is usable, and handle download, hardware, policy, and runtime failures. Use WebLLM only as Ben’s existing local fallback where the device supports it; if no local engine can run, retain deterministic lesson-based responses. Do not add a cloud or paid-API fallback.
2. Keep retrieval, lesson citations, confidence, safety rules, and answer validation in Ben. A browser model API supplies generation; it does not itself provide Ben’s curriculum grounding or guarantee strong reasoning, tool/function calling, web scraping, or correct citations. Those capabilities must be implemented and guarded by the app, not assumed from the browser model.
3. Do not treat a browser’s user-facing AI feature as permission for a website to access its model or the user’s browser context. Only use an API that the page can actually call and that reports itself available.

## Primary sources

- Mozilla, [AI on your terms: Firefox meets you where you are](https://blog.mozilla.org/en/firefox/firefox-ai-on-your-terms/) (2026-09-02)
- Mozilla Support, [On-device AI models in Firefox](https://support.mozilla.org/en-US/kb/on-device-models)
- Microsoft, [Prompt API in Microsoft Edge](https://learn.microsoft.com/en-us/microsoft-edge/web-platform/prompt-api)
- Microsoft, [Writing Assistance APIs in Microsoft Edge](https://learn.microsoft.com/en-us/microsoft-edge/web-platform/writing-assistance-apis)
- Chrome for Developers, [Prompt API](https://developer.chrome.com/docs/ai/prompt-api) (updated 2026-10-21)
- Chrome for Developers, [Built-in AI API availability](https://developer.chrome.com/docs/ai/built-in-apis)
- Chromium, [Prompt API feature status](https://chromestatus.com/feature/5134603979063296)
