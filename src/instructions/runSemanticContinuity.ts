// v1.5.0 Batch 4 -- run-folder adapter for Semantic Continuity.
//
//   run files / raw evidence
//     -> Batch 0-2 parsers and bridge evaluators
//     -> Batch 3 evaluateSemanticContinuity()
//
// This is an I/O adapter, NOT a policy evaluator: every continuity state comes
// from evaluateSemanticContinuity(). It reads only files that already exist in
// the run folder, reuses parseDeclaredTraceIds() for trace declarations, and
// reuses the already-computed context readiness results (and readRawContextCapsule)
// for my-dev-kit evidence -- it never recomputes readiness, reruns my-dev-kit,
// re-parses capsule JSON itself, or executes anything recorded in a report.
// Activation is explicit and versioned (run metadata `semanticContinuityVersion`);
// activation is never inferred from artifact contents.

import * as fs from 'fs';
import * as path from 'path';
import { parseDeclaredTraceIds } from '../traceChecker';
import { getWorkflow, StageDefinition } from '../workflows';
import { isValidMode } from '../types';
import { ContextReadinessResult } from './contextReadiness';
import {
  evaluateImplementationEvidenceBridge,
  validateImplementationResponsibilities,
} from './implementationResponsibilityEvidence';
import { RawEvidenceProjection, readRawContextCapsule } from './myDevKitEvidenceSummary';
import { evaluateSemanticContinuity, SemanticContinuityResult } from './semanticContinuity';
import { validateSemanticResponsibilities } from './semanticResponsibility';
import {
  evaluateTestImplementationBridge,
  validateTestImplementationResponsibilities,
} from './testImplementationResponsibilityEvidence';
import { findTestStrategySourceRequirement } from './testResponsibilityCriticality';
import {
  evaluateVerificationAttribution,
  validateVerificationResponsibilities,
} from './verificationResponsibilityEvidence';

// The single supported activation value. Do not duplicate this literal.
export const SEMANTIC_CONTINUITY_CONTRACT_VERSION = '1.0.0';

export const SEMANTIC_CONTINUITY_CONTRACT_VERSION_UNSUPPORTED = 'SEMANTIC_CONTINUITY_CONTRACT_VERSION_UNSUPPORTED';

export type RunSemanticContinuityActivation = 'not-required' | 'active' | 'unsupported';

export interface RunSemanticContinuityIntegrationIssue {
  code: typeof SEMANTIC_CONTINUITY_CONTRACT_VERSION_UNSUPPORTED;
  message: string;
}

export interface RunSemanticContinuityResult {
  contractVersion?: string;
  activation: RunSemanticContinuityActivation;
  // The workflow stage the evaluation was made at ("(complete)"/undefined
  // resolve to the workflow's last stage); only set when activation is 'active'.
  phaseStage?: string;
  // The exact Batch 3 result (never re-modelled here).
  continuity?: SemanticContinuityResult;
  integrationIssues: RunSemanticContinuityIntegrationIssue[];
}

export interface RunSemanticContinuityInput {
  mode: string;
  runFolder: string;
  semanticContinuityVersion?: string;
  proofOnly?: boolean;
  currentStage?: string;
  // Already computed by the same gate invocation; never recomputed here.
  implementationContextReadiness?: ContextReadinessResult;
  testContextReadiness?: ContextReadinessResult;
}

function readIfExists(runFolder: string, relativePath: string): string {
  const full = path.join(runFolder, relativePath);
  try {
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return fs.readFileSync(full, 'utf8');
  } catch {
    // Unreadable artifacts are treated as absent; lifecycle owns physical absence.
  }
  return '';
}

function stageFiles(stage: StageDefinition): string[] {
  return [stage.artifactFile, ...(stage.additionalArtifactFiles ?? [])];
}

function artifactOf(stages: readonly StageDefinition[], stageName: string): string | undefined {
  return stages.find((s) => s.name === stageName)?.artifactFile;
}

