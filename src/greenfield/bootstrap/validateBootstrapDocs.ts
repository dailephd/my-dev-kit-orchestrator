// Validates generated GreenfieldProjectDocBootstrapResult output.
//
// Adapted in concept from my-dev-kit-alpha's validateBootstrapDocs.ts
// (PORT_FROM_MY_DEV_KIT candidate per artifacts/greenfield-porting-map.txt),
// but retargeted: instead of checking for unresolved `<placeholder>` tokens
// in filled markdown templates (a concept this runtime does not use), it
// checks that all nine required v1.1.0 doc categories were produced (section
// 9.2) and that no generated doc content makes an unsupported-platform claim
// or a release/security/publish claim (section 9.5).
//
// v1.2.0: Android/Jetpack/Kotlin/Gradle claims are legitimate content for an
// android-compose bundle's docs, so the claim check is now profile-aware
// (see artifacts/v1.2.0-android-compose-profile-contract.txt, "Docs
// requirements"). iOS, React Native, Flutter, Kotlin Multiplatform, and
// Compose Multiplatform claims remain forbidden unconditionally, for every
// profile, always -- Android Compose is single-platform Android, not a
// multiplatform/cross-platform technology.
//
// v1.3.0 Batch 2: the profile-aware Android/Jetpack check below is now
// data-driven from GreenfieldProfile.allowedDocumentationTerminology instead
// of a hardcoded `selectedProfileId === 'android-compose'` comparison, and a
// symmetric Next.js/React terminology check was added for the same reason
// (see profileTypes.ts). validateGreenfieldProfileDocumentation() at the
// bottom of this file bridges this validator's findings into the shared
// v1.3.0 profile validation issue system (GF_DOC_REQUIREMENT_MISSING /
// GF_DOC_UNSUPPORTED_CLAIM) without replacing this function's existing
// signature or return shape, which callers and existing tests already rely
// on.
//
// v1.3.0 Batch 2 correction: `allowedDocumentationTerminology` now draws
// from the closed `GREENFIELD_DOCUMENTATION_TERMINOLOGY` vocabulary in
// profileTypes.ts instead of independent raw string literals here, and
// validateGreenfieldProfileDocumentation() no longer checks for a
// `status: 'skipped'` state on guidance-bearing docs -- the real generator
// (populateProjectDocsFromBrief.ts) never produces that status for those
// docs, and no other production, historical, or external path constructs
// this in-memory-only result shape, so that check protected no reachable
// behavior. Recognizing thin-but-present ('partial') guidance as
// insufficient requires real artifact/readiness semantics and is Batch 4
// scope, not Batch 2's static per-profile contract validation.

import {
  GREENFIELD_DOCUMENTATION_TERMINOLOGY,
  GreenfieldDocumentationTerminologyTag,
  GreenfieldProfile,
  GreenfieldProfileId,
} from '../profiles/profileTypes';
import { SUPPORTED_PROFILES } from '../profiles/resolveGreenfieldProfile';
import {
  GREENFIELD_CANONICAL_DOCUMENT_PATHS,
  GreenfieldDocSection,
  GreenfieldProjectDocBootstrapResult,
  GreenfieldProjectDocName,
} from './projectDocBootstrapTypes';
import { ProfileValidationIssue, ProfileValidationResult } from '../profiles/profileValidationTypes';
import { finalizeProfileValidationResult } from '../profiles/profileValidationOrdering';

const REQUIRED_DOC_NAMES: GreenfieldProjectDocName[] = [
  'product-boundary',
  'stack-decision',
  'starter-profile-summary',
  'development-workflow',
  'testing-expectations',
  'validation-expectations',
  'scaffold-planning-notes',
  'unresolved-decisions',
  'non-goals',
];

// Always forbidden, for every profile: these describe platforms/technologies
// this project does not and will not support, or cross-platform tech that is
// explicitly distinct from (and broader than) the single-platform Android
// Compose profile.
const UNSUPPORTED_PLATFORM_RE = /\b(ios|react-native|flutter|kotlin multiplatform|compose-multiplatform)\b/i;

// Gated by GreenfieldProfile.allowedDocumentationTerminology including
// 'android-jetpack' (currently only android-compose).
const ANDROID_JETPACK_RE = /\b(android|jetpack)\b/i;

