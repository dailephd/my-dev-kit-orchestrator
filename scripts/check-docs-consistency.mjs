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

// v1.2.0: extracted from source (SUPPORTED_PROFILES) rather than hardcoded,
// the same way modes and stages already are above -- this is what keeps
// docs from silently drifting the next time a greenfield profile is added
// or removed (see docs/DEVELOPMENT.md, "Adding a greenfield profile").
function extractGreenfieldProfiles(root) {
  const source = readText(root, 'src/greenfield/profiles/resolveGreenfieldProfile.ts');
  const match = source.match(/SUPPORTED_PROFILES:\s*Record<GreenfieldProfileId,\s*GreenfieldProfile>\s*=\s*\{([\s\S]*?)\}/);
  if (!match) throw new Error('Could not extract SUPPORTED_PROFILES from resolveGreenfieldProfile.ts');
  return extractQuotedItems(match[1]);
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

// Finds claimRegex matches in text and reports true only for matches that are
// NOT immediately preceded (within `window` characters) by a negation word.
// This lets docs correctly say "the orchestrator does not run Gradle" or
// "does not claim Play Store readiness" without a naive substring/regex
// check treating the negated sentence itself as the violation it is
// describing -- the exact false-positive trap the old hardcoded
// "supports android"/"supports mobile" patterns fell into once Android
// Compose became legitimately supported.
function containsUnnegatedClaim(text, claimRegex, window = 30) {
  const flags = claimRegex.flags.includes('g') ? claimRegex.flags : `${claimRegex.flags}g`;
  const re = new RegExp(claimRegex.source, flags);
  const negationRe = /\b(not|never|no|n't|without|does not|doesn't|did not|didn't)\b/i;
  let match;
  while ((match = re.exec(text))) {
    const start = Math.max(0, match.index - window);
    const preceding = text.slice(start, match.index);
    if (!negationRe.test(preceding)) {
      return true;
    }
  }
  return false;
}

export function runDocsConsistencyCheck(argv = process.argv.slice(2)) {
  const { root } = parseArgs(argv);
  const pkg = readJson(root, 'package.json');
  const modes = extractModes(root);
  const greenfieldStages = extractGreenfieldStages(root);
  const greenfieldArtifactPaths = extractGreenfieldArtifactPaths(root);
  const greenfieldProfiles = extractGreenfieldProfiles(root);

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

  // v1.2.0: source-derived profile-list check, replacing the old hardcoded
  // two-profile regex (`/supports the \`typescript-cli\` and \`nextjs-app\`
  // profiles/`), which would fail forever once a third profile shipped.
  for (const profile of greenfieldProfiles) {
    const token = `\`${profile}\``;
    if (!readme.includes(token) && !workflows.includes(token)) {
      fail(`Docs do not mention current greenfield profile ${profile}`, failures);
    }
  }

  // A doc that names a fixed, wrong profile count is stale by construction,
  // independent of which profiles it lists -- catches "only two profiles"
  // style phrasing even if it happens to also list a since-added profile id
  // somewhere else in the same document.
  const profileCountWords = { 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five' };
  const wrongProfileCountRe = new RegExp(
    `\\b(${Object.entries(profileCountWords)
      .filter(([count]) => Number(count) !== greenfieldProfiles.length)
      .map(([count, word]) => `${count}|${word}`)
      .join('|')})\\s+(supported\\s+)?(starter\\s+)?profiles\\b`,
    'i',
  );
  if (wrongProfileCountRe.test(workflows) || wrongProfileCountRe.test(readme)) {
    fail(
      `Docs state a greenfield profile count that does not match source (source has ${greenfieldProfiles.length}: ${greenfieldProfiles.join(', ')})`,
      failures,
    );
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

  // Historical v1.1.0-scoped claims (correctly preserved: v1.1.0 truly did
  // not support Android/mobile) are intentionally not checked here -- only
  // claims that are wrong about *current* behavior are checked below.
  // Every pattern here uses containsUnnegatedClaim so that this project's
  // own correct disclaimers ("does not support...", "does not claim...")
  // are never themselves flagged as violations.
  const misleadingClaims = [
    {
      kind: 'generic mobile support claim',
      pattern: /supports?\s+(a\s+)?(generic\s+)?mobile\b(?!\s+compose)/i,
    },
    { kind: 'iOS support claim', pattern: /supports?\s+ios\b/i },
    { kind: 'Flutter support claim', pattern: /supports?\s+flutter\b/i },
    { kind: 'React Native support claim', pattern: /supports?\s+react[- ]native\b/i },
    {
      kind: 'Gradle-execution claim',
      pattern: /\b(orchestrator|cli|tool)\s+(runs|executes|invokes|ran)\s+gradle\b/i,
    },
    { kind: 'Gradle-execution claim', pattern: /\bgradle\s+(ran|succeeded|passed)\b/i },
    {
      kind: 'Android SDK requirement claim',
      pattern: /\b(requires?|needs?)\s+(the\s+)?android sdk\b/i,
    },
    { kind: 'Play Store readiness claim', pattern: /play store\s+(ready|readiness)\b/i },
    { kind: 'release-readiness claim', pattern: /\brelease[- ]ready\b/i },
    { kind: 'mobile mode existence claim', pattern: /`mobile`/i },
  ];
  for (const { kind, pattern } of misleadingClaims) {
    for (const { relPath, content } of docsBundle) {
      if (containsUnnegatedClaim(content, pattern)) {
        fail(`${relPath} contains a potentially misleading ${kind}: ${pattern}`, failures);
      }
    }
  }

  // Publication-status claim: only meaningful while pkg.version has not
  // actually been bumped to the target version, i.e. it is not yet published.
  const targetVersionMatch = joinedDocs.match(/\bv(1\.2\.0)\b/);
  if (targetVersionMatch && targetVersionMatch[1] !== pkg.version) {
    const publishedClaimRe = new RegExp(
      `v${targetVersionMatch[1].replace(/\./g, '\\.')}\\s+(has been\\s+|is\\s+)?(published|released|tagged)\\b`,
      'i',
    );
    for (const { relPath, content } of docsBundle) {
      if (containsUnnegatedClaim(content, publishedClaimRe)) {
        fail(
          `${relPath} claims v${targetVersionMatch[1]} is published/released/tagged, but package.json version is still ${pkg.version}`,
          failures,
        );
      }
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
    `DOCS_CHECK_PASS: ${pkg.name}@${pkg.version}; ${modes.length} modes; ${greenfieldStages.length} greenfield stages; ${greenfieldProfiles.length} greenfield profiles; ${greenfieldArtifactPaths.length + 3} documented greenfield/shared artifact paths`,
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
