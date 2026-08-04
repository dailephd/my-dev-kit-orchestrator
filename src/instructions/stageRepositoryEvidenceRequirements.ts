// Exact stage -> repository-evidence requirement matrix (Batch 4).
//
// Repository evidence is attached only to the 11 native implementation and
// test-implementation stages listed in AGENTS.txt Batch 4 section 2.4. No
// other stage receives a RepositoryEvidenceReference. Lookup is by exact
// StageInstructionId only -- there is no stage-name-only fallback, which
// would risk cross-mode collisions (e.g. a "test" stage in one mode
// resembling "implementation" in another).

import * as path from 'path';
import { StageInstructionId } from './catalogIds';
import { InstructionCatalog } from './catalogTypes';
import { resolveStage } from './catalogResolver';
import { SupplementalContextEnforcement, SupplementalContextKind, SupplementalContextRole } from './supplementalContextTypes';

export const IMPLEMENTATION_CONTEXT_PACKET_RELATIVE_PATH = 'artifacts/implementation-context-packet.txt';
export const IMPLEMENTATION_CONTEXT_RETRIEVAL_REPORT_RELATIVE_PATH =
  'reports/implementation-context-retrieval-report.txt';
export const TEST_CONTEXT_PACKET_RELATIVE_PATH = 'artifacts/test-context-packet.txt';
export const TEST_CONTEXT_RETRIEVAL_REPORT_RELATIVE_PATH = 'reports/test-context-retrieval-report.txt';

export interface StageRepositoryEvidenceRequirement {
  stageId: StageInstructionId;
  kind: SupplementalContextKind;
  role: SupplementalContextRole;
  packetRelativePath: string;
  reportRelativePath: string;
  requiredForStage: boolean;
  enforcement: SupplementalContextEnforcement;
}

function implementationRequirement(stageId: StageInstructionId): StageRepositoryEvidenceRequirement {
  return {
    stageId,
    kind: 'implementation',
    role: 'implementation',
    packetRelativePath: IMPLEMENTATION_CONTEXT_PACKET_RELATIVE_PATH,
    reportRelativePath: IMPLEMENTATION_CONTEXT_RETRIEVAL_REPORT_RELATIVE_PATH,
    requiredForStage: true,
    enforcement: 'informational',
  };
}

function testImplementationRequirement(stageId: StageInstructionId): StageRepositoryEvidenceRequirement {
  return {
    stageId,
    kind: 'test',
    role: 'test-implementation',
    packetRelativePath: TEST_CONTEXT_PACKET_RELATIVE_PATH,
    reportRelativePath: TEST_CONTEXT_RETRIEVAL_REPORT_RELATIVE_PATH,
    requiredForStage: true,
    enforcement: 'informational',
  };
}

// Exactly 11 entries: 5 implementation-role + 6 test-implementation-role.
// Modes covered: feature, repair, refactor, harden, extraction (both roles),
// and test (test-implementation role only, per the mode matrix in section 2.3).
// greenfield has no entries.
export const STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS: readonly StageRepositoryEvidenceRequirement[] = [
  implementationRequirement('stage.feature.implementation'),
  testImplementationRequirement('stage.feature.test-implementation'),
  implementationRequirement('stage.repair.implementation'),
  testImplementationRequirement('stage.repair.test-implementation'),
  testImplementationRequirement('stage.test.test-implementation'),
  implementationRequirement('stage.refactor.implementation'),
  testImplementationRequirement('stage.refactor.test-implementation'),
  implementationRequirement('stage.harden.implementation'),
  testImplementationRequirement('stage.harden.test-implementation'),
  implementationRequirement('stage.extraction.implementation'),
  testImplementationRequirement('stage.extraction.test-implementation'),
];

const REQUIREMENT_BY_STAGE_ID: ReadonlyMap<string, StageRepositoryEvidenceRequirement> = new Map(
  STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.map((r) => [r.stageId, r]),
);

