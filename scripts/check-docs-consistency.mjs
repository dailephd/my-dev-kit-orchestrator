import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function parseArgs(argv) {
  const result = { root: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--root' || !argv[index + 1]) {
      throw new Error(argv[index] === '--root' ? '--root requires a value' : `Unknown argument: ${argv[index]}`);
    }
    result.root = path.resolve(argv[index + 1]);
    index += 1;
  }
  return result;
}

const readText = (root, relPath) => fs.readFileSync(path.join(root, relPath), 'utf8');
const readJson = (root, relPath) => JSON.parse(readText(root, relPath));
const quotedItems = (source) => [...source.matchAll(/'([^']+)'/g)].map((match) => match[1]);

function extractArray(source, pattern, owner) {
  const match = source.match(pattern);
  if (!match) throw new Error(`Could not extract ${owner}`);
  return quotedItems(match[1]);
}

function extractModes(root) {
  return extractArray(
    readText(root, 'src/types.ts'),
    /VALID_MODES\s*=\s*\[([\s\S]*?)\]\s*as const/,
    'VALID_MODES from src/types.ts',
  );
}

function extractWorkflowFacts(root) {
  const source = readText(root, 'src/workflows.ts');
  const workflows = {};
  for (const match of source.matchAll(/const ([A-Z]+)_STAGES\s*=\s*buildStages\(\[([\s\S]*?)\]\);/g)) {
    workflows[match[1].toLowerCase()] = quotedItems(match[2]);
  }
  workflows.greenfield = extractArray(
    readText(root, 'src/greenfield/modes/greenfieldStages.ts'),
    /GREENFIELD_STAGE_NAMES:\s*string\[\]\s*=\s*\[([\s\S]*?)\]/,
    'GREENFIELD_STAGE_NAMES',
  );
  return {
    stageOrderByMode: workflows,
    nativeStageCount: Object.values(workflows).reduce((total, stages) => total + stages.length, 0),
  };
}

function extractCliCommands(root) {
  const program = readText(root, 'src/program.ts');
  const factories = [...program.matchAll(/program\.addCommand\((make[A-Za-z]+Command)\(\)\);/g)].map((match) => match[1]);
  return factories.map((factory) => {
    const commandFile = factory.replace(/^make/, '').replace(/Command$/, '');
    const relPath = `src/commands/${commandFile[0].toLowerCase()}${commandFile.slice(1)}.ts`;
    const match = readText(root, relPath).match(/new Command\('([^']+)'\)/);
    if (!match) throw new Error(`Could not extract command name from ${relPath}`);
    return match[1];
  });
}

function extractGreenfieldProfiles(root) {
  return extractArray(
    readText(root, 'src/greenfield/profiles/resolveGreenfieldProfile.ts'),
    /SUPPORTED_PROFILES:\s*Record<GreenfieldProfileId,\s*GreenfieldProfile>\s*=\s*\{([\s\S]*?)\}/,
    'SUPPORTED_PROFILES',
  );
}

function extractContextFacts(root) {
  const source = readText(root, 'src/instructions/stageRepositoryEvidenceRequirements.ts');
  const orderedRequirements = [...source.matchAll(/(implementationRequirement|testImplementationRequirement)\('([^']+)'\)/g)].map(
    (match) => ({ kind: match[1] === 'implementationRequirement' ? 'implementation' : 'test', stageId: match[2] }),
  );
  const implementationStages = orderedRequirements.filter(({ kind }) => kind === 'implementation').map(({ stageId }) => stageId);
  const testStages = orderedRequirements.filter(({ kind }) => kind === 'test').map(({ stageId }) => stageId);
  const fixedPaths = [...source.matchAll(/export const [A-Z_]+_RELATIVE_PATH\s*=\s*(?:\r?\n\s*)?'([^']+)'/g)].map(
    (match) => match[1],
  );
  return {
    implementationStages,
    testStages,
    contextSensitiveStages: orderedRequirements.map(({ stageId }) => stageId),
    fixedPaths,
  };
}

function extractConstant(root, relPath, constant) {
  const match = readText(root, relPath).match(new RegExp(`export const ${constant}\\s*=\\s*'([^']+)'`));
  if (!match) throw new Error(`Could not extract ${constant} from ${relPath}`);
  return match[1];
}

