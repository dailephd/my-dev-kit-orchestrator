// Validates generated GreenfieldProjectDocBootstrapResult output.
//
// Adapted in concept from my-dev-kit-alpha's validateBootstrapDocs.ts
// (PORT_FROM_MY_DEV_KIT candidate per artifacts/greenfield-porting-map.txt),
// but retargeted: instead of checking for unresolved `<placeholder>` tokens
// in filled markdown templates (a concept this runtime does not use), it
// checks that all nine required v1.1.0 doc categories were produced (section
// 9.2) and that no generated doc content makes an Android/mobile claim or a
// release/security/publish claim (section 9.5).

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

const ANDROID_MOBILE_RE = /\b(android|ios|react-native|flutter|jetpack|kotlin multiplatform|compose-multiplatform)\b/i;
const RELEASE_SECURITY_PUBLISH_RE =
  /\b(released?|publish(ed|ing)?|security[- ]validated|passed all tests|production[- ]ready|shipped)\b/i;

export type GreenfieldDocValidationIssueKind =
  | 'missing-required-section'
  | 'android-mobile-claim'
  | 'release-security-publish-claim';

export interface GreenfieldDocValidationIssue {
  docName: string;
  kind: GreenfieldDocValidationIssueKind;
  message: string;
}

export interface GreenfieldDocValidationResult {
  valid: boolean;
  issues: GreenfieldDocValidationIssue[];
}

export function validateBootstrapDocs(
  result: GreenfieldProjectDocBootstrapResult,
): GreenfieldDocValidationResult {
  const issues: GreenfieldDocValidationIssue[] = [];
  const presentNames = new Set(result.targets.map((t) => t.docName));

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
    if (ANDROID_MOBILE_RE.test(text)) {
      issues.push({
        docName: target.docName,
        kind: 'android-mobile-claim',
        message: `Doc "${target.docName}" contains an Android/mobile claim, which is out of scope for v1.1.0.`,
      });
    }
    if (RELEASE_SECURITY_PUBLISH_RE.test(text)) {
      issues.push({
        docName: target.docName,
        kind: 'release-security-publish-claim',
        message: `Doc "${target.docName}" makes a release/security/publish claim, which this runtime must not assert.`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

function flattenSections(sections: GreenfieldDocSection[]): string {
  return sections.map((s) => `${s.heading}\n${s.content}`).join('\n');
}
