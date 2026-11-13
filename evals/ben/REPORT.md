# Ben routing eval

153 diagnosis + 60 holdout cases, lesson index d7cf5587d308a692. Regenerate with `npm run eval:ben`.

| pipeline, set | accuracy | drift: off-course answered | off-course, lessons offered | course turned away |
|---|---|---|---|---|
| keyword pipeline, cases | 69.9% | 24.5% | 0.0% | 4.9% |
| semantic router, cases | 88.2% | 2.0% | 2.0% | 2.4% |
| keyword pipeline, holdout | 63.3% | 30.0% | 0.0% | 7.4% |
| semantic router, holdout | 86.7% | 5.0% | 15.0% | 0.0% |
| keyword pipeline, all | 68.1% | 26.1% | 0.0% | 5.5% |
| semantic router, all | 87.8% | 2.9% | 5.8% | 1.8% |

Lesson ranking: top-1 93.5%, top-3 97.2% (108 course cases)

Semantic router, expected vs got (all cases):
| expected \ got | lesson | clarify | parametric_fallback | redirect | self | howto |
|---|---|---|---|---|---|---|
| lesson | 97 | 8 | 2 | 2 | 0 | 0 |
| clarify | 0 | 1 | 0 | 0 | 0 | 0 |
| parametric_fallback | 2 | 2 | 24 | 1 | 0 | 0 |
| redirect | 1 | 4 | 1 | 53 | 0 | 0 |
| self | 0 | 0 | 0 | 1 | 9 | 0 |
| howto | 0 | 0 | 0 | 0 | 0 | 5 |

Misses:
- [cases] c-solid-2: expected lesson, got parametric_fallback (solid-principles)
- [cases] c-part-2: expected lesson, got clarify (data-partitioning)
- [cases] c-cloud-2: expected lesson, got clarify (cloud-native-architecture)
- [cases] c-repl-1: expected lesson, got lesson (caching-strategies)
- [cases] c-repl-2: expected lesson, got lesson (scaling-web-service)
- [cases] c-rate-2: expected lesson, got clarify (rate-limiting)
- [cases] c-mpp-2: expected lesson, got redirect (anti-corruption-layer)
- [cases] c-raft-2: expected lesson, got parametric_fallback (replication-consistency-models)
- [cases] c-shard-1: expected lesson, got redirect (resilience-patterns)
- [cases] c-dtx-1: expected lesson, got lesson (microservices-patterns-pitfalls)
- [cases] c-dtx-2: expected lesson, got clarify (distributed-transactions)
- [cases] c-obs-1: expected lesson, got clarify (caching-strategies)
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
- [holdout] h-trap-gateway-arch: expected redirect, got parametric_fallback (api-gateways)
- [holdout] h-trap-token-arcade: expected redirect, got clarify (url-shortener)
- [holdout] h-s-name: expected self, got redirect (authn-authz)
