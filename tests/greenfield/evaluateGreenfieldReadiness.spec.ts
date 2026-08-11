import { evaluateGreenfieldReadiness } from '../../src/greenfield/readiness/evaluateGreenfieldReadiness';
import { GreenfieldReadinessInputs } from '../../src/greenfield/readiness/greenfieldReadinessTypes';
import { TYPESCRIPT_CLI_PROFILE } from '../../src/greenfield/profiles/typescriptCliProfile';
import { NEXTJS_APP_PROFILE } from '../../src/greenfield/profiles/nextjsAppProfile';
import { ANDROID_COMPOSE_PROFILE } from '../../src/greenfield/profiles/androidComposeProfile';

const VALID_SCAFFOLD_REPORT = `Artifact: ScaffoldImplementationReport
Workflow mode: greenfield
Profile: typescript-cli
Files changed:
- agents.txt
- claude.txt
- AGENTS.md
- CLAUDE.md
- package.json
- src/cli.ts
- src/index.ts
- README.md
Commands run:
- npm install: passed
Deviations: none
Blockers: none
Risks: none
Status: complete
`;

const VALID_FIRST_SLICE = `Artifact: FirstVerticalSlice
Workflow mode: greenfield
Profile: typescript-cli
Minimal behavior: The CLI parses a single "greet" command and prints a personalized greeting message to stdout, exercising the full command-parsing and output pipeline end to end.
Entry point: src/cli.ts
Tied to product boundary: Demonstrates the core command-handling workflow described in the product boundary document.
Status: complete
`;

const VALID_VERIFICATION_REPORT = `Artifact: VerificationReport
Workflow mode: greenfield
Commands verified:
- npm run typecheck: passed
- npm run build: passed
- npm test: passed
Status: complete
`;

function validInputs(overrides: Partial<GreenfieldReadinessInputs> = {}): GreenfieldReadinessInputs {
  return {
    profile: TYPESCRIPT_CLI_PROFILE,
    scaffoldImplementationReportContent: VALID_SCAFFOLD_REPORT,
    firstVerticalSliceContent: VALID_FIRST_SLICE,
    verificationReportContent: VALID_VERIFICATION_REPORT,
    ...overrides,
  };
}

