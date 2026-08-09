import {
  GREENFIELD_DOCUMENTATION_TERMINOLOGY,
  GREENFIELD_PROJECT_TYPE,
  GREENFIELD_WEB_FRAMEWORK,
  GreenfieldProfile,
  GreenfieldTargetExpectation,
} from './profileTypes';

// v1.3.0 Batch 3 (PSE-010): adapts the existing templateTargets below into
// required exact expectations. templateTargets itself is unchanged.
const NEXTJS_APP_TARGET_EXPECTATIONS: readonly GreenfieldTargetExpectation[] = [
  {
    id: 'package-manifest',
    category: 'configuration',
    matcher: { kind: 'exact', value: 'package.json' },
    required: true,
    purpose: 'Package manifest declaring dependencies and build/test scripts.',
    evidenceKind: 'file',
  },
  {
    id: 'root-layout',
    category: 'entry-point',
    matcher: { kind: 'exact', value: 'app/layout.tsx' },
    required: true,
    purpose: 'App Router root layout wrapping every page.',
    evidenceKind: 'file',
  },
  {
    id: 'root-page',
    category: 'source',
    matcher: { kind: 'exact', value: 'app/page.tsx' },
    required: true,
    purpose: 'App Router root page rendered at "/".',
    evidenceKind: 'file',
  },
  {
    id: 'readme',
    category: 'documentation',
    matcher: { kind: 'exact', value: 'README.md' },
    required: true,
    purpose: 'Project usage and page/route-map documentation.',
    evidenceKind: 'file',
  },
];

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
  allowedDocumentationTerminology: [GREENFIELD_DOCUMENTATION_TERMINOLOGY.NEXTJS_REACT],
  compatibleProjectTypes: [GREENFIELD_PROJECT_TYPE.FULLSTACK_WEB],
  compatibleWebFrameworks: [GREENFIELD_WEB_FRAMEWORK.NEXTJS],
  targetExpectations: NEXTJS_APP_TARGET_EXPECTATIONS,
};
