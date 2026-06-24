import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  parseArtifact,
  isPlaceholderContent,
  hasStatusMismatch,
  resolveArtifactKind,
  getArtifactSectionRequirements,
  checkArtifact,
  checkAllArtifacts,
} from '../artifactChecker';
import { ArtifactStateFile } from '../artifactLifecycle';
import { getWorkflow } from '../workflows';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-ac-'));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function makeRunFolder(tmp: string): string {
  const rf = path.join(tmp, 'run-test');
  fs.mkdirSync(path.join(rf, 'artifacts'), { recursive: true });
  return rf;
}

function writeArtifact(runFolder: string, artifactFile: string, content: string): void {
  const full = path.join(runFolder, artifactFile);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

function emptyStateFile(): ArtifactStateFile {
  return { version: '1', artifacts: {} };
}

// ─── parseArtifact ────────────────────────────────────────────────────────────

describe('parseArtifact', () => {
  it('detects single-line section header', () => {
    const result = parseArtifact('Artifact: RequestBrief\nStatus: complete\n');
    expect(result.sections.get('Artifact')).toBe('RequestBrief');
    expect(result.sections.get('Status')).toBe('complete');
  });

  it('collects multi-line section content', () => {
    const content = 'Requested change:\nLine one\nLine two\nStatus: complete\n';
    const result = parseArtifact(content);
    expect(result.sections.get('Requested change')).toBe('Line one\nLine two');
    expect(result.sections.get('Status')).toBe('complete');
  });

  it('returns empty sections map for empty artifact', () => {
    const result = parseArtifact('');
    expect(result.sections.size).toBe(0);
    expect(result.rawContent).toBe('');
  });

  it('returns empty sections map for artifact with no recognized sections', () => {
    const result = parseArtifact('- a list item\n  indented content\n1. numbered item\n');
    expect(result.sections.size).toBe(0);
  });

  it('strips leading and trailing whitespace from inline section values', () => {
    const result = parseArtifact('Artifact:   RequestBrief   \nStatus:   complete   \n');
    expect(result.sections.get('Artifact')).toBe('RequestBrief');
    expect(result.sections.get('Status')).toBe('complete');
  });

  it('handles section names with spaces and special characters', () => {
    const content =
      'User-visible or external behavior: users see a list\nStatus: complete\n';
    const result = parseArtifact(content);
    expect(result.sections.has('User-visible or external behavior')).toBe(true);
    expect(result.sections.get('User-visible or external behavior')).toBe('users see a list');
  });

  it('handles Run ID section', () => {
    const result = parseArtifact('Artifact: FinalReport\nRun ID: abc-123\nStatus: complete\n');
    expect(result.sections.get('Run ID')).toBe('abc-123');
  });

  it('does not match lines starting with a dash as section headers', () => {
    const result = parseArtifact('- some item:\nArtifact: BehaviorModel\n');
    expect(result.sections.has('- some item')).toBe(false);
    expect(result.sections.has('Artifact')).toBe(true);
  });
});

// ─── isPlaceholderContent ─────────────────────────────────────────────────────

describe('isPlaceholderContent', () => {
  it('returns true for very short content', () => {
    expect(isPlaceholderContent('short')).toBe(true);
  });

  it('returns true for content containing TODO', () => {
    const content = 'A'.repeat(200) + ' TODO fix this';
    expect(isPlaceholderContent(content)).toBe(true);
  });

  it('returns true for content containing PLACEHOLDER', () => {
    const content = 'A'.repeat(200) + ' PLACEHOLDER value';
    expect(isPlaceholderContent(content)).toBe(true);
  });

  it('returns true for content containing [TBD]', () => {
    const content = 'A'.repeat(200) + ' [TBD]';
    expect(isPlaceholderContent(content)).toBe(true);
  });

  it('returns true for content that is only dots', () => {
    expect(isPlaceholderContent('...')).toBe(true);
  });

  it('returns false for normal content', () => {
    const content =
      'Artifact: RequestBrief\n' +
      'Workflow mode: feature\n' +
      'Original request: add a new command to the CLI\n' +
      'Status: complete\n' +
      'This is a well-formed artifact with enough content to pass the length check.';
    expect(isPlaceholderContent(content)).toBe(false);
  });
});

// ─── hasStatusMismatch ────────────────────────────────────────────────────────

describe('hasStatusMismatch', () => {
  it('returns true when artifact says blocked but lifecycle state is complete', () => {
    expect(hasStatusMismatch('blocked', 'complete')).toBe(true);
  });

  it('returns true when artifact says incomplete but lifecycle state is complete', () => {
    expect(hasStatusMismatch('incomplete', 'complete')).toBe(true);
  });

  it('returns true when artifact says complete but lifecycle state is blocked', () => {
    expect(hasStatusMismatch('complete', 'blocked')).toBe(true);
  });

  it('returns true when artifact says complete but lifecycle state is incomplete', () => {
    expect(hasStatusMismatch('complete', 'incomplete')).toBe(true);
  });

  it('returns false when both agree on complete', () => {
    expect(hasStatusMismatch('complete', 'complete')).toBe(false);
  });

  it('returns false when both agree on blocked', () => {
    expect(hasStatusMismatch('blocked', 'blocked')).toBe(false);
  });

  it('returns false when artifact status is undefined', () => {
    expect(hasStatusMismatch(undefined, 'complete')).toBe(false);
  });

  it('returns false when lifecycle state is undefined', () => {
    expect(hasStatusMismatch('complete', undefined)).toBe(false);
  });
});

// ─── resolveArtifactKind ──────────────────────────────────────────────────────

describe('resolveArtifactKind', () => {
  it('maps request-brief to RequestBrief', () => {
    expect(resolveArtifactKind('request-brief')).toBe('RequestBrief');
  });

  it('maps architecture-context to ArchitectureContextPacket', () => {
    expect(resolveArtifactKind('architecture-context')).toBe('ArchitectureContextPacket');
  });

  it('maps behavior-model to BehaviorModel', () => {
    expect(resolveArtifactKind('behavior-model')).toBe('BehaviorModel');
  });

  it('maps pseudocode-packet to PseudocodePacket', () => {
    expect(resolveArtifactKind('pseudocode-packet')).toBe('PseudocodePacket');
  });

  it('maps test-strategy to TestStrategyPacket', () => {
    expect(resolveArtifactKind('test-strategy')).toBe('TestStrategyPacket');
  });

  it('maps implementation to ImplementationReport', () => {
    expect(resolveArtifactKind('implementation')).toBe('ImplementationReport');
  });

  it('maps verification to VerificationReport', () => {
    expect(resolveArtifactKind('verification')).toBe('VerificationReport');
  });

  it('maps judge to JudgeReport', () => {
    expect(resolveArtifactKind('judge')).toBe('JudgeReport');
  });

  it('maps final-report to FinalReport', () => {
    expect(resolveArtifactKind('final-report')).toBe('FinalReport');
  });

  it('returns undefined for unknown stage name', () => {
    expect(resolveArtifactKind('unknown-stage')).toBeUndefined();
  });
});

// ─── getArtifactSectionRequirements ──────────────────────────────────────────

describe('getArtifactSectionRequirements', () => {
  it('returns requirements for RequestBrief', () => {
    const reqs = getArtifactSectionRequirements('RequestBrief');
    expect(reqs).toBeDefined();
    expect(reqs?.required).toContain('Artifact');
    expect(reqs?.required).toContain('Status');
    expect(reqs?.required).toContain('Original request');
  });

  it('returns requirements for JudgeReport including Verdict', () => {
    const reqs = getArtifactSectionRequirements('JudgeReport');
    expect(reqs?.required).toContain('Verdict');
  });

  it('returns requirements for FinalReport including Run ID', () => {
    const reqs = getArtifactSectionRequirements('FinalReport');
    expect(reqs?.required).toContain('Run ID');
  });

  it('returns undefined for unknown artifact kind', () => {
    expect(getArtifactSectionRequirements('UnknownKind')).toBeUndefined();
  });
});

// ─── checkArtifact ────────────────────────────────────────────────────────────

describe('checkArtifact — MISSING_FILE', () => {
  it('returns fail result when artifact file does not exist', () => {
    const tmp = makeTempDir();
    try {
      const rf = makeRunFolder(tmp);
      const result = checkArtifact(rf, 'artifacts/request-brief.txt', 'request-brief', emptyStateFile());
      expect(result.passed).toBe(false);
      expect(result.issues.some((i) => i.code === 'MISSING_FILE' && i.severity === 'fail')).toBe(true);
    } finally {
      cleanup(tmp);
    }
  });
});

describe('checkArtifact — MISSING_SECTION', () => {
  it('returns fail when a required section is absent', () => {
    const tmp = makeTempDir();
    try {
      const rf = makeRunFolder(tmp);
      // Missing "Original request" and other required sections
      writeArtifact(rf, 'artifacts/request-brief.txt',
        'Artifact: RequestBrief\nWorkflow mode: feature\nStatus: complete\n');
      const result = checkArtifact(rf, 'artifacts/request-brief.txt', 'request-brief', emptyStateFile());
      expect(result.passed).toBe(false);
      const missing = result.issues.filter((i) => i.code === 'MISSING_SECTION');
      expect(missing.length).toBeGreaterThan(0);
      expect(missing.some((i) => i.section === 'Original request')).toBe(true);
    } finally {
      cleanup(tmp);
    }
  });
});

describe('checkArtifact — EMPTY_SECTION', () => {
  it('returns warn when a required section is present but empty', () => {
    const tmp = makeTempDir();
    try {
      const rf = makeRunFolder(tmp);
      writeArtifact(rf, 'artifacts/request-brief.txt',
        'Artifact: RequestBrief\n' +
        'Workflow mode: feature\n' +
        'Original request:\n' +  // empty content
        'Requested change: something\n' +
        'Target area: CLI\n' +
        'User-visible or external behavior: visible\n' +
        'Constraints: none\n' +
        'Non-goals: nothing\n' +
        'Success criteria: done\n' +
        'Ambiguity or missing information: none\n' +
        'Expected next stage: architecture-context\n' +
        'Status: complete\n');
      const result = checkArtifact(rf, 'artifacts/request-brief.txt', 'request-brief', emptyStateFile());
      const empty = result.issues.filter((i) => i.code === 'EMPTY_SECTION');
      expect(empty.some((i) => i.section === 'Original request')).toBe(true);
      expect(empty[0].severity).toBe('warn');
    } finally {
      cleanup(tmp);
    }
  });
});

describe('checkArtifact — PLACEHOLDER_CONTENT', () => {
  it('returns warn for very short content', () => {
    const tmp = makeTempDir();
    try {
      const rf = makeRunFolder(tmp);
      writeArtifact(rf, 'artifacts/behavior-model.txt', 'short');
      const result = checkArtifact(rf, 'artifacts/behavior-model.txt', 'behavior-model', emptyStateFile());
      expect(result.issues.some((i) => i.code === 'PLACEHOLDER_CONTENT' && i.severity === 'warn')).toBe(true);
    } finally {
      cleanup(tmp);
    }
  });

  it('returns warn for content containing TODO', () => {
    const tmp = makeTempDir();
    try {
      const rf = makeRunFolder(tmp);
      writeArtifact(rf, 'artifacts/behavior-model.txt',
        'Artifact: BehaviorModel\nWorkflow mode: feature\nStatus: complete\nTODO fill this in\n' +
        'A'.repeat(100));
      const result = checkArtifact(rf, 'artifacts/behavior-model.txt', 'behavior-model', emptyStateFile());
      expect(result.issues.some((i) => i.code === 'PLACEHOLDER_CONTENT')).toBe(true);
    } finally {
      cleanup(tmp);
    }
  });

  it('does not warn for normal content', () => {
    const tmp = makeTempDir();
    try {
      const rf = makeRunFolder(tmp);
      writeArtifact(rf, 'artifacts/behavior-model.txt',
        'Artifact: BehaviorModel\nWorkflow mode: feature\nStatus: complete\n' +
        'This is a well-formed behavior model with enough content to pass all threshold checks.\n');
      const result = checkArtifact(rf, 'artifacts/behavior-model.txt', 'behavior-model', emptyStateFile());
      expect(result.issues.some((i) => i.code === 'PLACEHOLDER_CONTENT')).toBe(false);
    } finally {
      cleanup(tmp);
    }
  });
});

describe('checkArtifact — STATUS_MISMATCH', () => {
  it('returns warn when artifact says blocked but state says complete', () => {
    const tmp = makeTempDir();
    try {
      const rf = makeRunFolder(tmp);
      writeArtifact(rf, 'artifacts/behavior-model.txt',
        'Artifact: BehaviorModel\nWorkflow mode: feature\nStatus: blocked\n' +
        'A'.repeat(100));
      const stateFile: ArtifactStateFile = {
        version: '1',
        artifacts: {
          'artifacts/behavior-model.txt': {
            state: 'complete',
            updatedAt: new Date().toISOString(),
          },
        },
      };
      const result = checkArtifact(rf, 'artifacts/behavior-model.txt', 'behavior-model', stateFile);
      expect(result.issues.some((i) => i.code === 'STATUS_MISMATCH' && i.severity === 'warn')).toBe(true);
    } finally {
      cleanup(tmp);
    }
  });

  it('does not warn when artifact Status and lifecycle state agree', () => {
    const tmp = makeTempDir();
    try {
      const rf = makeRunFolder(tmp);
      writeArtifact(rf, 'artifacts/behavior-model.txt',
        'Artifact: BehaviorModel\nWorkflow mode: feature\nStatus: complete\n' +
        'A'.repeat(100));
      const stateFile: ArtifactStateFile = {
        version: '1',
        artifacts: {
          'artifacts/behavior-model.txt': {
            state: 'complete',
            updatedAt: new Date().toISOString(),
          },
        },
      };
      const result = checkArtifact(rf, 'artifacts/behavior-model.txt', 'behavior-model', stateFile);
      expect(result.issues.some((i) => i.code === 'STATUS_MISMATCH')).toBe(false);
    } finally {
      cleanup(tmp);
    }
  });
});

describe('checkArtifact — unknown kind graceful fallback', () => {
  it('passes for artifact with unknown stage name when file exists', () => {
    const tmp = makeTempDir();
    try {
      const rf = makeRunFolder(tmp);
      writeArtifact(rf, 'artifacts/some-new-artifact.txt',
        'Artifact: SomeNewKind\nStatus: complete\n' + 'A'.repeat(100));
      const result = checkArtifact(rf, 'artifacts/some-new-artifact.txt', 'unknown-stage', emptyStateFile());
      // No registry entry means no MISSING_SECTION fails
      expect(result.issues.filter((i) => i.severity === 'fail' && i.code === 'MISSING_SECTION').length).toBe(0);
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── checkAllArtifacts ────────────────────────────────────────────────────────

describe('checkAllArtifacts', () => {
  it('returns one result per required artifact in the run', () => {
    const tmp = makeTempDir();
    try {
      const rf = makeRunFolder(tmp);
      // Create a minimal run metadata with feature workflow stages
      const featureStages = getWorkflow('feature').stages;
      const meta = {
        runId: 'test-run',
        mode: 'feature' as const,
        request: 'test',
        projectRoot: tmp,
        runFolder: rf,
        createdAt: new Date().toISOString(),
        currentStage: 'request-brief',
        stages: featureStages,
        status: 'created' as const,
      };
      const results = checkAllArtifacts(meta, emptyStateFile());
      // feature mode has 10 stages
      expect(results.length).toBe(featureStages.length);
    } finally {
      cleanup(tmp);
    }
  });

  it('returns MISSING_FILE for all artifacts when none exist', () => {
    const tmp = makeTempDir();
    try {
      const rf = makeRunFolder(tmp);
      const featureStages = getWorkflow('feature').stages;
      const meta = {
        runId: 'test-run',
        mode: 'feature' as const,
        request: 'test',
        projectRoot: tmp,
        runFolder: rf,
        createdAt: new Date().toISOString(),
        currentStage: 'request-brief',
        stages: featureStages,
        status: 'created' as const,
      };
      const results = checkAllArtifacts(meta, emptyStateFile());
      expect(results.every((r) => r.issues.some((i) => i.code === 'MISSING_FILE'))).toBe(true);
      expect(results.every((r) => !r.passed)).toBe(true);
    } finally {
      cleanup(tmp);
    }
  });
});
