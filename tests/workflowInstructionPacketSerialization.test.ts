import { buildInstructionCatalog } from '../src/instructions/catalog';
import { assembleWorkflowInstructionPacket, WorkflowInstructionPacket } from '../src/instructions/workflowInstructionPacket';
import {
  serializeWorkflowInstructionPacket,
  parseWorkflowInstructionPacket,
} from '../src/instructions/workflowInstructionPacketSerialization';

function assembledPacket(): WorkflowInstructionPacket {
  const result = assembleWorkflowInstructionPacket({
    catalog: buildInstructionCatalog(),
    workflowId: 'workflow.feature',
    stageId: 'stage.feature.implementation',
  });
  if (!result.ok) throw new Error('expected feature/implementation to assemble');
  return result.packet;
}

describe('canonical serialization', () => {
  it('repeated serialization is byte-identical', () => {
    const packet = assembledPacket();
    expect(serializeWorkflowInstructionPacket(packet)).toBe(serializeWorkflowInstructionPacket(packet));
  });

  it('object key order is stable regardless of insertion order', () => {
    const packet = assembledPacket();
    const reordered = JSON.parse(JSON.stringify(packet));
    const reorderedFlipped: Record<string, unknown> = {};
    for (const key of Object.keys(reordered).reverse()) {
      reorderedFlipped[key] = reordered[key];
    }
    expect(serializeWorkflowInstructionPacket(reorderedFlipped as unknown as WorkflowInstructionPacket)).toBe(
      serializeWorkflowInstructionPacket(packet),
    );
  });

  it('uses two-space indentation', () => {
    const text = serializeWorkflowInstructionPacket(assembledPacket());
    expect(text).toMatch(/\{\n  "/);
  });

  it('ends with exactly one newline', () => {
    const text = serializeWorkflowInstructionPacket(assembledPacket());
    expect(text.endsWith('\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
  });

  it('contains no generatedAt/timestamp field', () => {
    const text = serializeWorkflowInstructionPacket(assembledPacket());
    expect(text).not.toMatch(/generatedAt/i);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('contains no absolute worktree path, run ID, run folder, or temp path', () => {
    const text = serializeWorkflowInstructionPacket(assembledPacket());
    expect(text).not.toMatch(/[A-Za-z]:\\/);
    expect(text).not.toMatch(/\/Users\//);
    expect(text).not.toMatch(/runId/i);
    expect(text).not.toMatch(/runFolder/i);
    expect(text).not.toMatch(/temp/i);
  });

  it('parse then reserialize is byte-identical to the original serialization', () => {
    const packet = assembledPacket();
    const serialized = serializeWorkflowInstructionPacket(packet);
    const parsed = parseWorkflowInstructionPacket(serialized);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(serializeWorkflowInstructionPacket(parsed.packet)).toBe(serialized);
    }
  });
});

describe('schema-major parsing and validation', () => {
  it('rejects invalid JSON', () => {
    const result = parseWorkflowInstructionPacket('not json{');
    expect(result.ok).toBe(false);
  });

  it('rejects a non-object JSON value', () => {
    const result = parseWorkflowInstructionPacket('[1,2,3]');
    expect(result.ok).toBe(false);
  });

  it('rejects an unsupported schema major', () => {
    const packet = assembledPacket();
    const serialized = serializeWorkflowInstructionPacket({ ...packet, schemaVersion: '2.0.0' });
    const result = parseWorkflowInstructionPacket(serialized);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.code === 'PACKET_PARSE_UNSUPPORTED_SCHEMA_MAJOR')).toBe(true);
  });

  it('accepts a compatible minor/patch under the supported major', () => {
    const packet = assembledPacket();
    const serialized = serializeWorkflowInstructionPacket({ ...packet, schemaVersion: '1.9.3' });
    const result = parseWorkflowInstructionPacket(serialized);
    expect(result.ok).toBe(true);
  });

  it('rejects a malformed required field (missing resolvedRules)', () => {
    const packet = assembledPacket() as unknown as Record<string, unknown>;
    const { resolvedRules: _drop, ...rest } = packet;
    const result = parseWorkflowInstructionPacket(JSON.stringify(rest));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.code === 'PACKET_PARSE_MISSING_REQUIRED_FIELD')).toBe(true);
  });

  it('rejects an incorrect primaryEntry kind', () => {
    const packet = assembledPacket();
    const corrupted = { ...packet, primaryEntry: { ...packet.primaryEntry, kind: 'workflow' } };
    const result = parseWorkflowInstructionPacket(serializeWorkflowInstructionPacket(corrupted as never));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.code === 'PACKET_PARSE_INVALID_ENTRY_KIND')).toBe(true);
  });

  it('rejects duplicate resolved command IDs', () => {
    const packet = assembledPacket();
    const withDuplicate = {
      ...packet,
      resolvedCommands: [
        { id: 'command.my-dev-kit.index', kind: 'command', title: 't', description: 'd', owner: 'o', command: 'c', purpose: 'p', sideEffect: 'read-only', included: 'required' },
        { id: 'command.my-dev-kit.index', kind: 'command', title: 't', description: 'd', owner: 'o', command: 'c', purpose: 'p', sideEffect: 'read-only', included: 'required' },
      ],
    };
    const result = parseWorkflowInstructionPacket(serializeWorkflowInstructionPacket(withDuplicate as never));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.code === 'PACKET_PARSE_DUPLICATE_RESOLVED_ID')).toBe(true);
  });
});
