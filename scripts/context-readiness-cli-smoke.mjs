import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repositoryRoot, 'dist', 'cli.js');
const fixtureRoot = path.join(
  repositoryRoot,
  'tests',
  'fixtures',
  'context-contracts',
  'my-dev-kit-1.10.2-identity',
);
const { createRun } = require(path.join(repositoryRoot, 'dist', 'run.js'));
const {
  placeholderForSection,
} = require(path.join(repositoryRoot, 'dist', 'instructions', 'supplementalContextTemplates.js'));
const {
  REQUIRED_POPULATED_SECTIONS_BY_KIND,
} = require(path.join(repositoryRoot, 'dist', 'instructions', 'supplementalContextParser.js'));

function hashTree(root) {
  const hash = crypto.createHash('sha256');
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const fullPath = path.join(directory, entry.name);
      const relativePath = path.relative(root, fullPath).replaceAll(path.sep, '/');
      hash.update(relativePath);
      if (entry.isDirectory()) visit(fullPath);
      else hash.update(fs.readFileSync(fullPath));
    }
  };
  visit(root);
  return hash.digest('hex');
}

function runCli(root, runId, args, expectedExitCodes = [0]) {
  const result = spawnSync(process.execPath, [cliPath, ...args, '--run', runId, '--root', root], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (!expectedExitCodes.includes(result.status)) {
    throw new Error(`CLI ${args.join(' ')} exited ${result.status}\n${output}`);
  }
  return output;
}

function replaceRequiredSections(text, documentKind) {
  let result = text;
  for (const heading of REQUIRED_POPULATED_SECTIONS_BY_KIND[documentKind] ?? []) {
    const marker = `## ${heading}\n${placeholderForSection(documentKind, heading)}`;
    result = result.split(marker).join(`## ${heading}\nCopied-fixture CLI smoke evidence for "${heading}".`);
  }
  return result;
}

function populateSupplemental(runFolder, kind, capsulePath, auditPath) {
  const packetRelativePath =
    kind === 'implementation'
      ? 'artifacts/implementation-context-packet.txt'
      : 'artifacts/test-context-packet.txt';
  const reportRelativePath =
    kind === 'implementation'
      ? 'reports/implementation-context-retrieval-report.txt'
      : 'reports/test-context-retrieval-report.txt';
  const documentKind =
    kind === 'implementation' ? 'implementation-context-packet' : 'test-context-packet';

  for (const relativePath of [packetRelativePath, reportRelativePath]) {
    const target = path.join(runFolder, relativePath);
    let text = fs
      .readFileSync(target, 'utf8')
      .replace('Status: template', 'Status: populated')
      .replace('Source context capsule: unknown', `Source context capsule: ${capsulePath}`)
      .replace('Source retrieval audit: unknown', `Source retrieval audit: ${auditPath}`);
    if (relativePath === packetRelativePath) {
      text = replaceRequiredSections(text, documentKind);
    }
    fs.writeFileSync(target, text, 'utf8');
  }
}

function writeJson(target, value) {
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function createFixtureRun(root) {
  const meta = createRun({ request: 'context readiness CLI fixture smoke', mode: 'feature', projectRoot: root });
  const runJsonPath = path.join(meta.runFolder, 'run.json');
  const runJson = JSON.parse(fs.readFileSync(runJsonPath, 'utf8'));
  runJson.projectRoot = repositoryRoot;
  writeJson(runJsonPath, runJson);

  const capsulePath = path.join(meta.runFolder, 'implementation-capsule.json');
  const auditPath = path.join(meta.runFolder, 'implementation-audit.json');
  fs.copyFileSync(path.join(fixtureRoot, 'context-capsule.json'), capsulePath);
  fs.copyFileSync(path.join(fixtureRoot, 'retrieval-audit-record.json'), auditPath);
  populateSupplemental(meta.runFolder, 'implementation', capsulePath, auditPath);

  for (const stage of meta.stages) {
    if (stage.name === 'implementation') break;
    for (const relativePath of [stage.artifactFile, ...(stage.additionalArtifactFiles ?? [])]) {
      const target = path.join(meta.runFolder, relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      if (!fs.existsSync(target)) {
        fs.writeFileSync(target, `Artifact: ${stage.artifactKind}\nWorkflow mode: feature\nStatus: complete\n`, 'utf8');
      }
    }
  }

  return { meta, capsulePath, auditPath };
}

function mutateRawPair(capsulePath, auditPath, mutation) {
  const capsule = JSON.parse(fs.readFileSync(capsulePath, 'utf8'));
  const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
  mutation(capsule, audit);
  writeJson(capsulePath, capsule);
  writeJson(auditPath, audit);
}

function assertContains(output, value, scenario) {
  if (!output.includes(value)) {
    throw new Error(`${scenario}: expected output to contain ${JSON.stringify(value)}\n${output}`);
  }
}

function implementationScenario(parentRoot, name, mutation, expectedDecision, expectedCode) {
  const root = path.join(parentRoot, name);
  fs.mkdirSync(root, { recursive: true });
  const { meta, capsulePath, auditPath } = createFixtureRun(root);
  mutation?.({ meta, capsulePath, auditPath });

  const status = runCli(root, meta.runId, ['status']);
  assertContains(status, `Implementation context: ${expectedDecision}`, name);
  if (expectedCode) assertContains(status, expectedCode, name);

  const prompt = runCli(root, meta.runId, ['prompt', 'implementation']);
  if (expectedDecision === 'ready') {
    if (prompt.includes('BLOCKED on repository context')) {
      throw new Error(`${name}: valid producer evidence produced a refresh-only prompt`);
    }
  } else {
    assertContains(prompt, 'BLOCKED on repository context', name);
  }

  const check = runCli(root, meta.runId, ['check'], [0, 1]);
  assertContains(check, 'Repository context readiness', name);
  if (expectedCode) assertContains(check, expectedCode, name);
  console.log(`CONTEXT_CLI_SMOKE ${name}: ${expectedDecision}${expectedCode ? ` (${expectedCode})` : ''}`);
}

function syntheticTestRaw(mappingStatus) {
  return {
    schemaVersion: '1.0.0',
    tool: { name: 'my-dev-kit', version: '1.10.2' },
    index: { indexPath: '/idx', manifestPath: '/idx/manifest.json' },
    request: { role: 'test-implementation' },
    roleContext: { role: 'test-implementation' },
    roleAdequacy: { status: 'context sufficient for test implementation' },
    freshness: {
      role: 'test-implementation',
      state: 'fresh',
      comparedIdentities: [{ label: 'afterIndexPath', value: '/idx' }],
    },
    responsibilityMappings: {
      mappings: [{ responsibilityId: 'TST-SMOKE-001', mappingStatus }],
      truncated: false,
    },
    truncation: { truncated: false, records: [] },
    fullFileFallback: { used: 0 },
    provenance: [{ id: 'p1' }],
    warnings: [],
  };
}

function partialMappingScenario(parentRoot) {
  const name = 'partial-critical-mapping';
  const root = path.join(parentRoot, name);
  fs.mkdirSync(root, { recursive: true });
  const meta = createRun({ request: name, mode: 'test', projectRoot: root });
  const capsulePath = path.join(meta.runFolder, 'test-capsule.json');
  const auditPath = path.join(meta.runFolder, 'test-audit.json');
  writeJson(capsulePath, syntheticTestRaw('partially-mapped'));
  writeJson(auditPath, syntheticTestRaw('partially-mapped'));
  populateSupplemental(meta.runFolder, 'test', capsulePath, auditPath);
  fs.writeFileSync(
    path.join(meta.runFolder, 'artifacts', 'test-strategy-packet.txt'),
    [
      'test responsibility ID: TST-SMOKE-001',
      'criticality: critical',
      'traces to: smoke',
      'setup: smoke',
      'action or trigger: evaluate',
      'expected result: blocked',
      'test level: CLI',
      '',
    ].join('\n'),
    'utf8',
  );
  for (const stage of meta.stages) {
    if (stage.name === 'test-implementation') break;
    const target = path.join(meta.runFolder, stage.artifactFile);
    if (!fs.existsSync(target)) {
      fs.writeFileSync(target, `Artifact: ${stage.artifactKind}\nWorkflow mode: test\nStatus: complete\n`, 'utf8');
    }
  }
  // The phase-aware assertion belongs at the first evidence-owning stage.
  // Refresh the strategy artifact after its generated predecessors so the
  // lifecycle cursor reaches test-implementation rather than treating the
  // strategy as stale.
  const afterPredecessors = new Date(Date.now() + 2_000);
  fs.utimesSync(path.join(meta.runFolder, 'artifacts', 'test-strategy-packet.txt'), afterPredecessors, afterPredecessors);

  const status = runCli(root, meta.runId, ['status']);
  assertContains(status, 'Test context: refresh-required', name);
  assertContains(status, 'CONTEXT_CRITICAL_RESPONSIBILITY_PARTIALLY_MAPPED', name);
  const prompt = runCli(root, meta.runId, ['prompt', 'test-implementation']);
  assertContains(prompt, 'BLOCKED on repository context', name);
  console.log(`CONTEXT_CLI_SMOKE ${name}: refresh-required (CONTEXT_CRITICAL_RESPONSIBILITY_PARTIALLY_MAPPED)`);
}

function legacyRunScenario(parentRoot) {
  const name = 'legacy-run';
  const root = path.join(parentRoot, name);
  fs.mkdirSync(root, { recursive: true });
  const meta = createRun({ request: name, mode: 'feature', projectRoot: root });
  for (const relativePath of [
    'artifacts/implementation-context-packet.txt',
    'reports/implementation-context-retrieval-report.txt',
    'artifacts/test-context-packet.txt',
    'reports/test-context-retrieval-report.txt',
  ]) {
    fs.rmSync(path.join(meta.runFolder, relativePath), { force: true });
  }
  const status = runCli(root, meta.runId, ['status']);
  assertContains(status, 'Repository context: not required', name);
  console.log('CONTEXT_CLI_SMOKE legacy-run: loadable before evidence-owning phase');
}

const sourceHashBefore = hashTree(fixtureRoot);
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-context-cli-smoke-'));

try {
  implementationScenario(temporaryRoot, 'valid-schema-major-1-producer', undefined, 'ready');
  implementationScenario(
    temporaryRoot,
    'raw-contradiction',
    ({ capsulePath, auditPath }) => mutateRawPair(capsulePath, auditPath, (_capsule, audit) => {
      audit.request.role = 'test-implementation';
      audit.roleContext.role = 'test-implementation';
    }),
    'refresh-required',
    'CONTEXT_SOURCE_SUMMARY_MISMATCH',
  );
  implementationScenario(
    temporaryRoot,
    'supplemental-contradiction',
    ({ meta }) => {
      const reportPath = path.join(meta.runFolder, 'reports', 'implementation-context-retrieval-report.txt');
      fs.writeFileSync(
        reportPath,
        fs.readFileSync(reportPath, 'utf8').replace('Role: implementation', 'Role: test-implementation'),
        'utf8',
      );
    },
    'refresh-required',
  );
  implementationScenario(
    temporaryRoot,
    'repository-mismatch',
    ({ capsulePath, auditPath }) => mutateRawPair(capsulePath, auditPath, (capsule, audit) => {
      capsule.index.projectRoot = 'Z:/different/repository';
      audit.index.projectRoot = 'Z:/different/repository';
    }),
    'refresh-required',
    'CONTEXT_SOURCE_REPOSITORY_MISMATCH',
  );
  implementationScenario(
    temporaryRoot,
    'index-mismatch',
    ({ capsulePath, auditPath }) => mutateRawPair(capsulePath, auditPath, (_capsule, audit) => {
      audit.index.indexPath = 'Z:/different/index';
    }),
    'refresh-required',
    'CONTEXT_SOURCE_SUMMARY_MISMATCH',
  );
  implementationScenario(
    temporaryRoot,
    'required-truncation',
    ({ capsulePath, auditPath }) => mutateRawPair(capsulePath, auditPath, (capsule, audit) => {
      for (const evidence of [capsule, audit]) {
        evidence.truncation = {
          truncated: true,
          records: [{
            id: 'truncation-group:required',
            affectedGroup: 'required',
            requiredEvidenceLost: true,
            available: 2,
            used: 1,
            droppedCount: 1,
            droppedEvidenceIds: ['required:2'],
            reason: 'CLI smoke required overflow',
            adequacyImpact: 'required evidence omitted',
          }],
          warnings: ['required evidence omitted'],
        };
      }
    }),
    'refresh-required',
    'CONTEXT_REQUIRED_EVIDENCE_TRUNCATED',
  );
  implementationScenario(
    temporaryRoot,
    'missing-provenance',
    ({ capsulePath, auditPath }) => mutateRawPair(capsulePath, auditPath, (capsule, audit) => {
      capsule.provenance = [];
      audit.provenance = [];
    }),
    'refresh-required',
    'CONTEXT_PROVENANCE_MISSING',
  );
  partialMappingScenario(temporaryRoot);
  legacyRunScenario(temporaryRoot);

  const sourceHashAfter = hashTree(fixtureRoot);
  if (sourceHashAfter !== sourceHashBefore) {
    throw new Error('Source producer fixture tree changed during CLI smoke');
  }
  console.log(`CONTEXT_CLI_SMOKE_PASS: source fixtures unchanged (${sourceHashAfter})`);
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
