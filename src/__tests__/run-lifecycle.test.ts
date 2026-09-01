import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createRun, loadRun } from '../run';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-run-lifecycle-'));
}

function completeArtifacts(runFolder: string, artifacts: string[]): void {
  for (const artifact of artifacts) {
    const fullPath = path.join(runFolder, artifact);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, 'done', 'utf8');
  }
}

describe('durable run lifecycle reconciliation', () => {
  it('keeps a newly created run in its coherent initial persisted state', () => {
    const root = makeTempDir();
    try {
      const created = createRun({ request: 'Add lifecycle coverage', mode: 'feature', projectRoot: root });
      const loaded = loadRun(created.runFolder);
      expect(loaded.status).toBe('created');
      expect(loaded.currentStage).toBe(created.stages[0].name);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('reconciles stale persisted stage metadata from canonical artifact state on reload', () => {
    const root = makeTempDir();
    try {
      const created = createRun({ request: 'Advance lifecycle state', mode: 'feature', projectRoot: root });
      completeArtifacts(created.runFolder, [created.stages[0].artifactFile]);
      const loaded = loadRun(created.runFolder);
      expect(loaded.status).toBe('in_progress');
      expect(loaded.currentStage).toBe(created.stages[1].name);
      const persisted = JSON.parse(fs.readFileSync(path.join(created.runFolder, 'run.json'), 'utf8'));
      expect(persisted.currentStage).toBe(created.stages[1].name);
      expect(persisted.status).toBe('in_progress');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