// Bounded producer evidence for one context kind, taken only from an
// already-accepted (non-refresh-required) readiness result. Otherwise no
// producer evidence is fabricated: the bridges then report the mapping as
// unavailable, while the context blocker remains the canonical diagnosis.
function producerEvidence(
  readiness: ContextReadinessResult | undefined,
  runFolder: string,
): Pick<RawEvidenceProjection, 'responsibilityMappings' | 'responsibilityMappingsTruncated'> {
  const none = { responsibilityMappings: [], responsibilityMappingsTruncated: false };
  if (!readiness || readiness.decision === 'refresh-required' || !readiness.sourceCapsulePath) return none;
  const parsed = readRawContextCapsule(readiness.sourceCapsulePath, runFolder);
  if (!parsed.ok) return none;
  return {
    responsibilityMappings: parsed.projection.responsibilityMappings,
    responsibilityMappingsTruncated: parsed.projection.responsibilityMappingsTruncated,
  };
}

export function evaluateRunSemanticContinuity(input: RunSemanticContinuityInput): RunSemanticContinuityResult {
  const version = input.semanticContinuityVersion;
  if (version === undefined) {
    return { activation: 'not-required', integrationIssues: [] };
  }
  if (version !== SEMANTIC_CONTINUITY_CONTRACT_VERSION) {
    return {
      contractVersion: version,
      activation: 'unsupported',
      integrationIssues: [
        {
          code: SEMANTIC_CONTINUITY_CONTRACT_VERSION_UNSUPPORTED,
          message: `Unsupported semanticContinuityVersion "${version}"; the supported version is "${SEMANTIC_CONTINUITY_CONTRACT_VERSION}".`,
        },
      ],
    };
  }

  const { mode, runFolder } = input;
  const stages: readonly StageDefinition[] = isValidMode(mode) ? getWorkflow(mode).stages : [];
  const lastStage = stages.length > 0 ? stages[stages.length - 1].name : '(complete)';
  const phaseStage =
    input.currentStage === undefined || input.currentStage === '(complete)' ? lastStage : input.currentStage;

  // Strategy artifact: the exact mode-owned path from the existing registry.
  const requirement = findTestStrategySourceRequirement(mode);
  const strategyText = requirement ? readIfExists(runFolder, requirement.strategyArtifactRelativePath) : '';

  // Declared upstream trace IDs: only artifacts of stages BEFORE the strategy
  // stage, via the existing declaration parser (exact IDs, exact-deduplicated).
  const declared: string[] = [];
  if (requirement) {
    const strategyStageName = requirement.strategyStageId.replace(`stage.${mode}.`, '');
    const strategyIndex = stages.findIndex((s) => s.name === strategyStageName);
    for (const stage of strategyIndex >= 0 ? stages.slice(0, strategyIndex) : []) {
      for (const file of stageFiles(stage)) {
        for (const traceId of parseDeclaredTraceIds(readIfExists(runFolder, file))) {
          if (!declared.includes(traceId.id)) declared.push(traceId.id);
        }
      }
    }
  }

  const implementationFile = artifactOf(stages, 'implementation');
  const testImplementationFile = artifactOf(stages, 'test-implementation');
  const verificationFile = artifactOf(stages, 'verification');

  const semanticValidation = validateSemanticResponsibilities(strategyText);
  const implementationValidation = validateImplementationResponsibilities(
    implementationFile ? readIfExists(runFolder, implementationFile) : '',
  );
  const testImplementationValidation = validateTestImplementationResponsibilities(
    testImplementationFile ? readIfExists(runFolder, testImplementationFile) : '',
  );
  const verificationValidation = validateVerificationResponsibilities(
    verificationFile ? readIfExists(runFolder, verificationFile) : '',
  );

  const continuity = evaluateSemanticContinuity({
    mode,
    currentStage: phaseStage,
    proofOnly: input.proofOnly === true,
    declaredUpstreamTraceIds: declared,
    semanticValidation,
    implementationValidation,
    implementationBridge: evaluateImplementationEvidenceBridge({
      semanticResponsibilities: semanticValidation.responsibilities,
      declarations: implementationValidation.declarations,
      evidence: producerEvidence(input.implementationContextReadiness, runFolder),
    }),
    testImplementationValidation,
    testImplementationBridge: evaluateTestImplementationBridge({
      semanticResponsibilities: semanticValidation.responsibilities,
      declarations: testImplementationValidation.declarations,
      evidence: producerEvidence(input.testContextReadiness, runFolder),
    }),
    verificationValidation,
    verificationAttribution: evaluateVerificationAttribution({
      semanticResponsibilities: semanticValidation.responsibilities,
      declarations: verificationValidation.declarations,
    }),
  });

  return {
    contractVersion: version,
    activation: 'active',
    phaseStage,
    continuity,
    integrationIssues: [],
  };
}
