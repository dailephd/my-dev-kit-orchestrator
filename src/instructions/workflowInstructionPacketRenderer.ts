// Bounded human-readable rendering of a WorkflowInstructionPacket for
// inclusion in a single generated prompt. The renderer never adds run
// metadata, project paths, request text, or instructions unrelated to the
// packet's own resolved content -- those remain prompt-owned (see
// promptGenerator.ts's header()/Inputs:/Output file: handling).
//
// Empty-section policy: every section is always rendered with an explicit
// "(none)" placeholder when it has no entries, rather than being omitted --
// this keeps section presence (and therefore byte layout) identical across
// packets regardless of content, which is what backs renderer determinism.

import { WorkflowInstructionPacket } from './workflowInstructionPacket';

function renderList(items: string[]): string {
  if (items.length === 0) return '  (none)';
  return items.map((item) => `  - ${item}`).join('\n');
}

function renderCommands(packet: WorkflowInstructionPacket): string {
  if (packet.resolvedCommands.length === 0) return '  (none)';
  return packet.resolvedCommands
    .map((c) => `  - ${c.id} [${c.included}] (${c.sideEffect}): ${c.purpose}`)
    .join('\n');
}

function renderRules(packet: WorkflowInstructionPacket): string {
  if (packet.resolvedRules.length === 0) return '  (none)';
  return packet.resolvedRules
    .map((r) => `  - ${r.id} [${r.included}] (depth ${r.depth}): ${r.instruction}`)
    .join('\n');
}

function renderBudget(packet: WorkflowInstructionPacket): string {
  const lines = packet.budget.findings.map((f) => {
    const limit = f.declaredLimit === null ? 'unlimited' : String(f.declaredLimit);
    const status = f.overLimit ? 'OVER' : 'ok';
    return `  - ${f.limitName}: used ${f.used} / limit ${limit} [${status}]`;
  });
  lines.push(`  total characters: ${packet.budget.totalCharacters}`);
  return lines.join('\n');
}

function renderTruncation(packet: WorkflowInstructionPacket): string {
  if (!packet.truncation.truncated) return '  (none)';
  return packet.truncation.records
    .map(
      (r) =>
        `  - dropped ${r.rootOptionalEntryId} (limit ${r.limitingField}, used ${r.usedBefore} -> attempted ${r.attemptedAfter} / declared ${r.declaredLimit ?? 'unlimited'}): ${r.reason}`,
    )
    .join('\n');
}

function renderAdequacy(packet: WorkflowInstructionPacket): string {
  const lines = [`  status: ${packet.adequacy.status}`];
  if (packet.adequacy.reasons.length > 0) {
    lines.push(`  reasons:`);
    for (const reason of packet.adequacy.reasons) lines.push(`    - ${reason}`);
  }
  return lines.join('\n');
}

export function renderWorkflowInstructionPacket(packet: WorkflowInstructionPacket): string {
  const sections: string[] = [];

  sections.push('Workflow instruction packet:');
  sections.push(`  Schema version: ${packet.schemaVersion}`);
  sections.push(`  Catalog version: ${packet.catalogVersion}`);
  sections.push(`  Workflow ID: ${packet.workflowId}`);
  sections.push(`  Stage ID: ${packet.stageId}`);
  sections.push('');

  sections.push('Task:');
  sections.push(packet.primaryEntry.taskInstructions || '(none)');
  sections.push('');

  sections.push('Commands:');
  sections.push(renderCommands(packet));
  sections.push('');

  sections.push('Rules:');
  sections.push(renderRules(packet));
  sections.push('');

  sections.push('Validation requirements:');
  sections.push(renderList(packet.validationRequirements));
  sections.push('');

  sections.push('Stop conditions:');
  sections.push(renderList(packet.stopConditions));
  sections.push('');

  sections.push('Report contract:');
  sections.push(`  ${packet.reportContract.id} (${packet.reportContract.artifactKind}): ${packet.reportContract.purpose}`);
  sections.push('');

  sections.push('Budget:');
  sections.push(renderBudget(packet));
  sections.push('');

  sections.push('Truncation:');
  sections.push(renderTruncation(packet));
  sections.push('');

  sections.push('Adequacy:');
  sections.push(renderAdequacy(packet));
  sections.push('');

  sections.push('Warnings:');
  sections.push(renderList(packet.warnings));

  return sections.join('\n');
}