// TST-034: complete current-profile report, targets, first slice, and
// command evidence -> ready and deterministically empty errors.
describe('evaluateGreenfieldReadiness - valid readiness (TST-034)', () => {
  it('typescript-cli: ready with zero issues', () => {
    const result = evaluateGreenfieldReadiness(validInputs());
    expect(result.ready).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.legacyRun).toBe(false);
    expect(result.issues).toEqual([]);
  });

  it('android-compose: ready, including optional connectedAndroidTest skipped with reason', () => {
    const report = `Artifact: ScaffoldImplementationReport
Workflow mode: greenfield
Profile: android-compose
Files changed:
- agents.txt
- claude.txt
- AGENTS.md
- CLAUDE.md
- settings.gradle.kts
- build.gradle.kts
- app/build.gradle.kts
- app/src/main/AndroidManifest.xml
- app/src/main/java/MainActivity.kt
- app/src/test/java/ExampleUnitTest.kt
- app/src/androidTest/java/ExampleInstrumentedTest.kt
Commands run:
Deviations: none
Blockers: none
Risks: none
Status: complete
`;
    const slice = `Artifact: FirstVerticalSlice
Workflow mode: greenfield
Profile: android-compose
Minimal behavior: MainActivity renders a Compose screen with a single button that increments and displays a counter value on tap.
Entry point: app/src/main/java/MainActivity.kt
Tied to product boundary: Demonstrates the core Compose UI interaction described in the product boundary document.
Status: complete
`;
    const verification = `Artifact: VerificationReport
Workflow mode: greenfield
Commands verified:
- ./gradlew build: passed
- ./gradlew testDebugUnitTest: passed
- ./gradlew connectedAndroidTest: skipped, no connected device or emulator available
Status: complete
`;
    const result = evaluateGreenfieldReadiness({
      profile: ANDROID_COMPOSE_PROFILE,
      scaffoldImplementationReportContent: report,
      firstVerticalSliceContent: slice,
      verificationReportContent: verification,
    });
    expect(result.ready).toBe(true);
    expect(result.issues).toEqual([]);
  });

  // v1.3.0 Batch 5: nextjs-app had no TST-034 valid-readiness fixture of its
  // own (only used as a "wrong profile" string substitution in mismatch
  // tests elsewhere in this file) -- this closes that fixture gap so all
  // three current profiles have equivalent full-contract readiness coverage.
  it('nextjs-app: ready with zero issues', () => {
    const report = `Artifact: ScaffoldImplementationReport
Workflow mode: greenfield
Profile: nextjs-app
Files changed:
- agents.txt
- claude.txt
- AGENTS.md
- CLAUDE.md
- package.json
- app/layout.tsx
- app/page.tsx
- README.md
Commands run:
- npm install: passed
Deviations: none
Blockers: none
Risks: none
Status: complete
`;
    const slice = `Artifact: FirstVerticalSlice
Workflow mode: greenfield
Profile: nextjs-app
Minimal behavior: The root page renders a heading and a counter button that increments displayed state on click, exercising the full render and client-interaction pipeline end to end.
Entry point: app/page.tsx
Tied to product boundary: Demonstrates the core page-rendering workflow described in the product boundary document.
Status: complete
`;
    const verification = `Artifact: VerificationReport
Workflow mode: greenfield
Commands verified:
- npm run typecheck: passed
- npm run build: passed
- npm test: passed
Status: complete
`;
    const result = evaluateGreenfieldReadiness({
      profile: NEXTJS_APP_PROFILE,
      scaffoldImplementationReportContent: report,
      firstVerticalSliceContent: slice,
      verificationReportContent: verification,
    });
    expect(result.ready).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('does not mutate its inputs', () => {
    const inputs = validInputs();
    const before = JSON.parse(JSON.stringify(inputs));
    evaluateGreenfieldReadiness(inputs);
    expect(inputs).toEqual(before);
  });

  it('is deterministic for the same inputs', () => {
    const inputs = validInputs();
    expect(evaluateGreenfieldReadiness(inputs)).toEqual(evaluateGreenfieldReadiness(inputs));
  });
});

// TST-035: missing scaffold report -> GF_SCAFFOLD_REPORT_MISSING even if
// other artifacts exist.
describe('evaluateGreenfieldReadiness - missing scaffold report (TST-035)', () => {
  it('flags a missing scaffold implementation report', () => {
    const result = evaluateGreenfieldReadiness(validInputs({ scaffoldImplementationReportContent: undefined }));
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_SCAFFOLD_REPORT_MISSING' }));
  });

  it('flags a placeholder-only scaffold implementation report', () => {
    const result = evaluateGreenfieldReadiness(validInputs({ scaffoldImplementationReportContent: 'TODO' }));
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_SCAFFOLD_REPORT_MISSING' }));
  });
});

// TST-036: report lacks required target evidence -> GF_GENERATED_EVIDENCE_MISSING.
describe('evaluateGreenfieldReadiness - missing generated-target evidence (TST-036)', () => {
  it('TST-009: blocks readiness when one required common instruction target is omitted', () => {
    const report = VALID_SCAFFOLD_REPORT.replace('- agents.txt\n', '');
    const result = evaluateGreenfieldReadiness(validInputs({ scaffoldImplementationReportContent: report }));
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'GF_GENERATED_EVIDENCE_MISSING',
        affectedContract: 'targetExpectations:common-agents-instructions',
      }),
    );
  });

  it('flags a required target missing from "Files changed"', () => {
    const report = VALID_SCAFFOLD_REPORT.replace('- README.md\n', '');
    const result = evaluateGreenfieldReadiness(validInputs({ scaffoldImplementationReportContent: report }));
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_GENERATED_EVIDENCE_MISSING', affectedContract: expect.stringContaining('readme') }),
    );
  });
});

// TST-037: missing FirstVerticalSlice -> GF_FIRST_SLICE_MISSING.
describe('evaluateGreenfieldReadiness - missing first vertical slice (TST-037)', () => {
  it('flags a missing FirstVerticalSlice', () => {
    const result = evaluateGreenfieldReadiness(validInputs({ firstVerticalSliceContent: undefined }));
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_FIRST_SLICE_MISSING' }));
  });

  it('flags a placeholder-only FirstVerticalSlice', () => {
    const result = evaluateGreenfieldReadiness(validInputs({ firstVerticalSliceContent: '...' }));
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_FIRST_SLICE_MISSING' }));
  });
});

