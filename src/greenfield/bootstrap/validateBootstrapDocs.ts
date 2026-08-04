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

import { GreenfieldProfile, GreenfieldProfileId } from '../profiles/profileTypes';
import { SUPPORTED_PROFILES } from '../profiles/resolveGreenfieldProfile';
import { GreenfieldDocSection, GreenfieldProjectDocBootstrapResult, GreenfieldProjectDocName } from './projectDocBootstrapTypes';
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
  | 'release-security-publish-claim'
  | 'play-store-release-readiness-claim'
  | 'autonomous-execution-claim';

export interface GreenfieldDocValidationIssue {
  docName: string;
  kind: GreenfieldDocValidationIssueKind;
  message: string;
}

export interface GreenfieldDocValidationResult {
  valid: boolean;
  issues: GreenfieldDocValidationIssue[];
}

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
  const allowedTerminology = resolveAllowedDocumentationTerminology(selectedProfileId);
  const androidJetpackAllowed = allowedTerminology.includes('android-jetpack');
  const nextjsReactAllowed = allowedTerminology.includes('nextjs-react');

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
    const text = flattenSections(target.sections);

    if (UNSUPPORTED_PLATFORM_RE.test(text)) {
      issues.push({
        docName: target.docName,
        kind: 'unsupported-platform-claim',
        message: `Doc "${target.docName}" contains an unsupported-platform claim (iOS/React Native/Flutter/multiplatform), which is out of scope.`,
      });
    }

    if (!androidJetpackAllowed && ANDROID_JETPACK_RE.test(text)) {
      issues.push({
        docName: target.docName,
        kind: 'android-mobile-claim',
        message: `Doc "${target.docName}" contains an Android/Jetpack claim, which is not valid for the selected profile (${selectedProfileId ?? 'none'}).`,
      });
    }

    if (!nextjsReactAllowed && NEXTJS_REACT_RE.test(text)) {
      issues.push({
        docName: target.docName,
        kind: 'nextjs-web-claim',
        message: `Doc "${target.docName}" contains a Next.js/React claim, which is not valid for the selected profile (${selectedProfileId ?? 'none'}).`,
      });
    }

    if (RELEASE_SECURITY_PUBLISH_RE.test(text)) {
      issues.push({
        docName: target.docName,
        kind: 'release-security-publish-claim',
        message: `Doc "${target.docName}" makes a release/security/publish claim, which this runtime must not assert.`,
      });
    }

    if (PLAY_STORE_RELEASE_READINESS_RE.test(text)) {
      issues.push({
        docName: target.docName,
        kind: 'play-store-release-readiness-claim',
        message: `Doc "${target.docName}" makes a Play Store/release-readiness claim, which this runtime must not assert for any profile.`,
      });
    }

    if (AUTONOMOUS_EXECUTION_CLAIM_RE.test(text)) {
      issues.push({
        docName: target.docName,
        kind: 'autonomous-execution-claim',
        message: `Doc "${target.docName}" claims autonomous command/dependency/scaffold execution, which the orchestrator never performs.`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

function flattenSections(sections: GreenfieldDocSection[]): string {
  return sections.map((s) => `${s.heading}\n${s.content}`).join('\n');
}

// ─── Shared v1.3.0 issue-system bridge (TST-028..TST-033) ───────────────────

// Docs whose content is expected to carry setup or verification guidance
// for a selected profile (TST-032). A 'skipped' status on one of these for a
// selected (non-undefined) profile means the corresponding guidance is
// effectively absent, not merely thin.
const GUIDANCE_BEARING_DOC_NAMES: readonly GreenfieldProjectDocName[] = [
  'development-workflow',
  'testing-expectations',
  'validation-expectations',
];

const CLAIM_KIND_TO_DOC_UNSUPPORTED_CLAIM: ReadonlySet<GreenfieldDocValidationIssueKind> = new Set([
  'unsupported-platform-claim',
  'android-mobile-claim',
  'nextjs-web-claim',
  'release-security-publish-claim',
  'play-store-release-readiness-claim',
  'autonomous-execution-claim',
]);

/**
 * Bridges validateBootstrapDocs()'s findings, plus profile-owned
 * required-guidance-presence checks, into the shared v1.3.0
 * ProfileValidationIssue system (GF_DOC_REQUIREMENT_MISSING /
 * GF_DOC_UNSUPPORTED_CLAIM). Does not replace validateBootstrapDocs(), which
 * keeps its existing signature and GreenfieldDocValidationResult shape for
 * existing callers/tests.
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
    } else if (CLAIM_KIND_TO_DOC_UNSUPPORTED_CLAIM.has(baseIssue.kind)) {
      issues.push(docUnsupportedClaimIssue(profileId, baseIssue.docName, baseIssue.kind, baseIssue.message));
    }
  }

  if (profile) {
    const presentTargets = new Map(result.targets.map((t) => [t.docName, t] as const));
    for (const docName of GUIDANCE_BEARING_DOC_NAMES) {
      const target = presentTargets.get(docName);
      if (target && target.status === 'skipped') {
        issues.push(
          docRequirementMissingIssue(
            profileId,
            docName,
            `Doc "${docName}" has no generated setup/verification guidance for the selected profile (status "skipped").`,
          ),
        );
      }
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
