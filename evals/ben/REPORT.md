# Ben routing eval

201 diagnosis + 103 holdout cases, lesson index d7cf5587d308a692. Regenerate with `npm run eval:ben`.

| pipeline, set | accuracy | drift: off-course answered | off-course, lessons offered | course turned away |
|---|---|---|---|---|
| keyword pipeline, cases | 70.1% | 26.1% | 0.0% | 5.8% |
| semantic router, cases | 87.1% | 2.9% | 5.8% | 1.9% |
| keyword pipeline, holdout | 58.3% | 37.1% | 0.0% | 3.8% |
| semantic router, holdout | 66.0% | 11.4% | 11.4% | 7.7% |
| keyword pipeline, all | 66.1% | 29.8% | 0.0% | 5.1% |
| semantic router, all | 79.9% | 5.8% | 7.7% | 3.8% |

Lesson ranking: top-1 90.3%, top-3 96.8% (155 course cases)

Semantic router, expected vs got (all cases):
| expected \ got | lesson | clarify | parametric_fallback | redirect | self |
|---|---|---|---|---|---|
| lesson | 131 | 16 | 3 | 6 | 0 |
| clarify | 0 | 0 | 0 | 0 | 0 |
| parametric_fallback | 2 | 3 | 33 | 6 | 0 |
| redirect | 3 | 7 | 2 | 75 | 0 |
| self | 0 | 1 | 1 | 4 | 11 |

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
- [cases] h-c-dip: expected lesson, got clarify (solid-principles)
- [cases] h-c-kafka-batch: expected lesson, got clarify (stream-vs-batch)
- [cases] h-t-postman: expected parametric_fallback, got redirect (designing-chat-at-scale)
- [cases] h-d-ai-art: expected redirect, got clarify (designing-ai-systems)
- [cases] h-trap-stream-river: expected redirect, got clarify (stream-vs-batch)
- [cases] h-trap-gateway-arch: expected redirect, got parametric_fallback (api-gateways)
- [cases] h-trap-token-arcade: expected redirect, got clarify (url-shortener)
- [cases] h-s-name: expected self, got redirect (designing-chat-at-scale)
- [holdout] n-c-002: expected lesson, got clarify (anti-corruption-layer)
- [holdout] n-c-003: expected lesson, got redirect (stream-vs-batch)
- [holdout] n-c-006: expected lesson, got clarify (authn-authz)
- [holdout] n-c-007: expected lesson, got lesson (search-autocomplete)
- [holdout] n-c-008: expected lesson, got redirect (autocomplete-freshness-safety)
- [holdout] n-c-009: expected lesson, got lesson (design-instagram)
- [holdout] n-c-010: expected lesson, got lesson (api-gateways)
- [holdout] n-c-012: expected lesson, got lesson (replication-consistency-models)
- [holdout] n-c-014: expected lesson, got clarify (cdns)
- [holdout] n-c-017: expected lesson, got clarify (data-partitioning)
- [holdout] n-c-018: expected lesson, got parametric_fallback (designing-ai-systems)
- [holdout] n-c-028: expected lesson, got clarify (graphql-vs-rest)
- [holdout] n-c-029: expected lesson, got clarify (idempotency)
- [holdout] n-c-036: expected lesson, got lesson (cloud-native-architecture)
- [holdout] n-c-042: expected lesson, got redirect (search-autocomplete)
- [holdout] n-c-044: expected lesson, got clarify (load-balancers)
- [holdout] n-c-048: expected lesson, got clarify (data-partitioning)
- [holdout] n-c-050: expected lesson, got redirect (solid-principles)
- [holdout] n-t-055: expected parametric_fallback, got redirect (cap-theorem)
- [holdout] n-t-057: expected parametric_fallback, got redirect (graphql-vs-rest)
- [holdout] n-t-060: expected parametric_fallback, got redirect (autocomplete-freshness-safety)
- [holdout] n-t-062: expected parametric_fallback, got redirect (idempotency)
- [holdout] n-t-063: expected parametric_fallback, got redirect (nosql-databases)
- [holdout] n-t-067: expected parametric_fallback, got clarify (cloud-native-architecture)
- [holdout] n-d-071: expected redirect, got lesson (designing-ai-systems)
- [holdout] n-d-072: expected redirect, got parametric_fallback (graphql-vs-rest)
- [holdout] n-d-077: expected redirect, got lesson (microservices-vs-monolith)
- [holdout] n-d-079: expected redirect, got clarify (solid-principles)
- [holdout] n-o-084: expected redirect, got clarify (consensus-raft)
- [holdout] n-o-086: expected redirect, got clarify (url-shortener)
- [holdout] n-s-103: expected self, got redirect (authn-authz)
- [holdout] n-s-104: expected self, got clarify (cloud-native-architecture)
- [holdout] n-s-105: expected self, got redirect (autocomplete-freshness-safety)
- [holdout] n-s-106: expected self, got redirect (design-instagram)
- [holdout] n-s-107: expected self, got parametric_fallback (interview-framework)