// TST-038: structurally incomplete or template-only first-slice content ->
// GF_FIRST_SLICE_INCOMPLETE or GF_FIRST_SLICE_BOILERPLATE.
describe('evaluateGreenfieldReadiness - incomplete/boilerplate first slice (TST-038)', () => {
  it('flags a structurally incomplete first slice (blank Entry point)', () => {
    const slice = VALID_FIRST_SLICE.replace('Entry point: src/cli.ts', 'Entry point:');
    const result = evaluateGreenfieldReadiness(validInputs({ firstVerticalSliceContent: slice }));
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_FIRST_SLICE_INCOMPLETE' }));
  });

  it('flags a non-"complete" Status as incomplete', () => {
    const slice = VALID_FIRST_SLICE.replace('Status: complete', 'Status: incomplete');
    const result = evaluateGreenfieldReadiness(validInputs({ firstVerticalSliceContent: slice }));
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_FIRST_SLICE_INCOMPLETE' }));
  });

  it('flags placeholder-only "Minimal behavior" content as boilerplate', () => {
    // Short enough to trip isPlaceholderContent's length check for this one
    // section, but not one of the whole-file placeholder marker strings
    // (TODO/PLACEHOLDER/[TBD]) that would short-circuit at GF_FIRST_SLICE_MISSING first.
    const slice = VALID_FIRST_SLICE.replace(/Minimal behavior:.*\n/, 'Minimal behavior: n/a\n');
    const result = evaluateGreenfieldReadiness(validInputs({ firstVerticalSliceContent: slice }));
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_FIRST_SLICE_BOILERPLATE' }));
  });
});

// TST-039: required command has no evidence -> GF_COMMAND_EVIDENCE_MISSING.
describe('evaluateGreenfieldReadiness - required command evidence missing (TST-039)', () => {
  it('flags a required command absent from "Commands verified"', () => {
    const verification = VALID_VERIFICATION_REPORT.replace('- npm test: passed\n', '');
    const result = evaluateGreenfieldReadiness(validInputs({ verificationReportContent: verification }));
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_COMMAND_EVIDENCE_MISSING', evidenceKey: 'npm test' }),
    );
  });

  it('flags every required command when the VerificationReport is entirely absent', () => {
    const result = evaluateGreenfieldReadiness(validInputs({ verificationReportContent: undefined }));
    const missing = result.issues.filter((i) => i.code === 'GF_COMMAND_EVIDENCE_MISSING');
    expect(missing).toHaveLength(TYPESCRIPT_CLI_PROFILE.validationCommands.length);
  });

  it('flags a required command recorded as failed', () => {
    const verification = VALID_VERIFICATION_REPORT.replace('- npm test: passed', '- npm test: failed');
    const result = evaluateGreenfieldReadiness(validInputs({ verificationReportContent: verification }));
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_COMMAND_EVIDENCE_MISSING', evidenceKey: 'npm test' }),
    );
  });
});

// TST-040: optional command skipped with nonblank external-prerequisite
// reason -> accepted skip, not passed.
describe('evaluateGreenfieldReadiness - optional command skipped with reason (TST-040)', () => {
  it('accepts an optional command skipped with a nonblank reason', () => {
    const verification = `Artifact: VerificationReport
Workflow mode: greenfield
Commands verified:
- ./gradlew build: passed
- ./gradlew testDebugUnitTest: passed
- ./gradlew connectedAndroidTest: skipped, no device connected
Status: complete
`;
    const report = `Artifact: ScaffoldImplementationReport
Workflow mode: greenfield
Profile: android-compose
Files changed:
- agents.txt
- claude.txt
- AGENTS.md
- CLAUDE.md
- settings.gradle.kts
- build.gradle.kts
- app/build.gradle.kts
- app/src/main/AndroidManifest.xml
- app/src/main/java/MainActivity.kt
- app/src/test/java/ExampleUnitTest.kt
- app/src/androidTest/java/ExampleInstrumentedTest.kt
Commands run:
Status: complete
`;
    const slice = `Artifact: FirstVerticalSlice
Workflow mode: greenfield
Profile: android-compose
Minimal behavior: MainActivity renders a Compose screen with a single button that increments and displays a counter value on tap.
Entry point: app/src/main/java/MainActivity.kt
Tied to product boundary: Demonstrates the core Compose UI interaction described in the product boundary document.
Status: complete
`;
    const result = evaluateGreenfieldReadiness({
      profile: ANDROID_COMPOSE_PROFILE,
      scaffoldImplementationReportContent: report,
      firstVerticalSliceContent: slice,
      verificationReportContent: verification,
    });
    expect(result.issues.filter((i) => i.affectedContract.includes('connectedAndroidTest'))).toEqual([]);
    expect(result.ready).toBe(true);
  });
});