// Returns the exact requirement for a stage ID, or undefined when the stage
// is not repository-evidence-sensitive. This is the only lookup path used by
// StageContextBundle assembly -- there is no stage-name-only fallback.
export function findStageRepositoryEvidenceRequirement(
  stageId: string,
): StageRepositoryEvidenceRequirement | undefined {
  return REQUIREMENT_BY_STAGE_ID.get(stageId);
}

export function implementationContextPacketPath(runFolder: string): string {
  return safeJoin(runFolder, IMPLEMENTATION_CONTEXT_PACKET_RELATIVE_PATH);
}

export function implementationContextRetrievalReportPath(runFolder: string): string {
  return safeJoin(runFolder, IMPLEMENTATION_CONTEXT_RETRIEVAL_REPORT_RELATIVE_PATH);
}

export function testContextPacketPath(runFolder: string): string {
  return safeJoin(runFolder, TEST_CONTEXT_PACKET_RELATIVE_PATH);
}

export function testContextRetrievalReportPath(runFolder: string): string {
  return safeJoin(runFolder, TEST_CONTEXT_RETRIEVAL_REPORT_RELATIVE_PATH);
}

function safeJoin(runFolder: string, relativePath: string): string {
  const resolvedRoot = path.resolve(runFolder);
  const resolvedTarget = path.resolve(resolvedRoot, relativePath);
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`Supplemental context path escapes run folder: "${relativePath}"`);
  }
  return resolvedTarget;
}

// ─── Registry validation ────────────────────────────────────────────────────

export type StageRepositoryEvidenceRequirementIssueCode =
  | 'CONTEXT_REQUIREMENT_INVALID_STAGE'
  | 'CONTEXT_REQUIREMENT_DUPLICATE_STAGE'
  | 'CONTEXT_REQUIREMENT_ROLE_MISMATCH'
  | 'CONTEXT_REQUIREMENT_KIND_MISMATCH'
  | 'CONTEXT_REQUIREMENT_PATH_MISMATCH'
  | 'CONTEXT_REQUIREMENT_ORPHAN'
  | 'CONTEXT_REQUIREMENT_MATRIX_MISMATCH';

export interface StageRepositoryEvidenceRequirementIssue {
  code: StageRepositoryEvidenceRequirementIssueCode;
  message: string;
}

// The approved mode-level matrix from AGENTS.txt Batch 4 section 2.3, used to
// prove the registry has no orphan and no missing entry.
const APPROVED_MODE_MATRIX: Record<string, { implementation: boolean; test: boolean }> = {
  feature: { implementation: true, test: true },
  repair: { implementation: true, test: true },
  test: { implementation: false, test: true },
  refactor: { implementation: true, test: true },
  harden: { implementation: true, test: true },
  extraction: { implementation: true, test: true },
  greenfield: { implementation: false, test: false },
};

function stageIdParts(stageId: string): { mode: string; stageName: string } | undefined {
  const segments = stageId.split('.');
  if (segments.length !== 3 || segments[0] !== 'stage') return undefined;
  return { mode: segments[1], stageName: segments[2] };
}

