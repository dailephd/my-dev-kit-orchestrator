import { GreenfieldProfile, GreenfieldTargetExpectation } from './profileTypes';

// v1.3.0 Batch 3 (PSE-010): adapts the existing templateTargets below into
// required exact expectations. templateTargets itself is unchanged and
// remains the contract buildScaffoldPlan.ts and existing tests consume.
const TYPESCRIPT_CLI_TARGET_EXPECTATIONS: readonly GreenfieldTargetExpectation[] = [
  {
    id: 'package-manifest',
    category: 'configuration',
    matcher: { kind: 'exact', value: 'package.json' },
    required: true,
    purpose: 'Package manifest declaring dependencies and the CLI bin entry.',
    evidenceKind: 'file',
  },
  {
    id: 'cli-entry-point',
    category: 'entry-point',
    matcher: { kind: 'exact', value: 'src/cli.ts' },
    required: true,
    purpose: 'CLI entry point invoked via the package bin field.',
    evidenceKind: 'file',
  },
  {
    id: 'library-entry-point',
    category: 'source',
    matcher: { kind: 'exact', value: 'src/index.ts' },
    required: true,
    purpose: 'Library entry point exporting reusable functionality.',
    evidenceKind: 'file',
  },
  {
    id: 'readme',
    category: 'documentation',
    matcher: { kind: 'exact', value: 'README.md' },
    required: true,
    purpose: 'Project usage and command-reference documentation.',
    evidenceKind: 'file',
  },
];

/**
 * The TypeScript CLI starter profile. Chosen as the deterministic fallback
 * profile (see resolveGreenfieldProfile.ts) because a CLI tool requires the
 * fewest structural assumptions of the two supported profiles and matches
 * my-dev-kit-orchestrator's own product shape.
 */
export const TYPESCRIPT_CLI_PROFILE: GreenfieldProfile = {
  id: 'typescript-cli',
  displayName: 'TypeScript CLI',
  category: 'cli',
  supportedProjectKind: 'command-line tool',
  stackAssumptions: ['TypeScript', 'Node.js'],
  templateTargets: ['package.json', 'src/cli.ts', 'src/index.ts', 'README.md'],
  documentationExpectations: ['README.md usage section', 'command reference'],
  testExpectations: ['unit tests for command handlers', 'CLI smoke test'],
  validationExpectations: ['typecheck', 'build', 'test'],
  scaffoldPlanningHints: ['single package', 'bin entry point', 'no UI layer'],
  unsupportedConditions: ['requires a graphical or browser-rendered UI'],
  notesForBootstrapBundle: 'Minimal single-package layout; no frontend build step required.',
  setupCommands: [
    { command: 'npm install', purpose: 'Install dependencies.', required: true },
  ],
  validationCommands: [
    { command: 'npm run typecheck', purpose: 'Type-check the project.', required: true },
    { command: 'npm run build', purpose: 'Build the project.', required: true },
    { command: 'npm test', purpose: 'Run the test suite.', required: true },
  ],
  allowedDocumentationTerminology: [],
  compatibleProjectTypes: [],
  compatibleWebFrameworks: [],
  targetExpectations: TYPESCRIPT_CLI_TARGET_EXPECTATIONS,
};
