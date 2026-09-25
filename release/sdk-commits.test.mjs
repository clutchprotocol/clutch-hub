// Regression test for the two SDK release bugs that came in on 2026-09-18 (e974923).
// release-dry-run.yml runs it. It reads two real commits, so it needs the full git history.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { analyzeCommits, generateNotes } from './sdk-commits.mjs';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const releaserc = JSON.parse(readFileSync(new URL('../.releaserc.json', import.meta.url), 'utf8'));
const [, config] = releaserc.plugins.find((plugin) => plugin[0] === './release/sdk-commits.mjs');
const logger = { log() {} };

// Two real commits: a5287c0 changed packages/sdk, 318d787 changed only apps/demo.
// Each test gives both the same message, so only the paths they touch can explain a difference.
const sdk = 'a5287c053ba2babd0965aa5d5f67fcb4b9215202';
const demo = '318d787edebcc16f41d97a55b9634329c665a0aa';

test('a breaking change in packages/sdk is a major release', async () => {
  const commits = [{ hash: sdk, message: 'feat!: probe' }];
  assert.equal(await analyzeCommits(config, { cwd, logger, commits }), 'major');
});

test('a commit outside packages/sdk does not release the SDK', async () => {
  const commits = [{ hash: demo, message: 'feat!: probe' }];
  assert.equal(await analyzeCommits(config, { cwd, logger, commits }), null);
});

test('release notes list only the commits that touch packages/sdk', async () => {
  const text = await generateNotes(config, {
    cwd,
    logger,
    commits: [
      { hash: sdk, message: 'fix: probe in the sdk' },
      { hash: demo, message: 'fix: probe in the demo' },
    ],
    lastRelease: { gitTag: 'v4.2.1', version: '4.2.1' },
    nextRelease: { gitTag: 'v4.2.2', version: '4.2.2' },
    options: { repositoryUrl: 'https://github.com/clutchprotocol/clutch-hub.git' },
  });
  assert.match(text, /probe in the sdk/);
  assert.doesNotMatch(text, /probe in the demo/);
});

// npm-publish.yml sets `released` from a marker file, and publish-canary skips when it is true.
// Until 2026-09-25 nothing wrote that file, so a canary was published after every real release.
test('a real release writes the marker file that npm-publish.yml reads', () => {
  const [, exec] = releaserc.plugins.find((plugin) => plugin[0] === '@semantic-release/exec');
  assert.match(exec.successCmd ?? '', /\.semantic-release-released\b/);
  const workflow = readFileSync(new URL('../.github/workflows/npm-publish.yml', import.meta.url), 'utf8');
  assert.match(workflow, /-f \.semantic-release-released\b/);
});
