import { describe, expect, it } from 'vitest';
import { fadeAlpha, REJECT_FADE_S, REJECT_HOLD_S } from './markMap';
import { swayCurve } from '../app/stage';

describe('reject fade curve', () => {
  it('holds fully visible, then eases out to zero', () => {
    expect(fadeAlpha(0, REJECT_HOLD_S, REJECT_FADE_S)).toBe(1);
    expect(fadeAlpha(REJECT_HOLD_S, REJECT_HOLD_S, REJECT_FADE_S)).toBe(1);
    const mid = fadeAlpha(REJECT_HOLD_S + REJECT_FADE_S / 2, REJECT_HOLD_S, REJECT_FADE_S);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(0.5); // ease-out: more than half gone at the midpoint
    expect(fadeAlpha(REJECT_HOLD_S + REJECT_FADE_S, REJECT_HOLD_S, REJECT_FADE_S)).toBe(0);
    const total = REJECT_HOLD_S + REJECT_FADE_S;
    expect(total).toBeGreaterThanOrEqual(1);
    expect(total).toBeLessThanOrEqual(2);
  });

  it('is instant without hold or duration', () => {
    expect(fadeAlpha(0.001, 0, 0)).toBe(0);
  });
});

describe('camera sway curve', () => {
  it('has a dead zone, a soft curve and keeps the sign', () => {
    expect(swayCurve(0.05)).toBe(0);
    expect(Math.abs(swayCurve(-0.1))).toBe(0);
    expect(swayCurve(1)).toBe(1);
    expect(swayCurve(-1)).toBe(-1);
    expect(swayCurve(0.5)).toBeLessThan(0.5 * 0.5);
    expect(swayCurve(-0.5)).toBe(-swayCurve(0.5));
  });
});
