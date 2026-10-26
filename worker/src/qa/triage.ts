// worker/src/qa/triage.ts — deterministic scope gate for the tutor (P2).
//
// Zero model calls: triageMessage() classifies a learner message with regex
// patterns and a course keyword set, so greetings and obvious off-topic
// questions never spend model budget. Ambiguous input deliberately passes as
// in-scope -- the reasonAct constitution prompt declines gracefully when
// the model itself judges a question out of scope.
//
// Ordering matters: course keywords are checked FIRST, so "hi, what is the
// CAP theorem?" is in-scope (not small-talk) and "is sharding a joke?" is
// in-scope (not off-topic).

import { CURRICULUM } from './curriculum';

export type TriageVerdict = { kind: 'in-scope' } | { kind: 'small-talk' } | { kind: 'off-topic' };

/** Hand-curated course vocabulary. Merged with CURRICULUM titles/topics. */
const HAND_KEYWORDS = [
  // Core distributed systems
  'distributed', 'scalability', 'scalable', 'scaling', 'availability', 'reliability',
  'fault tolerance', 'fault-tolerant', 'consensus', 'replication', 'replica', 'quorum',
  'leader election', 'paxos', 'raft', 'gossip', 'vector clock', 'crdt', 'lww',
  'cap theorem', 'cap', 'acid', 'base', 'eventual consistency', 'strong consistency',
  'linearizability', 'linearizable', 'serializability', 'isolation level',
  // Partitioning & storage
  'sharding', 'shard', 'partition', 'partitioning', 'consistent hashing', 'hash ring',
  'virtual node', 'hot partition', 'database', 'sql', 'nosql', 'key-value', 'document db',
  'wide-column', 'graph db', 'index', 'b-tree', 'lsm', 'memtable', 'sstable',
  'compaction', 'tombstone', 'wal', 'bloom filter', 'hyperloglog', 'merkle',
  'dynamo', 'bigtable', 'cassandra', 'mongodb', 'redis', 'postgres', 'mysql',
  'elasticsearch', 'zookeeper', 'etcd', 'consul', 'cockroachdb', 'spanner',
  'denormalization', 'normalization', 'primary key', 'transaction', '2pc',
  'two-phase commit', 'saga', 'event sourcing', 'cqrs', 'oltp', 'olap',
  // Caching & performance
  'cache', 'caching', 'cdn', 'ttl', 'eviction', 'lru', 'lfu', 'write-through',
  'write-behind', 'cache-aside', 'cache stampede', 'thundering herd', 'dogpile',
  'latency', 'throughput', 'bandwidth', 'p99', 'percentile', 'tail latency',
  'load test', 'stress test', 'capacity planning', 'napkin math',
  'back-of-the-envelope', 'back of the envelope',
  // Networking & traffic
  'load balancer', 'load balancing', 'round robin', 'least connections', 'ip hash',
  'dns', 'tcp', 'udp', 'http', 'http/2', 'http/3', 'quic', 'websocket',
  'tls', 'mtls', 'api gateway', 'ingress', 'envoy', 'nginx', 'haproxy',
  'vpc', 'subnet', 'nat', 'firewall', 'waf', 'ddos',
  // Messaging & async
  'message queue', 'kafka', 'rabbitmq', 'pub/sub', 'pubsub', 'event-driven',
  'stream processing', 'mapreduce', 'spark', 'flink', 'batch', 'etl',
  'exactly-once', 'at-least-once', 'idempotency', 'idempotent',
  // Resilience patterns
  'circuit breaker', 'retry', 'backoff', 'timeout', 'bulkhead', 'hedged request',
  'rate limiting', 'rate limit', 'throttling', 'token bucket', 'leaky bucket',
  'degradation', 'graceful degradation', 'failover', 'disaster recovery', 'rpo', 'rto',
  // Architecture
  'microservices', 'monolith', 'modular monolith', 'service mesh', 'sidecar',
  'serverless', 'edge computing', 'kubernetes', 'docker', 'container',
  'rest', 'graphql', 'grpc', 'api design', 'versioning', 'pagination',
  'oauth', 'jwt', 'authentication', 'authorization', 'rbac', 'zero trust',
  'encryption', 'sso', 'session',
  // Data & ML-ish infra in lessons
  'data lake', 'data warehouse', 'feature store', 'embedding', 'vector db',
  'rag', 'llm', 'inference', 'agentic', 'multi-agent',
  // Ops
  'observability', 'monitoring', 'logging', 'tracing', 'metrics', 'alerting',
  'sla', 'slo', 'sli', 'error budget', 'on-call', 'postmortem', 'chaos engineering',
  // Interview framing used across lessons
  'system design interview', 'design a url shortener', 'design twitter',
  'design netflix', 'design uber', 'trade-off', 'tradeoff',
];

const SMALL_TALK_PATTERNS: RegExp[] = [
  /^(hi|hii+|hello|hey+|yo|hiya|howdy|greetings|namaste)\b/,
  /\b(thank(s| you)( (very|so) much)?|thx|tyvm)\b/,
  /\b(bye|goodbye|good ?bye|see you|good ?(morning|afternoon|evening|night))\b/,
  /\bwho are you\b/,
  /\byour name\b/,
  /\bwhat can you do\b/,
  /\bhow are you\b/,
  /^\s*help\s*[!?.]*\s*$/,
];

