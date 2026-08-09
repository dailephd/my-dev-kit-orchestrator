# Security

## Trust model

The orchestrator is a local CLI that reads requests, run metadata, stage artifacts, and supplemental evidence supplied by the user or coding agent. Treat project paths, artifact text/JSON, exported destinations, and external evidence as untrusted input. The tool coordinates evidence; it does not sandbox agents or prove that supplied claims are true.

## Filesystem and path boundaries

Normal state is contained beneath the project-local `.my-dev-kit-orchestrator/` directory. Greenfield scaffold-target validation normalizes paths, rejects unsafe absolute/traversal forms, and bounds pattern matching. Export validates destinations and rejects paths escaping the allowed root. Checks and prompt rendering do not execute target files.

## Subprocess and network behavior

The runtime does not execute coding agents, `my-dev-kit`, builds, tests, Gradle, Android tooling, publishing commands, or security scanners. It has no autonomous network workflow. `npm`/`npx`, Git, or companion-tool commands shown in prompts/docs are executed only by a user or coding agent outside the orchestrator process. This includes the full-stack environment contract: the orchestrator never executes Docker, PostgreSQL, Prisma, or any other project/database command itself; every setup and validation command in a full-stack scaffold plan is descriptive guidance for the coding agent, exactly like every other profile's commands.

## Full-stack environment contract

The full-stack scaffold and environment templates the orchestrator generates guidance for are non-secret by contract: `.env.example`/`.env.test.example` targets carry variable names and placeholders, never real secret values, and generated/persisted evidence (scaffold plans, reports, readiness output) is not expected to contain credentials. The reset/recovery contract the capability describes is scoped to development and test database lifecycles only; a production reset is not part of the supported contract. Container and runtime safety expectations (non-root production runtime, bounded Docker readiness, isolated test-database lifecycle, build-context-correct `.dockerignore`) are represented as target/command expectations in the generated-project contract for the coding agent to satisfy; the orchestrator validates evidence of them, it does not enforce them at runtime itself.

## Evidence parsing and generated output

Artifact and supplemental-evidence parsers use versioned contracts and deterministic issue results. Malformed, stale, mismatched, truncated, or legacy evidence is surfaced rather than silently normalized into success. Generated prompts, checks, and exports may contain repository/request text; review them before sharing and keep secrets out of requests and artifacts.

## Readiness and proof boundary

`RunIntegrityGate`, judge integrity, and final-report eligibility prevent a structurally blocked run from becoming an accepted normal `PASS`. They do not establish runtime correctness, vulnerability absence, safe deployment, or store readiness. Security validation belongs to `my-dev-kit-lab`; static repository evidence belongs to `my-dev-kit`.

## Reporting security issues

Do not place secrets or exploit details in public issues. Use the repository's GitHub security-reporting channel when available, or contact the maintainer privately. Include the package version, platform, minimal reproduction, affected path/command, and impact.

Contributor and release safety gates are in [DEVELOPMENT.md](DEVELOPMENT.md), [CI_CD.md](CI_CD.md), and [RELEASE.md](RELEASE.md).
