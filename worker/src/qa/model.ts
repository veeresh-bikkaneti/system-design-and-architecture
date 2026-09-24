// P2 (course Q&A agent): the cloud model call reasonActNode makes.
//
// Kept as one narrow, swappable function (AnswerModel) rather than inlined
// in graph.ts: runQaTurn accepts an AnswerModel override (see graph.ts), so
// tests exercise the full graph -- triage, checkpointing, transcript
// trimming -- against a deterministic fake, never the network. Production
// always uses the default export, callAnthropic.

import Anthropic from '@anthropic-ai/sdk';
import type { Env } from '../index';
import type { ChatTurn } from './graph';
import { QA_SYSTEM_PROMPT } from './systemPrompt';

// Per the course's own Claude API guidance: default to Claude Opus 5 unless
// told otherwise. This is the most expensive model this Worker calls, on a
// public, unauthenticated endpoint -- QA_DAILY_QUESTION_LIMIT (routes.ts) is
// the spend guardrail, not the model choice. env.ANTHROPIC_MODEL overrides
// this without a redeploy, e.g. to cut cost.
export const DEFAULT_MODEL = 'claude-opus-5';
export const MAX_TOKENS = 16000;

export type AnswerModel = (env: Env, messages: ChatTurn[]) => Promise<string>;

let client: Anthropic | null = null;
let clientKey: string | null = null;

/** One client per API key, so a key rotation (or a test swapping keys) doesn't reuse a stale one. */
function getClient(apiKey: string): Anthropic {
  if (!client || clientKey !== apiKey) {
    client = new Anthropic({ apiKey });
    clientKey = apiKey;
  }
  return client;
}

function textFrom(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}

/**
 * Calls Claude with the tutor persona (systemPrompt.ts) and the session's
 * transcript. Fails closed: no key, an API error, a refusal, or an empty
 * reply all throw rather than hand back something to show a student --
 * runQaTurn's caller (routes.ts) already turns any thrown error from a QA
 * turn into a generic INTERNAL_ERROR SSE event.
 */
export const callAnthropic: AnswerModel = async (env, messages) => {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('AI tutor is not configured (no ANTHROPIC_API_KEY).');
  }

  const response = await getClient(env.ANTHROPIC_API_KEY).messages.create({
    model: env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    max_tokens: MAX_TOKENS,
    system: QA_SYSTEM_PROMPT,
    thinking: { type: 'adaptive' },
    messages: messages.map((turn) => ({ role: turn.role, content: turn.content })),
  });

  if (response.stop_reason === 'refusal') {
    const category = response.stop_details?.category ?? 'unspecified';
    throw new Error(`Anthropic API refused the request (category: ${category}).`);
  }

  const text = textFrom(response.content);
  if (!text) {
    throw new Error(`Anthropic API returned no text (stop_reason: ${response.stop_reason}).`);
  }
  return text;
};
