import {
  GREENFIELD_DOCUMENTATION_TERMINOLOGY,
  GreenfieldProfile,
  GreenfieldTargetExpectation,
} from './profileTypes';

const PYTHON_CLI_TARGET_EXPECTATIONS: readonly GreenfieldTargetExpectation[] = [
  {
    id: 'project-metadata',
    category: 'configuration',
    matcher: { kind: 'exact', value: 'pyproject.toml' },
    required: true,
    purpose: 'Python project metadata, packaging configuration, and development dependencies.',
    evidenceKind: 'file',
  },
  {
    id: 'cli-entry-point',
    category: 'entry-point',
    matcher: { kind: 'exact', value: 'src/main.py' },
    required: true,
    purpose: 'Standard-library Python command-line entry point.',
    evidenceKind: 'file',
  },
  {
    id: 'cli-tests',
    category: 'test',
    matcher: { kind: 'exact', value: 'tests/test_main.py' },
    required: true,
    purpose: 'Pytest coverage for command-line behavior.',
    evidenceKind: 'file',
  },
  {
    id: 'readme',
    category: 'documentation',
    matcher: { kind: 'exact', value: 'README.md' },
    required: true,
    purpose: 'Project setup, usage, and command-line documentation.',
    evidenceKind: 'file',
  },
];

export const PYTHON_CLI_PROFILE: GreenfieldProfile = {
  id: 'python-cli',
  displayName: 'Python CLI',
  category: 'cli',
  supportedProjectKind: 'small Python command-line application',
  stackAssumptions: ['Python', 'pyproject.toml', 'standard-library command-line entry behavior', 'pytest'],
  templateTargets: ['pyproject.toml', 'src/main.py', 'tests/test_main.py', 'README.md'],
  documentationExpectations: ['README.md setup and usage sections', 'command-line behavior reference'],
  testExpectations: ['pytest unit tests', 'CLI help smoke behavior'],
  validationExpectations: ['Python syntax/compile validation', 'pytest', 'CLI help smoke behavior'],
  scaffoldPlanningHints: [
    'small src-based command-line application',
    'standard-library command-line behavior where practical',
    'pytest development dependency declared through pyproject.toml',
  ],
  unsupportedConditions: [
    'requires a Python web or API framework',
    'requires notebook, scientific-computing, or machine-learning project structure',
    'requires database, Docker, or full-stack web capability',
  ],
  notesForBootstrapBundle:
    'Framework-minimal Python CLI layout using pyproject.toml, src/main.py, and pytest. The orchestrator ' +
    'provides setup and validation guidance but does not create environments, install packages, execute Python, or run tests.',
  setupCommands: [
    {
      command: 'python -m pip install -e ".[dev]"',
      purpose: 'Install the project and its development dependencies in editable mode.',
      required: true,
    },
  ],
  validationCommands: [
    {
      command: 'python -m compileall src',
      purpose: 'Compile the Python source tree to detect syntax errors.',
      required: true,
    },
    {
      command: 'python -m pytest',
      purpose: 'Run the pytest test suite.',
      required: true,
    },
    {
      command: 'python src/main.py --help',
      purpose: 'Smoke-test the command-line help behavior.',
      required: true,
    },
  ],
  allowedDocumentationTerminology: [GREENFIELD_DOCUMENTATION_TERMINOLOGY.PYTHON],
  compatibleProjectTypes: [],
  compatibleWebFrameworks: [],
  targetExpectations: PYTHON_CLI_TARGET_EXPECTATIONS,
};
