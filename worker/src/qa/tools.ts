// P2 (course Q&A agent): the course-scoped tool allowlist as LangChain.js
// tools.
//
// Four tools, nothing else: no shell, no fetch, no user-data tools. Scope
// is enforced by construction -- the agent loop only ever sees these four
// definitions, so a tool outside this list cannot be called, however the
// model is prompted. (This complements the system constitution, which says
// the same thing in prose.)
//
// Each tool is a LangChain `DynamicStructuredTool` (name + description +
// zod schema, validated on every call). The Workers AI function definitions
// are derived from those same zod schemas via `convertToOpenAITool`, so
// there is exactly one source of truth for what the model may call.
//
// Quiz safety: search_lessons ranks the P1 BM25 index (quiz blocks were
// stripped before indexing); read_lesson serves D1 chunk texts (same
// stripping); list_curriculum and find_video serve metadata only. No tool
// can surface a quiz question, option, or correctIndex.

import { DynamicStructuredTool } from '@langchain/core/tools';
import { convertToOpenAITool } from '@langchain/core/utils/function_calling';
import { z } from 'zod';
import type { QaToolDefinition } from './model';
import { QA_INDEX } from './qa-index';
import { QA_META } from './qa-meta';
import {
  readLessonText,
  searchLessons,
  tokenize,
  uniqueSources,
  type ChunkStore,
} from './retrieval';

/** Hard caps: one tool call can never blow the model's context budget. */
export const MAX_SEARCH_RESULTS = 5;
export const MAX_READ_CHARS = 12_000;
export const MAX_VIDEO_RESULTS = 5;

/** Structured result of one tool execution. */
export interface ToolExecution {
  /** Data text for the model (the graph wraps it as data-not-instructions). */
  output: string;
  /** Lesson slugs backing this result -- feed the citation chips. */
  sources: string[];
}

export interface CourseTool {
  tool: DynamicStructuredTool;
  execute(args: Record<string, unknown>): Promise<ToolExecution>;
}

const searchLessonsSchema = z.object({
  query: z.string().min(1).max(500).describe('Keywords or a question about course content.'),
  top_k: z
    .number()
    .int()
    .min(1)
    .max(MAX_SEARCH_RESULTS)
    .optional()
    .default(MAX_SEARCH_RESULTS)
    .describe(`How many chunks to return (1-${MAX_SEARCH_RESULTS}).`),
});

const readLessonSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(100)
    .describe('Lesson slug, e.g. "cap-theorem". Use list_curriculum for valid slugs.'),
});

const listCurriculumSchema = z.object({});

const findVideoSchema = z.object({
  topic: z.string().min(1).max(200).describe('Topic to find lesson videos about, e.g. "CAP theorem".'),
  max_results: z
    .number()
    .int()
    .min(1)
    .max(MAX_VIDEO_RESULTS)
    .optional()
    .default(MAX_VIDEO_RESULTS)
    .describe(`How many videos to return (1-${MAX_VIDEO_RESULTS}).`),
});

const VALID_SLUGS = new Set(QA_META.curriculum.map((l) => l.slug));

function youtubeUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

async function executeSearchLessons(args: Record<string, unknown>): Promise<ToolExecution> {
  const { query, top_k } = searchLessonsSchema.parse(args);
  const results = searchLessons(QA_INDEX, query, top_k);
  if (results.length === 0) {
    return {
      output: `search_lessons: no course chunks matched "${query}". Try different keywords or list_curriculum to see what the course covers.`,
      sources: [],
    };
  }
  const lines = results.map(
    (r) => `- "${r.title}" (${r.slug}) / section "${r.heading}": ${r.excerpt}`,
  );
  return { output: `search_lessons results for "${query}":\n${lines.join('\n')}`, sources: uniqueSources(results).map((s) => s.slug) };
}

function makeReadLesson(store: ChunkStore) {
  return async (args: Record<string, unknown>): Promise<ToolExecution> => {
    const { slug } = readLessonSchema.parse(args);
    if (!VALID_SLUGS.has(slug)) {
      const hint = QA_META.curriculum
        .map((l) => l.slug)
        .filter((s) => s.includes(slug.split('-')[0] ?? ''))
        .slice(0, 3);
      return {
        output: `read_lesson: unknown lesson slug "${slug}". Valid slugs are listed by list_curriculum${hint.length > 0 ? ` (did you mean: ${hint.join(', ')}?)` : ''}.`,
        sources: [],
      };
    }
    const text = await readLessonText(store, slug, MAX_READ_CHARS);
    if (text.length === 0) {
      return { output: `read_lesson: lesson "${slug}" has no indexed text.`, sources: [] };
    }
    return { output: `read_lesson "${slug}" (course lesson text):\n${text}`, sources: [slug] };
  };
}

