import { useId } from 'react';
import { motion } from 'motion/react';
import './diagrams.css';
import { useDiagramEntrance } from './useDiagramEntrance';

/**
 * Props for {@link PacketFlow}.
 */
export interface PacketFlowProps {
  /**
   * Labels for the pipeline stages the request travels through, e.g.
   * `["Client", "Load Balancer"]`. The request fans out from the last
   * stage to each server. Defaults to `["Client", "Load Balancer"]`.
   */
  stages?: string[];
  /**
   * Labels for the downstream servers that the last stage fans out to,
   * e.g. `["api-1", "api-2", "api-3"]`. Defaults to three servers.
   */
  servers?: string[];
  /**
   * Seconds for one request dot to complete its journey from the first
   * stage to a server. Defaults to 4.
   */
  duration?: number;
  /**
   * Short label rendered inside each traveling request dot, e.g. `"GET"`.
   * Defaults to `""` (plain dots).
   */
  requestLabel?: string;
}

const DEFAULT_STAGES = ['Client', 'Load Balancer'];
const DEFAULT_SERVERS = ['Server 1', 'Server 2', 'Server 3'];

const NODE_W = 128;
const NODE_H = 46;
const VIEW_W = 660;

/**
 * Animated request-flow diagram for MDX lessons. A stream of request dots
 * travels from the first pipeline stage, through each intermediate stage,
 * and fans out to the servers — pure CSS keyframe animation, no JS timers.
 * Hovering the diagram pauses the animation.
 *
 * @example
 * ```mdx
 * <PacketFlow stages={["Browser", "CDN"]} servers={["origin-1", "origin-2"]} requestLabel="GET" />
 * ```
 */
