// TestStrategyPacket responsibility-ID and criticality contract (Batch 5).
//
// Responsibility criticality belongs to the orchestrator, never to
// my-dev-kit (whose request-level testResponsibilityRefs is a plain
// string[] with no criticality). This module parses the six exact
// test-strategy artifacts (one per mode) and overlays their declared
// criticality onto raw my-dev-kit responsibilityMappings by responsibility
// ID. See AGENTS.txt Batch 5 sections 10-11.

import * as fs from 'fs';
import * as path from 'path';
import { StageInstructionId } from './catalogIds';
import { RawResponsibilityMappingEntry } from './myDevKitEvidenceSummary';

export type TestResponsibilityCriticality = 'critical' | 'noncritical';

export interface TestStrategySourceRequirement {
  mode: string;
  testImplementationStageId: StageInstructionId;
  strategyStageId: StageInstructionId;
  strategyArtifactRelativePath: string;
  expectedArtifactKind: string;
}

// Exact six-stage registry. Not every mode's test-strategy stage is named
// "test-strategy" -- repair/refactor/harden use their own mode-specific
// strategy stage names and artifact files (see src/workflows.ts's
// REPAIR_STAGES/REFACTOR_STAGES/HARDEN_STAGES) -- so this must be an exact
// per-mode mapping, never a stage-name-only fallback.
export const TEST_STRATEGY_SOURCE_REQUIREMENTS: readonly TestStrategySourceRequirement[] = [
  {
    mode: 'feature',
    testImplementationStageId: 'stage.feature.test-implementation',
    strategyStageId: 'stage.feature.test-strategy',
    strategyArtifactRelativePath: 'artifacts/test-strategy-packet.txt',
    expectedArtifactKind: 'TestStrategyPacket',
  },
  {
    mode: 'repair',
    testImplementationStageId: 'stage.repair.test-implementation',
    strategyStageId: 'stage.repair.regression-test-strategy',
    strategyArtifactRelativePath: 'artifacts/regression-test-strategy.txt',
    expectedArtifactKind: 'RegressionTestStrategy',
  },
  {
    mode: 'test',
    testImplementationStageId: 'stage.test.test-implementation',
    strategyStageId: 'stage.test.test-strategy',
    strategyArtifactRelativePath: 'artifacts/test-strategy-packet.txt',
    expectedArtifactKind: 'TestStrategyPacket',
  },
  {
    mode: 'refactor',
    testImplementationStageId: 'stage.refactor.test-implementation',
    strategyStageId: 'stage.refactor.compatibility-test-strategy',
    strategyArtifactRelativePath: 'artifacts/compatibility-test-strategy.txt',
    expectedArtifactKind: 'CompatibilityTestStrategy',
  },
  {
    mode: 'harden',
    testImplementationStageId: 'stage.harden.test-implementation',
    strategyStageId: 'stage.harden.resilience-test-strategy',
    strategyArtifactRelativePath: 'artifacts/resilience-test-strategy.txt',
    expectedArtifactKind: 'ResilienceTestStrategy',
  },
  {
    mode: 'extraction',
    testImplementationStageId: 'stage.extraction.test-implementation',
    strategyStageId: 'stage.extraction.test-strategy',
    strategyArtifactRelativePath: 'artifacts/test-strategy-packet.txt',
    expectedArtifactKind: 'TestStrategyPacket',
  },
];

const REQUIREMENT_BY_MODE: ReadonlyMap<string, TestStrategySourceRequirement> = new Map(
  TEST_STRATEGY_SOURCE_REQUIREMENTS.map((r) => [r.mode, r]),
);

export function findTestStrategySourceRequirement(mode: string): TestStrategySourceRequirement | undefined {
  return REQUIREMENT_BY_MODE.get(mode);
}

export function testStrategyArtifactPath(mode: string, runFolder: string): string | undefined {
  const req = REQUIREMENT_BY_MODE.get(mode);
  if (!req) return undefined;
  return path.join(runFolder, req.strategyArtifactRelativePath);
}

