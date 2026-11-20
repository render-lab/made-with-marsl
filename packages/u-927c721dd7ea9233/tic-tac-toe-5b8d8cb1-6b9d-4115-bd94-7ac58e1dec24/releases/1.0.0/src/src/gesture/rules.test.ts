import { describe, expect, it } from 'vitest';
import { emptyBoard } from '../game';
import { judge } from './rules';

describe('judge', () => {
  it('accepts the right shape in an empty cell', () => {
    expect(judge({ shape: 'X', confidence: 0.9, cell: 4 }, 'X', emptyBoard())).toEqual({ ok: true, cell: 4 });
  });
  it('rejects the wrong shape', () => {
    expect(judge({ shape: 'O', confidence: 0.9, cell: 4 }, 'X', emptyBoard())).toEqual({ ok: false, message: "It's X's turn — draw an X." });
    expect(judge({ shape: 'X', confidence: 0.9, cell: 4 }, 'O', emptyBoard())).toEqual({ ok: false, message: "It's O's turn — draw an O." });
  });
  it('rejects a taken cell', () => {
    const b = emptyBoard();
    b[0] = 'O';
    expect(judge({ shape: 'X', confidence: 0.9, cell: 0 }, 'X', b)).toEqual({ ok: false, message: 'Top left is taken.' });
  });
  it('explains unrecognized drawings', () => {
    const b = emptyBoard();
    expect(judge({ shape: null, confidence: 0, cell: 4, reason: 'unclear' }, 'X', b)).toMatchObject({ ok: false, message: "Couldn't tell what that was — try again." });
    expect(judge({ shape: null, confidence: 0, cell: 4, reason: 'spans several cells' }, 'X', b).ok).toBe(false);
    expect(judge({ shape: null, confidence: 0, cell: -1, reason: 'off the board' }, 'X', b)).toMatchObject({ message: 'Draw inside the board.' });
  });
});
