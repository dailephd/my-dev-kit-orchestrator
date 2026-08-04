import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { evaluateContextReadiness } from '../src/instructions/contextReadiness';
import { evaluateRunContextReadiness } from '../src/instructions/runContextReadiness';
import { STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS } from '../src/instructions/stageRepositoryEvidenceRequirements';
import { getWorkflow } from '../src/workflows';
import { makeReadyRunFolder } from './readyContextTestHelpers';
import { evaluateRunIntegrityGate } from '../src/runIntegrityGate';

const implementationRequirement = STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.find(
  (requirement) => requirement.stageId === 'stage.feature.implementation',
)!;
const testRequirement = STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.find(
  (requirement) => requirement.stageId === 'stage.feature.test-implementation',
)!;

type RawEvidence = Record<string, any>;

function makeReadyFeature(): string {
  const runFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-historical-matrix-'));
  makeReadyRunFolder(runFolder, 'feature');
  return runFolder;
}

function rawPath(runFolder: string, kind: 'implementation' | 'test', source: 'capsule' | 'audit'): string {
  return path.join(runFolder, `${kind}-${source}.json`);
}

function mutateRaw(
  runFolder: string,
  kind: 'implementation' | 'test',
  mutate: (raw: RawEvidence) => void,
  sources: Array<'capsule' | 'audit'> = ['capsule', 'audit'],
): void {
  for (const source of sources) {
    const file = rawPath(runFolder, kind, source);
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as RawEvidence;
    mutate(raw);
    fs.writeFileSync(file, JSON.stringify(raw), 'utf8');
  }
}

function replaceSupplemental(runFolder: string, relativePath: string, before: string, after: string): void {
  const file = path.join(runFolder, relativePath);
  const text = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, text.replace(before, after), 'utf8');
}

interface HistoricalCase {
  name: string;
  kind: 'implementation' | 'test';
  expectedCode: string;
  expectedClassification: string;
  mutate(runFolder: string): void;
  projectRoot?: string;
}

