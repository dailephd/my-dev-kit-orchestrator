import { buildInstructionCatalog } from '../src/instructions/catalog';
import { assembleWorkflowInstructionPacket } from '../src/instructions/workflowInstructionPacket';
import { renderWorkflowInstructionPacket } from '../src/instructions/workflowInstructionPacketRenderer';

function renderedFeatureImplementation(): string {
  const result = assembleWorkflowInstructionPacket({
    catalog: buildInstructionCatalog(),
    workflowId: 'workflow.feature',
    stageId: 'stage.feature.implementation',
  });
  if (!result.ok) throw new Error('expected feature/implementation to assemble');
  return renderWorkflowInstructionPacket(result.packet);
}

describe('renderer', () => {
  it('is deterministic for identical packet input', () => {
    expect(renderedFeatureImplementation()).toBe(renderedFeatureImplementation());
  });

  it('contains the workflow ID and stage ID', () => {
    const text = renderedFeatureImplementation();
    expect(text).toContain('workflow.feature');
    expect(text).toContain('stage.feature.implementation');
  });

  it('contains task instructions', () => {
    const text = renderedFeatureImplementation();
    expect(text).toContain('Task:');
    expect(text).toContain('Implement the PseudocodePacket');
  });

  it('contains resolved rules', () => {
    const text = renderedFeatureImplementation();
    expect(text).toContain('rule.stage.no-implementation-before-pseudocode');
  });

  it('contains the report contract', () => {
    const text = renderedFeatureImplementation();
    expect(text).toContain('report.implementation');
  });

  it('contains a budget status section', () => {
    const text = renderedFeatureImplementation();
    expect(text).toContain('Budget:');
    expect(text).toContain('maxTotalCharacters');
  });

  it('contains an adequacy section', () => {
    const text = renderedFeatureImplementation();
    expect(text).toContain('Adequacy:');
    expect(text).toContain('adequate');
  });

  it('renders an explicit (none) placeholder for empty sections consistently', () => {
    const text = renderedFeatureImplementation();
    // feature/implementation resolves no commands in the current catalog.
    expect(text).toContain('Commands:\n  (none)');
    expect(text).toContain('Truncation:\n  (none)');
    expect(text).toContain('Warnings:\n  (none)');
  });

  it('does not include raw JSON', () => {
    const text = renderedFeatureImplementation();
    expect(text).not.toMatch(/^\s*\{/);
    expect(text).not.toContain('"schemaVersion"');
  });

  it('does not include run-specific paths', () => {
    const text = renderedFeatureImplementation();
    expect(text).not.toMatch(/[A-Za-z]:\\/);
    expect(text).not.toMatch(/\/Users\//);
    expect(text).not.toMatch(/run\.json/);
  });

  it('does not introduce unrelated instructions', () => {
    const text = renderedFeatureImplementation();
    for (const banned of [
      'npm publish',
      'npm version',
      'GitHub Release',
      'security:validate',
      'greenfield',
      'extraction',
      'Play Store',
    ]) {
      expect(text.toLowerCase()).not.toContain(banned.toLowerCase());
    }
  });
});
