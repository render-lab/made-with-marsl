/**
 * Game rules for drawn gestures: decide whether a recognized drawing is a legal move, and if
 * not, what to tell the player. Pure TypeScript.
 */
import { cellName, type Board, type Player } from '../game';
import type { Recognition } from './recognize';

export type Verdict = { ok: true; cell: number } | { ok: false; message: string };

const article = (p: Player) => (p === 'X' ? 'an X' : 'an O');
const capital = (s: string) => s[0].toUpperCase() + s.slice(1);

export function judge(r: Recognition, turn: Player, board: Board): Verdict {
  if (!r.shape) {
    switch (r.reason) {
      case 'empty':
      case 'too small':
        return { ok: false, message: 'Too small to read — draw it bigger.' };
      case 'too large':
        return { ok: false, message: 'Too big — keep it inside one square.' };
      case 'off the board':
        return { ok: false, message: 'Draw inside the board.' };
      case 'spans several cells':
        return { ok: false, message: 'That spans several squares — keep it inside one.' };
      default:
        return { ok: false, message: "Couldn't tell what that was — try again." };
    }
  }
  if (r.shape !== turn) return { ok: false, message: `It's ${turn}'s turn — draw ${article(turn)}.` };
  if (board[r.cell] !== null) return { ok: false, message: `${capital(cellName(r.cell))} is taken.` };
  return { ok: true, cell: r.cell };
}
