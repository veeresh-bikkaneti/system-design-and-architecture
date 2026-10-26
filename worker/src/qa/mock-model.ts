// worker/src/qa/mock-model.ts — test-only scripted QaModel for the tutor
// graph tests. NOT imported by src/index.ts; never ships in the Worker.
//
// The mock serves the graph's three model touch-points:
//   - invoke() with the "Summarize this study thread" system prompt ->
//     the configured summary text (rolling-summary path);
//   - invoke() otherwise -> the next scripted tool round;
//   - stream() -> the configured final text as a single chunk.
// Every call is recorded so tests can assert round caps, zero-model-call
// triage, and that ToolMessages carried the wrapped course data.

import { AIMessageChunk, BaseMessage, SystemMessage } from '@langchain/core/messages';
import type { StructuredToolInterface } from '@langchain/core/tools';
import type { QaModel, QaToolInvoker } from './graph';

export interface MockToolCall {
  name: string;
  args: Record<string, unknown>;
  id?: string;
}

export interface MockStep {
  text?: string;
  toolCalls?: MockToolCall[];
}

function aiMessage(text: string, toolCalls: MockToolCall[] = []): AIMessageChunk {
  const message = new AIMessageChunk({ content: text });
  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls.map((tc, i) => ({
      name: tc.name,
      args: tc.args,
      id: tc.id ?? `call_mock_${i}`,
      type: 'tool_call' as const,
    }));
    message.invalid_tool_calls = [];
  }
  return message;
}

export class MockModel implements QaModel {
  /** Every invoke() call's messages, in order (tool rounds + summary). */
  invokeCalls: BaseMessage[][] = [];
  /** Every stream() call's messages, in order. */
  streamCalls: BaseMessage[][] = [];
  /** Every bindTools() call's tool list. */
  bindToolsCalls: StructuredToolInterface[][] = [];
  private toolRound = 0;

  constructor(
    private toolScript: MockStep[] = [],
    private opts: { summaryText?: string; finalText?: string } = {},
  ) {}

  private isSummaryCall(messages: BaseMessage[]): boolean {
    const first = messages[0];
    return (
      messages.length === 2 &&
      first instanceof SystemMessage &&
      typeof first.content === 'string' &&
      first.content.includes('Summarize this study thread')
    );
  }

  async invoke(messages: BaseMessage[]): Promise<AIMessageChunk> {
    this.invokeCalls.push(messages);
    if (this.isSummaryCall(messages)) {
      return aiMessage(this.opts.summaryText ?? '');
    }
    const step = this.toolScript[Math.min(this.toolRound, this.toolScript.length - 1)] ?? {};
    this.toolRound += 1;
    return aiMessage(step.text ?? '', step.toolCalls ?? []);
  }

  stream(messages: BaseMessage[]): Promise<AsyncIterable<AIMessageChunk>> {
    this.streamCalls.push(messages);
    const text = this.opts.finalText ?? '';
    async function* gen(): AsyncGenerator<AIMessageChunk> {
      yield aiMessage(text);
    }
    return Promise.resolve(gen());
  }

  bindTools(tools: StructuredToolInterface[]): QaToolInvoker {
    this.bindToolsCalls.push(tools);
    return { invoke: (messages: BaseMessage[]) => this.invoke(messages) };
  }
}

/** Read the text of a tool message at a recorded invoke call. */
export function toolMessageContents(messages: BaseMessage[]): string[] {
  return messages
    .filter((m) => m.getType() === 'tool')
    .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)));
}
