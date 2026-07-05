import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function writeFile(root: string, relPath: string, content: string): void {
  const fullPath = path.join(root, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
}

function makeFixture(
  readme: string,
  overrides: { workflows?: string } = {},
): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-docs-check-'));

  writeFile(
    root,
    'package.json',
    JSON.stringify({
      name: '@dailephd/my-dev-kit-orchestrator',
      version: '1.1.0',
    }),
  );
  writeFile(
    root,
    'src/types.ts',
    "export const VALID_MODES = ['feature', 'repair', 'test', 'refactor', 'harden', 'extraction', 'greenfield'] as const;\n",
  );
  writeFile(
    root,
    'src/greenfield/modes/greenfieldStages.ts',
    "export const GREENFIELD_STAGE_NAMES: string[] = ['idea-brief','product-boundary','stack-decision','starter-profile','bootstrap-bundle','project-docs','scaffold-plan','scaffold-implementation','first-vertical-slice','verification','initial-index','judge','final-report'];\n",
  );
  writeFile(
    root,
    'src/greenfield/modes/greenfieldMode.ts',
    "export const GREENFIELD_ARTIFACT_MAP: Record<string, string> = {'idea-brief':'artifacts/idea-brief.json','product-boundary':'artifacts/product-boundary.txt','stack-decision':'artifacts/stack-decision.txt','starter-profile':'artifacts/starter-profile.json','bootstrap-bundle':'artifacts/bootstrap-bundle.json','project-docs':'artifacts/project-docs-report.txt','scaffold-plan':'artifacts/scaffold-plan.txt','scaffold-implementation':'reports/scaffold-implementation-report.txt','first-vertical-slice':'artifacts/first-vertical-slice.txt','initial-index':'reports/initial-index-report.txt'};\n",
  );
  writeFile(
    root,
    'src/greenfield/profiles/resolveGreenfieldProfile.ts',
    "const SUPPORTED_PROFILES: Record<GreenfieldProfileId, GreenfieldProfile> = {\n" +
      "  'typescript-cli': TYPESCRIPT_CLI_PROFILE,\n" +
      "  'nextjs-app': NEXTJS_APP_PROFILE,\n" +
      "  'android-compose': ANDROID_COMPOSE_PROFILE,\n" +
      "};\n",
  );

  writeFile(root, 'README.md', readme);
  writeFile(root, 'CHANGELOG.md', '# Changelog\n\n## v1.1.0\n\nReleased.\n');
  writeFile(root, 'docs/ROADMAP.md', '# Roadmap\n\n`v1.1.0` is published.\n');
  writeFile(
    root,
    'docs/WORKFLOWS.md',
    overrides.workflows ??
      '`feature` `repair` `test` `refactor` `harden` `extraction` `greenfield`\n' +
        'supports the `typescript-cli`, `nextjs-app`, and `android-compose` profiles\n' +
        '`idea-brief` `product-boundary` `stack-decision` `starter-profile` `bootstrap-bundle` `project-docs` `scaffold-plan` `scaffold-implementation` `first-vertical-slice` `verification` `initial-index` `judge` `final-report`\n',
  );
  writeFile(
    root,
    'docs/ARTIFACTS.md',
    '`artifacts/idea-brief.json` `artifacts/product-boundary.txt` `artifacts/stack-decision.txt` `artifacts/starter-profile.json` `artifacts/bootstrap-bundle.json` `artifacts/project-docs-report.txt` `artifacts/scaffold-plan.txt` `reports/scaffold-implementation-report.txt` `artifacts/first-vertical-slice.txt` `reports/initial-index-report.txt` `artifacts/verification-report.txt` `artifacts/judge-report.txt` `artifacts/final-report.txt`\n',
  );
  writeFile(root, 'docs/USAGE.md', 'my-dev-kit-orchestrator check --artifacts\n');
  writeFile(root, 'docs/DEVELOPMENT.md', 'development\n');
  writeFile(root, 'docs/ARCHITECTURE.md', 'architecture\n');

  return root;
}