export function PacketFlow({
  stages = DEFAULT_STAGES,
  servers = DEFAULT_SERVERS,
  duration = 4,
  requestLabel = '',
}: PacketFlowProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const animName = `pf-flow-${uid}`;
  // Scroll-triggered entrance shared with every other diagram component
  // (MermaidDiagram, StepThrough, VsToggle) — see useDiagramEntrance.
  const entrance = useDiagramEntrance();

  const serverCount = Math.max(1, servers.length);
  const gap = 76;
  const viewH = Math.max(200, serverCount * gap + 90);
  const midY = viewH / 2;

  // Stage boxes sit on the left; servers fan out on the right.
  const stageX = (i: number) => 24 + i * (NODE_W + 110);
  const stageCx = (i: number) => stageX(i) + NODE_W / 2;
  const serverX = stageX(stages.length - 1) + NODE_W + 120;
  const serverCx = serverX + NODE_W / 2;
  const serverCy = (i: number) => 60 + i * gap;

  const dots = servers.map((_, i) => {
    const dxStage = stageCx(stages.length - 1) - stageCx(0);
    const dxServer = serverCx - stageCx(0);
    const dyServer = serverCy(i) - midY;
    // Travel: first stage -> last stage -> pause -> fan out to server i -> fade.
    const keyframes = `@keyframes ${animName}-dot${i} {
      0% { transform: translate(0px, 0px); opacity: 0; }
      6% { opacity: 1; }
      32% { transform: translate(${dxStage}px, 0px); opacity: 1; }
      42% { transform: translate(${dxStage}px, 0px); opacity: 1; }
      66% { transform: translate(${dxServer}px, ${dyServer}px); opacity: 1; }
      76% { transform: translate(${dxServer}px, ${dyServer}px); opacity: 1; }
      86% { transform: translate(${dxServer}px, ${dyServer}px); opacity: 0; }
      100% { transform: translate(${dxServer}px, ${dyServer}px); opacity: 0; }
    }`;
    return { keyframes, delay: (duration / serverCount) * i };
  });

  return (
    <motion.div className="not-prose my-8" {...entrance}>
      <div className="packetflow diagram-panel overflow-x-auto rounded-xl border border-stone-200 bg-stone-50 p-4 shadow-soft dark:border-slate-800 dark:bg-slate-950">
        <style>{dots.map((d) => d.keyframes).join('\n')}</style>
        <p className="diagram-mono mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-400 dark:text-slate-500">
          Request flow
        </p>
        <svg
          viewBox={`0 0 ${VIEW_W} ${viewH}`}
          className="mx-auto block w-full max-w-2xl"
          role="img"
          aria-label={`Request flow: ${stages.join(' to ')} to ${servers.join(', ')}`}
        >
          {/* Edges: stages chained left to right, last stage fans out to servers */}
          {stages.slice(1).map((_, i) => (
            <line
              key={`e-${i}`}
              x1={stageX(i) + NODE_W}
              y1={midY}
              x2={stageX(i + 1)}
              y2={midY}
              className="stroke-stone-300 dark:stroke-slate-600"
              strokeWidth={2}
            />
          ))}
          {servers.map((_, i) => (
            <line
              key={`f-${i}`}
              x1={stageX(stages.length - 1) + NODE_W}
              y1={midY}
              x2={serverX}
              y2={serverCy(i)}
              className="stroke-stone-300 dark:stroke-slate-600"
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
          ))}

          {/* Stage nodes: first stage is the client (cyan), later stages are
              infra hops (amber) */}
          {stages.map((label, i) => (
            <g
              key={`s-${i}`}
              className="pf-node"
              style={{ animationDelay: `${0.05 + i * 0.07}s` }}
            >
              <rect
                x={stageX(i)}
                y={midY - NODE_H / 2}
                width={NODE_W}
                height={NODE_H}
                rx={9}
                className={
                  i === 0
                    ? 'fill-cyan-50 stroke-cyan-600 dark:fill-cyan-950/60 dark:stroke-cyan-400'
                    : 'fill-amber-50 stroke-amber-500 dark:fill-amber-950/60 dark:stroke-amber-400'
                }
                strokeWidth={1.5}
              />
              <text
                x={stageCx(i)}
                y={midY}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={11}
                fontWeight={600}
                className={
                  i === 0
                    ? 'diagram-mono fill-cyan-950 dark:fill-cyan-100'
                    : 'diagram-mono fill-amber-950 dark:fill-amber-100'
                }
              >
                {label}
              </text>
            </g>
          ))}

          {/* Server nodes: backend services (emerald) */}
          {servers.map((label, i) => (
            <g
              key={`srv-${i}`}
              className="pf-node"
              style={{ animationDelay: `${0.05 + (stages.length + i) * 0.07}s` }}
            >
              <rect
                x={serverX}
                y={serverCy(i) - NODE_H / 2}
                width={NODE_W}
                height={NODE_H}
                rx={9}
                className="fill-emerald-50 stroke-emerald-500 dark:fill-emerald-950/60 dark:stroke-emerald-400"
                strokeWidth={1.5}
              />
              <text
                x={serverCx}
                y={serverCy(i)}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={11}
                fontWeight={600}
                className="diagram-mono fill-emerald-950 dark:fill-emerald-100"
              >
                {label}
              </text>
            </g>
          ))}

          {/* Traveling request dots, anchored at the first stage's center */}
          {dots.map((d, i) => (
            <g key={`d-${i}`}>
              <circle
                cx={stageCx(0)}
                cy={midY}
                r={requestLabel ? 13 : 7}
                className="pf-dot fill-amber-400 dark:fill-amber-300"
                style={{
                  animation: `${animName}-dot${i} ${duration}s linear infinite`,
                  animationDelay: `${d.delay}s`,
                  opacity: 0,
                }}
              />
              {requestLabel && (
                <text
                  x={stageCx(0)}
                  y={midY}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={8}
                  fontWeight={700}
                  className="pf-dot fill-amber-950 pointer-events-none"
                  style={{
                    animation: `${animName}-dot${i} ${duration}s linear infinite`,
                    animationDelay: `${d.delay}s`,
                    opacity: 0,
                  }}
                >
                  {requestLabel}
                </text>
              )}
            </g>
          ))}
        </svg>
        <p className="diagram-mono mt-2 text-center text-[11px] text-stone-400 dark:text-slate-500">
          Hover to pause the animation
        </p>
      </div>
    </motion.div>
  );
}