function extractSchemaVersions(root) {
  return {
    catalogSchema: extractConstant(root, 'src/instructions/catalogTypes.ts', 'CATALOG_SCHEMA_VERSION'),
    catalogVersion: extractConstant(root, 'src/instructions/catalogTypes.ts', 'CATALOG_VERSION'),
    workflowInstructionPacket: extractConstant(
      root,
      'src/instructions/workflowInstructionPacket.ts',
      'WORKFLOW_INSTRUCTION_PACKET_SCHEMA_VERSION',
    ),
    taskState: extractConstant(root, 'src/instructions/taskState.ts', 'TASK_STATE_SCHEMA_VERSION'),
    stageContextBundle: extractConstant(
      root,
      'src/instructions/stageContextBundle.ts',
      'STAGE_CONTEXT_BUNDLE_SCHEMA_VERSION',
    ),
    supplementalContextPacket: extractConstant(
      root,
      'src/instructions/supplementalContextTypes.ts',
      'SUPPLEMENTAL_CONTEXT_PACKET_SCHEMA_VERSION',
    ),
    supplementalContextRetrievalReport: extractConstant(
      root,
      'src/instructions/supplementalContextTypes.ts',
      'SUPPLEMENTAL_CONTEXT_RETRIEVAL_REPORT_SCHEMA_VERSION',
    ),
    contextReadiness: extractConstant(
      root,
      'src/instructions/contextReadiness.ts',
      'CONTEXT_READINESS_SCHEMA_VERSION',
    ),
  };
}

function collectDocs(root, canonicalDocuments) {
  return canonicalDocuments.map((relPath) => ({ relPath, content: readText(root, relPath) }));
}

function section(text, heading, nextHeadingLevel = 2) {
  const start = text.indexOf(heading);
  if (start === -1) return '';
  const next = text.indexOf(`\n${'#'.repeat(nextHeadingLevel)} `, start + heading.length);
  return next === -1 ? text.slice(start) : text.slice(start, next);
}