describe('docs consistency check script', () => {
  const scriptPath = path.resolve(__dirname, '..', '..', 'scripts', 'check-docs-consistency.mjs');

  it('fails when README contains a stale published-version claim', () => {
    const root = makeFixture(
      '# title\n\n' +
        '`v1.0.0` is the current published stable workflow contract release.\n\n' +
        'Current implementation also mentions `1.1.0` and `greenfield`.\n',
    );

    const result = spawnSync(process.execPath, [scriptPath, '--root', root], {
      encoding: 'utf8',
      windowsHide: true,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('README.md still claims v1.0.0 is the current published release');

    fs.rmSync(root, { recursive: true, force: true });
  });

  it('passes for a complete, accurate fixture (three source-derived profiles, no stale claims)', () => {
    const root = makeFixture(
      '# title\n\n`1.1.0` `greenfield` `feature` `repair` `test` `refactor` `harden` `extraction`\n' +
        '`typescript-cli` `nextjs-app` `android-compose`\n' +
        'The orchestrator does not run Gradle and does not require the Android SDK.\n',
    );

    const result = spawnSync(process.execPath, [scriptPath, '--root', root], {
      encoding: 'utf8',
      windowsHide: true,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('DOCS_CHECK_PASS');
    expect(result.stdout).toContain('3 greenfield profiles');

    fs.rmSync(root, { recursive: true, force: true });
  });

  it('fails when docs list only the two pre-v1.2.0 greenfield profiles (the known stale claim)', () => {
    const root = makeFixture(
      '# title\n\n`1.1.0` `greenfield` `feature` `repair` `test` `refactor` `harden` `extraction`\n' +
        '`typescript-cli` `nextjs-app`\n',
      {
        workflows:
          '`feature` `repair` `test` `refactor` `harden` `extraction` `greenfield`\n' +
          'supports the `typescript-cli` and `nextjs-app` profiles\n' +
          '`idea-brief` `product-boundary` `stack-decision` `starter-profile` `bootstrap-bundle` `project-docs` `scaffold-plan` `scaffold-implementation` `first-vertical-slice` `verification` `initial-index` `judge` `final-report`\n',
      },
    );

    const result = spawnSync(process.execPath, [scriptPath, '--root', root], {
      encoding: 'utf8',
      windowsHide: true,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Docs do not mention current greenfield profile android-compose');

    fs.rmSync(root, { recursive: true, force: true });
  });

  it('fails when docs state a fixed profile count that does not match source, even if all profile ids are also present', () => {
    const root = makeFixture(
      '# title\n\n`1.1.0` `greenfield` `feature` `repair` `test` `refactor` `harden` `extraction`\n' +
        '`typescript-cli` `nextjs-app` `android-compose`\n',
      {
        workflows:
          '`feature` `repair` `test` `refactor` `harden` `extraction` `greenfield`\n' +
          'supports the two supported profiles `typescript-cli`, `nextjs-app`, and `android-compose`\n' +
          '`idea-brief` `product-boundary` `stack-decision` `starter-profile` `bootstrap-bundle` `project-docs` `scaffold-plan` `scaffold-implementation` `first-vertical-slice` `verification` `initial-index` `judge` `final-report`\n',
      },
    );

    const result = spawnSync(process.execPath, [scriptPath, '--root', root], {
      encoding: 'utf8',
      windowsHide: true,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Docs state a greenfield profile count that does not match source');

    fs.rmSync(root, { recursive: true, force: true });
  });

  it('does not false-positive on a correct "supports Android Compose" claim (source-derived, not the old hardcoded rejection)', () => {
    const root = makeFixture(
      '# title\n\n`1.1.0` `greenfield` `feature` `repair` `test` `refactor` `harden` `extraction`\n' +
        '`typescript-cli` `nextjs-app` `android-compose`\n' +
        'This release supports Android Compose as a greenfield starter profile.\n',
    );

    const result = spawnSync(process.execPath, [scriptPath, '--root', root], {
      encoding: 'utf8',
      windowsHide: true,
    });

    expect(result.status).toBe(0);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it('fails when docs make an unnegated generic mobile/iOS/Flutter/React Native support claim', () => {
    const root = makeFixture(
      '# title\n\n`1.1.0` `greenfield` `feature` `repair` `test` `refactor` `harden` `extraction`\n' +
        '`typescript-cli` `nextjs-app` `android-compose`\n' +
        'This release supports mobile app development end to end.\n',
    );

    const result = spawnSync(process.execPath, [scriptPath, '--root', root], {
      encoding: 'utf8',
      windowsHide: true,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('generic mobile support claim');

    fs.rmSync(root, { recursive: true, force: true });
  });

  it('does not false-positive on a correct negated Gradle/Android-SDK/Play-Store disclaimer', () => {
    const root = makeFixture(
      '# title\n\n`1.1.0` `greenfield` `feature` `repair` `test` `refactor` `harden` `extraction`\n' +
        '`typescript-cli` `nextjs-app` `android-compose`\n' +
        'The orchestrator does not run Gradle, does not require the Android SDK, ' +
        'and does not claim Play Store readiness.\n',
    );

    const result = spawnSync(process.execPath, [scriptPath, '--root', root], {
      encoding: 'utf8',
      windowsHide: true,
    });

    expect(result.status).toBe(0);

    fs.rmSync(root, { recursive: true, force: true });
  });
});
