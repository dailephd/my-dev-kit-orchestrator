import * as fs from 'fs';
import * as path from 'path';

export const WORKSPACE_DIR = '.my-dev-kit-orchestrator';
export const RUNS_DIR = 'runs';

export interface WorkspaceConfig {
  projectRoot: string;
  runDirectory: string;
  createdAt: string;
  version: string;
}

export function getWorkspaceRoot(projectRoot: string): string {
  return path.join(projectRoot, WORKSPACE_DIR);
}

export function getRunsDir(projectRoot: string): string {
  return path.join(projectRoot, WORKSPACE_DIR, RUNS_DIR);
}

export function initWorkspace(projectRoot: string): void {
  const workspaceDir = getWorkspaceRoot(projectRoot);
  const runsDir = path.join(workspaceDir, RUNS_DIR);

  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.mkdirSync(runsDir, { recursive: true });

  const configPath = path.join(workspaceDir, 'config.json');
  if (!fs.existsSync(configPath)) {
    const config: WorkspaceConfig = {
      projectRoot,
      runDirectory: runsDir,
      createdAt: new Date().toISOString(),
      version: '0.1.0',
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  }
}

export function workspaceExists(projectRoot: string): boolean {
  return fs.existsSync(getWorkspaceRoot(projectRoot));
}