// TST-041: optional command skipped without reason -> GF_OPTIONAL_SKIP_REASON_MISSING.
describe('evaluateGreenfieldReadiness - optional command skipped without reason (TST-041)', () => {
  it('flags an optional command skipped with a blank reason', () => {
    const verification = `Artifact: VerificationReport
Workflow mode: greenfield
Commands verified:
- ./gradlew build: passed
- ./gradlew testDebugUnitTest: passed
- ./gradlew connectedAndroidTest: skipped
Status: complete
`;
    const result = evaluateGreenfieldReadiness({
      profile: ANDROID_COMPOSE_PROFILE,
      scaffoldImplementationReportContent: undefined,
      firstVerticalSliceContent: undefined,
      verificationReportContent: verification,
    });
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_OPTIONAL_SKIP_REASON_MISSING', evidenceKey: './gradlew connectedAndroidTest' }),
    );
  });
});

// TST-042: prose claims passed without command evidence -> GF_COMMAND_PASS_UNSUPPORTED.
describe('evaluateGreenfieldReadiness - unsupported pass claim (TST-042)', () => {
  it('flags a prose-only "passed" claim with no structured evidence entry', () => {
    const verification = `Artifact: VerificationReport
Workflow mode: greenfield
Commands verified:
- npm run typecheck: passed
- npm run build: passed
Notes: npm test passed without any issues.
Status: complete
`;
    const result = evaluateGreenfieldReadiness(validInputs({ verificationReportContent: verification }));
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_COMMAND_PASS_UNSUPPORTED', evidenceKey: 'npm test' }),
    );
    expect(result.issues.filter((i) => i.code === 'GF_COMMAND_EVIDENCE_MISSING' && i.evidenceKey === 'npm test')).toEqual(
      [],
    );
  });
});

// TST-043: evidence/first slice names another profile -> profile mismatch, not ready.
describe('evaluateGreenfieldReadiness - profile mismatch (TST-043)', () => {
  it('flags a first-vertical-slice declaring a different profile', () => {
    const slice = VALID_FIRST_SLICE.replace('Profile: typescript-cli', 'Profile: nextjs-app');
    const result = evaluateGreenfieldReadiness(validInputs({ firstVerticalSliceContent: slice }));
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_FIRST_SLICE_PROFILE_MISMATCH', expected: 'typescript-cli', actual: 'nextjs-app' }),
    );
  });

  it('treats a scaffold report declaring a different profile as providing no usable evidence', () => {
    const report = VALID_SCAFFOLD_REPORT.replace('Profile: typescript-cli', 'Profile: nextjs-app');
    const result = evaluateGreenfieldReadiness(validInputs({ scaffoldImplementationReportContent: report }));
    expect(result.ready).toBe(false);
    expect(result.issues.some((i) => i.code === 'GF_GENERATED_EVIDENCE_MISSING')).toBe(true);
  });
});

// TST-044: complete artifacts with stale upstream -> stale lifecycle prevents readiness.
describe('evaluateGreenfieldReadiness - stale artifacts (TST-044)', () => {
  it('flags a stale scaffold implementation report', () => {
    const result = evaluateGreenfieldReadiness(validInputs({ scaffoldImplementationReportStale: true }));
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_SCAFFOLD_REPORT_STALE' }));
  });
});

// TST-045: historical run lacking v1.3.0 evidence fields -> legacy behavior
// plus GF_LEGACY_EVIDENCE_NOT_EVALUATED warning, no retroactive failure.
describe('evaluateGreenfieldReadiness - legacy run compatibility (TST-045)', () => {
  it('treats a report without a "Profile" section as legacy and does not fail it', () => {
    const legacyReport = `Artifact: ScaffoldImplementationReport
Workflow mode: greenfield
Files changed: created package.json, src/cli.ts, src/index.ts, README.md
Commands run: npm install
Deviations: none
Blockers: none
Risks: none
Status: complete
`;
    const result = evaluateGreenfieldReadiness(validInputs({ scaffoldImplementationReportContent: legacyReport }));
    expect(result.legacyRun).toBe(true);
    expect(result.ready).toBe(false); // legacy runs are never "ready" in the new sense
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_LEGACY_EVIDENCE_NOT_EVALUATED', severity: 'warning' }),
    );
    expect(result.issues.filter((i) => i.code === 'GF_GENERATED_EVIDENCE_MISSING')).toEqual([]);
  });
});

