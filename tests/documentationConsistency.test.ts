import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const repositoryRoot = path.resolve(__dirname, '..');
const checkerPath = path.join(repositoryRoot, 'scripts', 'check-docs-consistency.mjs');
const temporaryRoots: string[] = [];

function copyFile(root: string, relativePath: string): void {
  const destination = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(repositoryRoot, relativePath), destination);
}

function createIsolatedRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestrator-docs-check-'));
  temporaryRoots.push(root);
  for (const relativePath of ['package.json', 'README.md', 'CHANGELOG.md']) copyFile(root, relativePath);
  fs.cpSync(path.join(repositoryRoot, 'docs'), path.join(root, 'docs'), { recursive: true });
  fs.cpSync(path.join(repositoryRoot, 'src', 'commands'), path.join(root, 'src', 'commands'), { recursive: true });
  for (const relativePath of [
    'src/types.ts',
    'src/workflows.ts',
    'src/program.ts',
    'src/greenfield/modes/greenfieldStages.ts',
    'src/greenfield/modes/greenfieldMode.ts',
    'src/greenfield/profiles/resolveGreenfieldProfile.ts',
    'src/instructions/catalogTypes.ts',
    'src/instructions/workflowInstructionPacket.ts',
    'src/instructions/taskState.ts',
    'src/instructions/stageContextBundle.ts',
    'src/instructions/supplementalContextTypes.ts',
    'src/instructions/contextReadiness.ts',
    'src/instructions/stageRepositoryEvidenceRequirements.ts',
    'tests/fixtures/v121-compatibility/compatibility-manifest.json',
  ]) copyFile(root, relativePath);
  return root;
}

function mutate(root: string, relativePath: string, mutation: (content: string) => string): void {
  const target = path.join(root, relativePath);
  const before = fs.readFileSync(target, 'utf8');
  const after = mutation(before);
  expect(after).not.toBe(before);
  fs.writeFileSync(target, after, 'utf8');
}

function replace(text: string, from: string | RegExp, to: string): string {
  return text.replace(from, to);
}

function swapHeadingNames(text: string, first: string, second: string): string {
  const placeholder = '## __TEMPORARY_HEADING__';
  return text
    .replace(`## ${first}`, placeholder)
    .replace(`## ${second}`, `## ${first}`)
    .replace(placeholder, `## ${second}`);
}

