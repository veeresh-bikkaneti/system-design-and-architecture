import { describe, expect, it } from 'vitest';
import { GENERAL_KNOWLEDGE_CONFIDENCE, grounding } from './web.ts';

describe('grounding', () => {
  it('labels an about-Ben reply as high confidence', () => {
    expect(grounding({ aboutMe: true, inScope: false }).level).toBe('high');
  });

  it('labels a lesson-grounded reply as high confidence', () => {
    expect(grounding({ aboutMe: false, inScope: true }).level).toBe('high');
  });

  it('labels an off-course reply distinctly from a plain low-confidence one', () => {
    expect(grounding({ aboutMe: false, inScope: false, offCourse: true }).label).toMatch(/Off topic/);
    expect(grounding({ aboutMe: false, inScope: false }).level).toBe('low');
  });

  it('gives the model-knowledge fallback its own level and a clear disclaimer', () => {
    expect(GENERAL_KNOWLEDGE_CONFIDENCE.level).toBe('general');
    expect(GENERAL_KNOWLEDGE_CONFIDENCE.label).toMatch(/General knowledge/);
  });
});
