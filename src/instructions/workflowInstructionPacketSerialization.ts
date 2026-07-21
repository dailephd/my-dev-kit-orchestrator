// Deterministic canonical serialization and schema-major parsing for
// WorkflowInstructionPacket. No runtime schema-validation dependency is
// added; validation follows the repository's existing dependency-free,
// hand-written structural-check style (see catalogValidation.ts).

import {
  WORKFLOW_INSTRUCTION_PACKET_SUPPORTED_MAJOR,
  WorkflowInstructionPacket,
} from './workflowInstructionPacket';

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    result[key] = canonicalize((value as Record<string, unknown>)[key]);
  }
  return result;
}

export function serializeWorkflowInstructionPacket(packet: WorkflowInstructionPacket): string {
  const canonical = canonicalize(packet);
  return `${JSON.stringify(canonical, null, 2)}\n`;
}

export interface PacketParseIssue {
  code:
    | 'PACKET_PARSE_INVALID_JSON'
    | 'PACKET_PARSE_NOT_AN_OBJECT'
    | 'PACKET_PARSE_MISSING_SCHEMA_VERSION'
    | 'PACKET_PARSE_UNSUPPORTED_SCHEMA_MAJOR'
    | 'PACKET_PARSE_MISSING_REQUIRED_FIELD'
    | 'PACKET_PARSE_INVALID_FIELD_TYPE'
    | 'PACKET_PARSE_INVALID_ENTRY_KIND'
    | 'PACKET_PARSE_DUPLICATE_RESOLVED_ID'
    | 'PACKET_PARSE_MULTIPLE_REPORT_CONTRACTS';
  message: string;
  field?: string;
}

export type PacketParseResult =
  | { ok: true; packet: WorkflowInstructionPacket }
  | { ok: false; issues: PacketParseIssue[] };

const REQUIRED_FIELDS: Array<keyof WorkflowInstructionPacket> = [
  'schemaVersion',
  'catalogSchemaVersion',
  'catalogVersion',
  'workflowId',
  'stageId',
  'primaryEntry',
  'resolvedCommands',
  'resolvedRules',
  'reportContract',
  'validationRequirements',
  'stopConditions',
  'resolutionProvenance',
  'budget',
  'truncation',
  'adequacy',
  'unresolvedReferences',
  'warnings',
];

function majorVersion(schemaVersion: string): number | undefined {
  const match = /^(\d+)\./.exec(schemaVersion);
  if (!match) return undefined;
  return Number(match[1]);
}

export function parseWorkflowInstructionPacket(serialized: string): PacketParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(serialized);
  } catch (err) {
    return {
      ok: false,
      issues: [
        {
          code: 'PACKET_PARSE_INVALID_JSON',
          message: `Packet text is not valid JSON: ${(err as Error).message}`,
        },
      ],
    };
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {
      ok: false,
      issues: [{ code: 'PACKET_PARSE_NOT_AN_OBJECT', message: 'Packet must parse to a JSON object.' }],
    };
  }

  const obj = raw as Record<string, unknown>;
  const issues: PacketParseIssue[] = [];

  if (typeof obj.schemaVersion !== 'string' || obj.schemaVersion.length === 0) {
    issues.push({
      code: 'PACKET_PARSE_MISSING_SCHEMA_VERSION',
      message: 'Packet is missing a valid string "schemaVersion" field.',
      field: 'schemaVersion',
    });
    return { ok: false, issues };
  }

  const major = majorVersion(obj.schemaVersion);
  if (major !== WORKFLOW_INSTRUCTION_PACKET_SUPPORTED_MAJOR) {
    issues.push({
      code: 'PACKET_PARSE_UNSUPPORTED_SCHEMA_MAJOR',
      message: `Unsupported packet schema major "${obj.schemaVersion}". Supported major: ${WORKFLOW_INSTRUCTION_PACKET_SUPPORTED_MAJOR}.`,
      field: 'schemaVersion',
    });
    return { ok: false, issues };
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in obj)) {
      issues.push({
        code: 'PACKET_PARSE_MISSING_REQUIRED_FIELD',
        message: `Packet is missing required field "${field}".`,
        field,
      });
    }
  }
  if (issues.length > 0) return { ok: false, issues };

  if (typeof obj.workflowId !== 'string' || typeof obj.stageId !== 'string') {
    issues.push({
      code: 'PACKET_PARSE_INVALID_FIELD_TYPE',
      message: '"workflowId" and "stageId" must be strings.',
    });
  }

  const primaryEntry = obj.primaryEntry as Record<string, unknown> | undefined;
  if (!primaryEntry || typeof primaryEntry !== 'object' || primaryEntry.kind !== 'stage') {
    issues.push({
      code: 'PACKET_PARSE_INVALID_ENTRY_KIND',
      message: '"primaryEntry.kind" must be "stage".',
      field: 'primaryEntry',
    });
  }

  const reportContract = obj.reportContract as Record<string, unknown> | undefined;
  if (!reportContract || typeof reportContract !== 'object' || reportContract.kind !== 'report-contract') {
    issues.push({
      code: 'PACKET_PARSE_INVALID_ENTRY_KIND',
      message: '"reportContract.kind" must be "report-contract".',
      field: 'reportContract',
    });
  } else if (Array.isArray(obj.reportContract)) {
    issues.push({
      code: 'PACKET_PARSE_MULTIPLE_REPORT_CONTRACTS',
      message: '"reportContract" must be a single object, not an array.',
      field: 'reportContract',
    });
  }

  if (!Array.isArray(obj.resolvedCommands)) {
    issues.push({
      code: 'PACKET_PARSE_INVALID_FIELD_TYPE',
      message: '"resolvedCommands" must be an array.',
      field: 'resolvedCommands',
    });
  } else {
    const ids = (obj.resolvedCommands as Array<Record<string, unknown>>).map((c) => c.id);
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    for (const dup of new Set(duplicates)) {
      issues.push({
        code: 'PACKET_PARSE_DUPLICATE_RESOLVED_ID',
        message: `Duplicate resolved command ID "${String(dup)}" in "resolvedCommands".`,
        field: 'resolvedCommands',
      });
    }
  }

  if (!Array.isArray(obj.resolvedRules)) {
    issues.push({
      code: 'PACKET_PARSE_INVALID_FIELD_TYPE',
      message: '"resolvedRules" must be an array.',
      field: 'resolvedRules',
    });
  } else {
    const ids = (obj.resolvedRules as Array<Record<string, unknown>>).map((r) => r.id);
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    for (const dup of new Set(duplicates)) {
      issues.push({
        code: 'PACKET_PARSE_DUPLICATE_RESOLVED_ID',
        message: `Duplicate resolved rule ID "${String(dup)}" in "resolvedRules".`,
        field: 'resolvedRules',
      });
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return { ok: true, packet: raw as WorkflowInstructionPacket };
}
