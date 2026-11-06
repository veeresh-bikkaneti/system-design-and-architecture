# Ben routing eval

201 diagnosis + 0 fresh holdout cases, lesson index d7cf5587d308a692. Regenerate with `npm run eval:ben`.

| pipeline, set | cases | accuracy | drift: off-course answered | off-course, lessons offered | course turned away |
|---|---:|---:|---:|---:|---:|
| keyword pipeline, cases | 201 | 70.1% | 26.1% | 0.0% | 5.9% |
| semantic router, cases | 201 | 89.6% | 2.9% | 5.8% | 2.0% |
| keyword pipeline, holdout | 0 | N/A | N/A | N/A | N/A |
| semantic router, holdout | 0 | N/A | N/A | N/A | N/A |
| keyword pipeline, all | 201 | 70.1% | 26.1% | 0.0% | 5.9% |
| semantic router, all | 201 | 89.6% | 2.9% | 5.8% | 2.0% |

Semantic lesson ranking on course cases:
| set | course cases ranked | top-1 | top-3 |
|---|---:|---:|---:|
| cases | 100 | 93.0% | 97.0% |
| holdout | 0 | N/A | N/A |
| all | 100 | 93.0% | 97.0% |

Semantic router, expected vs got (all cases):
| expected \ got | lesson | clarify | parametric_fallback | redirect | self |
|---|---|---|---|---|---|
| lesson | 95 | 2 | 2 | 2 | 0 |
| clarify | 0 | 6 | 0 | 0 | 0 |
| parametric_fallback | 2 | 1 | 21 | 1 | 0 |
| redirect | 1 | 4 | 1 | 53 | 0 |
| self | 0 | 0 | 0 | 1 | 9 |

Misses:
- [cases] c-solid-2: expected lesson, got parametric_fallback (solid-principles)
- [cases] c-part-2: expected lesson, got clarify (data-partitioning)
- [cases] c-repl-1: expected lesson, got lesson (caching-strategies)
- [cases] c-repl-2: expected lesson, got lesson (scaling-web-service)
- [cases] c-mpp-2: expected lesson, got redirect (anti-corruption-layer)
- [cases] c-raft-2: expected lesson, got parametric_fallback (replication-consistency-models)
- [cases] c-shard-1: expected lesson, got redirect (resilience-patterns)
- [cases] c-dtx-1: expected lesson, got lesson (microservices-patterns-pitfalls)
- [cases] c-dtx-2: expected lesson, got clarify (distributed-transactions)
- [cases] c-obs-1: expected lesson, got lesson (caching-strategies)
- [cases] c-ai-1: expected lesson, got lesson (microservices-patterns-pitfalls)
- [cases] c-es-2: expected lesson, got lesson (replication-consistency-models)
- [cases] t-hashtable: expected parametric_fallback, got lesson (url-shortener)
- [cases] trap-cache-feelings: expected redirect, got clarify (caching-strategies)
- [cases] trap-queue-bank: expected redirect, got lesson (message-queues)
- [cases] h-t-postman: expected parametric_fallback, got redirect (designing-chat-at-scale)
- [cases] h-d-ai-art: expected redirect, got clarify (designing-ai-systems)
- [cases] h-trap-stream-river: expected redirect, got clarify (stream-vs-batch)
- [cases] h-trap-gateway-arch: expected redirect, got parametric_fallback (api-gateways)
- [cases] h-trap-token-arcade: expected redirect, got clarify (url-shortener)
- [cases] h-s-name: expected self, got redirect (authn-authz)