// ─── Responsibility-block parsing ──────────────────────────────────────────

// Required format (AGENTS.txt Batch 5 section 10.2):
//   test responsibility ID: <ID>
//   criticality: critical | noncritical
//   traces to: ...
//   setup: ...
//   action or trigger: ...
//   expected result: ...
//   test level: ...
//
// Blocks are separated by blank lines or by the next "test responsibility
// ID:" line. Parsing is deterministic line-based matching -- no fuzzy or
// semantic interpretation.
const FIELD_RE = /^([a-zA-Z][a-zA-Z0-9 ]*):\s*(.*)$/;
const REQUIRED_BLOCK_FIELDS = [
  'test responsibility id',
  'criticality',
  'traces to',
  'setup',
  'action or trigger',
  'expected result',
  'test level',
];
const RESPONSIBILITY_BODY_FIELDS = REQUIRED_BLOCK_FIELDS.filter((field) => field !== 'test responsibility id');
const RESPONSIBILITY_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._:/#-]*$/;

export interface ParsedTestResponsibility {
  responsibilityId: string;
  criticality: TestResponsibilityCriticality | undefined;
  criticalityRaw: string | undefined;
  missingFields: string[];
  blockIndex: number;
}

export type TestResponsibilityParseIssueCode =
  | 'CONTEXT_TEST_RESPONSIBILITY_ID_MISSING'
  | 'CONTEXT_TEST_RESPONSIBILITY_ID_INVALID'
  | 'CONTEXT_TEST_RESPONSIBILITY_DUPLICATE'
  | 'CONTEXT_TEST_RESPONSIBILITY_CRITICALITY_MISSING'
  | 'CONTEXT_TEST_RESPONSIBILITY_CRITICALITY_INVALID';

export interface TestResponsibilityParseIssue {
  code: TestResponsibilityParseIssueCode;
  message: string;
  blockIndex: number;
  responsibilityId?: string;
}

export interface TestResponsibilityParseResult {
  responsibilities: ParsedTestResponsibility[];
  issues: TestResponsibilityParseIssue[];
  duplicateResponsibilityIds: string[];
}

function splitIntoBlocks(text: string): string[][] {
  const lines = text.split(/\r\n|\n/);
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    const isNewBlockStart = /^test responsibility id\s*:/i.test(line.trim());
    if (isNewBlockStart && current.length > 0) {
      blocks.push(current);
      current = [];
    }
    if (line.trim().length === 0 && current.length > 0 && !isNewBlockStart) {
      // Blank line: only closes a block once at least one field line exists,
      // and only when the block isn't a responsibility block in progress
      // that hasn't hit its next start line yet -- kept simple: blank lines
      // inside a responsibility block are treated as block separators only
      // when the block already looks complete (has an ID field).
      const hasId = current.some((l) => /^test responsibility id\s*:/i.test(l.trim()));
      if (hasId) {
        blocks.push(current);
        current = [];
        continue;
      }
    }
    if (line.trim().length > 0 || current.length > 0) {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current);
  return blocks.filter((b) => b.some((l) => l.trim().length > 0));
}

function hasLegacyResponsibilityList(blockLines: readonly string[]): boolean {
  const headingIndex = blockLines.findIndex((line) => /^test responsibilities\s*:\s*$/i.test(line.trim()));
  if (headingIndex < 0) return false;
  return blockLines.slice(headingIndex + 1).some((line) => /^[-*+]\s+\S/.test(line.trim()));
}

