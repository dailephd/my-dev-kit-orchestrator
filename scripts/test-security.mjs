import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const EXPECTED_PACKAGE_NAME = '@dailephd/my-dev-kit-orchestrator';
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const FORBIDDEN_SEGMENTS = new Set([
  'node_modules',
  'coverage',
  '.my-dev-kit',
  '.my-dev-kit-orchestrator',
  '.idea',
  '.vscode',
  'reports',
  'tmp',
  'temp',
]);

function parseArgs(argv) {
  const result = { root: process.cwd(), packJson: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root' || arg === '--pack-json') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a value`);
      }
      if (arg === '--root') result.root = path.resolve(value);
      else result.packJson = path.resolve(value);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return result;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizePackagePath(filePath) {
  return filePath.replaceAll('\\', '/').replace(/^\.\/+/, '');
}

function isForbiddenPackagePath(filePath) {
  const normalized = normalizePackagePath(filePath);
  const lower = normalized.toLowerCase();
  const segments = lower.split('/');

  if (segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment))) return true;
  if (segments.some((segment) => segment === '.env' || segment.startsWith('.env.'))) return true;
  if (lower.endsWith('.log') || lower.endsWith('.tgz')) return true;
  return false;
}

function validateManifest(manifest) {
  const errors = [];
  if (manifest.name !== EXPECTED_PACKAGE_NAME) {
    errors.push(`Unexpected package name: ${String(manifest.name)}`);
  }
  if (typeof manifest.version !== 'string' || !SEMVER_RE.test(manifest.version)) {
    errors.push(`Invalid package version: ${String(manifest.version)}`);
  }

  const binPath = manifest.bin?.['my-dev-kit-orchestrator'];
  if (binPath !== 'dist/cli.js' || path.isAbsolute(binPath ?? '') || String(binPath).includes('..')) {
    errors.push(`Unsafe or unexpected CLI bin path: ${String(binPath)}`);
  }

  const ALLOWED_FILES_POLICY_ENTRIES = new Set(['dist', 'CHANGELOG.md']);
  const filesPolicy = Array.isArray(manifest.files) ? manifest.files : [];
  const hasUnexpectedEntry = filesPolicy.some((entry) => !ALLOWED_FILES_POLICY_ENTRIES.has(entry));
  if (!Array.isArray(manifest.files) || !filesPolicy.includes('dist') || hasUnexpectedEntry) {
    errors.push('package.json files policy must contain only "dist" and "CHANGELOG.md"');
  }
  return errors;
}

function loadPackResult(root, packJsonPath) {
  if (packJsonPath) return readJson(packJsonPath);

  const npmExecPath = process.env.npm_execpath;
  if (!npmExecPath) {
    throw new Error('npm_execpath is unavailable; run this check through npm run test:security');
  }
  const result = spawnSync(
    process.execPath,
    [npmExecPath, 'pack', '--dry-run', '--json', '--ignore-scripts'],
    { cwd: root, encoding: 'utf8', windowsHide: true },
  );
  if (result.status !== 0) {
    throw new Error(`npm pack --dry-run failed with exit ${String(result.status)}: ${result.stderr.trim()}`);
  }
  return JSON.parse(result.stdout);
}

function validatePackResult(packResult) {
  const errors = [];
  const entry = Array.isArray(packResult) ? packResult[0] : undefined;
  const files = entry?.files;
  if (!Array.isArray(files)) return ['npm pack JSON does not contain a files array'];

  const paths = files.map((file) => normalizePackagePath(String(file?.path ?? '')));
  for (const filePath of paths) {
    if (!filePath) errors.push('npm pack reported an empty file path');
    else if (isForbiddenPackagePath(filePath)) errors.push(`Forbidden package path: ${filePath}`);
  }
  if (!paths.includes('package.json')) errors.push('Package output is missing package.json');
  if (!paths.includes('README.md')) errors.push('Package output is missing README.md');
  if (!paths.includes('CHANGELOG.md')) errors.push('Package output is missing CHANGELOG.md');
  return errors;
}

export function runSecurityContract(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const manifest = readJson(path.join(options.root, 'package.json'));
  const packResult = loadPackResult(options.root, options.packJson);
  const errors = [...validateManifest(manifest), ...validatePackResult(packResult)];

  if (errors.length > 0) {
    for (const error of errors) console.error(`SECURITY_CONTRACT_FAIL: ${error}`);
    return 1;
  }
  console.log('SECURITY_CONTRACT_PASS: package metadata and tarball contents are safe');
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    process.exitCode = runSecurityContract();
  } catch (error) {
    console.error(`SECURITY_CONTRACT_FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
