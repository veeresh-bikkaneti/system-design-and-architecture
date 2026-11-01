# TODOs

## Ranking: unique-tag lead before nearest chunk

- **What:** Pin unique lesson tags before the 0.45 nearest-chunk win, and decide how Guides such as `tutor-loop` rank for local-AI questions.
- **Why:** Live `DDD` returns Anti-Corruption Layer because that MDX says the DDD books call it an anti-corruption layer. Live `tell me about local AI` returns Designing AI Systems. PR #127 CORS-only does not change those leads.
- **Context:** Keyword `prepareTurn('DDD')` already hits `domain-driven-design`. A follow-up test must give ACL a competing high score and still expect `domain-driven-design` as lead. `tutor-loop` is type Guide, so the lesson router cannot pin it today.
- **Depends on:** PR #127 CORS-only landing or remaining open. Do not mix into the CORS diff beyond this file.
