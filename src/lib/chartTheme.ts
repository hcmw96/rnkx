/** Shared Recharts styling — SCORE dual-area reference look.
 *  League colours only: Engine = lime, Run = cyan. Never swap these. */

export const ENGINE_CHART_COLOR = 'hsl(var(--neon-lime))';
export const RUN_CHART_COLOR = 'hsl(var(--electric-cyan))';

/** Solid stroke on area curves (px). */
export const CHART_STROKE_WIDTH = 2;
/** Vertical gradient peak opacity (~40–50%). */
export const AREA_PEAK_OPACITY = 0.45;
/** Transparent at baseline. */
export const AREA_FLOOR_OPACITY = 0;

export const CHART_AXIS_TICK = { fill: 'hsl(0 0% 55%)', fontSize: 10 } as const;
export const CHART_GRID_STROKE = 'hsla(0,0%,100%,0.06)';
export const CHART_CURSOR_STROKE = 'hsla(0,0%,100%,0.12)';
export const CHART_ACTIVE_DOT_STROKE = '#0a0a0a';

export const CHART_TOOLTIP_CLASS =
  'rounded-lg border border-border/80 bg-[hsla(0,0%,8%,0.95)] px-3 py-2 shadow-xl backdrop-blur-sm';