const historicalCases: HistoricalCase[] = [
  {
    name: 'insufficient owner/role evidence',
    kind: 'implementation',
    expectedCode: 'CONTEXT_ADEQUACY_INSUFFICIENT',
    expectedClassification: 'inadequate',
    mutate: (runFolder) =>
      mutateRaw(runFolder, 'implementation', (raw) => {
        raw.roleAdequacy = { status: 'context insufficient and more retrieval required' };
      }),
  },
  {
    name: 'required evidence truncation',
    kind: 'implementation',
    expectedCode: 'CONTEXT_REQUIRED_EVIDENCE_TRUNCATED',
    expectedClassification: 'required-evidence-truncated',
    mutate: (runFolder) =>
      mutateRaw(runFolder, 'implementation', (raw) => {
        raw.truncation = { truncated: true, records: [{ requiredEvidenceLost: true }] };
      }),
  },
  {
    name: 'raw capsule/audit contradiction',
    kind: 'implementation',
    expectedCode: 'CONTEXT_SOURCE_SUMMARY_MISMATCH',
    expectedClassification: 'incompatible',
    mutate: (runFolder) =>
      mutateRaw(
        runFolder,
        'implementation',
        (raw) => {
          raw.freshness = {
            role: 'implementation',
            state: 'stale',
            comparedIdentities: [{ label: 'afterIndexPath', value: '/idx' }],
          };
        },
        ['audit'],
      ),
  },
  {
    name: 'supplemental capsule-reference contradiction',
    kind: 'implementation',
    expectedCode: 'CONTEXT_SUPPLEMENTAL_SOURCE_MISMATCH',
    expectedClassification: 'incompatible',
    mutate: (runFolder) =>
      replaceSupplemental(
        runFolder,
        'reports/implementation-context-retrieval-report.txt',
        `Source context capsule: ${rawPath(runFolder, 'implementation', 'capsule')}`,
        'Source context capsule: /different/context-capsule.json',
      ),
  },
  {
    name: 'repository mismatch',
    kind: 'implementation',
    expectedCode: 'CONTEXT_SOURCE_REPOSITORY_MISMATCH',
    expectedClassification: 'repository-scope-mismatch',
    projectRoot: '/active/orchestrator',
    mutate: (runFolder) =>
      mutateRaw(runFolder, 'implementation', (raw) => {
        raw.index.projectRoot = '/unrelated/repository';
      }),
  },
  {
    name: 'declared index mismatch',
    kind: 'implementation',
    expectedCode: 'CONTEXT_DECLARED_INDEX_IDENTITY_MISMATCH',
    expectedClassification: 'index-identity-mismatch',
    mutate: (runFolder) => {
      replaceSupplemental(
        runFolder,
        'artifacts/implementation-context-packet.txt',
        'Index identity: unknown',
        'Index identity: /wrong-index',
      );
      replaceSupplemental(
        runFolder,
        'reports/implementation-context-retrieval-report.txt',
        'Index identity: unknown',
        'Index identity: /wrong-index',
      );
    },
  },
  {
    name: 'missing provenance',
    kind: 'implementation',
    expectedCode: 'CONTEXT_PROVENANCE_MISSING',
    expectedClassification: 'provenance-missing',
    mutate: (runFolder) =>
      mutateRaw(runFolder, 'implementation', (raw) => {
        raw.provenance = [];
      }),
  },
  {
    name: 'partially mapped critical responsibility',
    kind: 'test',
    expectedCode: 'CONTEXT_CRITICAL_RESPONSIBILITY_PARTIALLY_MAPPED',
    expectedClassification: 'critical-responsibilities-unmapped',
    mutate: (runFolder) =>
      mutateRaw(runFolder, 'test', (raw) => {
        raw.responsibilityMappings = {
          mappings: [{ responsibilityId: 'TST-READY-001', mappingStatus: 'partially-mapped' }],
          truncated: false,
        };
      }),
  },
  {
    name: 'missing critical responsibility mapping',
    kind: 'test',
    expectedCode: 'CONTEXT_CRITICAL_RESPONSIBILITY_MISSING_MAPPING',
    expectedClassification: 'critical-responsibilities-unmapped',
    mutate: (runFolder) =>
      mutateRaw(runFolder, 'test', (raw) => {
        raw.responsibilityMappings = { mappings: [], truncated: false };
      }),
  },
  {
    name: 'truncated responsibility mappings with incomplete critical coverage',
    kind: 'test',
    expectedCode: 'CONTEXT_RESPONSIBILITY_MAPPINGS_TRUNCATED',
    expectedClassification: 'responsibility-mappings-truncated',
    mutate: (runFolder) =>
      mutateRaw(runFolder, 'test', (raw) => {
        raw.responsibilityMappings = { mappings: [], truncated: true };
      }),
  },
  {
    name: 'stale evidence',
    kind: 'implementation',
    expectedCode: 'CONTEXT_FRESHNESS_STALE',
    expectedClassification: 'stale',
    mutate: (runFolder) =>
      mutateRaw(runFolder, 'implementation', (raw) => {
        raw.freshness = { role: 'implementation', state: 'stale', comparedIdentities: [] };
      }),
  },
  {
    name: 'unknown freshness',
    kind: 'implementation',
    expectedCode: 'CONTEXT_FRESHNESS_UNKNOWN',
    expectedClassification: 'freshness-unknown',
    mutate: (runFolder) =>
      mutateRaw(runFolder, 'implementation', (raw) => {
        raw.freshness = { role: 'implementation', state: 'unknown', comparedIdentities: [] };
      }),
  },
  {
    // v1.2.3 Batch 1 / Batch 4 section 7.3: the last adequate witness for a
    // required v1.10.4 role condition is lost. Distinct from generic
    // "required evidence truncation" above -- this must trip the dedicated
    // CONTEXT_REQUIRED_CONDITION_WITNESS_LOST code even when
    // truncationRequiredEvidenceLost itself is left false.
    name: 'last adequate witness lost for a required role condition (v1.10.4)',
    kind: 'implementation',
    expectedCode: 'CONTEXT_REQUIRED_CONDITION_WITNESS_LOST',
    expectedClassification: 'required-evidence-incomplete',
    mutate: (runFolder) =>
      mutateRaw(runFolder, 'implementation', (raw) => {
        raw.roleConditionCoverage = [
          {
            conditionId: 'implementation.required-contract',
            role: 'implementation',
            required: true,
            retainedWitnessIds: [],
            conditionSatisfied: false,
            lostRequiredCondition: true,
          },
        ];
      }),
  },
];

