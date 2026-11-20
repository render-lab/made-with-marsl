import { describe, expect, it } from 'vitest';
import {
  Game,
  LINES,
  availableMoves,
  bestMove,
  computerMove,
  evaluate,
  other,
  randomMove,
  type Cell,
  type Player,
} from './index';

function boardFrom(s: string): Cell[] {
  // e.g. "XO.|.X.|..O" — '.' empty, '|' ignored
  return s
    .replace(/\|/g, '')
    .split('')
    .map((c) => (c === 'X' ? 'X' : c === 'O' ? 'O' : null));
}

describe('evaluate', () => {
  it.each(LINES.map((l) => [l] as const))('detects a win on line %j for both players', (line) => {
    for (const p of ['X', 'O'] as Player[]) {
      const b: Cell[] = Array(9).fill(null);
      for (const i of line) b[i] = p;
      expect(evaluate(b)).toEqual({ winner: p, line });
    }
  });

  it('reports a draw on a full board with no line', () => {
    const b = boardFrom('XOX|XOO|OXX');
    expect(evaluate(b)).toEqual({ winner: 'draw', line: null });
  });

  it('reports in-progress for an incomplete board', () => {
    expect(evaluate(boardFrom('XO.|...|...'))).toEqual({ winner: null, line: null });
  });

  it('a win on the last move is a win, not a draw', () => {
    expect(evaluate(boardFrom('XOX|OXO|OXX')).winner).toBe('X');
  });
});

describe('Game', () => {
  it('starts with X and alternates turns', () => {
    const g = new Game();
    expect(g.turn).toBe('X');
    g.play(4);
    expect(g.turn).toBe('O');
    g.play(0);
    expect(g.turn).toBe('X');
    expect(g.board[4]).toBe('X');
    expect(g.board[0]).toBe('O');
    expect(g.history).toEqual([
      { index: 4, player: 'X' },
      { index: 0, player: 'O' },
    ]);
  });

  it('rejects invalid moves', () => {
    const g = new Game();
    expect(g.canPlay(-1)).toBe('out-of-range');
    expect(g.canPlay(9)).toBe('out-of-range');
    expect(g.canPlay(1.5)).toBe('out-of-range');
    expect(() => g.play(9)).toThrow();
    g.play(0);
    expect(g.canPlay(0)).toBe('occupied');
    expect(() => g.play(0)).toThrow();
    expect(g.turn).toBe('O');
  });

  it('detects a win, exposes the line and refuses further moves', () => {
    const g = new Game();
    for (const m of [0, 3, 1, 4, 2]) g.play(m);
    expect(g.result).toEqual({ winner: 'X', line: [0, 1, 2] });
    expect(g.isOver).toBe(true);
    expect(g.canPlay(8)).toBe('game-over');
    expect(() => g.play(8)).toThrow();
  });

  it('detects a draw', () => {
    const g = new Game();
    // X O X / X O O / O X X
    for (const m of [0, 1, 2, 4, 3, 5, 7, 6, 8]) g.play(m);
    expect(g.result.winner).toBe('draw');
    expect(g.result.line).toBeNull();
  });

  it('resets', () => {
    const g = new Game();
    for (const m of [0, 3, 1, 4, 2]) g.play(m);
    g.reset();
    expect(g.board.every((c) => c === null)).toBe(true);
    expect(g.turn).toBe('X');
    expect(g.isOver).toBe(false);
    expect(g.history).toHaveLength(0);
  });
});

describe('AI', () => {
  it('random move is always legal', () => {
    const b = boardFrom('XOX|.O.|X..');
    for (let i = 0; i < 50; i++) {
      expect(availableMoves(b)).toContain(randomMove(b));
    }
  });

  it('takes an immediate win', () => {
    // O to move, O can win at 5 (row 3,4,5)
    const b = boardFrom('XX.|OO.|X..');
    expect(bestMove(b, 'O')).toBe(5);
    // X to move, X can win at 2
    expect(bestMove(boardFrom('XX.|OO.|...'), 'X')).toBe(2);
  });

  it('prefers winning over blocking', () => {
    // O to move: can win at 5, X threatens 2
    const b = boardFrom('XX.|OO.|X..');
    expect(bestMove(b, 'O')).toBe(5);
  });

  it('blocks an immediate threat', () => {
    // O to move; X threatens column 0 via 6
    expect(bestMove(boardFrom('XO.|X..|...'), 'O')).toBe(6);
    // O to move; X threatens diagonal at 8
    expect(bestMove(boardFrom('XO.|.X.|...'), 'O')).toBe(8);
  });

  it('computerMove dispatches by difficulty', () => {
    const b = boardFrom('XX.|OO.|...');
    expect(computerMove(b, 'X', 'hard')).toBe(2);
    expect(availableMoves(b)).toContain(computerMove(b, 'X', 'easy'));
  });

  /** Explore every possible opponent reply; the AI must never lose. */
  function explore(cells: Cell[], toMove: Player, ai: Player, stats: { games: number; losses: number }) {
    const { winner } = evaluate(cells);
    if (winner) {
      stats.games++;
      if (winner === other(ai)) stats.losses++;
      return;
    }
    if (toMove === ai) {
      // Check every tie-broken choice by trying all optimal moves via different rng values.
      const choices = new Set<number>();
      for (const r of [0, 0.34, 0.67, 0.99]) choices.add(bestMove(cells, ai, () => r));
      for (const m of choices) {
        cells[m] = ai;
        explore(cells, other(toMove), ai, stats);
        cells[m] = null;
      }
    } else {
      for (const m of availableMoves(cells)) {
        cells[m] = toMove;
        explore(cells, other(toMove), ai, stats);
        cells[m] = null;
      }
    }
  }

  it.each(['X', 'O'] as Player[])('minimax never loses from the start position playing %s', (ai) => {
    const stats = { games: 0, losses: 0 };
    explore(Array(9).fill(null), 'X', ai, stats);
    expect(stats.games).toBeGreaterThan(0);
    expect(stats.losses).toBe(0);
  });
});
