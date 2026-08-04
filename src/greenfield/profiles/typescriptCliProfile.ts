import { GreenfieldProfile } from './profileTypes';

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
};
