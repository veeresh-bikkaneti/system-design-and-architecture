// The certification exam's question bank and scoring logic. This module is
// never sent to the client -- only publicQuestions() (no correctIndex) and
// the aggregate result of scoreSubmission() (no per-question correctness)
// ever leave the Worker. That's the whole point of Phase 2: today's per-
// lesson practice quizzes ship `correctIndex` in the site's JS bundle (fine
// for self-check), but nothing server-verified backs a "passed" claim yet.
//
// Questions are grounded in the three published lessons (cap-theorem,
// load-balancers, data-partitioning) -- see content/lessons/*.mdx -- and
// deliberately don't test anything beyond what those lessons actually teach.

export interface ExamQuestion {
  id: string;
  topic: string;
  question: string;
  options: string[];
  correctIndex: number;
}

export const EXAM_PASS_THRESHOLD = 0.7;

const EXAM_QUESTIONS: ExamQuestion[] = [
  // --- CAP theorem ---
  {
    id: 'cap-1',
    topic: 'cap-theorem',
    question: 'What trade-off does the CAP theorem describe during a network partition?',
    options: [
      'A system must choose between consistency and availability',
      'A system must choose between latency and throughput',
      'A system must permanently pick exactly two of C, A, and P as a fixed label',
      'A system must shut down until the partition is resolved',
    ],
    correctIndex: 0,
  },
  {
    id: 'cap-2',
    topic: 'cap-theorem',
    question: 'Which of these is an example of an AP system (favors availability during a partition)?',
    options: ['ZooKeeper', 'etcd', 'Cassandra', 'HBase'],
    correctIndex: 2,
  },
  {
    id: 'cap-3',
    topic: 'cap-theorem',
    question: 'What does PACELC add on top of CAP?',
    options: [
      'A fourth property (Partition tolerance is split into two sub-properties)',
      'The latency/consistency trade-off that exists even when there is no partition',
      'A proof that CAP does not apply to relational databases',
      'A requirement that all systems must be strictly CP',
    ],
    correctIndex: 1,
  },
  // --- Load balancers ---
  {
    id: 'lb-1',
    topic: 'load-balancers',
    question: 'What can a Layer 7 load balancer do that a Layer 4 load balancer cannot?',
    options: [
      'Balance traffic across multiple servers at all',
      'Route based on URL path, host header, or cookies',
      'Perform health checks on backend servers',
      'Handle more total throughput',
    ],
    correctIndex: 1,
  },
  {
    id: 'lb-2',
    topic: 'load-balancers',
    question: 'Which routing algorithm minimizes how many keys/requests get reshuffled when servers are added or removed?',
    options: ['Round robin', 'IP hash', 'Consistent hashing', 'Weighted round robin'],
    correctIndex: 2,
  },
  {
    id: 'lb-3',
    topic: 'load-balancers',
    question: 'Why do production teams typically run at least two load balancer nodes rather than one?',
    options: [
      'To support Layer 4 and Layer 7 at the same time',
      'A single load balancer instance would be a single point of failure',
      'TCP/IP requires load balancers to run in pairs',
      'To double the number of available routing algorithms',
    ],
    correctIndex: 1,
  },
  // --- Data partitioning ---
  {
    id: 'part-1',
    topic: 'data-partitioning',
    question: 'Which partitioning strategy makes range queries expensive, since they must fan out to every shard?',
    options: ['Range-based', 'Hash-based', 'Directory-based', 'None of the above'],
    correctIndex: 1,
  },
  {
    id: 'part-2',
    topic: 'data-partitioning',
    question: 'What technique minimizes data movement when a sharded cluster is resized?',
    options: [
      'Directory-based lookup with a single central server',
      'Range-based partitioning in alphabetical order',
      'Consistent hashing',
      'Two-phase commit',
    ],
    correctIndex: 2,
  },
  {
    id: 'part-3',
    topic: 'data-partitioning',
    question: 'A transaction that touches multiple shards typically needs which kind of protocol, or must be avoided by design?',
    options: ['A distributed transaction protocol such as two-phase commit', 'DNS load balancing', 'A CDN', 'IP hashing'],
    correctIndex: 0,
  },
];

export function publicQuestions(): Omit<ExamQuestion, 'correctIndex'>[] {
  return EXAM_QUESTIONS.map(({ id, topic, question, options }) => ({ id, topic, question, options }));
}

export interface ScoreResult {
  score: number;
  total: number;
  passed: boolean;
}

// answers maps question id -> selected option index. Missing/invalid entries
// just count as wrong; this never throws on a malformed submission.
export function scoreSubmission(answers: unknown): ScoreResult {
  const total = EXAM_QUESTIONS.length;
  const answerMap = answers && typeof answers === 'object' ? (answers as Record<string, unknown>) : {};

  let score = 0;
  for (const q of EXAM_QUESTIONS) {
    if (answerMap[q.id] === q.correctIndex) score++;
  }

  return { score, total, passed: total > 0 && score / total >= EXAM_PASS_THRESHOLD };
}