function containsUnnegatedClaim(text, claimRegex, window = 55) {
  const flags = claimRegex.flags.includes('g') ? claimRegex.flags : `${claimRegex.flags}g`;
  const regex = new RegExp(claimRegex.source, flags);
  const negation = /\b(not|never|no|without|does not|doesn't|did not|didn't|has no|isn't|is not|remains manual)\b/i;
  for (const match of text.matchAll(regex)) {
    if (!negation.test(text.slice(Math.max(0, match.index - window), match.index + match[0].length))) return true;
  }
  return false;
}

function addIssue(issues, code, documentPath, expected, actual, action) {
  issues.push({ code, documentPath, expected, actual, action });
}

function topLevelHeadings(content) {
  return [...content.matchAll(/^## (.+)$/gm)].map((match) => match[1].trim());
}

function matchesPattern(value, pattern) {
  return new RegExp(pattern, 'i').test(value);
}

function structuralPlanningCode(documentPath) {
  return {
    'docs/ARCHITECTURE.md': 'DOC_ARCHITECTURE_CANDIDATE_CONTENT',
    'docs/WORKFLOWS.md': 'DOC_WORKFLOW_PLANNED_SEQUENCE',
    'docs/ARTIFACTS.md': 'DOC_ARTIFACT_PLANNED_CONTRACT',
    'docs/USAGE.md': 'DOC_USAGE_UNIMPLEMENTED_BEHAVIOR',
    'docs/DEVELOPMENT.md': 'DOC_DEVELOPMENT_CANDIDATE_ARCHITECTURE',
    'docs/ROADMAP.md': 'DOC_ROADMAP_BATCH_LOG_CONTAMINATION',
    'CHANGELOG.md': 'DOC_CHANGELOG_BATCH_LOG_CONTAMINATION',
  }[documentPath] ?? 'DOC_STRUCTURE_PLANNING_OUTSIDE_PROJECT_PLAN';
}

function validateDocumentStructures(issues, manifest, byPath) {
  for (const [documentPath, contract] of Object.entries(manifest.documentStructures ?? {})) {
    const content = byPath[documentPath] ?? '';
    const headings = topLevelHeadings(content);

    for (const required of contract.requiredTopLevelHeadings ?? []) {
      if (!headings.includes(required)) {
        addIssue(issues, 'DOC_REQUIRED_HEADING_MISSING', documentPath, required, 'missing', 'Restore the required top-level heading defined by the preservation manifest.');
      }
    }

    const allowedPatterns = contract.allowedTopLevelHeadingPatterns ?? [];
    if (allowedPatterns.length > 0) {
      for (const heading of headings) {
        if (!allowedPatterns.some((pattern) => matchesPattern(heading, pattern))) {
          addIssue(issues, 'DOC_DOCUMENT_STRUCTURE_MISMATCH', documentPath, 'top-level heading allowed by the preservation manifest', heading, 'Move, rename, or remove the unexpected top-level section.');
        }
      }
    }

    for (const pattern of contract.forbiddenTopLevelHeadingPatterns ?? []) {
      for (const heading of headings.filter((candidate) => matchesPattern(candidate, pattern))) {
        addIssue(issues, 'DOC_STRUCTURE_FORBIDDEN_PLANNED_SECTION', documentPath, `heading not matching ${pattern}`, heading, 'Remove the prohibited planning section and integrate current facts into the document structure.');
        addIssue(issues, structuralPlanningCode(documentPath), documentPath, 'current-state content within the document purpose', heading, 'Move detailed planning to the local plan or rewrite the section as current behavior.');
        if (documentPath === 'docs/ARCHITECTURE.md' && /^(?:Unreleased|Current|Implemented) v\d+\.\d+\.\d+.*architecture/i.test(heading)) {
          addIssue(issues, 'DOC_DOCUMENT_STRUCTURE_MISMATCH', documentPath, 'current architecture organized by component', heading, 'Integrate the implemented architecture into normal component sections.');
        }
      }
    }

    for (const pattern of contract.forbiddenContentPatterns ?? []) {
      const match = content.match(new RegExp(pattern, 'im'));
      if (match) {
        addIssue(issues, structuralPlanningCode(documentPath), documentPath, `content not matching ${pattern}`, match[0], 'Remove detailed planning or candidate content from the committed document.');
        if (/planned|candidate|conceptual|implementation-time|migration/i.test(match[0])) {
          addIssue(issues, 'DOC_STRUCTURE_PLANNING_OUTSIDE_PROJECT_PLAN', documentPath, 'current-state documentation without detailed planning', match[0], 'Keep detailed implementation planning only in the local untracked plan.');
        }
      }
    }

    for (const group of contract.orderedHeadingGroups ?? []) {
      let cursor = -1;
      for (const heading of group) {
        const index = headings.indexOf(heading);
        if (index === -1) continue;
        if (index < cursor) {
          addIssue(issues, 'DOC_HEADING_ORDER_MISMATCH', documentPath, group.join(' -> '), headings.join(' -> '), 'Restore the manifest-defined major heading order.');
          break;
        }
        cursor = index;
      }
    }
  }
}

function checkProjectPlanBoundary(issues, root, docs) {
  const tracked = spawnSync('git', ['ls-files', '--error-unmatch', 'project_plan.txt'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (tracked.status === 0) {
    addIssue(issues, 'DOC_PROJECT_PLAN_TRACKED', 'project_plan.txt', 'local untracked file', 'tracked by Git', 'Remove the project plan from committed scope through an explicitly authorized index change.');
  }

  const publicLinkPattern = /\[[^\]]*\]\([^\n)]*project_plan\.txt[^\n)]*\)|\b(?:read|see|consult|open|documentation)\b[^\n]{0,60}\bproject_plan\.txt\b|\bproject_plan\.txt\b[^\n]{0,60}\b(?:public|documentation|guide)\b/i;
  for (const { relPath, content } of docs) {
    const match = content.match(publicLinkPattern);
    if (match) {
      addIssue(issues, 'DOC_PROJECT_PLAN_PUBLIC_LINK', relPath, 'no public link or reading instruction for project_plan.txt', match[0], 'Remove the public dependency on the local untracked plan.');
    }
  }
}

function requireTokens(issues, documentPath, content, tokens, code = 'DOC_REQUIRED_FACT_MISSING') {
  for (const token of tokens) {
    if (!content.toLowerCase().includes(token.toLowerCase())) {
      addIssue(issues, code, documentPath, `claim containing ${JSON.stringify(token)}`, 'missing', `Add the verified fact token ${JSON.stringify(token)}.`);
    }
  }
}

function compareFact(issues, documentPath, label, expected, actual) {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    addIssue(
      issues,
      'MANIFEST_FACT_DRIFT',
      documentPath,
      `${label}=${JSON.stringify(expected)}`,
      `${label}=${JSON.stringify(actual)}`,
      'Update documentation metadata from the live implementation owner.',
    );
  }
}

function checkWrongCountClaims(issues, docs, label, expected, nounPattern, code) {
  const numberWords = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, thirteen: 13, 'seventy-seven': 77 };
  const regex = new RegExp(`\\b(\\d+|${Object.keys(numberWords).join('|')})\\s+${nounPattern}\\b`, 'gi');
  for (const { relPath, content } of docs) {
    for (const match of content.matchAll(regex)) {
      const value = /^\d+$/.test(match[1]) ? Number(match[1]) : numberWords[match[1].toLowerCase()];
      if (value !== expected) {
        addIssue(issues, code, relPath, `${expected} ${label}`, match[0], `Replace or historically scope the incorrect ${label} count.`);
      }
    }
  }
}