// Gated by GreenfieldProfile.allowedDocumentationTerminology including
// 'nextjs-react' (currently only nextjs-app). Symmetric with the Android
// check above (TST-029).
const NEXTJS_REACT_RE = /\b(next\.?js|react)\b/i;

const PYTHON_RE = /\b(python|pytest|pyproject\.toml)\b/i;

const RELEASE_SECURITY_PUBLISH_RE =
  /\b(released?|publish(ed|ing)?|security[- ]validated|statically analyzed|static analysis (passed|complete)|passed all tests|production[- ]ready|shipped)\b/i;

const PLAY_STORE_RELEASE_READINESS_RE = /\b(play store|app release|release[- ]ready)\b/i;

// v1.3.0 Batch 2 (TST-031): the orchestrator only plans and prompts; it
// never installs dependencies, runs commands, or generates a scaffold on its
// own. Generated docs must never claim otherwise.
const AUTONOMOUS_EXECUTION_CLAIM_RE =
  /\b(automatically (installs?|runs?|executes?|scaffolds?|builds?|generates?)|installs? dependencies for you|runs? commands? (for you|automatically)|generates? the project automatically)\b/i;

export type GreenfieldDocValidationIssueKind =
  | 'missing-required-section'
  | 'unsupported-platform-claim'
  | 'android-mobile-claim'
  | 'nextjs-web-claim'
  | 'python-stack-claim'
  | 'release-security-publish-claim'
  | 'play-store-release-readiness-claim'
  | 'autonomous-execution-claim'
  // v1.3.1 Batch 2: a common canonical document path was declared more than
  // once in GreenfieldProjectDocBootstrapResult.canonicalDocuments.
  | 'duplicate-canonical-path';

export interface GreenfieldDocValidationIssue {
  docName: string;
  kind: GreenfieldDocValidationIssueKind;
  message: string;
}

export interface GreenfieldDocValidationResult {
  valid: boolean;
  issues: GreenfieldDocValidationIssue[];
}

interface GreenfieldDocumentationTerminologyClaimRule {
  readonly terminology: GreenfieldDocumentationTerminologyTag;
  readonly pattern: RegExp;
  readonly kind: GreenfieldDocValidationIssueKind;
  readonly claimLabel: string;
}

const PROFILE_TERMINOLOGY_CLAIM_RULES: readonly GreenfieldDocumentationTerminologyClaimRule[] = [
  {
    terminology: GREENFIELD_DOCUMENTATION_TERMINOLOGY.ANDROID_JETPACK,
    pattern: ANDROID_JETPACK_RE,
    kind: 'android-mobile-claim',
    claimLabel: 'Android/Jetpack claim',
  },
  {
    terminology: GREENFIELD_DOCUMENTATION_TERMINOLOGY.NEXTJS_REACT,
    pattern: NEXTJS_REACT_RE,
    kind: 'nextjs-web-claim',
    claimLabel: 'Next.js/React claim',
  },
  {
    terminology: GREENFIELD_DOCUMENTATION_TERMINOLOGY.PYTHON,
    pattern: PYTHON_RE,
    kind: 'python-stack-claim',
    claimLabel: 'Python stack claim',
  },
];

function resolveAllowedDocumentationTerminology(selectedProfileId?: GreenfieldProfileId): readonly string[] {
  if (!selectedProfileId) {
    return [];
  }
  const profile = SUPPORTED_PROFILES[selectedProfileId];
  return profile ? profile.allowedDocumentationTerminology : [];
}

/**
 * Validates generated doc content.
 *
 * @param result the generated docs to validate
 * @param selectedProfileId the profile the bundle was built from, if known.
 *   Terminology this profile's `allowedDocumentationTerminology` permits
 *   (e.g. Android/Jetpack for android-compose, Next.js/React for nextjs-app)
 *   is not flagged; for any other profile id (or when omitted), it is
 *   flagged the same way it always was before v1.2.0.
 */