async function executeListCurriculum(): Promise<ToolExecution> {
  const tiers = ['beginner', 'intermediate', 'advanced'] as const;
  const lines: string[] = [];
  for (const tier of tiers) {
    lines.push(`${tier.toUpperCase()}:`);
    for (const l of QA_META.curriculum.filter((c) => c.tier === tier)) {
      lines.push(`- ${l.title} (${l.slug}): ${l.summary}`);
    }
  }
  return { output: `Course curriculum (${QA_META.curriculum.length} lessons):\n${lines.join('\n')}`, sources: [] };
}

async function executeFindVideo(args: Record<string, unknown>): Promise<ToolExecution> {
  const { topic, max_results } = findVideoSchema.parse(args);
  const queryTokens = new Set(tokenize(topic));
  if (queryTokens.size === 0) {
    return { output: 'find_video: give a topic with real keywords, e.g. "CAP theorem".', sources: [] };
  }
  const scored = QA_META.videos
    .map((v) => {
      const hay = new Set(tokenize(`${v.title} ${v.description} ${v.source} ${v.lessonTitle}`));
      let score = 0;
      for (const t of queryTokens) if (hay.has(t)) score += 1;
      return { v, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.v.videoId.localeCompare(b.v.videoId))
    .slice(0, max_results);
  if (scored.length === 0) {
    return {
      output: `find_video: no lesson videos matched "${topic}". Try list_curriculum to see what the course covers.`,
      sources: [],
    };
  }
  const lines = scored.map(
    (s) =>
      `- "${s.v.title}" by ${s.v.source} (in lesson "${s.v.lessonTitle}")\n  ${youtubeUrl(s.v.videoId)}\n  ${s.v.description}`,
  );
  return {
    output: `Videos about "${topic}":\n${lines.join('\n')}`,
    sources: [...new Set(scored.map((s) => s.v.slug))],
  };
}

function toDefinition(tool: DynamicStructuredTool): QaToolDefinition {
  // convertToOpenAITool derives {type:'function', function:{name, description,
  // parameters}} from the tool's zod schema -- one source of truth.
  const openai = convertToOpenAITool(tool) as {
    function: { name: string; description?: string; parameters: QaToolDefinition['parameters'] };
  };
  return {
    name: openai.function.name,
    description: openai.function.description ?? '',
    parameters: openai.function.parameters,
  };
}

/** All four course tools, bound to a chunk store for read_lesson. */
export function createCourseTools(store: ChunkStore): {
  tools: CourseTool[];
  definitions: QaToolDefinition[];
  execute(name: string, args: Record<string, unknown>): Promise<ToolExecution>;
} {
  const execSearch = (args: Record<string, unknown>): Promise<ToolExecution> =>
    executeSearchLessons(args);
  const execRead = makeReadLesson(store);
  const execList = (_args: Record<string, unknown>): Promise<ToolExecution> =>
    executeListCurriculum();
  const execVideo = (args: Record<string, unknown>): Promise<ToolExecution> =>
    executeFindVideo(args);

  const defs: Array<[string, string, typeof searchLessonsSchema | typeof readLessonSchema | typeof listCurriculumSchema | typeof findVideoSchema, (a: Record<string, unknown>) => Promise<ToolExecution>]> = [
    [
      'search_lessons',
      'Search the course lessons for a topic. Returns matching chunks with lesson titles, slugs, section headings, and excerpts. Use this FIRST for any factual course question.',
      searchLessonsSchema,
      execSearch,
    ],
    [
      'read_lesson',
      'Read the full text of one course lesson by slug (up to 12k chars). Use after search_lessons to get complete context, or when the learner asks about a specific lesson.',
      readLessonSchema,
      execRead,
    ],
    [
      'list_curriculum',
      'List the full course curriculum: all lessons grouped by tier with titles, slugs, and summaries. Use when the learner asks what the course covers or which lesson to study next.',
      listCurriculumSchema,
      execList,
    ],
    [
      'find_video',
      'Find lesson videos about a topic. Returns video titles, creators, descriptions, and YouTube links. Use when the learner asks for a video or wants to watch rather than read.',
      findVideoSchema,
      execVideo,
    ],
  ];

  const tools: CourseTool[] = defs.map(([name, description, schema, execute]) => ({
    tool: new DynamicStructuredTool({
      name,
      description,
      schema,
      func: async (args) => (await execute(args as Record<string, unknown>)).output,
    }),
    execute,
  }));

  const byName = new Map(tools.map((t) => [t.tool.name, t]));
  return {
    tools,
    definitions: tools.map((t) => toDefinition(t.tool)),
    execute: async (name, args) => {
      const t = byName.get(name);
      if (!t) {
        return { output: `Unknown tool "${name}". Available: ${[...byName.keys()].join(', ')}.`, sources: [] };
      }
      try {
        return await t.execute(args);
      } catch (err) {
        // zod validation failures and store errors become tool data, never
        // exceptions -- the loop must survive a bad tool call.
        const detail = err instanceof Error ? err.message : String(err);
        return { output: `Tool "${name}" failed: ${detail}`, sources: [] };
      }
    },
  };
}