export function runDocsConsistencyCheck(argv = process.argv.slice(2)) {
  const { root } = parseArgs(argv);
  const pkg = readJson(root, 'package.json');
  const manifestPath = 'docs/documentation-preservation-manifest.json';
  const manifest = readJson(root, manifestPath);
  const compatibilityPath = 'tests/fixtures/v121-compatibility/compatibility-manifest.json';
  const compatibility = readJson(root, compatibilityPath);
  const modes = extractModes(root);
  const workflowFacts = extractWorkflowFacts(root);
  const cliCommands = extractCliCommands(root);
  const greenfieldProfiles = extractGreenfieldProfiles(root);
  const contextFacts = extractContextFacts(root);
  const schemaVersions = extractSchemaVersions(root);
  const docs = collectDocs(root, manifest.canonicalDocuments);
  const byPath = Object.fromEntries(docs.map(({ relPath, content }) => [relPath, content]));
  const joinedDocs = docs.map(({ content }) => content).join('\n');
  const issues = [];

  validateDocumentStructures(issues, manifest, byPath);
  checkProjectPlanBoundary(issues, root, docs);

  for (const relPath of manifest.canonicalDocuments) {
    if (!fs.existsSync(path.join(root, relPath))) {
      addIssue(issues, 'CANONICAL_DOCUMENT_MISSING', relPath, 'tracked canonical document', 'missing', 'Restore the document or explicitly update preservation policy.');
    }
  }
  for (const [relPath, tokens] of Object.entries(manifest.requiredTerms)) {
    requireTokens(issues, relPath, byPath[relPath] ?? '', tokens, 'PRESERVED_TERM_MISSING');
  }

  const facts = manifest.protectedFacts;
  compareFact(issues, manifestPath, 'packageName', pkg.name, facts.packageName);
  compareFact(issues, manifestPath, 'packageMetadataVersion', pkg.version, facts.packageMetadataVersion);
  compareFact(issues, manifestPath, 'latestPublishedVersion', pkg.version, facts.latestPublishedVersion);
  compareFact(issues, manifestPath, 'cliCommands', cliCommands, facts.cliCommands);
  compareFact(issues, manifestPath, 'workflowModeCount', modes.length, facts.workflowModeCount);
  compareFact(issues, manifestPath, 'nativeStageCount', workflowFacts.nativeStageCount, facts.nativeStageCount);
  compareFact(issues, manifestPath, 'greenfieldStageCount', workflowFacts.stageOrderByMode.greenfield.length, facts.greenfieldStageCount);
  compareFact(issues, manifestPath, 'greenfieldProfileCount', greenfieldProfiles.length, facts.greenfieldProfileCount);
  compareFact(issues, manifestPath, 'contextSensitiveStageCount', contextFacts.contextSensitiveStages.length, facts.contextSensitiveStageCount);
  compareFact(issues, manifestPath, 'implementationContextStageCount', contextFacts.implementationStages.length, facts.implementationContextStageCount);
  compareFact(issues, manifestPath, 'testContextStageCount', contextFacts.testStages.length, facts.testContextStageCount);
  compareFact(issues, manifestPath, 'schemaVersions', schemaVersions, facts.schemaVersions);
  compareFact(issues, manifestPath, 'fixedContextPaths', contextFacts.fixedPaths, facts.fixedContextPaths);
  compareFact(issues, manifestPath, 'specializedRendererStages', compatibility.documentedLegacyExceptions, facts.specializedRendererStages);
  compareFact(issues, compatibilityPath, 'modeNames', modes, compatibility.modeNames);
  compareFact(issues, compatibilityPath, 'stageCount', workflowFacts.nativeStageCount, compatibility.stageCount);
  compareFact(issues, compatibilityPath, 'cliCommandNames', cliCommands, compatibility.cliCommands.map(({ name }) => name));
  compareFact(issues, compatibilityPath, 'contextSensitiveStages', contextFacts.contextSensitiveStages, compatibility.contextSensitiveStages);

  const roadmapHeadings = [...byPath['docs/ROADMAP.md'].matchAll(/^### (v\d+\.\d+\.\d+)\b/gm)].map((match) => match[1]);
  if (JSON.stringify([...new Set(roadmapHeadings)]) !== JSON.stringify(manifest.roadmapVersions)) {
    addIssue(issues, 'ROADMAP_VERSION_ORDER_DRIFT', 'docs/ROADMAP.md', manifest.roadmapVersions.join(', '), [...new Set(roadmapHeadings)].join(', '), 'Restore chronological version headings.');
  }
  const workflowsText = byPath['docs/WORKFLOWS.md'];
  for (const mode of modes) {
    const modeSection = section(workflowsText, `## ${mode[0].toUpperCase()}${mode.slice(1)}`, 2);
    let stageCursor = -1;
    for (const stageName of workflowFacts.stageOrderByMode[mode]) {
      const next = modeSection.indexOf(`\`${stageName}\``, stageCursor + 1);
      if (next === -1) {
        addIssue(issues, 'WORKFLOW_STAGE_ORDER_DRIFT', 'docs/WORKFLOWS.md', `${mode}: ${workflowFacts.stageOrderByMode[mode].join(' -> ')}`, `${stageName} missing or reordered`, 'Restore the source-defined native stage order.');
        break;
      }
      stageCursor = next;
    }
  }

  const readme = byPath['README.md'];
  const changelog = byPath['CHANGELOG.md'];
  const roadmap = byPath['docs/ROADMAP.md'];
  const architecture = byPath['docs/ARCHITECTURE.md'];
  const artifacts = byPath['docs/ARTIFACTS.md'];
  const usage = byPath['docs/USAGE.md'];
  const development = byPath['docs/DEVELOPMENT.md'];

  requireTokens(issues, 'README.md', readme, [pkg.name, 'latest published package', '1.2.0', 'v1.2.1', 'unreleased', 'eight commands', 'seven workflow modes', '79 native stages']);
  requireTokens(issues, 'CHANGELOG.md', changelog, ['v1.2.1', 'Implemented in source but not published', 'v1.2.0']);
  requireTokens(issues, 'docs/ROADMAP.md', roadmap, ['Implemented, unreleased v1.2.1', 'implementation complete', 'compatibility validation complete']);
  requireTokens(issues, 'docs/WORKFLOWS.md', workflowsText, ['79 native stages', 'Seventy-seven stages', '11-stage matrix', 'five implementation-context stages', 'six test-context stages']);
  requireTokens(issues, 'docs/ARCHITECTURE.md', architecture, ['WorkflowInstructionPacket', 'TaskState', 'StageContextBundle', 'never persisted', 'ContextReadiness']);
  requireTokens(issues, 'docs/ARTIFACTS.md', artifacts, ['not native artifacts', 'not native stage artifacts', ...contextFacts.fixedPaths]);
  requireTokens(issues, 'docs/USAGE.md', usage, ['<MY_DEV_KIT_CLI>', 'no JSON option', 'refresh-only', ...contextFacts.fixedPaths]);
  requireTokens(issues, 'docs/DEVELOPMENT.md', development, ['Node.js 22 and 24', 'Node.js 24.11.0', 'Node.js 22 was not run locally', 'no live CI']);
  const architectureSchemaLabels = {
    catalogSchema: 'Instruction catalog schema',
    catalogVersion: 'Instruction catalog version',
    workflowInstructionPacket: '`WorkflowInstructionPacket`',
    taskState: '`TaskState`',
    stageContextBundle: '`StageContextBundle`',
    supplementalContextPacket: 'Supplemental context packet',
    supplementalContextRetrievalReport: 'Supplemental context retrieval report',
    contextReadiness: '`ContextReadiness`',
  };
  for (const [key, label] of Object.entries(architectureSchemaLabels)) {
    const expectedVersion = schemaVersions[key];
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`\\|\\s*${escapedLabel}\\s*\\|\\s*\\\`${expectedVersion.replace(/\./g, '\\.')}\\\`\\s*\\|`).test(architecture)) {
      addIssue(issues, 'SCHEMA_VERSION_CLAIM_MISMATCH', 'docs/ARCHITECTURE.md', `${label} ${expectedVersion}`, 'missing or incorrect table row', 'Use the exported schema/version constant.');
    }
  }
  for (const fixedPath of contextFacts.fixedPaths) {
    for (const [documentPath, content] of [['docs/ARTIFACTS.md', artifacts], ['docs/USAGE.md', usage]]) {
      if (!content.includes(fixedPath)) {
        addIssue(issues, 'FIXED_CONTEXT_PATH_MISSING', documentPath, fixedPath, 'missing', 'Restore the source-owned fixed context path.');
      }
    }
  }

  const currentFactDocs = docs.filter(({ relPath }) => !['CHANGELOG.md', 'docs/RELEASE_CHECKLIST.md'].includes(relPath));
  checkWrongCountClaims(issues, currentFactDocs, 'workflow modes', modes.length, '(?:workflow\\s+)?modes', 'WORKFLOW_MODE_COUNT_MISMATCH');
  checkWrongCountClaims(issues, currentFactDocs, 'native stages', workflowFacts.nativeStageCount, 'native\\s+stages', 'NATIVE_STAGE_COUNT_MISMATCH');
  checkWrongCountClaims(issues, currentFactDocs, 'greenfield stages', workflowFacts.stageOrderByMode.greenfield.length, 'greenfield\\s+stages', 'GREENFIELD_STAGE_COUNT_MISMATCH');
  checkWrongCountClaims(issues, currentFactDocs, 'greenfield profiles', greenfieldProfiles.length, '(?:supported\\s+)?(?:greenfield\\s+)?(?:starter\\s+)?profiles', 'GREENFIELD_PROFILE_COUNT_MISMATCH');
  checkWrongCountClaims(issues, currentFactDocs, 'context-sensitive stages', contextFacts.contextSensitiveStages.length, 'context-sensitive\\s+(?:direct\\s+)?stages', 'CONTEXT_STAGE_COUNT_MISMATCH');
  checkWrongCountClaims(issues, currentFactDocs, 'CLI commands', cliCommands.length, '(?:CLI\\s+)?commands', 'CLI_COMMAND_COUNT_MISMATCH');

  if (containsUnnegatedClaim(joinedDocs, /v1\.2\.1[^\n]{0,45}(?:\bpublished\b|\breleased\b|available (?:from|on) npm|npm latest)/i)) {
    addIssue(issues, 'V121_PUBLICATION_FALSE_CLAIM', 'canonical documentation', 'v1.2.1 implemented and unreleased', 'publication claim found', 'Remove the publication claim and preserve v1.2.0 as latest published.');
    addIssue(issues, 'DOC_VERSION_CONTRADICTORY_STATUS', 'canonical documentation', 'v1.2.1 implemented and unreleased', 'v1.2.1 publication claim found', 'Remove the status contradiction across canonical documents.');
  }
  if (/v1\.2\.1[\s\S]{0,180}not implemented|not implemented[\s\S]{0,180}v1\.2\.1/i.test(joinedDocs)) {
    addIssue(issues, 'DOC_VERSION_CONTRADICTORY_STATUS', 'canonical documentation', 'v1.2.1 implemented and unreleased', 'v1.2.1 described as not implemented', 'Remove stale planned status and document current source behavior.');
  }
  const currentTechnicalDocs = ['README.md', 'docs/ARCHITECTURE.md', 'docs/WORKFLOWS.md', 'docs/ARTIFACTS.md', 'docs/USAGE.md', 'docs/DEVELOPMENT.md'];
  for (const documentPath of currentTechnicalDocs) {
    const content = byPath[documentPath] ?? '';
    if (/v1\.2\.1[\s\S]{0,160}(?:will add|future planned|status:\s*planned)|(?:will add|future planned|status:\s*planned)[\s\S]{0,160}v1\.2\.1/i.test(content)) {
      addIssue(issues, 'DOC_VERSION_CONTRADICTORY_STATUS', documentPath, 'implemented current-source behavior', 'v1.2.1 described as future work', 'Replace planned-future framing with current implemented behavior.');
    }
  }
  if (!/latest published package[\s\S]{0,100}1\.2\.0/i.test(readme)) {
    addIssue(issues, 'V120_PUBLISHED_CLAIM_MISSING', 'README.md', 'latest published package v1.2.0', 'missing', 'Restore the verified npm publication state.');
  }
  if (containsUnnegatedClaim(readme, /v(?!1\.2\.0\b)\d+\.\d+\.\d+[^\n]{0,45}current published/i)) {
    addIssue(issues, 'STALE_PUBLISHED_VERSION_CLAIM', 'README.md', 'v1.2.0 is the current published version', 'older current-published claim found', 'Historically scope or remove the stale publication claim.');
  }
  if (!/v1\.2\.1[\s\S]{0,120}unreleased|unreleased[\s\S]{0,120}v1\.2\.1/i.test(readme + '\n' + changelog + '\n' + roadmap)) {
    addIssue(issues, 'V121_UNRELEASED_CLAIM_MISSING', 'README.md; CHANGELOG.md; docs/ROADMAP.md', 'v1.2.1 is unreleased', 'missing', 'State the implemented-versus-published distinction.');
  }
  for (const [documentPath, content, statusPattern] of [
    ['README.md', readme, /v1\.2\.1[\s\S]{0,160}unreleased|unreleased[\s\S]{0,160}v1\.2\.1/i],
    ['CHANGELOG.md', changelog, /v1\.2\.1[\s\S]{0,220}(?:not published|unreleased)/i],
    ['docs/ROADMAP.md', roadmap, /(?:unreleased[\s\S]{0,80}v1\.2\.1|v1\.2\.1[\s\S]{0,180}(?:unreleased|not yet published))/i],
  ]) {
    if (!statusPattern.test(content)) {
      addIssue(issues, 'V121_UNRELEASED_CLAIM_MISSING', documentPath, 'v1.2.1 implemented but unreleased', 'missing', 'Restore the release-state distinction in this document.');
    }
  }

  const contradictionChecks = [
    ['AUTOMATIC_MY_DEV_KIT_CLAIM', /(?:orchestrator|CLI|tool|initial-index)\s+(?:automatically\s+)?(?:runs|executes|invokes)\s+`?my-dev-kit`?/i, 'manual my-dev-kit execution'],
    ['STATUS_JSON_FALSE_CLAIM', /status\s+--json|status[^\n]{0,40}(?:supports|provides|outputs?)\s+JSON/i, 'status has no JSON option'],
    ['TASK_STATE_PERSISTENCE_FALSE_CLAIM', /(?:persist(?:s|ed)?|writes?|stores?)\s+(?:the\s+)?`?TaskState`?/i, 'TaskState is in memory only'],
    ['STAGE_CONTEXT_BUNDLE_PERSISTENCE_FALSE_CLAIM', /(?:persist(?:s|ed)?|writes?|stores?)\s+(?:the\s+)?`?StageContextBundle`?/i, 'StageContextBundle is in memory only'],
    ['NATIVE_CONTEXT_STAGE_FALSE_CLAIM', /(?:adds?|has|uses|creates?)\s+(?:a\s+)?native\s+(?:implementation-|test-)?context\s+stage/i, 'no native context stage'],
  ];
  for (const [code, regex, expected] of contradictionChecks) {
    for (const { relPath, content } of docs) {
      if (containsUnnegatedClaim(content, regex)) {
        addIssue(issues, code, relPath, expected, `claim matching ${regex}`, 'Rewrite the claim to match the implementation boundary.');
      }
    }
  }

  for (const profile of greenfieldProfiles) {
    if (!readme.includes(`\`${profile}\``) && !workflowsText.includes(`\`${profile}\``)) {
      addIssue(issues, 'GREENFIELD_PROFILE_CLAIM_MISSING', 'README.md; docs/WORKFLOWS.md', `current profile ${profile}`, 'missing', 'Document every source-defined greenfield profile.');
    }
  }

  const misleadingClaims = [
    ['GENERIC_MOBILE_SUPPORT_FALSE_CLAIM', /supports?\s+(?:a\s+)?(?:generic\s+)?mobile\b(?!\s+compose)/i, 'no generic mobile support claim'],
    ['IOS_SUPPORT_FALSE_CLAIM', /supports?\s+ios\b/i, 'iOS is unsupported'],
    ['FLUTTER_SUPPORT_FALSE_CLAIM', /supports?\s+flutter\b/i, 'Flutter is unsupported'],
    ['REACT_NATIVE_SUPPORT_FALSE_CLAIM', /supports?\s+react[- ]native\b/i, 'React Native is unsupported'],
    ['GRADLE_EXECUTION_FALSE_CLAIM', /(?:orchestrator|CLI|tool)\s+(?:runs|executes|invokes)\s+Gradle\b/i, 'the orchestrator does not execute Gradle'],
    ['ANDROID_SDK_REQUIREMENT_FALSE_CLAIM', /(?:requires?|needs?)\s+(?:the\s+)?Android SDK\b/i, 'the orchestrator does not require the Android SDK'],
    ['PLAY_STORE_READINESS_FALSE_CLAIM', /Play Store\s+(?:ready|readiness)\b/i, 'no Play Store readiness claim'],
  ];
  for (const [code, regex, expected] of misleadingClaims) {
    for (const { relPath, content } of docs) {
      if (containsUnnegatedClaim(content, regex)) {
        addIssue(issues, code, relPath, expected, `claim matching ${regex}`, 'Restore the documented greenfield execution/support boundary.');
      }
    }
  }

  for (const [relPath, content] of Object.entries(byPath)) {
    if (/Z:\\Users|Projects_worktrees|Projects\\_worktrees|\bNode(?:\.js)?\s*26\b/i.test(content)) {
      addIssue(issues, 'LOCAL_OR_UNSUPPORTED_ENVIRONMENT_CLAIM', relPath, 'portable paths and Node 22/24 evidence', 'local path or Node 26 claim found', 'Use generic paths and configured/runtime-verified Node versions.');
    }
  }

  requireTokens(issues, 'docs/WORKFLOWS.md', workflowsText, ['scaffold-plan', 'scaffold-implementation', 'specialized scaffold renderer'], 'SCAFFOLD_EXCEPTION_DISCLOSURE_MISSING');
  const v121Roadmap = section(roadmap, '### v1.2.1', 3);
  const v121Changelog = section(changelog, '### v1.2.1', 2);
  if (/\bBatch\s+[0-9]+\b|candidate implementation batches|files changed|test suites?:\s*\d+/i.test(v121Roadmap)) {
    addIssue(issues, 'ROADMAP_BATCH_LOG_CONTAMINATION', 'docs/ROADMAP.md', 'high-level v1.2.1 milestone only', 'batch/log detail found', 'Move implementation chronology outside the public roadmap.');
  }
  if (/\bBatch\s+[0-9]+\b|candidate implementation batches|tests?:\s*\d+\s+(?:passed|total)|worktree/i.test(v121Changelog)) {
    addIssue(issues, 'CHANGELOG_BATCH_HISTORY_CONTAMINATION', 'CHANGELOG.md', 'release-oriented v1.2.1 delta', 'batch/history detail found', 'Remove internal implementation chronology.');
  }

  issues.sort((a, b) => a.code.localeCompare(b.code) || a.documentPath.localeCompare(b.documentPath) || a.expected.localeCompare(b.expected));
  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(`DOCS_CHECK_FAIL [${issue.code}] path=${JSON.stringify(issue.documentPath)} expected=${JSON.stringify(issue.expected)} actual=${JSON.stringify(issue.actual)} action=${JSON.stringify(issue.action)}`);
    }
    return 1;
  }

  console.log(`DOCS_CHECK_PASS: ${pkg.name}@${pkg.version}; published v${facts.latestPublishedVersion}; implemented-unreleased v${facts.implementedUnreleasedVersion}; ${cliCommands.length} commands; ${modes.length} modes; ${workflowFacts.nativeStageCount} native stages; ${workflowFacts.stageOrderByMode.greenfield.length} greenfield stages; ${greenfieldProfiles.length} greenfield profiles; ${contextFacts.contextSensitiveStages.length} context-sensitive stages; schemas ${[...new Set(Object.values(schemaVersions))].join(', ')}`);
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    process.exitCode = runDocsConsistencyCheck();
  } catch (error) {
    console.error(`DOCS_CHECK_FAIL [DOCS_CHECK_EXCEPTION] path="repository" expected="readable implementation and documentation sources" actual=${JSON.stringify(error instanceof Error ? error.message : String(error))} action="Restore the required owner or fix the extractor."`);
    process.exitCode = 1;
  }
}
