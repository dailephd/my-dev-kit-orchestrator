// v1.3.0 Batch 4 (PseudocodePacket PSE-020): the shared readiness result,
// extending -- not replacing -- the Batch 1 ProfileValidationResult shape.
import { GreenfieldProfile } from '../profiles/profileTypes';
import { GreenfieldScaffoldPlan } from '../scaffold/scaffoldPlanTypes';
import { ProfileValidationResult } from '../profiles/profileValidationTypes';
import { GreenfieldFullstackCapability } from '../fullstack/fullstackCapabilityTypes';

export interface GreenfieldReadinessResult extends ProfileValidationResult {
  /** True only when `valid` and every required-evidence/first-slice/legacy condition is satisfied. */
  readonly ready: boolean;
  /**
   * True when the run's native artifacts predate the Batch 4 structured
   * evidence sections (the "Profile" field is absent from the scaffold
   * implementation report). A legacy run is never `ready`, but it is not
   * retroactively failed for missing fields it could not have written;
   * see GF_LEGACY_EVIDENCE_NOT_EVALUATED.
   */
  readonly legacyRun: boolean;
  /** True when optional read-only filesystem corroboration was actually performed (projectRoot resolved and was accessible). */
  readonly filesystemCorroborationPerformed: boolean;
}

export interface GreenfieldReadinessInputs {
  readonly profile: GreenfieldProfile;
  /** Parsed scaffold plan, or undefined when scaffold-plan.txt is missing/unparseable. */
  readonly scaffoldPlan?: GreenfieldScaffoldPlan;
  /** Raw text content of reports/scaffold-implementation-report.txt, or undefined when the file does not exist. */
  readonly scaffoldImplementationReportContent?: string;
  /** True when the existing lifecycle marks this artifact stale relative to its upstream dependencies. */
  readonly scaffoldImplementationReportStale?: boolean;
  /** Raw text content of artifacts/first-vertical-slice.txt, or undefined when the file does not exist. */
  readonly firstVerticalSliceContent?: string;
  readonly firstVerticalSliceStale?: boolean;
  /** Raw text content of artifacts/verification-report.txt, or undefined when the file does not exist. */
  readonly verificationReportContent?: string;
  /** Raw text content of artifacts/project-docs-report.txt, or undefined when the file does not exist. */
  readonly projectDocsReportContent?: string;
  /**
   * The trusted run project root (RunMetadata.projectRoot). Filesystem
   * corroboration is performed automatically when this resolves to an
   * accessible directory; no separate opt-in flag exists. Omit or pass
   * undefined to skip corroboration entirely (e.g. when the root is
   * unknown or inaccessible).
   */
  readonly projectRoot?: string;
  /**
   * v1.3.1 Batch 5: the resolved full-stack capability, when the run's
   * bootstrap-bundle.json records `fullstackCapability.status === 'selected'`.
   * Undefined for every ordinary non-full-stack run (typescript-cli,
   * android-compose, or nextjs-app without the fullstack-web + nextjs
   * dimensions), in which case readiness evaluation is byte-for-byte
   * unchanged from pre-Batch-5 behavior.
   */
  readonly capability?: GreenfieldFullstackCapability;
}
