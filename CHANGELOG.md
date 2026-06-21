# Changelog

## Unreleased

### Documentation

- clarified the graph-guided architecture context design
- documented the retrieval evidence report and ArchitectureContextPacket synthesis
- clarified the relationship between `my-dev-kit` and `my-dev-kit-orchestrator`

## v0.1.0

Initial release of `my-dev-kit-orchestrator`.

Included in `v0.1.0`:

- CLI commands: `init`, `start`, `status`, `prompt`, and `list`
- workflow modes: `feature`, `repair`, `test`, `refactor`, and `harden`
- local workspace initialization under `.my-dev-kit-orchestrator/`
- run creation with `00-request.txt`, `run.json`, `prompts/`, `artifacts/`, and `reports/`
- generated stage prompt files for each workflow mode
- plain-text artifact naming and file-existence stage tracking
- run inspection via `status` and `list`
- prompt retrieval for the next or selected stage via `prompt`
- Jest test coverage for command behavior, workflow definitions, prompt generation, and run management

Not included in `v0.1.0`:

- direct LLM execution
- automatic `my-dev-kit` execution
- JSON-schema-heavy artifact validation
- automatic judge routing
- design-map generation
