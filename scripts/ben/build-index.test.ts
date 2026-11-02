import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { embedAll } from './build-index.mjs';
import { embedderDir, loadNodeEmbedder } from './embedder.mjs';

/**
 * The browser embeds a question on its own, so every lesson vector has to be
 * what that chunk would get on its own too. The q8 model quantizes activations
 * with one scale per tensor (DynamicQuantizeLinear), so a chunk embedded in a
 * batch picks up its neighbours' ranges: measured 0.992 cosine against itself.
 * That is enough to swing the eval on an unrelated lesson edit.
 *
 * Needs the real 23 MB model. When it is not on disk (`npm test` on a fresh
 * clone, or CI before `npm run ben:index`) this skips rather than download it.
 */
const modelDir = process.env.BEN_EMBEDDER_DIR ?? embedderDir;
const hasModel = existsSync(join(modelDir, 'onnx', 'model_quantized.onnx'));

const cosine = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + v * b[i], 0);

describe.skipIf(!hasModel)('embedAll', () => {
  it('gives a chunk the same vector alone or in a crowd', { timeout: 120_000 }, async () => {
    const embed = await loadNodeEmbedder();
    const target =
      'Domain-Driven Design. Bounded contexts. A bounded context draws a line around one model, ' +
      'so "order" can mean a cart in checkout and a parcel in shipping without either team arguing.';
    const crowd = [
      'Caching. Short.',
      'Rate limiting. A token bucket refills at a steady rate and spends one token per request; ' +
        'when the bucket is empty the request waits or is dropped, which smooths bursts without ' +
        'punishing steady traffic. Leaky buckets do the same job from the other end.',
      'CAP. Pick two, they said. It is more nuanced than that.',
    ];
    const [alone] = await embedAll(embed, [target]);
    const [crowded] = await embedAll(embed, [target, ...crowd]);
    expect(cosine(alone, crowded)).toBeGreaterThanOrEqual(0.9999);
  });
});
