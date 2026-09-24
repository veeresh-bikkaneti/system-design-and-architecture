# Ben routing eval

144 diagnosis + 48 holdout cases, lesson index 5e6eba6a36ba5e92. Regenerate with `npm run eval:ben`.

| pipeline, set | accuracy | drift: off-course answered | off-course, lessons offered | course turned away |
|---|---|---|---|---|
| keyword pipeline, cases | 74.3% | 24.5% | 0.0% | 5.2% |
| semantic router, cases | 86.8% | 2.0% | 2.0% | 2.6% |
| keyword pipeline, holdout | 70.8% | 30.0% | 0.0% | 13.6% |
| semantic router, holdout | 89.6% | 0.0% | 5.0% | 0.0% |
| keyword pipeline, all | 73.4% | 26.1% | 0.0% | 7.1% |
| semantic router, all | 87.5% | 1.4% | 2.9% | 2.0% |

Lesson ranking: top-1 92.9%, top-3 96.9% (98 course cases)

Semantic router, expected vs got (all cases):
| expected \ got | lesson | clarify | lookup | redirect | self |
|---|---|---|---|---|---|
| lesson | 86 | 9 | 2 | 2 | 0 |
| clarify | 0 | 0 | 0 | 0 | 0 |
| lookup | 2 | 0 | 21 | 1 | 0 |
| redirect | 1 | 2 | 0 | 55 | 1 |
| self | 0 | 0 | 0 | 0 | 10 |

Misses:
- [cases] c-part-2: expected lesson, got clarify (data-partitioning)
- [cases] c-cloud-2: expected lesson, got clarify (cloud-native-architecture)
- [cases] c-bff-2: expected lesson, got clarify (bff-backend-for-frontend)
- [cases] c-repl-1: expected lesson, got lesson (caching-strategies)
- [cases] c-repl-2: expected lesson, got lesson (scaling-web-service)
- [cases] c-rate-2: expected lesson, got clarify (rate-limiting)
- [cases] c-mpp-2: expected lesson, got redirect (anti-corruption-layer)
- [cases] c-raft-2: expected lesson, got lookup (replication-consistency-models)
- [cases] c-shard-1: expected lesson, got redirect (resilience-patterns)
- [cases] c-dtx-1: expected lesson, got lesson (microservices-patterns-pitfalls)
- [cases] c-dtx-2: expected lesson, got lookup (distributed-transactions)
- [cases] c-obs-1: expected lesson, got clarify (caching-strategies)
- [cases] c-ddd-2: expected lesson, got clarify (domain-driven-design)
- [cases] c-acl-1: expected lesson, got clarify (anti-corruption-layer)
- [cases] c-ai-1: expected lesson, got lesson (microservices-patterns-pitfalls)
- [cases] c-es-2: expected lesson, got lesson (replication-consistency-models)
- [cases] t-hashtable: expected lookup, got lesson (url-shortener)
- [cases] trap-cache-feelings: expected redirect, got clarify (caching-strategies)
- [cases] trap-queue-bank: expected redirect, got lesson (message-queues)
- [holdout] h-c-dip: expected lesson, got clarify (solid-principles)
- [holdout] h-c-kafka-batch: expected lesson, got clarify (stream-vs-batch)
- [holdout] h-t-postman: expected lookup, got redirect (designing-chat-at-scale)
- [holdout] h-d-ai-art: expected redirect, got self (designing-ai-systems)
- [holdout] h-trap-stream-river: expected redirect, got clarify (stream-vs-batch)
