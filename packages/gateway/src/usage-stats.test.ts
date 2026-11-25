import { describe, expect, it } from 'vitest';
import { bucketEdges } from './usage-stats';

const clock = (timeZone: string) => (time: number) =>
  new Date(time).toLocaleTimeString('en-GB', { timeZone, hour12: false });

describe('bucketEdges', () => {
  it('keeps days on local midnight across a DST change', () => {
    // Melbourne moved its clocks forward on 4 October 2026.
    const now = Date.parse('2026-10-10T12:34:56+11:00');
    const edges = bucketEdges('30d', 'Australia/Melbourne', now);
    expect(edges).toHaveLength(31);
    expect(edges.at(-1)).toBe(now);
    expect(new Set(edges.slice(0, -1).map(clock('Australia/Melbourne')))).toEqual(
      new Set(['00:00:00']),
    );
  });

  it('starts hours on the local hour in half-hour time zones', () => {
    const now = Date.parse('2026-11-26T10:15:00+05:30');
    const edges = bucketEdges('24h', 'Asia/Kolkata', now);
    expect(edges).toHaveLength(25);
    expect(edges.slice(0, -1).every((edge) => clock('Asia/Kolkata')(edge).endsWith(':00:00'))).toBe(
      true,
    );
    expect(clock('Asia/Kolkata')(edges.at(-2)!)).toBe('10:00:00');
  });
});
