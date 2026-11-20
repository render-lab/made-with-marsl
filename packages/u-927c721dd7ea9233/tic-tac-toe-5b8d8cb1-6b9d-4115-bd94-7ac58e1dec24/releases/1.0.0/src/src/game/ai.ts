import { availableMoves, evaluate, other, type Board, type Cell, type Player } from './board';

export type Difficulty = 'easy' | 'hard';

/** Easy: a uniformly random legal move. */
export function randomMove(board: Board, rng: () => number = Math.random): number {
  const moves = availableMoves(board);
  if (moves.length === 0) throw new Error('No moves available');
  return moves[Math.floor(rng() * moves.length) % moves.length];
}

/**
 * Minimax with alpha-beta pruning. Scores prefer faster wins and slower losses.
 * Returns the score from `me`'s perspective.
 */
function minimax(
  cells: Cell[],
  toMove: Player,
  me: Player,
  depth: number,
  alpha: number,
  beta: number,
): number {
  const { winner } = evaluate(cells);
  if (winner === me) return 10 - depth;
  if (winner === 'draw') return 0;
  if (winner) return depth - 10;

  const maximizing = toMove === me;
  let best = maximizing ? -Infinity : Infinity;
  for (const m of availableMoves(cells)) {
    cells[m] = toMove;
    const score = minimax(cells, other(toMove), me, depth + 1, alpha, beta);
    cells[m] = null;
    if (maximizing) {
      best = Math.max(best, score);
      alpha = Math.max(alpha, score);
    } else {
      best = Math.min(best, score);
      beta = Math.min(beta, score);
    }
    if (beta <= alpha) break;
  }
  return best;
}

/**
 * Hard: optimal move for `me` (unbeatable). Among equally good moves, ties are broken
 * with `rng` so games vary while staying perfect.
 */
export function bestMove(board: Board, me: Player, rng: () => number = Math.random): number {
  const cells = board.slice() as Cell[];
  const moves = availableMoves(cells);
  if (moves.length === 0) throw new Error('No moves available');
  let bestScore = -Infinity;
  let best: number[] = [];
  for (const m of moves) {
    cells[m] = me;
    const score = minimax(cells, other(me), me, 1, -Infinity, Infinity);
    cells[m] = null;
    if (score > bestScore) {
      bestScore = score;
      best = [m];
    } else if (score === bestScore) {
      best.push(m);
    }
  }
  return best[Math.floor(rng() * best.length) % best.length];
}

export function computerMove(
  board: Board,
  me: Player,
  difficulty: Difficulty,
  rng: () => number = Math.random,
): number {
  return difficulty === 'hard' ? bestMove(board, me, rng) : randomMove(board, rng);
}
