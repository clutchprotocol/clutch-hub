// Only commits that change packages/sdk may decide the SDK's next version and its release notes.
//
// semantic-release reads every commit since the last tag, from every folder of this repo. The
// `paths:` filter in npm-publish.yml only decides when the release job runs. So before this file,
// an apps/demo commit counted as an SDK change: the 4.2.0 notes list the whole demo history.
//
// This plugin wraps the two plugins that read commits, and gives them only the commits that touch
// packages/sdk. `git diff-tree` prints nothing for a merge commit, so a merge never counts by
// itself. The commits it brought in are checked one by one, like any other commit.
import { execFileSync } from 'node:child_process';
// ponytail: both plugins come with semantic-release, and npm hoists them to the root today. If an
// update ever nests them, this import fails loudly and nothing is released. Then add both to the
// root devDependencies.
import { analyzeCommits as analyze } from '@semantic-release/commit-analyzer';
import { generateNotes as notes } from '@semantic-release/release-notes-generator';

const touchesSdk = (hash, cwd) =>
  execFileSync('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', hash, '--', 'packages/sdk/'], {
    cwd,
    encoding: 'utf8',
  }).trim() !== '';

const sdkOnly = (context) => {
  const commits = context.commits.filter(({ hash }) => touchesSdk(hash, context.cwd));
  context.logger.log('%d of %d commits touch packages/sdk', commits.length, context.commits.length);
  return { ...context, commits };
};

export const analyzeCommits = (config, context) => analyze(config, sdkOnly(context));
export const generateNotes = (config, context) => notes(config, sdkOnly(context));