function isResponsibilityEntry(
  fields: Readonly<Record<string, string>>,
  blockLines: readonly string[],
): boolean {
  if (Object.prototype.hasOwnProperty.call(fields, 'test responsibility id')) return true;
  if (hasLegacyResponsibilityList(blockLines)) return true;

  const bodyFieldCount = RESPONSIBILITY_BODY_FIELDS.filter((field) =>
    Object.prototype.hasOwnProperty.call(fields, field),
  ).length;
  const hasResponsibilitySignature =
    Object.prototype.hasOwnProperty.call(fields, 'criticality') ||
    Object.prototype.hasOwnProperty.call(fields, 'action or trigger') ||
    Object.prototype.hasOwnProperty.call(fields, 'expected result') ||
    Object.prototype.hasOwnProperty.call(fields, 'test level');

  // A real entry with its ID accidentally removed still has the structured
  // responsibility body. Requiring two body fields plus a responsibility-only
  // signature avoids interpreting document preambles, headings, prose, command
  // lists, coverage/risk sections, downstream-use text, or status trailers as
  // responsibility entries.
  return bodyFieldCount >= 2 && hasResponsibilitySignature;
}

export function parseTestResponsibilityBlocks(text: string): TestResponsibilityParseResult {
  const blocks = splitIntoBlocks(text);
  const responsibilities: ParsedTestResponsibility[] = [];
  const issues: TestResponsibilityParseIssue[] = [];
  const seenIds = new Map<string, number>();
  const duplicateResponsibilityIds: string[] = [];

  blocks.forEach((blockLines, blockIndex) => {
    const fields: Record<string, string> = {};
    for (const line of blockLines) {
      const match = line.trim().match(FIELD_RE);
      if (!match) continue;
      const key = match[1].trim().toLowerCase();
      if (REQUIRED_BLOCK_FIELDS.includes(key) && !(key in fields)) {
        fields[key] = match[2].trim();
      }
    }

    if (!isResponsibilityEntry(fields, blockLines)) return;

    const responsibilityId = fields['test responsibility id'];
    if (!responsibilityId) {
      issues.push({
        code: 'CONTEXT_TEST_RESPONSIBILITY_ID_MISSING',
        message: `Responsibility block ${blockIndex} is missing "test responsibility ID:".`,
        blockIndex,
      });
      return;
    }

    if (!RESPONSIBILITY_ID_RE.test(responsibilityId)) {
      issues.push({
        code: 'CONTEXT_TEST_RESPONSIBILITY_ID_INVALID',
        message: `Responsibility block ${blockIndex} has a malformed test responsibility ID: "${responsibilityId}".`,
        blockIndex,
        responsibilityId,
      });
    }

    if (seenIds.has(responsibilityId)) {
      if (!duplicateResponsibilityIds.includes(responsibilityId)) {
        duplicateResponsibilityIds.push(responsibilityId);
      }
      issues.push({
        code: 'CONTEXT_TEST_RESPONSIBILITY_DUPLICATE',
        message: `Duplicate test responsibility ID: "${responsibilityId}".`,
        blockIndex,
        responsibilityId,
      });
    } else {
      seenIds.set(responsibilityId, blockIndex);
    }

    const criticalityRaw = fields['criticality'];
    let criticality: TestResponsibilityCriticality | undefined;
    if (!criticalityRaw) {
      issues.push({
        code: 'CONTEXT_TEST_RESPONSIBILITY_CRITICALITY_MISSING',
        message: `Responsibility "${responsibilityId}" is missing "criticality:".`,
        blockIndex,
        responsibilityId,
      });
    } else if (criticalityRaw !== 'critical' && criticalityRaw !== 'noncritical') {
      issues.push({
        code: 'CONTEXT_TEST_RESPONSIBILITY_CRITICALITY_INVALID',
        message: `Responsibility "${responsibilityId}" has an invalid criticality value: "${criticalityRaw}" (expected "critical" or "noncritical").`,
        blockIndex,
        responsibilityId,
      });
    } else {
      criticality = criticalityRaw;
    }

    const missingFields = REQUIRED_BLOCK_FIELDS.filter((f) => !(f in fields));

    responsibilities.push({ responsibilityId, criticality, criticalityRaw, missingFields, blockIndex });
  });

  return { responsibilities, issues, duplicateResponsibilityIds };
}

