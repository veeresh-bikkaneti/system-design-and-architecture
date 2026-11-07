# Ben routing eval

153 diagnosis + 48 holdout cases, lesson index a7b6c70c56fa6c71. Regenerate with `npm run eval:ben`.

| pipeline, set | accuracy | drift: off-course answered | off-course, lessons offered | course turned away |
|---|---|---|---|---|
| keyword pipeline, cases | 69.9% | 24.5% | 0.0% | 4.9% |
| semantic router, cases | 85.0% | 2.0% | 2.0% | 2.4% |
| keyword pipeline, holdout | 70.8% | 30.0% | 0.0% | 9.1% |
| semantic router, holdout | 89.6% | 5.0% | 0.0% | 0.0% |
| keyword pipeline, all | 70.1% | 26.1% | 0.0% | 5.8% |
| semantic router, all | 86.1% | 2.9% | 1.4% | 1.9% |

Lesson ranking: top-1 92.2%, top-3 96.1% (103 course cases)

Semantic router, expected vs got (all cases):
| expected \ got | lesson | clarify | parametric_fallback | redirect | self |
|---|---|---|---|---|---|
| lesson | 88 | 11 | 3 | 2 | 0 |
| clarify | 0 | 0 | 0 | 0 | 0 |
| parametric_fallback | 2 | 2 | 23 | 1 | 0 |
| redirect | 2 | 1 | 0 | 56 | 0 |
| self | 0 | 0 | 0 | 1 | 9 |

Misses:
- [cases] c-solid-1: expected lesson, got clarify (solid-principles)
- [cases] c-solid-2: expected lesson, got clarify (solid-principles)
- [cases] c-part-1: expected lesson, got parametric_fallback (data-partitioning)
- [cases] c-part-2: expected lesson, got clarify (data-partitioning)
- [cases] c-cloud-2: expected lesson, got clarify (cloud-native-architecture)
- [cases] c-bff-1: expected lesson, got lesson (api-gateways)
- [cases] c-repl-1: expected lesson, got lesson (caching-strategies)
- [cases] c-repl-2: expected lesson, got lesson (scaling-web-service)
- [cases] c-rate-2: expected lesson, got clarify (rate-limiting)
- [cases] c-mpp-2: expected lesson, got redirect (anti-corruption-layer)
- [cases] c-shard-1: expected lesson, got redirect (resilience-patterns)
- [cases] c-dtx-1: expected lesson, got lesson (microservices-patterns-pitfalls)
- [cases] c-dtx-2: expected lesson, got parametric_fallback (distributed-transactions)
- [cases] c-obs-1: expected lesson, got clarify (caching-strategies)
- [cases] c-ddd-2: expected lesson, got clarify (domain-driven-design)
- [cases] c-acl-1: expected lesson, got clarify (anti-corruption-layer)
- [cases] c-ai-1: expected lesson, got lesson (scaling-web-service)
- [cases] c-ai-2: expected lesson, got parametric_fallback (designing-ai-systems)
- [cases] c-es-2: expected lesson, got lesson (replication-consistency-models)
- [cases] c-zt-1: expected lesson, got clarify (zero-trust-security)
- [cases] t-hashtable: expected parametric_fallback, got lesson (url-shortener)
- [cases] trap-cache-feelings: expected redirect, got clarify (caching-strategies)
- [cases] trap-queue-bank: expected redirect, got lesson (message-queues)
- [holdout] h-c-dip: expected lesson, got clarify (solid-principles)
- [holdout] h-c-kafka-batch: expected lesson, got clarify (stream-vs-batch)
- [holdout] h-t-postman: expected parametric_fallback, got redirect (designing-chat-at-scale)
- [holdout] h-d-ai-art: expected redirect, got lesson (designing-ai-systems)
- [holdout] h-s-name: expected self, got redirect (designing-chat-at-scale)