export function validateBootstrapDocs(
  result: GreenfieldProjectDocBootstrapResult,
  selectedProfileId?: GreenfieldProfileId,
): GreenfieldDocValidationResult {
  const issues: GreenfieldDocValidationIssue[] = [];
  const presentNames = new Set(result.targets.map((t) => t.docName));
  const allowedTerminology = new Set(resolveAllowedDocumentationTerminology(selectedProfileId));

  for (const required of REQUIRED_DOC_NAMES) {
    if (!presentNames.has(required)) {
      issues.push({
        docName: required,
        kind: 'missing-required-section',
        message: `Required doc "${required}" was not generated.`,
      });
    }
  }

  for (const target of result.targets) {
    checkDocClaims(target.docName, target.sections, selectedProfileId, allowedTerminology, issues);
  }

  // v1.3.1 Batch 2: the standardized common canonical document baseline.
  // Optional on the result (see projectDocBootstrapTypes.ts), so only
  // evaluated when present -- absence does not fail validation, preserving
  // compatibility with callers/reconstructions that predate this contract.
  if (result.canonicalDocuments) {
    const presentPaths = new Set(result.canonicalDocuments.map((d) => d.path));

    for (const requiredPath of GREENFIELD_CANONICAL_DOCUMENT_PATHS) {
      if (!presentPaths.has(requiredPath)) {
        issues.push({
          docName: requiredPath,
          kind: 'missing-required-section',
          message: `Required common canonical document "${requiredPath}" was not generated.`,
        });
      }
    }

    const seenPaths = new Set<string>();
    for (const doc of result.canonicalDocuments) {
      if (seenPaths.has(doc.path)) {
        issues.push({
          docName: doc.path,
          kind: 'duplicate-canonical-path',
          message: `Canonical document path "${doc.path}" is declared more than once.`,
        });
      }
      seenPaths.add(doc.path);

      checkDocClaims(doc.path, doc.sections, selectedProfileId, allowedTerminology, issues);
    }
  }

  return { valid: issues.length === 0, issues };
}

// Shared claim-detection rules, run identically against legacy doc-category
// targets and standardized canonical-document targets (both are keyed by a
// docName string and share the same GreenfieldDocSection[] shape).
function checkDocClaims(
  docName: string,
  sections: GreenfieldDocSection[],
  selectedProfileId: GreenfieldProfileId | undefined,
  allowedTerminology: ReadonlySet<string>,
  issues: GreenfieldDocValidationIssue[],
): void {
  const text = flattenSections(sections);

  if (UNSUPPORTED_PLATFORM_RE.test(text)) {
    issues.push({
      docName,
      kind: 'unsupported-platform-claim',
      message: `Doc "${docName}" contains an unsupported-platform claim (iOS/React Native/Flutter/multiplatform), which is out of scope.`,
    });
  }

  for (const rule of PROFILE_TERMINOLOGY_CLAIM_RULES) {
    if (!allowedTerminology.has(rule.terminology) && rule.pattern.test(text)) {
      issues.push({
        docName,
        kind: rule.kind,
        message: `Doc "${docName}" contains a ${rule.claimLabel}, which is not valid for the selected profile (${selectedProfileId ?? 'none'}).`,
      });
    }
  }

  if (RELEASE_SECURITY_PUBLISH_RE.test(text)) {
    issues.push({
      docName,
      kind: 'release-security-publish-claim',
      message: `Doc "${docName}" makes a release/security/publish claim, which this runtime must not assert.`,
    });
  }

  if (PLAY_STORE_RELEASE_READINESS_RE.test(text)) {
    issues.push({
      docName,
      kind: 'play-store-release-readiness-claim',
      message: `Doc "${docName}" makes a Play Store/release-readiness claim, which this runtime must not assert for any profile.`,
    });
  }

  if (AUTONOMOUS_EXECUTION_CLAIM_RE.test(text)) {
    issues.push({
      docName,
      kind: 'autonomous-execution-claim',
      message: `Doc "${docName}" claims autonomous command/dependency/scaffold execution, which the orchestrator never performs.`,
    });
  }
}

function flattenSections(sections: GreenfieldDocSection[]): string {
  return sections.map((s) => `${s.heading}\n${s.content}`).join('\n');
}

// ─── Shared v1.3.0 issue-system bridge (TST-028..TST-031, TST-033; reachable
// portion of TST-032) ─────────────────────────────────────────────────────

