import { GreenfieldProfile } from './profileTypes';

/**
 * The Next.js app starter profile, selected when the brief indicates a
 * web-facing application (see resolveGreenfieldProfile.ts).
 */
export const NEXTJS_APP_PROFILE: GreenfieldProfile = {
  id: 'nextjs-app',
  displayName: 'Next.js App',
  category: 'web-app',
  supportedProjectKind: 'browser-rendered web application',
  stackAssumptions: ['TypeScript', 'Next.js', 'React'],
  templateTargets: ['package.json', 'app/layout.tsx', 'app/page.tsx', 'README.md'],
  documentationExpectations: ['README.md usage section', 'page/route map'],
  testExpectations: ['component tests', 'route smoke tests'],
  validationExpectations: ['typecheck', 'build', 'test'],
  scaffoldPlanningHints: ['app directory routing', 'frontend build step required'],
  unsupportedConditions: ['requires a native mobile shell'],
  notesForBootstrapBundle: 'Frontend-first layout; requires a build step before verification.',
  setupCommands: [
    { command: 'npm install', purpose: 'Install dependencies.', required: true },
  ],
  validationCommands: [
    { command: 'npm run typecheck', purpose: 'Type-check the project.', required: true },
    { command: 'npm run build', purpose: 'Build the project.', required: true },
    { command: 'npm test', purpose: 'Run the test suite.', required: true },
  ],
};
