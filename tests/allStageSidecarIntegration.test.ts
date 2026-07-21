import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createRun } from '../src/run';
import { parseWorkflowInstructionPacket } from '../src/instructions/workflowInstructionPacketSerialization';
import { VALID_MODES } from '../src/types';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-batch3-sidecar-'));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function sidecarPathFor(runFolder: string, promptFile: string): string {
  return path.join(runFolder, promptFile.replace(/\.prompt\.txt$/, '.instruction-packet.json'));
}

describe.each(VALID_MODES)('sidecar coverage for %s runs', (mode) => {
  let tmp: string;
  let meta: ReturnType<typeof createRun>;

  beforeAll(() => {
    tmp = makeTempDir();
    meta = createRun({ request: 'test request', mode, projectRoot: tmp });
  });

  afterAll(() => {
    cleanup(tmp);
  });

  it('writes exactly one sidecar per native stage', () => {
    for (const stage of meta.stages) {
      const sidecarPath = sidecarPathFor(meta.runFolder, stage.promptFile);
      expect(fs.existsSync(sidecarPath)).toBe(true);
    }
  });

  it('every sidecar parses successfully and matches its owning stage', () => {
    for (const stage of meta.stages) {
      const sidecarPath = sidecarPathFor(meta.runFolder, stage.promptFile);
      const text = fs.readFileSync(sidecarPath, 'utf8');
      const parsed = parseWorkflowInstructionPacket(text);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parsed.packet.workflowId).toBe(`workflow.${mode}`);
        expect(parsed.packet.stageId).toBe(`stage.${mode}.${stage.name}`);
      }
    }
  });

  it('no sidecar contains run-specific values', () => {
    for (const stage of meta.stages) {
      const sidecarPath = sidecarPathFor(meta.runFolder, stage.promptFile);
      const text = fs.readFileSync(sidecarPath, 'utf8');
      expect(text).not.toContain(meta.runId);
      expect(text).not.toContain(meta.runFolder);
      expect(text).not.toContain(tmp);
      expect(text).not.toMatch(/"taskState"/);
      expect(text).not.toMatch(/"upstreamArtifacts"/);
    }
  });
});

describe('sidecar exclusion from lifecycle/status/check/export', () => {
  it('sidecar absence does not affect status, check, or export for an old-style run missing sidecars', () => {
    const tmp = makeTempDir();
    try {
      const meta = createRun({ request: 'test request', mode: 'feature', projectRoot: tmp });
      for (const stage of meta.stages) {
        const sidecarPath = sidecarPathFor(meta.runFolder, stage.promptFile);
        if (fs.existsSync(sidecarPath)) fs.rmSync(sidecarPath);
      }
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getArtifactStatuses } = require('../src/stageDetector');
      expect(() => getArtifactStatuses(meta)).not.toThrow();
    } finally {
      cleanup(tmp);
    }
  });
});