export function readTestResponsibilityBlocks(strategyPath: string): TestResponsibilityParseResult | undefined {
  if (!fs.existsSync(strategyPath)) return undefined;
  const text = fs.readFileSync(strategyPath, 'utf8');
  return parseTestResponsibilityBlocks(text);
}

// ─── Criticality overlay ───────────────────────────────────────────────────

export type CriticalResponsibilityMappingState = 'mapped' | 'partially-mapped' | 'unmapped' | 'not-applicable' | 'missing';

export interface CriticalResponsibilitySummary {
  totalResponsibilities: number;
  criticalResponsibilities: number;
  noncriticalResponsibilities: number;
  criticalMapped: number;
  criticalPartiallyMapped: number;
  criticalUnmapped: number;
  criticalMissing: number;
  noncriticalMappingWarnings: string[];
  duplicateResponsibilityIds: string[];
  unknownCriticalityIds: string[];
  unmappedCriticalIds: string[];
}

export function computeCriticalResponsibilitySummary(
  parsed: TestResponsibilityParseResult,
  rawMappings: RawResponsibilityMappingEntry[],
): CriticalResponsibilitySummary {
  const mappingByRespId = new Map<string, string>();
  for (const m of rawMappings) {
    // First occurrence wins deterministically; later duplicates do not
    // silently override an already-recorded mapping status.
    if (!mappingByRespId.has(m.responsibilityId)) {
      mappingByRespId.set(m.responsibilityId, m.mappingStatus);
    }
  }

  const summary: CriticalResponsibilitySummary = {
    totalResponsibilities: parsed.responsibilities.length,
    criticalResponsibilities: 0,
    noncriticalResponsibilities: 0,
    criticalMapped: 0,
    criticalPartiallyMapped: 0,
    criticalUnmapped: 0,
    criticalMissing: 0,
    noncriticalMappingWarnings: [],
    duplicateResponsibilityIds: [...parsed.duplicateResponsibilityIds],
    unknownCriticalityIds: [],
    unmappedCriticalIds: [],
  };

  for (const r of parsed.responsibilities) {
    if (!r.criticality) {
      summary.unknownCriticalityIds.push(r.responsibilityId);
      continue;
    }
    const mappingStatus = mappingByRespId.get(r.responsibilityId);
    if (r.criticality === 'critical') {
      summary.criticalResponsibilities++;
      if (mappingStatus === 'mapped') {
        summary.criticalMapped++;
      } else if (mappingStatus === 'partially-mapped') {
        summary.criticalPartiallyMapped++;
        summary.unmappedCriticalIds.push(r.responsibilityId);
      } else if (mappingStatus === undefined) {
        summary.criticalMissing++;
        summary.unmappedCriticalIds.push(r.responsibilityId);
      } else {
        // unmapped or not-applicable
        summary.criticalUnmapped++;
        summary.unmappedCriticalIds.push(r.responsibilityId);
      }
    } else {
      summary.noncriticalResponsibilities++;
      if (mappingStatus === undefined) {
        summary.noncriticalMappingWarnings.push(`Responsibility "${r.responsibilityId}" (noncritical) has no mapping.`);
      } else if (mappingStatus === 'partially-mapped' || mappingStatus === 'unmapped') {
        summary.noncriticalMappingWarnings.push(
          `Responsibility "${r.responsibilityId}" (noncritical) is "${mappingStatus}".`,
        );
      }
    }
  }

  return summary;
}

// Vacuously true when there are no critical responsibilities at all --
// nothing critical is left unmapped.
export function allCriticalResponsibilitiesFullyMapped(summary: CriticalResponsibilitySummary): boolean {
  return (
    summary.criticalMapped === summary.criticalResponsibilities &&
    summary.criticalPartiallyMapped === 0 &&
    summary.criticalUnmapped === 0 &&
    summary.criticalMissing === 0
  );
}
