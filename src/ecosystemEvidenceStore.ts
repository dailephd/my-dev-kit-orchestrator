import * as fs from 'fs';
import * as path from 'path';
import { createHash, randomUUID } from 'crypto';
import {
  EcosystemRecordIssueCode, RunEcosystemEvidenceDocumentV1, RunEcosystemRequirementsDocumentV1,
  serializeEcosystemDocument, validateRunEcosystemEvidenceDocument, validateRunEcosystemRequirementsDocument,
} from './ecosystemEvidenceContracts';

const REQUIREMENTS_FILE = 'ecosystem-requirements.json';
const EVIDENCE_FILE = 'ecosystem-evidence.json';
export interface EcosystemActivationMetadata {
  ecosystemEvidenceVersion?: unknown;
  ecosystemRequirementsSha256?: unknown;
}
export class EcosystemEvidenceError extends Error {
  constructor(public readonly code: EcosystemRecordIssueCode) {
    super(code); // No raw input, paths, underlying I/O messages or secrets.
    this.name = 'EcosystemEvidenceError';
  }
}
export function hasEcosystemActivation(metadata: EcosystemActivationMetadata): boolean {
  return metadata.ecosystemEvidenceVersion !== undefined || metadata.ecosystemRequirementsSha256 !== undefined;
}
// Apply existing local-file safety conventions: inspect raw traversal before
// resolving, refuse directories as files and links/junctions before descending.
// This helper is internal to activation/storage, not an evidence ingestion API.
export function assertEcosystemPathSafety(raw: string, mustExist = true, file = false): string {
  if (typeof raw !== 'string' || !raw || raw.includes('\0') || raw.includes('..') || /^(?:[a-z]+:\/\/|\\\\|\/\/)/i.test(raw)) {
    throw new EcosystemEvidenceError('ECO_RECORD_INVALID');
  }
  const resolved = path.resolve(raw);
  let current = path.parse(resolved).root;
  for (const segment of resolved.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    let stat: fs.Stats;
    try { stat = fs.lstatSync(current); } catch (error) {
      if (!mustExist && (error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw new EcosystemEvidenceError('ECO_RECORD_INVALID');
    }
    if (stat.isSymbolicLink() || (current !== resolved && !stat.isDirectory())) throw new EcosystemEvidenceError('ECO_RECORD_INVALID');
    if (current === resolved && (file ? !stat.isFile() : !stat.isDirectory())) throw new EcosystemEvidenceError('ECO_RECORD_INVALID');
  }
  return resolved;
}
export function assertEcosystemRunFolderIdentity(runFolder: string, storedRunFolder: unknown): void {
  if (typeof storedRunFolder !== 'string') throw new EcosystemEvidenceError('ECO_RECORD_INVALID');
  const actual = assertEcosystemPathSafety(runFolder);
  const stored = assertEcosystemPathSafety(storedRunFolder);
  // Compare filesystem identities, so Windows drive/path casing differences
  // do not turn the same safe directory into a mismatched run. Neither producer
  // identifiers nor locator strings are normalized by this operation.
  if (fs.realpathSync.native(actual) !== fs.realpathSync.native(stored)) throw new EcosystemEvidenceError('ECO_RECORD_INVALID');
}
function readLocalBytes(file: string): Buffer {
  assertEcosystemPathSafety(file, true, true);
  const descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    if (!fs.fstatSync(descriptor).isFile()) throw new EcosystemEvidenceError('ECO_RECORD_INVALID');
    return fs.readFileSync(descriptor);
  } finally { fs.closeSync(descriptor); }
}
function parseBytes(bytes: Buffer): unknown {
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  return JSON.parse(text) as unknown;
}
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
function requireValidRequirements(document: unknown): RunEcosystemRequirementsDocumentV1 {
  const result = validateRunEcosystemRequirementsDocument(document);
  if (!result.valid) throw new EcosystemEvidenceError(result.issues.some((issue) => issue.code === 'ECO_SCHEMA_UNSUPPORTED') ? 'ECO_SCHEMA_UNSUPPORTED' : 'ECO_RECORD_INVALID');
  return result.document;
}
function requireValidEvidence(document: unknown): RunEcosystemEvidenceDocumentV1 {
  const result = validateRunEcosystemEvidenceDocument(document);
  if (!result.valid) throw new EcosystemEvidenceError(result.issues.some((issue) => issue.code === 'ECO_SCHEMA_UNSUPPORTED') ? 'ECO_SCHEMA_UNSUPPORTED' : 'ECO_RECORD_INVALID');
  return result.document;
}
export function prepareRunEcosystemRequirements(document: unknown): string {
  return serializeEcosystemDocument(requireValidRequirements(document));
}
export function readEcosystemRequirementsInput(inputPath: string): RunEcosystemRequirementsDocumentV1 {
  try { return requireValidRequirements(parseBytes(readLocalBytes(inputPath))); } catch (error) {
    if (error instanceof EcosystemEvidenceError) throw error;
    throw new EcosystemEvidenceError('ECO_REQUIREMENTS_UNAVAILABLE');
  }
}
// Called only within createRun, after validation/serialization and exclusive
// creation of its new runFolder. An initialization failure leaves an incomplete
// explicitly activated run; createRun must never return success in that case.
export function initializeRunEcosystemEvidence(runFolder: string, requirementsBytes: string): {
  ecosystemEvidenceVersion: '1.0.0'; ecosystemRequirementsSha256: string;
} {
  try {
    assertEcosystemPathSafety(runFolder);
    requireValidRequirements(JSON.parse(requirementsBytes));
    const requirementsPath = path.join(runFolder, REQUIREMENTS_FILE);
    fs.writeFileSync(requirementsPath, requirementsBytes, { encoding: 'utf8', flag: 'wx' });
    const saved = readLocalBytes(requirementsPath);
    if (!saved.equals(Buffer.from(requirementsBytes, 'utf8'))) throw new EcosystemEvidenceError('ECO_REQUIREMENTS_DIGEST_MISMATCH');
    requireValidRequirements(parseBytes(saved));
    fs.writeFileSync(path.join(runFolder, EVIDENCE_FILE), serializeEcosystemDocument({ schemaVersion: '1.0.0', evidence: [] }), { encoding: 'utf8', flag: 'wx' });
    requireValidEvidence(parseBytes(readLocalBytes(path.join(runFolder, EVIDENCE_FILE))));
    return { ecosystemEvidenceVersion: '1.0.0', ecosystemRequirementsSha256: sha256(saved) };
  } catch (error) {
    if (error instanceof EcosystemEvidenceError) throw error;
    throw new EcosystemEvidenceError('ECO_RECORD_INVALID');
  }
}
export interface RunEcosystemRecordInspection {
  activated: boolean;
  issues: EcosystemRecordIssueCode[];
  requirements?: RunEcosystemRequirementsDocumentV1;
  evidence?: RunEcosystemEvidenceDocumentV1;
}
export function verifyRunEcosystemInitialization(runFolder: string, expected: EcosystemActivationMetadata): void {
  try {
    const stored = parseBytes(readLocalBytes(path.join(runFolder, 'run.json')));
    if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) throw new EcosystemEvidenceError('ECO_RECORD_INVALID');
    const actual = stored as EcosystemActivationMetadata;
    if (actual.ecosystemEvidenceVersion !== expected.ecosystemEvidenceVersion ||
        actual.ecosystemRequirementsSha256 !== expected.ecosystemRequirementsSha256) throw new EcosystemEvidenceError('ECO_RECORD_INVALID');
    const inspection = inspectRunEcosystemRecords(runFolder, actual);
    if (!inspection.activated || inspection.issues.length) throw new EcosystemEvidenceError(inspection.issues[0] ?? 'ECO_RECORD_INVALID');
  } catch (error) {
    if (error instanceof EcosystemEvidenceError) throw error;
    throw new EcosystemEvidenceError('ECO_RECORD_INVALID');
  }
}
// Storage facts only: the existing RunIntegrityGate owns the interim eligibility
// decision. Legacy inspection performs no filesystem access.
export function inspectRunEcosystemRecords(runFolder: string, metadata: EcosystemActivationMetadata): RunEcosystemRecordInspection {
  if (!hasEcosystemActivation(metadata)) return { activated: false, issues: [] };
  const issues: EcosystemRecordIssueCode[] = [];
  let requirements: RunEcosystemRequirementsDocumentV1 | undefined;
  let evidence: RunEcosystemEvidenceDocumentV1 | undefined;
  if (metadata.ecosystemEvidenceVersion !== '1.0.0') {
    issues.push(typeof metadata.ecosystemEvidenceVersion === 'string' && metadata.ecosystemEvidenceVersion.length > 0 ? 'ECO_SCHEMA_UNSUPPORTED' : 'ECO_RECORD_INVALID');
  }
  if (typeof metadata.ecosystemRequirementsSha256 !== 'string' || metadata.ecosystemRequirementsSha256.length !== 64 || !/^[0-9a-f]{64}$/.test(metadata.ecosystemRequirementsSha256)) issues.push('ECO_RECORD_INVALID');
  try { assertEcosystemPathSafety(runFolder); } catch { return { activated: true, issues: [...new Set([...issues, 'ECO_RECORD_INVALID' as const])] }; }
  try {
    const bytes = readLocalBytes(path.join(runFolder, REQUIREMENTS_FILE));
    if (typeof metadata.ecosystemRequirementsSha256 === 'string' && sha256(bytes) !== metadata.ecosystemRequirementsSha256) issues.push('ECO_REQUIREMENTS_DIGEST_MISMATCH');
    try { requirements = requireValidRequirements(parseBytes(bytes)); } catch (error) {
      issues.push(error instanceof EcosystemEvidenceError ? error.code : 'ECO_RECORD_INVALID');
    }
  } catch { issues.push('ECO_REQUIREMENTS_UNAVAILABLE'); }
  try {
    const bytes = readLocalBytes(path.join(runFolder, EVIDENCE_FILE));
    try { evidence = requireValidEvidence(parseBytes(bytes)); } catch (error) {
      issues.push(error instanceof EcosystemEvidenceError ? error.code : 'ECO_RECORD_INVALID');
    }
  } catch { issues.push('ECO_EVIDENCE_UNAVAILABLE'); }
  return { activated: true, issues: [...new Set(issues)], ...(issues.length ? {} : { requirements, evidence }) };
}

