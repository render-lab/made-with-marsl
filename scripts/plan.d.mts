export function identity(files: { path: string; sha: string; executable?: boolean }[]): string;
export function validateRelease(directory: string, root?: string): { id: string; path: string; image: string; sourceHash: string; reviewHash: string };
