import { GREENFIELD_DOCUMENTATION_TERMINOLOGY, GreenfieldProfile, GreenfieldTargetExpectation } from './profileTypes';

// v1.3.0 Batch 3 (PSE-010): adapts the existing templateTargets below into
// required exact expectations. templateTargets itself is unchanged. All
// seven remain required -- the instrumented-test source file is still part
// of the standard project skeleton even though *running*
// connectedAndroidTest is optional (device/emulator-dependent); that
// optionality belongs to the validation command, not to whether the file is
// scaffolded.
const ANDROID_COMPOSE_TARGET_EXPECTATIONS: readonly GreenfieldTargetExpectation[] = [
  {
    id: 'gradle-settings',
    category: 'configuration',
    matcher: { kind: 'exact', value: 'settings.gradle.kts' },
    required: true,
    purpose: 'Gradle settings file declaring included modules.',
    evidenceKind: 'file',
  },
  {
    id: 'gradle-root-build',
    category: 'configuration',
    matcher: { kind: 'exact', value: 'build.gradle.kts' },
    required: true,
    purpose: 'Root Gradle build script.',
    evidenceKind: 'file',
  },
  {
    id: 'gradle-app-build',
    category: 'configuration',
    matcher: { kind: 'exact', value: 'app/build.gradle.kts' },
    required: true,
    purpose: 'App module Gradle build script.',
    evidenceKind: 'file',
  },
  {
    id: 'android-manifest',
    category: 'configuration',
    matcher: { kind: 'exact', value: 'app/src/main/AndroidManifest.xml' },
    required: true,
    purpose: 'Android application manifest.',
    evidenceKind: 'file',
  },
  {
    id: 'main-activity',
    category: 'entry-point',
    matcher: { kind: 'exact', value: 'app/src/main/java/MainActivity.kt' },
    required: true,
    purpose: 'Compose entry-point activity.',
    evidenceKind: 'file',
  },
  {
    id: 'unit-test-example',
    category: 'test',
    matcher: { kind: 'exact', value: 'app/src/test/java/ExampleUnitTest.kt' },
    required: true,
    purpose: 'JVM unit test example under app/src/test (no device required).',
    evidenceKind: 'file',
  },
  {
    id: 'instrumented-test-example',
    category: 'test',
    matcher: { kind: 'exact', value: 'app/src/androidTest/java/ExampleInstrumentedTest.kt' },
    required: true,
    purpose: 'Instrumentation test example under app/src/androidTest.',
    evidenceKind: 'file',
  },
];

/**
 * The Android Compose starter profile (v1.2.0), selected only when
 * explicitly requested (directly or via a bounded alias -- see
 * resolveGreenfieldProfile.ts). Never selected by silent inference from
 * generic "mobile" wording (see the 'unresolved' fallback branch in
 * resolveGreenfieldProfile.ts and artifacts/v1.2.0-android-compose-profile-contract.txt).
 *
 * The orchestrator only plans and prompts for this profile; it never
 * installs the Android SDK, never invokes Gradle, and never builds an
 * Android app itself (see artifacts/v1.2.0-android-compose-do-not-expand-list.txt).
 */
export const ANDROID_COMPOSE_PROFILE: GreenfieldProfile = {
  id: 'android-compose',
  displayName: 'Android Compose',
  category: 'mobile',
  supportedProjectKind: 'Android application built with Jetpack Compose',
  stackAssumptions: ['Kotlin', 'Jetpack Compose', 'Gradle', 'Android app module'],
  templateTargets: [
    'settings.gradle.kts',
    'build.gradle.kts',
    'app/build.gradle.kts',
    'app/src/main/AndroidManifest.xml',
    'app/src/main/java/MainActivity.kt',
    'app/src/test/java/ExampleUnitTest.kt',
    'app/src/androidTest/java/ExampleInstrumentedTest.kt',
  ],
  documentationExpectations: [
    'Android project overview',
    'Kotlin/Jetpack Compose stack summary',
    'Gradle setup expectations',
    'Android SDK/environment prerequisites (external, not orchestrator-managed)',
    'validation limitations (instrumentation tests require a device or emulator)',
  ],
  testExpectations: [
    'unit tests under app/src/test (JVM, no device required)',
    'instrumentation tests under app/src/androidTest (require a connected device or emulator; not run by the orchestrator)',
    'Gradle test command guidance',
  ],
  validationExpectations: ['Gradle build', 'Gradle unit tests', 'Gradle instrumented tests'],
  scaffoldPlanningHints: [
    'single Android app module',
    'Compose-based UI, no XML layouts',
    'Gradle wrapper included; no separate dependency-manager install step',
  ],
  unsupportedConditions: [
    'no Android SDK installed',
    'Gradle unavailable',
    'user asked for iOS',
    'user asked for Flutter',
    'user asked for React Native',
  ],
  notesForBootstrapBundle:
    'Single-module Android app; Gradle wrapper included; no npm-based setup step. The orchestrator ' +
    'guides scaffold planning and validation prompts; it does not build Android apps itself, does not ' +
    'invoke Gradle, and does not verify Android SDK availability.',
  setupCommands: [],
  validationCommands: [
    {
      command: './gradlew build',
      purpose: 'Build the Android app via the Gradle wrapper.',
      required: true,
      environmentNotes: 'Requires a working Android SDK on the machine that runs this command; the orchestrator does not install or verify it.',
    },
    {
      command: './gradlew testDebugUnitTest',
      purpose: 'Run JVM unit tests (no device or emulator required).',
      required: true,
    },
    {
      command: './gradlew connectedAndroidTest',
      purpose: 'Run instrumentation tests.',
      required: false,
      environmentNotes: 'Requires a connected Android device or running emulator; the orchestrator does not provide or manage one.',
    },
  ],
  allowedDocumentationTerminology: [GREENFIELD_DOCUMENTATION_TERMINOLOGY.ANDROID_JETPACK],
  compatibleProjectTypes: [],
  compatibleWebFrameworks: [],
  targetExpectations: ANDROID_COMPOSE_TARGET_EXPECTATIONS,
};