function runCheck(root: string): { status: number | null; output: string } {
  const result = childProcess.spawnSync(process.execPath, [checkerPath, '--root', root], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function expectIssue(relativePath: string, mutation: (content: string) => string, issueCode: string): void {
  const root = createIsolatedRoot();
  mutate(root, relativePath, mutation);
  const result = runCheck(root);
  expect(result.status).toBe(1);
  expect(result.output).toContain(`[${issueCode}]`);
}

afterAll(() => {
  for (const root of temporaryRoots) fs.rmSync(root, { recursive: true, force: true });
});

describe('documentation consistency gate', () => {
  it('passes the reconciled canonical documentation', () => {
    const result = runCheck(createIsolatedRoot());
    expect(result.status).toBe(0);
    expect(result.output).toContain('DOCS_CHECK_PASS');
  });

  it.each([
    ['wrong mode count', 'README.md', (text: string) => replace(text, 'seven workflow modes', 'six workflow modes'), 'WORKFLOW_MODE_COUNT_MISMATCH'],
    ['wrong stage count', 'docs/WORKFLOWS.md', (text: string) => replace(text, '79 native stages', '78 native stages'), 'NATIVE_STAGE_COUNT_MISMATCH'],
    ['wrong command count', 'README.md', (text: string) => replace(text, 'The CLI has eight commands:', 'The CLI has nine commands:'), 'CLI_COMMAND_COUNT_MISMATCH'],
    ['wrong profile count', 'docs/WORKFLOWS.md', (text: string) => replace(text, /supports four starter\s+profiles:/, 'supports two starter profiles:'), 'GREENFIELD_PROFILE_COUNT_MISMATCH'],
    ['wrong context-sensitive count', 'docs/WORKFLOWS.md', (text: string) => replace(text, 'exact 11-stage matrix', '10 context-sensitive stages'), 'CONTEXT_STAGE_COUNT_MISMATCH'],
    ['wrong schema version', 'docs/ARCHITECTURE.md', (text: string) => replace(text, '| `WorkflowInstructionPacket` | `1.0.0` |', '| `WorkflowInstructionPacket` | `2.0.0` |'), 'SCHEMA_VERSION_CLAIM_MISMATCH'],
    ['missing fixed path', 'docs/ARTIFACTS.md', (text: string) => replace(text, /- `artifacts\/test-context-packet\.txt`\r?\n/, ''), 'FIXED_CONTEXT_PATH_MISSING'],
    ['contradictory v1.2.1 unreleased status', 'README.md', (text: string) => `${text}\nv1.2.1 is unreleased.\n`, 'V121_RELEASE_STATUS_CONTRADICTION'],
    ['contradictory v1.2.3 unreleased status', 'README.md', (text: string) => `${text}\nv1.2.3 is unreleased.\n`, 'V123_RELEASE_STATUS_CONTRADICTION'],
    ['missing current-version publication', 'README.md', (text: string) => replace(text, '@dailephd/my-dev-kit-orchestrator@1.4.0', '@dailephd/my-dev-kit-orchestrator@1.2.9'), 'V123_PUBLISHED_CLAIM_MISSING'],
    ['automatic retrieval claim', 'README.md', (text: string) => `${text}\nThe orchestrator automatically runs my-dev-kit.\n`, 'AUTOMATIC_MY_DEV_KIT_CLAIM'],
    ['status JSON claim', 'docs/USAGE.md', (text: string) => `${text}\nThe status --json option emits JSON.\n`, 'STATUS_JSON_FALSE_CLAIM'],
    ['persisted TaskState claim', 'docs/ARCHITECTURE.md', (text: string) => `${text}\nThe runtime persists TaskState for later runs.\n`, 'TASK_STATE_PERSISTENCE_FALSE_CLAIM'],
    ['persisted StageContextBundle claim', 'docs/ARCHITECTURE.md', (text: string) => `${text}\nThe runtime stores StageContextBundle on disk.\n`, 'STAGE_CONTEXT_BUNDLE_PERSISTENCE_FALSE_CLAIM'],
    ['native context-stage claim', 'docs/WORKFLOWS.md', (text: string) => `${text}\nThe workflow adds a native context stage.\n`, 'NATIVE_CONTEXT_STAGE_FALSE_CLAIM'],
    ['unsupported run identity claim', 'docs/ARCHITECTURE.md', (text: string) => replace(text, '- supplemental document kind and role', '- workflow, stage, run, and repository identity'), 'UNSUPPORTED_CONTEXT_IDENTITY_CLAIM'],
    ['missing documented blocker field', 'docs/ARCHITECTURE.md', (text: string) => replace(text, '`supportingIssueCodes`', '`secondaryCodes`'), 'CONTEXT_BLOCKER_FIELD_DOCUMENTATION_MISSING'],
    ['blocker manifest field drift', 'docs/documentation-preservation-manifest.json', (text: string) => replace(text, /      "supportingIssueCodes"(\r?\n)    ]/, '      "secondaryCodes"$1    ]'), 'MANIFEST_FACT_DRIFT'],
    ['missing scaffold exception', 'docs/WORKFLOWS.md', (text: string) => replace(text, 'specialized scaffold renderer', 'shared renderer'), 'SCAFFOLD_EXCEPTION_DISCLOSURE_MISSING'],
    ['roadmap batch log', 'docs/ROADMAP.md', (text: string) => replace(text, '### v1.2.1 - Workflow Instruction and Context Readiness', '### v1.2.1 - Workflow Instruction and Context Readiness\n\nBatch 6 implementation log.'), 'ROADMAP_BATCH_LOG_CONTAMINATION'],
    ['v1.2.2 roadmap batch log', 'docs/ROADMAP.md', (text: string) => replace(text, '### v1.2.2 - Context Readiness and Documentation Safeguards', '### v1.2.2 - Context Readiness and Documentation Safeguards\n\nBatch 4 implementation log.'), 'ROADMAP_BATCH_LOG_CONTAMINATION'],
    ['changelog batch history', 'CHANGELOG.md', (text: string) => replace(text, '## v1.2.1 - Workflow Instruction and Context Readiness', '## v1.2.1 - Workflow Instruction and Context Readiness\n\nBatch 6 implementation history.'), 'DOC_CHANGELOG_BATCH_LOG_CONTAMINATION'],
    ['v1.2.2 changelog batch history', 'CHANGELOG.md', (text: string) => replace(text, '## v1.2.2 - Context Readiness and Documentation Safeguards', '## v1.2.2 - Context Readiness and Documentation Safeguards\n\nBatch 4 implementation history.'), 'DOC_CHANGELOG_BATCH_LOG_CONTAMINATION'],
    ['stale extraction artifact count', 'docs/USAGE.md', (text: string) => replace(text, 'all six gate artifact files', 'all five gate artifact files'), 'EXTRACTION_GATE_FILE_COUNT_DRIFT'],
    ['collapsed artifact formats', 'docs/ARTIFACTS.md', (text: string) => replace(text, /Artifacts are inspectable[\s\S]*?use text\./, 'Artifacts are plain-text handoff files stored in each run folder.'), 'ARTIFACT_FORMAT_COLLAPSE'],
    ['resolved producer mismatch as current', 'docs/ARCHITECTURE.md', (text: string) => replace(text, '## Non-goals', '- The my-dev-kit 1.10.2 mismatch remains a current limitation.\n\n## Non-goals'), 'RESOLVED_PRODUCER_LIMITATION_STILL_CURRENT'],
    ['missing-file-only prompt selection', 'docs/USAGE.md', (text: string) => replace(text, /`prompt` without a stage selects[\s\S]*?remain current/, '`prompt` without a stage prints the first stage whose expected artifact file is missing'), 'PROMPT_STAGE_SELECTION_SEMANTICS_DRIFT'],
    ['missing custom-output rediscovery warning', 'docs/USAGE.md', (text: string) => replace(text, 'They cannot rediscover or select a custom-output', 'They cannot select a custom-output'), 'CUSTOM_OUTPUT_REDISCOVERY_LIMITATION_MISSING'],
    ['android xml removed from its preserved v1.3.0 assignment', 'docs/ROADMAP.md', (text: string) => replace(text, '- `android-xml`', '- `android-xml-removed`'), 'ROADMAP_CANDIDATE_ASSIGNMENT_DRIFT'],
    // v1.4.0 is published; v1.5.0 remains planned.
    ['planned v1.5.0 marked implemented', 'docs/ROADMAP.md', (text: string) => replace(text, '### v1.5.0 - Semantic Continuity and Evidence-to-Implementation Bridge', '### v1.5.0 - Semantic Continuity and Evidence-to-Implementation Bridge\n\nImplemented.'), 'PLANNED_VERSION_STATUS_DRIFT'],
    ['v1.5.0 marked published', 'docs/ROADMAP.md', (text: string) => replace(text, '### v1.5.0 - Semantic Continuity and Evidence-to-Implementation Bridge', '### v1.5.0 - Semantic Continuity and Evidence-to-Implementation Bridge\n\nPublished.'), 'PLANNED_VERSION_STATUS_DRIFT'],
    ['current release residue', 'README.md', (text: string) => `${text}\nv1.2.3 is pending.\n`, 'CURRENT_RELEASE_RESIDUE'],
  ])('detects %s', (_name, relativePath, mutation, issueCode) => {
    expectIssue(relativePath as string, mutation as (content: string) => string, issueCode as string);
  });

  it.each([
    ['a direct positive claim', 'my-dev-kit-orchestrator provides native implementation-context stages.'],
    ['an unrelated negation in the previous paragraph', 'Do not duplicate the retrieval workflow.\n\nmy-dev-kit-orchestrator provides native implementation-context stages.'],
    ['an unrelated negation in the same paragraph', 'Do not duplicate the retrieval workflow, and my-dev-kit-orchestrator provides native implementation-context stages.'],
  ])('detects a native context-stage claim after %s', (_name, injected) => {
    expectIssue(
      'docs/WORKFLOWS.md',
      (text) => `${text}\n${injected}\n`,
      'NATIVE_CONTEXT_STAGE_FALSE_CLAIM',
    );
  });

  it.each([
    'my-dev-kit-orchestrator does not provide native implementation-context stages.',
    'my-dev-kit-orchestrator does not currently provide native implementation-context stages.',
  ])('allows an explicit local native context-stage negation: %s', (injected) => {
    const root = createIsolatedRoot();
    mutate(root, 'docs/WORKFLOWS.md', (text) => `${text}\n${injected}\n`);
    const result = runCheck(root);
    expect(result.status).toBe(0);
    expect(result.output).not.toContain('[NATIVE_CONTEXT_STAGE_FALSE_CLAIM]');
  });

  it('emits deterministic output ordering', () => {
    const root = createIsolatedRoot();
    mutate(root, 'README.md', (text) => `${text}\nThe orchestrator automatically runs my-dev-kit.\nThe status --json option emits JSON.\n`);
    const first = runCheck(root);
    const second = runCheck(root);
    expect(first.status).toBe(1);
    expect(second.status).toBe(1);
    expect(second.output).toBe(first.output);
  });

  it('rejects the exact stale README planned section and contradictory status', () => {
    const root = createIsolatedRoot();
    mutate(root, 'README.md', (text) => `${text}\n## Planned: v1.2.1 (workflow-instruction and context-refresh integration)\n\nStatus: planned, not implemented, not published.\n`);
    const result = runCheck(root);
    expect(result.status).toBe(1);
    expect(result.output).toContain('[DOC_STRUCTURE_FORBIDDEN_PLANNED_SECTION]');
    expect(result.output).toContain('[DOC_VERSION_CONTRADICTORY_STATUS]');
  });

  it('rejects the exact stale ARCHITECTURE planned chapter', () => {
    const root = createIsolatedRoot();
    mutate(root, 'docs/ARCHITECTURE.md', (text) => `${text}\n## v1.2.1 (planned): Workflow Catalog, WorkflowInstructionPacket, and StageContextBundle\n\nStatus: planned, not implemented, not published.\n\n### Structured workflow catalog (planned)\n\n### WorkflowInstructionPacket (planned)\n\n### Prompt-level StageContextBundle (planned)\n\n### Migration strategy (planned)\n`);
    const result = runCheck(root);
    expect(result.status).toBe(1);
    expect(result.output).toContain('[DOC_STRUCTURE_FORBIDDEN_PLANNED_SECTION]');
    expect(result.output).toContain('[DOC_ARCHITECTURE_CANDIDATE_CONTENT]');
    expect(result.output).toContain('[DOC_VERSION_CONTRADICTORY_STATUS]');
  });

  it('rejects a current-version-specific ARCHITECTURE chapter', () => {
    expectIssue(
      'docs/ARCHITECTURE.md',
      (text) => `${text}\n## Unreleased v1.2.1 instruction and context architecture\n`,
      'DOC_DOCUMENT_STRUCTURE_MISMATCH',
    );
  });

  it.each([
    ['planned workflow sequence', 'docs/WORKFLOWS.md', 'Planned operational sequence for a future workflow.', 'DOC_WORKFLOW_PLANNED_SEQUENCE'],
    ['planned artifact contract', 'docs/ARTIFACTS.md', 'Planned artifact contract for a candidate path.', 'DOC_ARTIFACT_PLANNED_CONTRACT'],
    ['unimplemented usage', 'docs/USAGE.md', 'Unimplemented procedure for a future CLI.', 'DOC_USAGE_UNIMPLEMENTED_BEHAVIOR'],
    ['candidate development architecture', 'docs/DEVELOPMENT.md', 'Candidate owner for a future module plan.', 'DOC_DEVELOPMENT_CANDIDATE_ARCHITECTURE'],
  ])('rejects %s', (_name, relativePath, injected, issueCode) => {
    expectIssue(relativePath, (text) => `${text}\n${injected}\n`, issueCode);
  });

  it('rejects detailed ROADMAP implementation logging', () => {
    expectIssue(
      'docs/ROADMAP.md',
      (text) => `${text}\nBatch 1\nFiles modified: src/example.ts\n2,110 tests passed\ncommand transcript: npm test\n`,
      'DOC_ROADMAP_BATCH_LOG_CONTAMINATION',
    );
  });

  it('rejects CHANGELOG implementation-batch chronology', () => {
    expectIssue(
      'CHANGELOG.md',
      (text) => `${text}\nBatch 2 implementation chronology.\n`,
      'DOC_CHANGELOG_BATCH_LOG_CONTAMINATION',
    );
  });

  it('rejects a tracked project_plan.txt using an isolated Git fixture', () => {
    const root = createIsolatedRoot();
    fs.writeFileSync(path.join(root, 'project_plan.txt'), '1. PROJECT IDENTITY\n', 'utf8');
    expect(childProcess.spawnSync('git', ['init'], { cwd: root, encoding: 'utf8' }).status).toBe(0);
    expect(childProcess.spawnSync('git', ['add', '-f', 'project_plan.txt'], { cwd: root, encoding: 'utf8' }).status).toBe(0);
    const result = runCheck(root);
    expect(result.status).toBe(1);
    expect(result.output).toContain('[DOC_PROJECT_PLAN_TRACKED]');
  });

  it('rejects a public project-plan link', () => {
    expectIssue(
      'README.md',
      (text) => `${text}\nSee the [local project plan](project_plan.txt) for implementation details.\n`,
      'DOC_PROJECT_PLAN_PUBLIC_LINK',
    );
  });

  it.each([
    ['README required heading', 'README.md', 'Current release'],
    ['ARCHITECTURE required heading', 'docs/ARCHITECTURE.md', 'Purpose'],
    ['ROADMAP required heading', 'docs/ROADMAP.md', 'Version summary'],
  ])('rejects a missing %s', (_name, relativePath, heading) => {
    expectIssue(
      relativePath,
      (text) => text.replace(`## ${heading}`, `### ${heading}`),
      'DOC_REQUIRED_HEADING_MISSING',
    );
  });

  it.each([
    ['README', 'README.md', 'Current release', 'Quick start'],
    ['ARCHITECTURE', 'docs/ARCHITECTURE.md', 'System boundaries', 'Core components'],
    ['ROADMAP', 'docs/ROADMAP.md', 'Published v1.2.0', 'Published v1.2.1'],
  ])('rejects invalid %s major heading order', (_name, relativePath, first, second) => {
    expectIssue(
      relativePath,
      (text) => swapHeadingNames(text, first, second),
      'DOC_HEADING_ORDER_MISMATCH',
    );
  });
});
