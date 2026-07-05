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

import { GreenfieldProfileId } from '../profiles/profileTypes';
import { GreenfieldDocSection, GreenfieldProjectDocBootstrapResult, GreenfieldProjectDocName } from './projectDocBootstrapTypes';

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

// Only meaningful for a non-android-compose profile's docs; permitted when
// the selected profile is android-compose.
const ANDROID_JETPACK_RE = /\b(android|jetpack)\b/i;

const RELEASE_SECURITY_PUBLISH_RE =
  /\b(released?|publish(ed|ing)?|security[- ]validated|passed all tests|production[- ]ready|shipped)\b/i;

const PLAY_STORE_RELEASE_READINESS_RE = /\b(play store|app release|release[- ]ready)\b/i;

export type GreenfieldDocValidationIssueKind =
  | 'missing-required-section'
  | 'unsupported-platform-claim'
  | 'android-mobile-claim'
  | 'release-security-publish-claim'
  | 'play-store-release-readiness-claim';

export interface GreenfieldDocValidationIssue {
  docName: string;
  kind: GreenfieldDocValidationIssueKind;
  message: string;
}

export interface GreenfieldDocValidationResult {
  valid: boolean;
  issues: GreenfieldDocValidationIssue[];
}

/**
 * Validates generated doc content.
 *
 * @param result the generated docs to validate
 * @param selectedProfileId the profile the bundle was built from, if known.
 *   When `'android-compose'`, Android/Jetpack mentions are permitted; for any
 *   other profile id (or when omitted), they are flagged the same way they
 *   always were before v1.2.0.
 */
export function validateBootstrapDocs(
  result: GreenfieldProjectDocBootstrapResult,
  selectedProfileId?: GreenfieldProfileId,
): GreenfieldDocValidationResult {
  const issues: GreenfieldDocValidationIssue[] = [];
  const presentNames = new Set(result.targets.map((t) => t.docName));
  const androidJetpackAllowed = selectedProfileId === 'android-compose';

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
  }

  return { valid: issues.length === 0, issues };
}

function flattenSections(sections: GreenfieldDocSection[]): string {
  return sections.map((s) => `${s.heading}\n${s.content}`).join('\n');
}