// TST-046: report-only, corroborated, missing, directory, symlink, and
// filesystem-only cases inside a temp projectRoot -- covered in
// filesystemCorroboration.spec.ts (uses real temp directories).

// Section 19.5: documentation findings integration.
describe('evaluateGreenfieldReadiness - documentation findings integration', () => {
  const VALID_PROJECT_DOCS_REPORT = `Artifact: ProjectDocsReport
Workflow mode: greenfield
Profile: typescript-cli
Product boundary: A CLI tool for syncing notes across devices.
Stack decision: TypeScript, Node.js.
Starter profile summary: TypeScript CLI selected as the starter profile.
Development workflow: single package, bin entry point, no UI layer.
Testing expectations: unit tests for command handlers, CLI smoke test.
Validation expectations: typecheck, build, test.
Scaffold planning notes: package.json, src/cli.ts, src/index.ts, README.md.
Unresolved decisions: none.
Non-goals: no graphical interface.
Status: complete
`;

  it('a valid ProjectDocsReport contributes no documentation findings', () => {
    const result = evaluateGreenfieldReadiness(validInputs({ projectDocsReportContent: VALID_PROJECT_DOCS_REPORT }));
    expect(result.issues.filter((i) => i.code.startsWith('GF_DOC_'))).toEqual([]);
  });

  it('flags a structurally absent required documentation doc name', () => {
    const incomplete = VALID_PROJECT_DOCS_REPORT.replace('Non-goals: no graphical interface.\n', '');
    const result = evaluateGreenfieldReadiness(validInputs({ projectDocsReportContent: incomplete }));
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_DOC_REQUIREMENT_MISSING' }));
  });

  it('flags an unsupported claim (Android terminology for a non-Android profile)', () => {
    const tampered = VALID_PROJECT_DOCS_REPORT.replace(
      'Non-goals: no graphical interface.',
      'Non-goals: no Android or Jetpack support.',
    );
    const result = evaluateGreenfieldReadiness(validInputs({ projectDocsReportContent: tampered }));
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_DOC_UNSUPPORTED_CLAIM' }));
  });

  it('preserves profile terminology boundaries without a profile-ID conditional (android-compose permits Android terms)', () => {
    const androidDocs = `Artifact: ProjectDocsReport
Workflow mode: greenfield
Profile: android-compose
Product boundary: An Android app for tracking habits.
Stack decision: Kotlin, Jetpack Compose, Gradle.
Starter profile summary: Android Compose selected.
Development workflow: single Android app module.
Testing expectations: unit tests under app/src/test.
Validation expectations: Gradle build, Gradle unit tests.
Scaffold planning notes: settings.gradle.kts, build.gradle.kts.
Unresolved decisions: none.
Non-goals: no offline mode.
Status: complete
`;
    const result = evaluateGreenfieldReadiness({
      profile: ANDROID_COMPOSE_PROFILE,
      scaffoldImplementationReportContent: undefined,
      firstVerticalSliceContent: undefined,
      verificationReportContent: undefined,
      projectDocsReportContent: androidDocs,
    });
    expect(result.issues.filter((i) => i.code === 'GF_DOC_UNSUPPORTED_CLAIM')).toEqual([]);
  });

  it('does not treat undefined projectDocsReportContent as a documentation finding', () => {
    const result = evaluateGreenfieldReadiness(validInputs({ projectDocsReportContent: undefined }));
    expect(result.issues.filter((i) => i.code.startsWith('GF_DOC_'))).toEqual([]);
  });
});

describe('evaluateGreenfieldReadiness - non-throwing behavior', () => {
  it('never throws for a thoroughly malformed set of inputs', () => {
    expect(() =>
      evaluateGreenfieldReadiness({
        profile: TYPESCRIPT_CLI_PROFILE,
        scaffoldImplementationReportContent: '',
        firstVerticalSliceContent: '',
        verificationReportContent: '',
        projectDocsReportContent: '',
      }),
    ).not.toThrow();
  });
});
