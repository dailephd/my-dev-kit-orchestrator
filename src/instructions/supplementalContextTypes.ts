// Supplemental repository-context document contracts (Batch 4).
//
// These describe the plain-text implementation/test context packet and
// retrieval-report files the orchestrator reads from a run folder. They are
// orchestrator-owned supplemental-document schemas, distinct from:
//   - the WorkflowInstructionPacket schema
//   - the instruction catalog schema
//   - the TaskState schema
//   - the StageContextBundle schema
//   - my-dev-kit's own ContextRequest / capsule / retrieval-audit schemas
//
// Batch 4 only classifies documents structurally (missing / template /
// populated / malformed / unsupported-schema / role-mismatch / kind-mismatch).
// It never evaluates whether a declared value is true -- that enforcement
// (freshness, adequacy, responsibility-mapping gates) is deferred to Batch 5.

export const SUPPLEMENTAL_CONTEXT_PACKET_SCHEMA_VERSION = '1.0.0';
export const SUPPLEMENTAL_CONTEXT_PACKET_SUPPORTED_MAJOR = 1;

export const SUPPLEMENTAL_CONTEXT_RETRIEVAL_REPORT_SCHEMA_VERSION = '1.0.0';
export const SUPPLEMENTAL_CONTEXT_RETRIEVAL_REPORT_SUPPORTED_MAJOR = 1;

export type SupplementalContextDocumentKind =
  | 'implementation-context-packet'
  | 'implementation-context-retrieval-report'
  | 'test-context-packet'
  | 'test-context-retrieval-report';

export type SupplementalContextRole = 'implementation' | 'test-implementation';

// The "contextKind" a stage requirement asks for -- selects which pair of
// document kinds (packet + report) and which fixed paths apply.
export type SupplementalContextKind = 'implementation' | 'test';

// What a document may self-declare in its "Status:" metadata field.
export type SupplementalContextDeclaredStatus = 'template' | 'populated';

// The full set of statuses the parser can classify a document into. Only
// "template" and "populated" can be self-declared; the rest are always
// parser-derived and can never come from document content.
export type SupplementalContextDocumentStatus =
  | 'missing'
  | 'template'
  | 'populated'
  | 'malformed'
  | 'unsupported-schema'
  | 'role-mismatch'
  | 'kind-mismatch';

export type RepositoryEvidenceAggregateStatus =
  | 'missing'
  | 'template'
  | 'populated'
  | 'partial'
  | 'malformed'
  | 'unsupported-schema'
  | 'incompatible';

export type DeclaredFreshness = 'fresh' | 'stale' | 'unknown';

export type DeclaredAdequacy =
  | 'sufficient'
  | 'sufficient-with-assumptions'
  | 'insufficient'
  | 'conflict'
  | 'unknown';

export type DeclaredTruncation = 'yes' | 'no' | 'unknown';

export type RepositoryScope = 'single-repository' | 'source-target';

export type SupplementalContextEnforcement = 'informational';

export type SupplementalContextIssueCode =
  | 'SUPPLEMENTAL_CONTEXT_MISSING_REQUIRED_METADATA'
  | 'SUPPLEMENTAL_CONTEXT_DUPLICATE_METADATA'
  | 'SUPPLEMENTAL_CONTEXT_EMPTY_METADATA_VALUE'
  | 'SUPPLEMENTAL_CONTEXT_INVALID_SCHEMA_VERSION'
  | 'SUPPLEMENTAL_CONTEXT_INVALID_STATUS'
  | 'SUPPLEMENTAL_CONTEXT_INVALID_FRESHNESS'
  | 'SUPPLEMENTAL_CONTEXT_INVALID_ADEQUACY'
  | 'SUPPLEMENTAL_CONTEXT_INVALID_TRUNCATION'
  | 'SUPPLEMENTAL_CONTEXT_INVALID_REPOSITORY_SCOPE'
  | 'SUPPLEMENTAL_CONTEXT_MISSING_REQUIRED_SECTION'
  | 'SUPPLEMENTAL_CONTEXT_DUPLICATE_SECTION'
  | 'SUPPLEMENTAL_CONTEXT_UNSUPPORTED_SCHEMA_MAJOR'
  | 'SUPPLEMENTAL_CONTEXT_KIND_MISMATCH'
  | 'SUPPLEMENTAL_CONTEXT_ROLE_MISMATCH'
  | 'CONTEXT_REQUIRED_SECTION_NOT_POPULATED';

export interface SupplementalContextParserIssue {
  code: SupplementalContextIssueCode;
  message: string;
}

// Raw parsed metadata (string values only -- validated/typed values are
// exposed separately on SupplementalContextInspection). Keys are the exact
// case-sensitive "Key: value" labels from the document, unmodified.
export type SupplementalContextRawMetadata = Record<string, string>;

export interface SupplementalContextParsedDocument {
  metadata: SupplementalContextRawMetadata;
  sections: Record<string, string>;
}

export interface SupplementalContextInspection {
  status: SupplementalContextDocumentStatus;
  path: string;
  expectedKind: SupplementalContextDocumentKind;
  expectedRole: SupplementalContextRole;

  declaredSchemaVersion?: string;
  declaredKind?: string;
  declaredRole?: string;
  declaredStatus?: SupplementalContextDeclaredStatus;
  declaredRepositoryScope?: string;
  declaredFreshness?: DeclaredFreshness;
  declaredAdequacy?: DeclaredAdequacy;
  declaredRequiredEvidenceTruncated?: DeclaredTruncation;
  declaredResponsibilityMappingsTruncated?: DeclaredTruncation;
  declaredCriticalResponsibilityMappingStatus?: string;

  toolName?: string;
  toolVersion?: string;
  indexIdentity?: string;
  contextCapsuleSchemaVersion?: string;
  retrievalAuditSchemaVersion?: string;

  // Batch 5: optional raw-evidence path references. "unknown" (the starter
  // template default) and an absent key are both treated as "not declared"
  // by readiness evaluation -- only a populated document that has replaced
  // these with a real path can reach "ready".
  declaredSourceCapsulePath?: string;
  declaredSourceAuditPath?: string;
  declaredAfterIndex?: string;

  supportedSchemaMajor: number;

  warnings: string[];
  issues: SupplementalContextParserIssue[];
}
