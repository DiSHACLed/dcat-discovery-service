import type { ContainmentResultValue, Result } from './types';

const RESULT_WIDTH = Math.max(...(['CONTAIN', 'PARTIALY_CONTAIN', 'ALIGNED', 'DEPEND', 'REJECTED'] as ContainmentResultValue[]).map(s => s.length));

export function prettyResult(result: Result): string[] {
  return Object.entries(result.starPatternsContainment).map(([starPattern, c]) => {
    const label = c.result.padEnd(RESULT_WIDTH);
    const shape = c.target?.[0] ? `  ${c.target[0]}` : '';
    return `      ${starPattern.padEnd(20)}  →  ${label}${shape}`;
  });
}
