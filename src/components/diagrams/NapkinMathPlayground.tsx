import { useId, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import './diagrams.css';
import { useDiagramEntrance } from './useDiagramEntrance';

/**
 * Props for {@link NapkinMathPlayground}. All optional — the defaults mirror
 * the worked example in the "The napkin math" section of the
 * scaling-web-service lesson.
 */
export interface NapkinMathPlaygroundProps {
  /** Requests per day the sliders start at. Defaults to 1,000,000. */
  defaultRequestsPerDay?: number;
  /** Average request/response size in bytes the sliders start at. Defaults to 2048. */
  defaultRequestSizeBytes?: number;
  /** Writes per 100 requests the slider starts at. Defaults to 5. */
  defaultWritesPer100?: number;
  /** Days of data retention the slider starts at. Defaults to 30. */
  defaultRetentionDays?: number;
}

/** One server comfortably handles this many requests/second (lesson assumption). */
const SERVER_CAPACITY_RPS = 500;
/** Traffic isn't flat — the lesson's deliberately pessimistic peak multiplier. */
const PEAK_MULTIPLIER = 10;
/** You run at least this many servers for redundancy, whatever the math says. */
const MIN_FLEET = 3;
const SECONDS_PER_DAY = 86_400;

function logSlider(min: number, max: number, value: number): number {
  return ((Math.log(value) - Math.log(min)) / (Math.log(max) - Math.log(min))) * 1000;
}
function logUnslider(min: number, max: number, t: number): number {
  return Math.exp(Math.log(min) + (t / 1000) * (Math.log(max) - Math.log(min)));
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

function fmtCompact(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(n < 10 && n % 1 !== 0 ? 1 : 0);
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1e15) return `${(bytes / 1e15).toFixed(1)} PB`;
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${Math.round(bytes)} B`;
}

function fmtRate(rps: number): string {
  if (rps >= 1000) return `${fmtCompact(rps)} req/s`;
  if (rps >= 10) return `${Math.round(rps)} req/s`;
  return `${rps.toFixed(1)} req/s`;
}

interface SliderRowProps {
  id: string;
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  sliderValue: number;
  onChange: (sliderValue: number) => void;
}

function SliderRow({ id, label, valueLabel, min, max, step, sliderValue, onChange }: SliderRowProps) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <label
          htmlFor={id}
          className="diagram-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500 dark:text-stone-400"
        >
          {label}
        </label>
        <span className="diagram-mono text-sm font-bold text-amber-700 dark:text-amber-400">
          {valueLabel}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={sliderValue}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-amber-600"
      />
    </div>
  );
}

/**
 * Interactive back-of-the-envelope capacity planner for MDX lessons. Four
 * sliders (requests/day, request size, write ratio, retention) feed the exact
 * worked example from the lesson's "The napkin math" section — and every
 * intermediate step is shown, because beginners learn from the working, not
 * just the answer.
 *
 * No animation beyond the shared scroll entrance: values update instantly so
 * the math always matches what the reader sees.
 *
 * @example
 * ```mdx
 * <NapkinMathPlayground />
 * ```
 */
export function NapkinMathPlayground({
  defaultRequestsPerDay = 1_000_000,
  defaultRequestSizeBytes = 2_048,
  defaultWritesPer100 = 5,
  defaultRetentionDays = 30,
}: NapkinMathPlaygroundProps) {
  const [reqT, setReqT] = useState(() => logSlider(1e4, 1e10, defaultRequestsPerDay));
  const [sizeT, setSizeT] = useState(() => logSlider(1e3, 1e7, defaultRequestSizeBytes));
  const [writesPer100, setWritesPer100] = useState(defaultWritesPer100);
  const [retT, setRetT] = useState(() => logSlider(1, 3650, defaultRetentionDays));
  // Unique prefix so two playgrounds on one page never share input ids.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

  const entrance = useDiagramEntrance();

  const math = useMemo(() => {
    const requestsPerDay = logUnslider(1e4, 1e10, reqT);
    const requestSizeBytes = logUnslider(1e3, 1e7, sizeT);
    const retentionDays = Math.round(logUnslider(1, 3650, retT));
    const avgRps = requestsPerDay / SECONDS_PER_DAY;
    const peakRps = avgRps * PEAK_MULTIPLIER;
    const rawServers = Math.ceil(peakRps / SERVER_CAPACITY_RPS);
    const servers = Math.max(MIN_FLEET, rawServers);
    const bandwidthBytesPerSec = peakRps * requestSizeBytes;
    const writesPerDay = requestsPerDay * (writesPer100 / 100);
    const storageBytes = writesPerDay * requestSizeBytes * retentionDays;
    return {
      requestsPerDay,
      requestSizeBytes,
      retentionDays,
      avgRps,
      peakRps,
      rawServers,
      servers,
      bandwidthBytesPerSec,
      writesPerDay,
      storageBytes,
    };
  }, [reqT, sizeT, writesPer100, retT]);

  const verdict = useMemo(() => {
    if (math.servers <= MIN_FLEET && math.storageBytes < 10e9)
      return 'One beefy box could hold all of this. Worry about the product, not the scale.';
    if (math.servers <= 20 && math.storageBytes < 1e12)
      return 'Small-fleet territory: a load balancer, a few app servers, maybe a read replica.';
    if (math.servers <= 200)
      return 'Fleet territory: caching and read replicas start earning their keep here.';
    return 'Distributed-systems land: sharding, CDN, the whole toolbox. The napkin told you so.';
  }, [math]);

  const requestSizeLabel =
    math.requestSizeBytes >= 1e6
      ? `${(math.requestSizeBytes / 1e6).toFixed(1)} MB`
      : `${(math.requestSizeBytes / 1e3).toFixed(1)} KB`;

  return (
    <motion.div
      className="not-prose diagram-panel my-8 rounded-xl border border-stone-200 bg-stone-50 p-5 shadow-soft dark:border-stone-800 dark:bg-stone-950"
      {...entrance}
    >
      <h4 className="diagram-mono mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
        Napkin math playground
      </h4>
      <p className="mb-5 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
        The lesson did this once with 1M requests/day. Now drag the sliders and watch the same
        arithmetic redo itself — the working is shown on purpose, so steal the technique.
      </p>

      <div className="grid gap-5 md:grid-cols-2">
        <SliderRow
          id={`${uid}-napkin-req-day`}
          label="Requests per day"
          valueLabel={fmtCompact(math.requestsPerDay)}
          min={0}
          max={1000}
          step={1}
          sliderValue={reqT}
          onChange={setReqT}
        />
        <SliderRow
          id={`${uid}-napkin-req-size`}
          label="Avg request size"
          valueLabel={requestSizeLabel}
          min={0}
          max={1000}
          step={1}
          sliderValue={sizeT}
          onChange={setSizeT}
        />
        <SliderRow
          id={`${uid}-napkin-writes`}
          label="Writes per 100 requests"
          valueLabel={`${100 - writesPer100} reads : ${writesPer100} writes`}
          min={1}
          max={100}
          step={1}
          sliderValue={writesPer100}
          onChange={setWritesPer100}
        />
        <SliderRow
          id={`${uid}-napkin-retention`}
          label="Retention"
          valueLabel={
            math.retentionDays >= 365
              ? `${(math.retentionDays / 365).toFixed(1)} yrs`
              : `${math.retentionDays} days`
          }
          min={0}
          max={1000}
          step={1}
          sliderValue={retT}
          onChange={setRetT}
        />
      </div>

      <ol className="mt-6 space-y-2.5 border-t border-stone-200 pt-5 text-sm dark:border-stone-800">
        <li className="flex gap-3">
          <span className="diagram-mono shrink-0 font-bold text-amber-700 dark:text-amber-400">1.</span>
          <span className="text-stone-600 dark:text-stone-300">
            <strong className="text-stone-900 dark:text-stone-100">{fmtInt(math.requestsPerDay)}</strong>{' '}
            requests ÷ 86,400 s ≈ <strong className="text-stone-900 dark:text-stone-100">{fmtRate(math.avgRps)}</strong>{' '}
            average. A day is long; traffic isn't.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="diagram-mono shrink-0 font-bold text-amber-700 dark:text-amber-400">2.</span>
          <span className="text-stone-600 dark:text-stone-300">
            Dinner rush: {PEAK_MULTIPLIER}× average ≈{' '}
            <strong className="text-stone-900 dark:text-stone-100">{fmtRate(math.peakRps)}</strong> peak.
            Deliberately pessimistic — launch day is not the time for optimism.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="diagram-mono shrink-0 font-bold text-amber-700 dark:text-amber-400">3.</span>
          <span className="text-stone-600 dark:text-stone-300">
            {fmtRate(math.peakRps)} ÷ {SERVER_CAPACITY_RPS} req/s per server ≈{' '}
            <strong className="text-stone-900 dark:text-stone-100">
              {math.rawServers} server{math.rawServers === 1 ? '' : 's'}
            </strong>{' '}
            by the math →{' '}
            <strong className="text-stone-900 dark:text-stone-100">
              {math.servers} server{math.servers === 1 ? '' : 's'}
            </strong>{' '}
            in reality. The extra are redundancy and headroom: half arithmetic, half humility.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="diagram-mono shrink-0 font-bold text-amber-700 dark:text-amber-400">4.</span>
          <span className="text-stone-600 dark:text-stone-300">
            Bandwidth at peak:{' '}
            <strong className="text-stone-900 dark:text-stone-100">
              {fmtBytes(math.bandwidthBytesPerSec)}/s
            </strong>{' '}
            ({fmtRate(math.peakRps)} × {requestSizeLabel} per request).
          </span>
        </li>
        <li className="flex gap-3">
          <span className="diagram-mono shrink-0 font-bold text-amber-700 dark:text-amber-400">5.</span>
          <span className="text-stone-600 dark:text-stone-300">
            Storage:{' '}
            <strong className="text-stone-900 dark:text-stone-100">
              {fmtCompact(math.writesPerDay)}
            </strong>{' '}
            writes/day × {requestSizeLabel} × {math.retentionDays} days ≈{' '}
            <strong className="text-stone-900 dark:text-stone-100">
              {fmtBytes(math.storageBytes)}
            </strong>
            .
          </span>
        </li>
      </ol>

      <p
        aria-live="polite"
        className="mt-5 rounded-lg bg-amber-100/70 px-4 py-3 text-sm font-medium text-amber-950 dark:bg-amber-950/50 dark:text-amber-100"
      >
        {verdict}
      </p>
    </motion.div>
  );
}