describe('historical producer/readiness semantic matrix', () => {
  it.each(historicalCases)(
    '$name fails closed with its canonical actionable blocker',
    ({ kind, expectedCode, expectedClassification, mutate, projectRoot }) => {
      const runFolder = makeReadyFeature();
      try {
        mutate(runFolder);
        const requirement = kind === 'implementation' ? implementationRequirement : testRequirement;
        const result = evaluateContextReadiness({
          requirement,
          stageId: requirement.stageId,
          runFolder,
          mode: 'feature',
          ...(projectRoot ? { projectRoot } : {}),
        });
        expect(result.decision).toBe('refresh-required');
        expect(result.classification).toBe(expectedClassification);
        expect(result.blockingIssueCodes).toContain(expectedCode);
        expect(result.primaryIssue).toBeDefined();
        expect(result.issues).toContain(result.primaryIssue);
        expect(result.blockerSummary).toEqual(
          expect.objectContaining({
            primaryCode: result.primaryIssue?.code,
            primaryReason: result.primaryIssue?.message,
            correctiveAction: expect.any(String),
            evidenceTarget: expect.any(String),
          }),
        );

        // v1.2.3 Batch 4 (section 10 cross-surface agreement): the
        // canonical RunIntegrityGate must classify the same evidence the
        // same way readiness itself just did -- it is a pure projection of
        // this same result, not a second authority.
        const gate = evaluateRunIntegrityGate({
          mode: 'feature',
          runFolder,
          workflowStageNames: getWorkflow('feature').stages.map((s) => s.name),
          ...(projectRoot ? { projectRoot } : {}),
        });
        expect(gate.contextReady).toBe(false);
        expect(gate.expectedJudgeVerdict).toBe('NEED_CONTEXT');
        const expectedStageName = kind === 'implementation' ? 'implementation' : 'test-implementation';
        expect(gate.blockedStageNames).toContain(expectedStageName);
      } finally {
        fs.rmSync(runFolder, { recursive: true, force: true });
      }
    },
  );

  it('aggregates simultaneous implementation/test blockers deterministically and recommends implementation first', () => {
    const runFolder = makeReadyFeature();
    try {
      mutateRaw(runFolder, 'implementation', (raw) => {
        raw.truncation = { truncated: true, records: [{ requiredEvidenceLost: true }] };
      });
      mutateRaw(runFolder, 'test', (raw) => {
        raw.responsibilityMappings = {
          mappings: [{ responsibilityId: 'TST-READY-001', mappingStatus: 'partially-mapped' }],
          truncated: false,
        };
      });
      const input = {
        mode: 'feature',
        runFolder,
        workflowStageNames: getWorkflow('feature').stages.map((stage) => stage.name),
      };
      const first = evaluateRunContextReadiness(input);
      const second = evaluateRunContextReadiness(input);
      expect(first.overallDecision).toBe('refresh-required');
      expect(first.recommendedNextStage).toBe('implementation');
      expect(first.primaryBlocker?.contextKind).toBe('implementation');
      expect(first.primaryBlocker?.primaryCode).toBe('CONTEXT_REQUIRED_EVIDENCE_TRUNCATED');
      expect(first.blockingIssueCodes).toEqual([
        'CONTEXT_REQUIRED_EVIDENCE_TRUNCATED',
        'CONTEXT_CRITICAL_RESPONSIBILITY_PARTIALLY_MAPPED',
      ]);
      expect(second.primaryBlocker).toEqual(first.primaryBlocker);
      expect(second.blockingIssueCodes).toEqual(first.blockingIssueCodes);
    } finally {
      fs.rmSync(runFolder, { recursive: true, force: true });
    }
  });
});
