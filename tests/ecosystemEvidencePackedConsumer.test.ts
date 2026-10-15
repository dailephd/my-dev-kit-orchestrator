import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { spawnSync } from 'child_process';

// Integration task section 5.4 requires createRun at the installed root
// entrypoint. Existing persistence tests import it directly from src/run;
// this deliberately exercises a freshly packed and installed module instead.
describe('local working-tree candidate public activation API', () => {
  it('exports createRun to an isolated installed consumer without a private subpath', () => {
    const repository = path.resolve(__dirname, '..');
    const integration = path.join(repository, '.my-dev-kit-workflow', 'integration', 'v170', 'rerun-r2');
    const temporary = path.join(repository, '.my-dev-kit-workflow', 'tmp');
    const cache = path.join(repository, '.my-dev-kit-workflow', 'npm-cache');
    for (const folder of [temporary, cache, ...['package', 'consumer', 'fixture-project', 'output', 'logs'].map(part => path.join(integration, part))]) {
      fs.mkdirSync(folder, { recursive: true });
    }
    const consumer = fs.mkdtempSync(path.join(integration, 'consumer', 'api repro with spaces-'));
    const identity = path.basename(consumer);
    const packages = fs.mkdtempSync(path.join(integration, 'package', 'api-repro-'));
    const npmCli = process.env.npm_execpath;
    if (!npmCli || !fs.existsSync(npmCli)) throw new Error('Run this integration test through npm test');
    const env = { ...process.env, npm_config_cache: cache, TEMP: temporary, TMP: temporary, TMPDIR: temporary };
    const execute = (label: string, args: string[], cwd: string): string => {
      const result = spawnSync(process.execPath, [npmCli, ...args], {
        cwd, env, encoding: 'utf8', windowsHide: true, timeout: 120000,
      });
      fs.writeFileSync(path.join(integration, 'logs', `${identity}-${label}.json`), JSON.stringify({
        command: [process.execPath, npmCli, ...args], cwd, exit: result.status,
        stdout: result.stdout, stderr: result.stderr, error: result.error?.message,
      }, null, 2) + '\n');
      if (result.error) throw result.error;
      expect(result.status).toBe(0);
      return result.stdout;
    };
    const sourcePaths = ['src/index.ts', 'src/run.ts', 'package.json', 'package-lock.json'];
    const sourceBefore = sourcePaths.map(file => fs.readFileSync(path.join(repository, file)));
    execute('build', ['run', 'build'], repository);
    const packed = JSON.parse(execute('pack', ['pack', '--json', '--pack-destination', packages], repository)) as Array<{ filename: string }>;
    const tarball = path.join(packages, packed[0].filename);
    fs.writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ name: 'eco-api-repro', version: '0.0.0', private: true }) + '\n');
    execute('install', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', tarball], consumer);
    const entry = require.resolve('@dailephd/my-dev-kit-orchestrator', { paths: [consumer] });
    expect(path.relative(consumer, entry).startsWith('..')).toBe(false);
    const api = require(entry) as Record<string, unknown>;
    for (let i = 0; i < sourcePaths.length; i++) expect(fs.readFileSync(path.join(repository, sourcePaths[i]))).toEqual(sourceBefore[i]);
    fs.writeFileSync(path.join(integration, 'output', `${identity}-entrypoint.json`), JSON.stringify({
      entry, tarball, sha256: createHash('sha256').update(fs.readFileSync(tarball)).digest('hex'),
      exportedKeys: Object.keys(api).sort(), createRun: typeof api.createRun,
      replaceRunEcosystemEvidence: typeof api.replaceRunEcosystemEvidence,
    }, null, 2) + '\n');
    // Do not replace this with dist/run.js or a development-checkout import.
    expect(typeof api.createRun).toBe('function');
    expect(typeof api.replaceRunEcosystemEvidence).toBe('function');
    expect(typeof api.createProgram).toBe('function');
    expect(typeof api.consumeBoundedObserverEvidence).toBe('function');
    expect(api.VALID_MODES).toHaveLength(7);
    expect(typeof api.isValidMode).toBe('function');
    expect(api.OBSERVER_BOUNDED_AGENT_CONTEXT_ARTIFACT_KIND).toBe('my-frontend-observer/bounded-agent-context');
    expect(api.OBSERVER_BOUNDED_AGENT_CONTEXT_SCHEMA_VERSION).toBe('1.0.0');
    expect(api.OBSERVER_EVIDENCE_BOUNDS).toBeDefined();
    expect(api.loadRun).toBeUndefined();
    expect(Object.keys(api).sort()).toEqual([
      'OBSERVER_BOUNDED_AGENT_CONTEXT_ARTIFACT_KIND', 'OBSERVER_BOUNDED_AGENT_CONTEXT_SCHEMA_VERSION',
      'OBSERVER_EVIDENCE_BOUNDS', 'VALID_MODES', 'consumeBoundedObserverEvidence', 'createProgram',
      'createRun', 'isValidMode', 'replaceRunEcosystemEvidence',
    ]);

    const fixture = fs.mkdtempSync(path.join(integration, 'fixture-project', 'activation with spaces-'));
    // Type-only annotation; the runtime value above is exclusively installed.
    const installed = api as typeof import('../src/index');
    const requirements: import('../src/index').RunEcosystemRequirementsDocumentV1 = {
      schemaVersion: '1.0.0',
      subject: { schemaVersion: '1.0.0', authority: '@dailephd/my-dev-kit', namespace: 'my-dev-kit/static', value: fixture },
      requirements: [{ schemaVersion: '1.0.0', requirementId: 'static', capabilityId: 'my-dev-kit/static-context',
        criticality: 'critical', acceptedArtifactKinds: ['my-dev-kit/context-capsule', 'my-dev-kit/retrieval-audit'] }],
    };
    const activated = installed.createRun({ request: 'public activation', name: 'activated', mode: 'greenfield',
      projectRoot: fixture, ecosystemRequirementsDocument: requirements });
    const requirementsPath = path.join(activated.runFolder, 'ecosystem-requirements.json');
    const evidencePath = path.join(activated.runFolder, 'ecosystem-evidence.json');
    const requirementsBytes = fs.readFileSync(requirementsPath);
    expect(JSON.parse(requirementsBytes.toString('utf8'))).toEqual(requirements);
    expect(activated.ecosystemEvidenceVersion).toBe('1.0.0');
    expect(activated.ecosystemRequirementsSha256).toBe(createHash('sha256').update(requirementsBytes).digest('hex'));
    expect(JSON.parse(fs.readFileSync(path.join(activated.runFolder, 'run.json'), 'utf8'))).toEqual(activated);
    expect(JSON.parse(fs.readFileSync(evidencePath, 'utf8'))).toEqual({ schemaVersion: '1.0.0', evidence: [] });
    installed.replaceRunEcosystemEvidence(activated.runFolder, { schemaVersion: '1.0.0', evidence: [] });
    expect(fs.readFileSync(requirementsPath)).toEqual(requirementsBytes);

    const legacy = installed.createRun({ request: 'public legacy', name: 'legacy', mode: 'greenfield', projectRoot: fixture });
    const legacySaved = JSON.parse(fs.readFileSync(path.join(legacy.runFolder, 'run.json'), 'utf8'));
    for (const metadata of [legacy, legacySaved]) {
      expect(metadata).not.toHaveProperty('ecosystemEvidenceVersion');
      expect(metadata).not.toHaveProperty('ecosystemRequirementsSha256');
    }
    for (const filename of ['ecosystem-requirements.json', 'ecosystem-evidence.json']) {
      expect(fs.existsSync(path.join(legacy.runFolder, filename))).toBe(false);
    }
    const runs = path.dirname(activated.runFolder);
    const beforeInvalid = fs.readdirSync(runs).sort();
    expect(() => installed.createRun({ request: 'invalid public input', name: 'invalid', mode: 'greenfield',
      projectRoot: fixture, ecosystemRequirementsDocument: { ...requirements, requirements: [] } })).toThrow('ECO_RECORD_INVALID');
    expect(fs.readdirSync(runs).sort()).toEqual(beforeInvalid);

    // Compile a consumer that names both public types through installed .d.ts.
    const typedConsumer = path.join(consumer, 'public-contract.ts');
    fs.writeFileSync(typedConsumer, [
      "import { createRun, replaceRunEcosystemEvidence } from '@dailephd/my-dev-kit-orchestrator';",
      "import type { RunMetadata, RunEcosystemRequirementsDocumentV1 } from '@dailephd/my-dev-kit-orchestrator';",
      'export function activate(projectRoot: string, ecosystemRequirementsDocument: RunEcosystemRequirementsDocumentV1): RunMetadata {',
      "  const run: RunMetadata = createRun({ projectRoot, request: 'typed public activation', mode: 'greenfield', ecosystemRequirementsDocument });",
      "  replaceRunEcosystemEvidence(run.runFolder, { schemaVersion: '1.0.0', evidence: [] });",
      '  return run;', '}',
    ].join('\n') + '\n');
    const compiler = path.join(repository, 'node_modules', 'typescript', 'bin', 'tsc');
    const compilation = spawnSync(process.execPath, [compiler, '--noEmit', '--strict', '--skipLibCheck',
      '--target', 'ES2020', '--module', 'commonjs', '--moduleResolution', 'node',
      '--typeRoots', path.join(repository, 'node_modules', '@types'), typedConsumer], {
      cwd: consumer, env, encoding: 'utf8', windowsHide: true, timeout: 120000,
    });
    fs.writeFileSync(path.join(integration, 'logs', `${identity}-typed-consumer.json`), JSON.stringify({
      exit: compilation.status, stdout: compilation.stdout, stderr: compilation.stderr,
    }, null, 2) + '\n');
    if (compilation.error) throw compilation.error;
    expect(compilation.status).toBe(0);
    fs.writeFileSync(path.join(integration, 'output', `${identity}-activation.json`), JSON.stringify({
      activatedRun: activated.runId, legacyRun: legacy.runId, requirementsSha256: activated.ecosystemRequirementsSha256,
      emptyEvidence: true, legacyUnactivated: true, invalidInputRejectedBeforeCreation: true, typedConsumerExit: compilation.status,
    }, null, 2) + '\n');
  }, 180000);
});