export function validateStageRepositoryEvidenceRequirements(
  catalog: InstructionCatalog,
): StageRepositoryEvidenceRequirementIssue[] {
  const issues: StageRepositoryEvidenceRequirementIssue[] = [];
  const seen = new Set<string>();
  const seenByMode: Record<string, { implementation: boolean; test: boolean }> = {};

  for (const req of STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS) {
    if (seen.has(req.stageId)) {
      issues.push({
        code: 'CONTEXT_REQUIREMENT_DUPLICATE_STAGE',
        message: `Duplicate repository-evidence requirement for stage "${req.stageId}".`,
      });
      continue;
    }
    seen.add(req.stageId);

    const parts = stageIdParts(req.stageId);
    if (!parts) {
      issues.push({
        code: 'CONTEXT_REQUIREMENT_INVALID_STAGE',
        message: `Stage ID "${req.stageId}" is not a valid stage.<mode>.<stage-name> ID.`,
      });
      continue;
    }

    const resolved = resolveStage(catalog, req.stageId);
    if (!resolved.ok) {
      issues.push({
        code: 'CONTEXT_REQUIREMENT_INVALID_STAGE',
        message: `Stage "${req.stageId}" does not exist in the instruction catalog.`,
      });
      continue;
    }

    const expectedStageName = req.role === 'implementation' ? 'implementation' : 'test-implementation';
    if (parts.stageName !== expectedStageName) {
      issues.push({
        code: 'CONTEXT_REQUIREMENT_ROLE_MISMATCH',
        message: `Stage "${req.stageId}" role "${req.role}" does not match its stage name "${parts.stageName}".`,
      });
    }

    const expectedKind: SupplementalContextKind = req.role === 'implementation' ? 'implementation' : 'test';
    if (req.kind !== expectedKind) {
      issues.push({
        code: 'CONTEXT_REQUIREMENT_KIND_MISMATCH',
        message: `Stage "${req.stageId}" kind "${req.kind}" does not match expected kind "${expectedKind}".`,
      });
    }

    const expectedPacketPath =
      expectedKind === 'implementation' ? IMPLEMENTATION_CONTEXT_PACKET_RELATIVE_PATH : TEST_CONTEXT_PACKET_RELATIVE_PATH;
    const expectedReportPath =
      expectedKind === 'implementation'
        ? IMPLEMENTATION_CONTEXT_RETRIEVAL_REPORT_RELATIVE_PATH
        : TEST_CONTEXT_RETRIEVAL_REPORT_RELATIVE_PATH;
    if (req.packetRelativePath !== expectedPacketPath || req.reportRelativePath !== expectedReportPath) {
      issues.push({
        code: 'CONTEXT_REQUIREMENT_PATH_MISMATCH',
        message: `Stage "${req.stageId}" packet/report paths do not match the fixed paths for kind "${expectedKind}".`,
      });
    }

    if (parts.mode === 'greenfield') {
      issues.push({
        code: 'CONTEXT_REQUIREMENT_ORPHAN',
        message: `Greenfield stage "${req.stageId}" must not have a repository-evidence requirement.`,
      });
    }

    const modeMatrix = APPROVED_MODE_MATRIX[parts.mode];
    if (!modeMatrix || !modeMatrix[expectedKind]) {
      issues.push({
        code: 'CONTEXT_REQUIREMENT_ORPHAN',
        message: `Stage "${req.stageId}" has a requirement not present in the approved mode matrix.`,
      });
    }

    seenByMode[parts.mode] = seenByMode[parts.mode] ?? { implementation: false, test: false };
    seenByMode[parts.mode][expectedKind] = true;
  }

  for (const [mode, matrix] of Object.entries(APPROVED_MODE_MATRIX)) {
    const seenForMode = seenByMode[mode] ?? { implementation: false, test: false };
    if (matrix.implementation && !seenForMode.implementation) {
      issues.push({
        code: 'CONTEXT_REQUIREMENT_MATRIX_MISMATCH',
        message: `Mode "${mode}" requires an implementation-context requirement, but none is registered.`,
      });
    }
    if (matrix.test && !seenForMode.test) {
      issues.push({
        code: 'CONTEXT_REQUIREMENT_MATRIX_MISMATCH',
        message: `Mode "${mode}" requires a test-context requirement, but none is registered.`,
      });
    }
  }

  if (STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.length !== 11) {
    issues.push({
      code: 'CONTEXT_REQUIREMENT_MATRIX_MISMATCH',
      message: `Expected exactly 11 repository-evidence requirements, found ${STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.length}.`,
    });
  }

  return issues;
}

// Mode-level matrix helper for template writing (Batch 4 section 2.2/14.2).
export function requiredSupplementalContextKindsForMode(mode: string): SupplementalContextKind[] {
  const matrix = APPROVED_MODE_MATRIX[mode];
  if (!matrix) return [];
  const kinds: SupplementalContextKind[] = [];
  if (matrix.implementation) kinds.push('implementation');
  if (matrix.test) kinds.push('test');
  return kinds;
}