/** Complete replacement only. Native locator strings remain inert data. */
export function replaceRunEcosystemEvidence(runFolder: string, document: RunEcosystemEvidenceDocumentV1): void {
  let temporaryPath: string | undefined;
  let ownsTemporary = false;
  try {
    const folder = assertEcosystemPathSafety(runFolder);
    const metadata = parseBytes(readLocalBytes(path.join(folder, 'run.json')));
    if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) throw new EcosystemEvidenceError('ECO_RECORD_INVALID');
    const activation = metadata as EcosystemActivationMetadata & { runFolder?: unknown };
    if (!hasEcosystemActivation(activation)) throw new EcosystemEvidenceError('ECO_RECORD_INVALID');
    assertEcosystemRunFolderIdentity(folder, activation.runFolder);
    const inspection = inspectRunEcosystemRecords(folder, activation);
    if (inspection.issues.length) throw new EcosystemEvidenceError(inspection.issues[0]);
    const bytes = serializeEcosystemDocument(requireValidEvidence(document));
    const destination = path.join(folder, EVIDENCE_FILE);
    assertEcosystemPathSafety(destination, true, true);
    temporaryPath = path.join(folder, `.ecosystem-evidence-${randomUUID()}.tmp`);
    const descriptor = fs.openSync(temporaryPath, 'wx');
    ownsTemporary = true;
    try { fs.writeFileSync(descriptor, bytes, 'utf8'); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
    // Recheck immutable requirements and target safety immediately before rename.
    const beforeRename = inspectRunEcosystemRecords(folder, activation);
    if (beforeRename.issues.length) throw new EcosystemEvidenceError(beforeRename.issues[0]);
    assertEcosystemPathSafety(destination, true, true);
    fs.renameSync(temporaryPath, destination);
    ownsTemporary = false;
  } catch (error) {
    if (error instanceof EcosystemEvidenceError) throw error;
    throw new EcosystemEvidenceError('ECO_RECORD_INVALID');
  } finally {
    if (ownsTemporary && temporaryPath) {
      try { fs.unlinkSync(temporaryPath); } catch { /* Only this operation's file; never broad cleanup. */ }
    }
  }
}
