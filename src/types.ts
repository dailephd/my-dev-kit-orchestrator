export const VALID_MODES = ['feature', 'repair', 'test', 'refactor', 'harden', 'extraction'] as const;

export type WorkflowMode = typeof VALID_MODES[number];

export function isValidMode(value: string): value is WorkflowMode {
  return (VALID_MODES as readonly string[]).includes(value);
}

export interface GlobalOptions {
  root?: string;
  mode?: string;
  name?: string;
  run?: string;
  outputDir?: string;
}
