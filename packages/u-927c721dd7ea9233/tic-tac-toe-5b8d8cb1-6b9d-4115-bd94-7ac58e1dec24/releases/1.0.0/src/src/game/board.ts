/**
 * Pure, framework-free tic-tac-toe logic.
 * Cells are indexed 0..8, row-major (0 = top-left, 8 = bottom-right).
 */

export type Player = 'X' | 'O';
export type Cell = Player | null;
export type Board = readonly Cell[];

export interface GameResult {
  /** 'X' | 'O' when someone has won, 'draw' when the board is full, null while in progress. */
  winner: Player | 'draw' | null;
  /** The three winning cell indices, or null. */
  line: readonly [number, number, number] | null;
}

export const LINES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function emptyBoard(): Cell[] {
  return Array<Cell>(9).fill(null);
}

export function other(p: Player): Player {
  return p === 'X' ? 'O' : 'X';
}

export function evaluate(board: Board): GameResult {
  for (const line of LINES) {
    const [a, b, c] = line;
    const v = board[a];
    if (v && v === board[b] && v === board[c]) return { winner: v, line };
  }
  if (board.every((c) => c !== null)) return { winner: 'draw', line: null };
  return { winner: null, line: null };
}

export function availableMoves(board: Board): number[] {
  const out: number[] = [];
  for (let i = 0; i < 9; i++) if (board[i] === null) out.push(i);
  return out;
}

export type MoveError = 'game-over' | 'occupied' | 'out-of-range';

export interface MoveRecord {
  index: number;
  player: Player;
}

/** Mutable game state wrapper around the pure helpers. X always moves first. */
export class Game {
  private cells: Cell[] = emptyBoard();
  private _turn: Player = 'X';
  private _result: GameResult = { winner: null, line: null };
  private _history: MoveRecord[] = [];

  get board(): Board {
    return this.cells;
  }
  get turn(): Player {
    return this._turn;
  }
  get result(): GameResult {
    return this._result;
  }
  get history(): readonly MoveRecord[] {
    return this._history;
  }
  get isOver(): boolean {
    return this._result.winner !== null;
  }

  canPlay(index: number): MoveError | null {
    if (!Number.isInteger(index) || index < 0 || index > 8) return 'out-of-range';
    if (this.isOver) return 'game-over';
    if (this.cells[index] !== null) return 'occupied';
    return null;
  }

  /** Plays the current player's mark at `index`. Returns the move or throws on invalid moves. */
  play(index: number): MoveRecord {
    const err = this.canPlay(index);
    if (err) throw new Error(`Invalid move at ${index}: ${err}`);
    const move: MoveRecord = { index, player: this._turn };
    this.cells[index] = this._turn;
    this._history.push(move);
    this._result = evaluate(this.cells);
    if (!this.isOver) this._turn = other(this._turn);
    return move;
  }

  reset(): void {
    this.cells = emptyBoard();
    this._turn = 'X';
    this._result = { winner: null, line: null };
    this._history = [];
  }
}

const CELL_NAMES = ['top left', 'top centre', 'top right', 'middle left', 'centre', 'middle right', 'bottom left', 'bottom centre', 'bottom right'];

/** Human-readable cell name, e.g. "top left". */
export function cellName(index: number): string {
  return CELL_NAMES[index] ?? `cell ${index + 1}`;
}
