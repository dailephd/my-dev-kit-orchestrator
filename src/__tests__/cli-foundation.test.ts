import { createProgram } from '../program';
import { VALID_MODES, isValidMode } from '../types';

describe('CLI program', () => {
  it('has the correct name', () => {
    const program = createProgram();
    expect(program.name()).toBe('my-dev-kit-orchestrator');
  });

  it('has version 0.6.0', () => {
    const program = createProgram();
    expect(program.version()).toBe('0.6.0');
  });

  it('registers init command', () => {
    const program = createProgram();
    const names = program.commands.map((c) => c.name());
    expect(names).toContain('init');
  });

  it('registers start command', () => {
    const program = createProgram();
    const names = program.commands.map((c) => c.name());
    expect(names).toContain('start');
  });

  it('registers status command', () => {
    const program = createProgram();
    const names = program.commands.map((c) => c.name());
    expect(names).toContain('status');
  });

  it('registers prompt command', () => {
    const program = createProgram();
    const names = program.commands.map((c) => c.name());
    expect(names).toContain('prompt');
  });

  it('registers list command', () => {
    const program = createProgram();
    const names = program.commands.map((c) => c.name());
    expect(names).toContain('list');
  });

  it('registers mark command', () => {
    const program = createProgram();
    const names = program.commands.map((c) => c.name());
    expect(names).toContain('mark');
  });

  it('does not register unsupported v0.1.0 commands', () => {
    const program = createProgram();
    const names = program.commands.map((c) => c.name());
    const unsupported = [
      'agent',
      'workflow',
      'schema',
      'artifact',
      'graph',
      'trace',
      'judge',
      'repair',
      'context',
      'run',
    ];
    for (const name of unsupported) {
      expect(names).not.toContain(name);
    }
  });

  it('command surface has exactly the v1.0.0 commands', () => {
    const program = createProgram();
    const names = program.commands.map((c) => c.name()).sort();
    expect(names).toEqual(['check', 'export', 'init', 'list', 'mark', 'prompt', 'start', 'status']);
  });

  it('describes the staged workflow including test implementation', () => {
    const program = createProgram();
    expect(program.description()).toContain('test implementation');
  });
});

describe('mode validation', () => {
  it('accepts all valid modes', () => {
    for (const mode of VALID_MODES) {
      expect(isValidMode(mode)).toBe(true);
    }
  });

  it('accepts feature', () => {
    expect(isValidMode('feature')).toBe(true);
  });

  it('accepts repair', () => {
    expect(isValidMode('repair')).toBe(true);
  });

  it('accepts test', () => {
    expect(isValidMode('test')).toBe(true);
  });

  it('accepts refactor', () => {
    expect(isValidMode('refactor')).toBe(true);
  });

  it('accepts harden', () => {
    expect(isValidMode('harden')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidMode('')).toBe(false);
  });

  it('rejects unknown mode', () => {
    expect(isValidMode('debug')).toBe(false);
  });

  it('rejects case variants', () => {
    expect(isValidMode('Feature')).toBe(false);
    expect(isValidMode('REPAIR')).toBe(false);
  });

  it('rejects partial mode names', () => {
    expect(isValidMode('feat')).toBe(false);
  });

  it('VALID_MODES contains exactly six modes', () => {
    expect(VALID_MODES).toHaveLength(6);
  });

  it('accepts extraction', () => {
    expect(isValidMode('extraction')).toBe(true);
  });
});

describe('start command options', () => {
  it('start command has --mode option', () => {
    const program = createProgram();
    const startCmd = program.commands.find((c) => c.name() === 'start')!;
    const optionNames = startCmd.options.map((o) => o.long);
    expect(optionNames).toContain('--mode');
  });

  it('start command has --root option', () => {
    const program = createProgram();
    const startCmd = program.commands.find((c) => c.name() === 'start')!;
    const optionNames = startCmd.options.map((o) => o.long);
    expect(optionNames).toContain('--root');
  });

  it('start command has --name option', () => {
    const program = createProgram();
    const startCmd = program.commands.find((c) => c.name() === 'start')!;
    const optionNames = startCmd.options.map((o) => o.long);
    expect(optionNames).toContain('--name');
  });

  it('start command has --output-dir option', () => {
    const program = createProgram();
    const startCmd = program.commands.find((c) => c.name() === 'start')!;
    const optionNames = startCmd.options.map((o) => o.long);
    expect(optionNames).toContain('--output-dir');
  });

  it('start command has --source option for extraction mode', () => {
    const program = createProgram();
    const startCmd = program.commands.find((c) => c.name() === 'start')!;
    const optionNames = startCmd.options.map((o) => o.long);
    expect(optionNames).toContain('--source');
  });

  it('start command has --target option for extraction mode', () => {
    const program = createProgram();
    const startCmd = program.commands.find((c) => c.name() === 'start')!;
    const optionNames = startCmd.options.map((o) => o.long);
    expect(optionNames).toContain('--target');
  });
});

describe('status command options', () => {
  it('status command has --run option', () => {
    const program = createProgram();
    const statusCmd = program.commands.find((c) => c.name() === 'status')!;
    const optionNames = statusCmd.options.map((o) => o.long);
    expect(optionNames).toContain('--run');
  });

  it('status command has --root option', () => {
    const program = createProgram();
    const statusCmd = program.commands.find((c) => c.name() === 'status')!;
    const optionNames = statusCmd.options.map((o) => o.long);
    expect(optionNames).toContain('--root');
  });
});

describe('prompt command options', () => {
  it('prompt command has --run option', () => {
    const program = createProgram();
    const promptCmd = program.commands.find((c) => c.name() === 'prompt')!;
    const optionNames = promptCmd.options.map((o) => o.long);
    expect(optionNames).toContain('--run');
  });
});

describe('list command options', () => {
  it('list command has --mode option', () => {
    const program = createProgram();
    const listCmd = program.commands.find((c) => c.name() === 'list')!;
    const optionNames = listCmd.options.map((o) => o.long);
    expect(optionNames).toContain('--mode');
  });
});

describe('init command options', () => {
  it('init command has --root option', () => {
    const program = createProgram();
    const initCmd = program.commands.find((c) => c.name() === 'init')!;
    const optionNames = initCmd.options.map((o) => o.long);
    expect(optionNames).toContain('--root');
  });
});

describe('mark command options', () => {
  it('mark command has --state option', () => {
    const program = createProgram();
    const markCmd = program.commands.find((c) => c.name() === 'mark')!;
    const optionNames = markCmd.options.map((o) => o.long);
    expect(optionNames).toContain('--state');
  });

  it('mark command has --reason option', () => {
    const program = createProgram();
    const markCmd = program.commands.find((c) => c.name() === 'mark')!;
    const optionNames = markCmd.options.map((o) => o.long);
    expect(optionNames).toContain('--reason');
  });

  it('mark command has --run option', () => {
    const program = createProgram();
    const markCmd = program.commands.find((c) => c.name() === 'mark')!;
    const optionNames = markCmd.options.map((o) => o.long);
    expect(optionNames).toContain('--run');
  });

  it('mark command has --root option', () => {
    const program = createProgram();
    const markCmd = program.commands.find((c) => c.name() === 'mark')!;
    const optionNames = markCmd.options.map((o) => o.long);
    expect(optionNames).toContain('--root');
  });
});