const CLAIM_KIND_TO_DOC_UNSUPPORTED_CLAIM: ReadonlySet<GreenfieldDocValidationIssueKind> = new Set([
  'unsupported-platform-claim',
  'android-mobile-claim',
  'nextjs-web-claim',
  'python-stack-claim',
  'release-security-publish-claim',
  'play-store-release-readiness-claim',
  'autonomous-execution-claim',
]);

/**
 * Bridges validateBootstrapDocs()'s findings into the shared v1.3.0
 * ProfileValidationIssue system (GF_DOC_REQUIREMENT_MISSING /
 * GF_DOC_UNSUPPORTED_CLAIM). Does not replace validateBootstrapDocs(), which
 * keeps its existing signature and GreenfieldDocValidationResult shape for
 * existing callers/tests.
 *
 * Covers TST-032 only for a required doc that is structurally absent from
 * `result.targets` (translated from validateBootstrapDocs()'s existing
 * `missing-required-section` finding). It does not evaluate whether a
 * *present* doc's content is sufficiently detailed ('partial' vs
 * 'generated') -- that requires real artifact/readiness semantics and is
 * Batch 4 scope.
 *
 * Not currently called from any production greenfield run path; neither is
 * validateBootstrapDocs() itself (confirmed at baseline, before v1.3.0).
 * Wiring documentation findings into status/check/artifact readiness is
 * Batch 4's explicit ownership per the v1.3.0 Batch 0 design report.
 */
export function validateGreenfieldProfileDocumentation(
  result: GreenfieldProjectDocBootstrapResult,
  profile?: GreenfieldProfile,
): ProfileValidationResult {
  const baseResult = validateBootstrapDocs(result, profile?.id);
  const profileId = profile?.id ?? 'unresolved-profile';
  const issues: ProfileValidationIssue[] = [];

  for (const baseIssue of baseResult.issues) {
    if (baseIssue.kind === 'missing-required-section') {
      issues.push(docRequirementMissingIssue(profileId, baseIssue.docName, baseIssue.message));
    } else if (baseIssue.kind === 'duplicate-canonical-path') {
      issues.push(docDuplicatePathIssue(profileId, baseIssue.docName, baseIssue.message));
    } else if (CLAIM_KIND_TO_DOC_UNSUPPORTED_CLAIM.has(baseIssue.kind)) {
      issues.push(docUnsupportedClaimIssue(profileId, baseIssue.docName, baseIssue.kind, baseIssue.message));
    }
  }

  return finalizeProfileValidationResult(issues);
}

function docRequirementMissingIssue(profileId: string, docName: string, reason: string): ProfileValidationIssue {
  return {
    code: 'GF_DOC_REQUIREMENT_MISSING',
    severity: 'error',
    profileId,
    affectedContract: docName,
    reason,
    correctiveAction: `Generate required guidance content for the "${docName}" doc.`,
    evidenceKey: docName,
  };
}

// v1.3.1 Batch 2: no existing GF_* code represents "duplicate declaration
// within an array of path-keyed documents" (GF_PROFILE_UNSUPPORTED_FIELD
// covers duplicate scalar enum values, a different shape; GF_TARGET_DUPLICATE
// covers scaffold-target duplicates, a different contract). This mirrors that
// existing one-code-per-duplicate-concept precedent.
function docDuplicatePathIssue(profileId: string, docPath: string, reason: string): ProfileValidationIssue {
  return {
    code: 'GF_DOC_DUPLICATE_PATH',
    severity: 'error',
    profileId,
    affectedContract: docPath,
    reason,
    correctiveAction: `Remove the duplicate declaration of "${docPath}" so each canonical document path appears exactly once.`,
    evidenceKey: docPath,
  };
}

function docUnsupportedClaimIssue(
  profileId: string,
  docName: string,
  kind: GreenfieldDocValidationIssueKind,
  reason: string,
): ProfileValidationIssue {
  return {
    code: 'GF_DOC_UNSUPPORTED_CLAIM',
    severity: 'error',
    profileId,
    affectedContract: docName,
    reason,
    correctiveAction: `Remove the unsupported claim from the "${docName}" doc.`,
    evidenceKey: `${docName}:${kind}`,
  };
}
