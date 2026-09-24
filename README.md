# System Design Mastery

**[🚀 Live course: 36 interactive lessons](https://veeresh-bikkaneti.github.io/system-design-and-architecture/)** — free, runs entirely in your browser. Nothing to install, no account, no signup.

## How it works

1. **Open the course** at the link above.
2. **Follow the roadmap** from lesson 1 (beginner basics) to lesson 36 (frontier topics like AI agents and multi-region design) — or jump straight to any topic.
3. **Learn by reading** — every lesson explains its topic in plain English with architecture diagrams, real-world analogies, and a short quiz to check your understanding.
4. **Track progress and earn badges** — your progress and quiz scores are saved in your own browser. Finish lesson groups to earn badges you can show on LinkedIn.
5. **Go deeper (optional)** — each lesson ends with hand-picked conference talks and tutorials when you want more than the lesson covers.

The lessons, quizzes, and badges are a static site, so your progress never leaves your machine. Ben, the chat button, also runs entirely on your machine — there is no backend and no server for chat.

## AI assistant (100% client-side, no key, no cloud model)

Stuck on a lesson? The floating chat button opens Ben. He never calls an AI provider or a server of ours. Setup, the tool loop, and the diagram are in [docs/ai-tutor.md](docs/ai-tutor.md).

- **On-device inference, two tiers.** Ben first tries the browser's own built-in AI (Chrome's Prompt API). If that's not available, he falls back to WebLLM, running a small model on your GPU via WebGPU, with weights cached in IndexedDB after the first download. Either way, inference runs on your device — no API key, no subscription, no Cloudflare Worker in the loop.
- **Any browser.** The chat UI itself (retrieval, routing, transcript) uses only standard Web APIs (`fetch`, `localStorage`) and works everywhere; the on-device generation step degrades gracefully where neither engine is available, falling back to the grounded lesson text without a rewrite.
- **Clean context.** The course is an [Open Knowledge Format](https://github.com/GoogleCloudPlatform/open-knowledge-format) bundle: one short card per lesson, plus guides for OKF itself and for LangChain tool calling. Each question retrieves two or three cards. The model only sees that slice.
- **Tool calling, LangChain-shaped.** The page, not the model, runs `search_lessons`, `read_concept`, and `web_search`. Tool output is data, not new instructions. If the model's draft is unusable, the grounded reply stays.
- **Memory.** The conversation transcript is persisted to your browser's `localStorage`, so it survives a reload; "New topic" clears it explicitly.

The assistant is strictly additive: every lesson, quiz, badge, and progress feature works without it.

## Curriculum

Lessons are original explanatory text written for this course, covering standard, widely taught system-design topics (the CAP theorem, load balancing, data partitioning, and more). Each lesson cites the primary and canonical sources for its topic in a "Sources & further reading" section, and ends with "Go deeper" video picks, so the material is grounded in the field rather than in any single reference.

### References & acknowledgments

The course draws on standard, openly available system-design literature, including:

- Martin Kleppmann, *Designing Data-Intensive Applications* (O'Reilly, 2017).
- Betsy Beyer et al., *Site Reliability Engineering* (Google / O'Reilly, 2016).
- Seminal papers such as Gilbert & Lynch (2002) on the CAP theorem and DeCandia et al. (2007) on Dynamo.
