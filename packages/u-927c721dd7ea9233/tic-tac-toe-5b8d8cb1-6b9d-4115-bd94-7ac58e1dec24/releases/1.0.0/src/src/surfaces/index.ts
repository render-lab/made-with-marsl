import { chalkboard } from './chalkboard';
import { frost } from './frost';
import { sand } from './sand';
import { snow } from './snow';
import { steam } from './steam';
import type { SurfaceDefinition } from './types';

/** Registry of selectable surfaces, in picker order. Add new surfaces here. */
export const SURFACES: SurfaceDefinition[] = [snow, sand, steam, chalkboard, frost];

export type { Surface, SurfaceDefinition, StrokeKind, SurfaceOptions } from './types';
