// Structural contracts (required metadata keys, required sections) for the
// four supplemental repository-context document kinds. See
// supplementalContextTypes.ts for the schema/version/enum constants and
// supplementalContextParser.ts for the deterministic line-based parser that
// validates documents against these contracts.

import { SupplementalContextDocumentKind, SupplementalContextRole } from './supplementalContextTypes';

export const ROLE_BY_DOCUMENT_KIND: Record<SupplementalContextDocumentKind, SupplementalContextRole> = {
  'implementation-context-packet': 'implementation',
  'implementation-context-retrieval-report': 'implementation',
  'test-context-packet': 'test-implementation',
  'test-context-retrieval-report': 'test-implementation',
};

const COMMON_PACKET_METADATA = [
  'Schema version',
  'Document kind',
  'Role',
  'Status',
  'Repository scope',
  'Freshness',
  'Adequacy',
  'Required evidence truncated',
  'Context capsule schema version',
  'Retrieval audit schema version',
  'Tool name',
  'Tool version',
  'Index identity',
];

const COMMON_REPORT_METADATA = [
  'Schema version',
  'Document kind',
  'Role',
  'Status',
  'Repository scope',
  'Request schema version',
  'Context capsule schema version',
  'Retrieval audit schema version',
  'Tool name',
  'Tool version',
  'Index identity',
  'Freshness',
  'Adequacy',
  'Required evidence truncated',
  'Full-file fallback used',
  'Determinism checked',
];

const TEST_ONLY_METADATA = ['Responsibility mappings truncated', 'Critical responsibility mapping status'];

export const REQUIRED_METADATA_BY_DOCUMENT_KIND: Record<SupplementalContextDocumentKind, string[]> = {
  'implementation-context-packet': [...COMMON_PACKET_METADATA],
  'implementation-context-retrieval-report': [...COMMON_REPORT_METADATA],
  'test-context-packet': [...COMMON_PACKET_METADATA, ...TEST_ONLY_METADATA],
  'test-context-retrieval-report': [...COMMON_REPORT_METADATA, ...TEST_ONLY_METADATA],
};

export const REQUIRED_SECTIONS_BY_DOCUMENT_KIND: Record<SupplementalContextDocumentKind, string[]> = {
  'implementation-context-packet': [
    'Focus',
    'Selected owners',
    'Dependencies',
    'Contracts',
    'Validators',
    'Constants',
    'Errors',
    'Schemas',
    'Callers and callees',
    'Closest tests',
    'Test infrastructure',
    'Test commands',
    'Unresolved items',
    'Budget and truncation',
    'Full-file fallback',
    'Provenance',
    'Assumptions',
    'Notes',
  ],
  'implementation-context-retrieval-report': [
    'Retrieval request',
    'Command record',
    'Focus selection',
    'Candidate and owner selection',
    'Evidence groups',
    'Unresolved evidence',
    'Adequacy evaluation',
    'Freshness classification',
    'Budget',
    'Truncation',
    'Full-file fallback',
    'Provenance',
    'Warnings',
    'Determinism',
    'Assumptions',
    'Notes',
  ],
  'test-context-packet': [
    'Changed surface',
    'Production owners',
    'Production contracts',
    'Validators',
    'Constants',
    'Errors',
    'Schemas',
    'Closest tests',
    'Test infrastructure',
    'Test commands',
    'Test responsibilities',
    'Responsibility mappings',
    'Reusable test helpers',
    'Oracle evidence',
    'Unresolved items',
    'Budget and truncation',
    'Full-file fallback',
    'Provenance',
    'Assumptions',
    'Notes',
  ],
  'test-context-retrieval-report': [
    'Retrieval request',
    'Command record',
    'Changed-surface selection',
    'Production-owner selection',
    'Test-infrastructure discovery',
    'Test-command discovery',
    'Responsibility mapping',
    'Criticality overlay',
    'Adequacy evaluation',
    'Freshness classification',
    'Budget',
    'Truncation',
    'Full-file fallback',
    'Provenance',
    'Warnings',
    'Determinism',
    'Assumptions',
    'Notes',
  ],
};

export const VALID_REPOSITORY_SCOPES = ['single-repository', 'source-target'];
export const VALID_DECLARED_STATUSES = ['template', 'populated'];
export const VALID_FRESHNESS_VALUES = ['fresh', 'stale', 'unknown'];
export const VALID_ADEQUACY_VALUES = [
  'sufficient',
  'sufficient-with-assumptions',
  'insufficient',
  'conflict',
  'unknown',
];
export const VALID_TRUNCATION_VALUES = ['yes', 'no', 'unknown'];
