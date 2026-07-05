import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function parseArgs(argv) {
  const result = { root: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') {
      const value = argv[index + 1];
      if (!value) throw new Error('--root requires a value');
      result.root = path.resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}

export function runTrackedIgnoredCheck(argv = process.argv.slice(2)) {
  const { root } = parseArgs(argv);
  const result = spawnSync(
    'git',
    ['ls-files', '-ci', '--exclude-standard'],
    { cwd: root, encoding: 'utf8', windowsHide: true },
  );

  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    console.error(`TRACKED_IGNORED_FAIL: git ls-files failed${stderr ? `: ${stderr}` : ''}`);
    return 1;
  }

  const trackedIgnored = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (trackedIgnored.length > 0) {
    console.error('TRACKED_IGNORED_FAIL: tracked paths match .gitignore');
    for (const filePath of trackedIgnored) {
      console.error(`TRACKED_IGNORED_FILE: ${filePath}`);
    }
    console.error('TRACKED_IGNORED_REPAIR: git rm --cached <path> to stop tracking ignored files without deleting local content');
    return 1;
  }

  console.log('TRACKED_IGNORED_PASS: no tracked files match .gitignore');
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    process.exitCode = runTrackedIgnoredCheck();
  } catch (error) {
    console.error(`TRACKED_IGNORED_FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
