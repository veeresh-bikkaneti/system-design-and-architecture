# Ben routing eval

144 diagnosis + 48 holdout cases, lesson index 1d9536e69afe2d0d. Regenerate with `npm run eval:ben`.

| pipeline, set | accuracy | drift: off-course answered | off-course, lessons offered | course turned away |
|---|---|---|---|---|
| keyword pipeline, cases | 73.6% | 24.5% | 0.0% | 3.9% |
| semantic router, cases | 86.1% | 2.0% | 2.0% | 2.6% |
| keyword pipeline, holdout | 70.8% | 30.0% | 0.0% | 9.1% |
| semantic router, holdout | 87.5% | 0.0% | 10.0% | 0.0% |
| keyword pipeline, all | 72.9% | 26.1% | 0.0% | 5.1% |
| semantic router, all | 86.5% | 1.4% | 4.3% | 2.0% |

Lesson ranking: top-1 91.8%, top-3 95.9% (98 course cases)

Semantic router, expected vs got (all cases):
| expected \ got | lesson | clarify | parametric_fallback | redirect | self |
|---|---|---|---|---|---|
| lesson | 87 | 8 | 2 | 2 | 0 |
| clarify | 0 | 0 | 0 | 0 | 0 |
| parametric_fallback | 2 | 0 | 21 | 1 | 0 |
| redirect | 1 | 3 | 0 | 55 | 0 |
| self | 0 | 0 | 0 | 1 | 9 |

Misses:
- [cases] c-solid-2: expected lesson, got clarify (solid-principles)
- [cases] c-part-2: expected lesson, got clarify (data-partitioning)
- [cases] c-cloud-2: expected lesson, got clarify (cloud-native-architecture)
- [cases] c-bff-1: expected lesson, got lesson (api-gateways)
- [cases] c-repl-1: expected lesson, got lesson (caching-strategies)
- [cases] c-repl-2: expected lesson, got lesson (scaling-web-service)
- [cases] c-rate-2: expected lesson, got clarify (rate-limiting)
- [cases] c-mpp-2: expected lesson, got redirect (anti-corruption-layer)
- [cases] c-raft-2: expected lesson, got parametric_fallback (replication-consistency-models)
- [cases] c-shard-1: expected lesson, got redirect (resilience-patterns)
- [cases] c-dtx-1: expected lesson, got lesson (microservices-patterns-pitfalls)
- [cases] c-dtx-2: expected lesson, got parametric_fallback (distributed-transactions)
- [cases] c-obs-1: expected lesson, got lesson (caching-strategies)
- [cases] c-ddd-2: expected lesson, got clarify (domain-driven-design)
- [cases] c-acl-1: expected lesson, got clarify (anti-corruption-layer)
- [cases] c-ai-1: expected lesson, got lesson (microservices-patterns-pitfalls)
- [cases] c-es-2: expected lesson, got lesson (replication-consistency-models)
- [cases] t-hashtable: expected parametric_fallback, got lesson (url-shortener)
- [cases] trap-cache-feelings: expected redirect, got clarify (caching-strategies)
- [cases] trap-queue-bank: expected redirect, got lesson (message-queues)
- [holdout] h-c-dip: expected lesson, got clarify (solid-principles)
- [holdout] h-c-kafka-batch: expected lesson, got clarify (stream-vs-batch)
- [holdout] h-t-postman: expected parametric_fallback, got redirect (designing-chat-at-scale)
- [holdout] h-d-ai-art: expected redirect, got clarify (designing-ai-systems)
- [holdout] h-trap-stream-river: expected redirect, got clarify (stream-vs-batch)
- [holdout] h-s-name: expected self, got redirect (authn-authz)
