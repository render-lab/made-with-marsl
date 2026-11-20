import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, lstatSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const hash = data => createHash('sha256').update(data).digest('hex');
export const identity = files => hash('source-v2\n' + JSON.stringify(files.map(f => [f.path, f.sha, !!f.executable]).sort((a,b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));
const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const releasePath = new RegExp(`^packages/u-[a-f0-9]{16}/([a-z][a-z0-9-]{0,47}-${uuid})/releases/((?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*))$`);
function filesUnder(root, directory = root) {
  return readdirSync(directory).flatMap(name => {
    const full = join(directory, name), stat = lstatSync(full);
    if (stat.isSymbolicLink()) throw new Error('Symlinks are not allowed in release bundles');
    if (stat.isDirectory()) return filesUnder(root, full);
    if (!stat.isFile()) throw new Error('Only regular files are allowed');
    return [{ path: relative(root, full).replaceAll('\\', '/'), sha: hash(readFileSync(full)), executable: !!(stat.mode & 0o111) }];
  });
}
export function validateRelease(directory, root = process.cwd()) {
  const match = releasePath.exec(directory);
  if (!match) throw new Error('Invalid release path');
  const base = resolve(root, directory), manifest = JSON.parse(readFileSync(join(base, 'release.json'), 'utf8'));
  const image = `ghcr.io/render-lab/marsl-${match[1]}:${match[2]}`;
  if (manifest.schemaVersion !== 1 || manifest.path !== directory || manifest.image !== image || manifest.version !== match[2] || !new RegExp(`^${uuid}$`).test(manifest.releaseId)) throw new Error('Release metadata does not match its destination');
  const bundle = filesUnder(base);
  const actual = bundle.filter(f => f.path.startsWith('src/') && !f.path.startsWith('src/.marsl-package/')).map(f => ({ ...f, path: f.path.slice(4) }));
  if (!Array.isArray(manifest.source) || identity(actual) !== manifest.sourceHash || identity(manifest.source) !== manifest.sourceHash) throw new Error('Source contents differ from the reviewed version');
  for (const name of ['README.md', 'HOWTO.md', 'LICENSE', 'Dockerfile']) if (!actual.some(f => f.path === name)) throw new Error(`Missing ${name}`);
  return { id: manifest.releaseId, path: directory, image, sourceHash: manifest.sourceHash, reviewHash: identity(bundle) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [before, after] = process.argv.slice(2);
  if (!/^[a-f0-9]{40}$/.test(before ?? '') || !/^[a-f0-9]{40}$/.test(after ?? '')) throw new Error('Expected commit IDs');
  const changed = execFileSync('git', ['diff', '--no-renames', '--name-status', '-z', before, after], { encoding: 'utf8' }).split('\0');
  const directories = new Set();
  const added = new Set();
  for (let i = 0; i < changed.length - 1; i += 2) {
    const [status, path] = changed.slice(i, i+2);
    if (!path.startsWith('packages/')) continue;
    if (status !== 'A') throw new Error('Published releases are immutable; add a new release directory');
    const match = /^(packages\/[^/]+\/[^/]+\/releases\/[^/]+)\//.exec(path);
    if (!match) throw new Error('Files must belong to a versioned release directory');
    directories.add(match[1]);
    added.add(path);
  }
  const releases = [...directories].map(directory => {
    if (!added.has(directory + '/release.json')) throw new Error('A new release manifest is required; existing releases are immutable');
    return validateRelease(directory);
  });
  if (releases.length > 20) throw new Error('At most 20 releases per push');
  appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify({ include: releases })}\ncount=${releases.length}\n`);
}