const OFF_TOPIC_PATTERNS: RegExp[] = [
  /\b(resume|\bcv\b|cover letter|job application)\b/,
  /\bweather\b/,
  /\btell me a joke\b/,
  /\bjoke\b.*\btell\b|\btell\b.*\bjoke\b/,
  /\bwrite my (essay|homework|assignment|paper)\b/,
  /\bdo my homework\b/,
  /\b(relationship|dating) advice\b/,
  /\bpoem\b/,
  /\bstock (price|tip|pick|recommendation)\b/,
  /\bcryptocurrency\b.*\b(invest|buy)\b/,
  /\bmedical\b.*\badvice\b/,
  /\blottery\b/,
];

let keywordSet: Set<string> | null = null;

/**
 * Generic English words that must never act as course keywords on their
 * own. They leak in from lesson titles/topics ("what", "tell", "write",
 * "course") and would otherwise defeat the small-talk/off-topic gates --
 * e.g. every "what is ..." question would classify in-scope. The hand list
 * above is curated and is NOT filtered; only the derived words are.
 */
const KEYWORD_STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'nor', 'so', 'yet',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'done',
  'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must', 'ought',
  'i', 'me', 'my', 'mine', 'you', 'your', 'yours', 'he', 'him', 'his',
  'she', 'her', 'hers', 'it', 'its', 'we', 'us', 'our', 'ours',
  'they', 'them', 'their', 'theirs',
  'this', 'that', 'these', 'those', 'here', 'there',
  'as', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'off', 'on', 'onto',
  'out', 'over', 'to', 'up', 'with', 'within', 'without', 'about', 'above',
  'after', 'before', 'between', 'under', 'until', 'while', 'during', 'through',
  'what', 'whatever', 'when', 'whenever', 'where', 'wherever', 'which', 'whichever',
  'who', 'whoever', 'whom', 'whose', 'how', 'however', 'why',
  'not', 'no', 'yes', 'if', 'then', 'than', 'such', 'only', 'own', 'same',
  'very', 'just', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some',
  'again', 'once', 'also', 'well', 'much', 'many',
  'tell', 'tells', 'told', 'telling', 'write', 'writes', 'wrote', 'written', 'writing',
  'course', 'courses', 'lesson', 'lessons', 'thing', 'things', 'stuff',
  'learn', 'learns', 'learned', 'learning', 'teach', 'teaches', 'know', 'knows', 'known',
  'use', 'uses', 'used', 'using', 'make', 'makes', 'made', 'making',
  'get', 'gets', 'got', 'getting', 'take', 'takes', 'took', 'taken',
  'work', 'works', 'worked', 'working',
]);

/** Course vocabulary: hand list + tokens from lesson titles/topics. */
function getCourseKeywords(): Set<string> {
  if (!keywordSet) {
    const set = new Set<string>();
    for (const kw of HAND_KEYWORDS) set.add(kw.toLowerCase());
    for (const entry of CURRICULUM) {
      for (const word of entry.title.toLowerCase().split(/[^a-z0-9+/#]+/)) {
        if (word.length >= 4 && !KEYWORD_STOPWORDS.has(word)) set.add(word);
      }
      for (const topic of entry.topics) {
        for (const word of topic.toLowerCase().split(/[^a-z0-9+/#]+/)) {
          if (word.length >= 3 && !KEYWORD_STOPWORDS.has(word)) set.add(word);
        }
      }
    }
    keywordSet = set;
  }
  return keywordSet;
}

function normalize(message: string): string {
  return message.toLowerCase().replace(/[^\p{L}\p{N}\s+#/.-]/gu, ' ');
}

/** True when the message carries no recognizable words at all. */
function isGibberish(normalized: string): boolean {
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const letters = normalized.replace(/[^a-z]/g, '');
  // Short messages with no word of 3+ letters and no digits: "asdf", "???".
  return (
    normalized.length < 24 &&
    !words.some((w) => w.length >= 3) &&
    letters.length < 3
  );
}

/**
 * Classify a learner message. Deterministic and model-free: greetings and
 * clear off-topic intents are caught here; anything ambiguous passes as
 * in-scope and the agent's constitution handles the graceful decline.
 */
export function triageMessage(message: string): TriageVerdict {
  const normalized = normalize(message);
  const keywords = getCourseKeywords();

  // 1. Course vocabulary wins over everything -- a greeting wrapped around
  //    a real question is still a real question.
  const tokens = new Set(normalized.split(/\s+/).filter(Boolean));
  for (const kw of keywords) {
    if (kw.includes(' ') ? normalized.includes(kw) : tokens.has(kw)) {
      return { kind: 'in-scope' };
    }
  }

  // 2. Small talk: greetings, thanks, farewells, "who are you".
  for (const pattern of SMALL_TALK_PATTERNS) {
    if (pattern.test(normalized)) return { kind: 'small-talk' };
  }

  // 3. Clear non-course intents.
  for (const pattern of OFF_TOPIC_PATTERNS) {
    if (pattern.test(normalized)) return { kind: 'off-topic' };
  }

  // 4. Gibberish / ultra-short nonsense.
  if (isGibberish(normalized)) return { kind: 'off-topic' };

  // 5. Ambiguous: err toward passing; the constitution declines gracefully.
  return { kind: 'in-scope' };
}
