import fs from 'node:fs';
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

function readText(root, relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function readJson(root, relPath) {
  return JSON.parse(readText(root, relPath));
}

function extractQuotedItems(tsSource) {
  return [...tsSource.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

function extractModes(root) {
  const source = readText(root, 'src/types.ts');
  const match = source.match(/VALID_MODES\s*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!match) throw new Error('Could not extract VALID_MODES from src/types.ts');
  return extractQuotedItems(match[1]);
}

function extractGreenfieldStages(root) {
  const source = readText(root, 'src/greenfield/modes/greenfieldStages.ts');
  const match = source.match(/GREENFIELD_STAGE_NAMES:\s*string\[\]\s*=\s*\[([\s\S]*?)\]/);
  if (!match) throw new Error('Could not extract GREENFIELD_STAGE_NAMES');
  return extractQuotedItems(match[1]);
}

function extractGreenfieldArtifactPaths(root) {
  const source = readText(root, 'src/greenfield/modes/greenfieldMode.ts');
  return [...source.matchAll(/'([^']+)':\s*'([^']+)'/g)].map((match) => ({
    stage: match[1],
    artifactPath: match[2],
  }));
}

function collectDocs(root) {
  const docsDir = path.join(root, 'docs');
  const docs = fs
    .readdirSync(docsDir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => path.join('docs', name));
  return ['README.md', 'CHANGELOG.md', ...docs];
}

function fail(message, failures) {
  failures.push(message);
}

export function runDocsConsistencyCheck(argv = process.argv.slice(2)) {
  const { root } = parseArgs(argv);
  const pkg = readJson(root, 'package.json');
  const modes = extractModes(root);
  const greenfieldStages = extractGreenfieldStages(root);
  const greenfieldArtifactPaths = extractGreenfieldArtifactPaths(root);

  const readme = readText(root, 'README.md');
  const changelog = readText(root, 'CHANGELOG.md');
  const roadmapPath = fs.existsSync(path.join(root, 'docs', 'ROADMAP.md')) ? 'docs/ROADMAP.md' : 'ROADMAP.md';
  const roadmap = readText(root, roadmapPath);
  const workflows = readText(root, 'docs/WORKFLOWS.md');
  const artifacts = readText(root, 'docs/ARTIFACTS.md');
  const docsBundle = collectDocs(root).map((relPath) => ({
    relPath,
    content: readText(root, relPath),
  }));
  const joinedDocs = docsBundle.map((entry) => entry.content).join('\n');

  const failures = [];

  for (const pattern of [
    /6 modes/i,
    /six modes/i,
    /greenfield planned/i,
    /planned greenfield/i,
    /v1\.1\.0 planned/i,
    /validateGreenfieldArtifacts\.ts/i,
  ]) {
    if (pattern.test(readme)) {
      fail(`README.md contains stale text matching ${pattern}`, failures);
    }
  }

  if (/v1\.0\.0[^\n]*current published/i.test(readme)) {
    fail('README.md still claims v1.0.0 is the current published release', failures);
  }

  if (readme.includes('my-dev-kit-orchestrator@1.0.0') || readme.includes('my-dev-kit-orchestrator@0')) {
    fail('README.md contains stale package version references', failures);
  }

  if (!readme.includes(pkg.version) && /v\d+\.\d+\.\d+/.test(readme)) {
    fail(`README.md references a version but does not mention current package version ${pkg.version}`, failures);
  }

  for (const mode of modes) {
    const token = `\`${mode}\``;
    if (!readme.includes(token) && !workflows.includes(token)) {
      fail(`Docs do not mention current mode ${mode}`, failures);
    }
  }

  if (!readme.includes('greenfield') || !workflows.includes('greenfield')) {
    fail('Docs do not present greenfield as a current mode', failures);
  }

  if (!/supports the\s+`typescript-cli`\s+and\s+`nextjs-app`\s+profiles/i.test(workflows)) {
    fail('docs/WORKFLOWS.md does not state the current greenfield profile support', failures);
  }

  for (const stage of greenfieldStages) {
    if (!workflows.includes(`\`${stage}\``)) {
      fail(`docs/WORKFLOWS.md is missing greenfield stage ${stage}`, failures);
    }
  }

  for (const { artifactPath } of greenfieldArtifactPaths) {
    if (!artifacts.includes(`\`${artifactPath}\``)) {
      fail(`docs/ARTIFACTS.md is missing greenfield artifact path ${artifactPath}`, failures);
    }
  }

  for (const sharedPath of ['artifacts/verification-report.txt', 'artifacts/judge-report.txt', 'artifacts/final-report.txt']) {
    if (!artifacts.includes(`\`${sharedPath}\``)) {
      fail(`docs/ARTIFACTS.md is missing shared artifact path ${sharedPath}`, failures);
    }
  }

  if (/Implemented but not yet published/i.test(changelog)) {
    fail('CHANGELOG.md still says v1.1.0 is not yet published', failures);
  }

  if (/awaiting a separate pre-release workflow/i.test(roadmap)) {
    fail('docs/ROADMAP.md still says v1.1.0 is awaiting pre-release', failures);
  }

  const misleadingAndroidClaims = [
    /v1\.1\.0.{0,80}android profile/i,
    /v1\.1\.0.{0,80}mobile profile/i,
    /supports android/i,
    /supports mobile/i,
  ];
  for (const pattern of misleadingAndroidClaims) {
    if (pattern.test(readme) || pattern.test(workflows) || pattern.test(artifacts)) {
      fail(`Docs contain a potentially misleading Android/mobile support claim: ${pattern}`, failures);
    }
  }

  if (!readText(root, 'docs/USAGE.md').includes('my-dev-kit-orchestrator check --artifacts')) {
    fail('docs/USAGE.md is missing check --artifacts usage', failures);
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`DOCS_CHECK_FAIL: ${failure}`);
    }
    return 1;
  }

  console.log(
    `DOCS_CHECK_PASS: ${pkg.name}@${pkg.version}; ${modes.length} modes; ${greenfieldStages.length} greenfield stages; ${greenfieldArtifactPaths.length + 3} documented greenfield/shared artifact paths`,
  );
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    process.exitCode = runDocsConsistencyCheck();
  } catch (error) {
    console.error(`DOCS_CHECK_FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
