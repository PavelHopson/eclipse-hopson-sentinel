# Live structured-output decision baseline

This slice wires the shadow evaluator to Sentinel's existing `sideQuery` runtime path.

## Command

```bash
bun run decision:shadow:baseline
```

Optional model override:

```bash
bun run decision:shadow:baseline -- --model <model>
```

The command loads the existing saved provider profile when the shell has no explicit provider
selection, chooses the current fast model by default, and runs only the synthetic 18-case seed
corpus.

## Runtime boundary

Each case receives exactly one forced tool:

`record_decision`

The tool schema allows only:

- one decision from the request allowlist;
- confidence between 0 and 1;
- up to 16 short reason codes.

No ordinary Sentinel tools are passed to this side query.

Context is serialized as untrusted JSON. The system prompt explicitly instructs the model not to
follow instructions embedded in that data. Contexts larger than 12,000 serialized characters fail
closed rather than being truncated.

## Output hygiene

The report prints:

- case ID;
- expected / actual decision;
- confidence;
- validity;
- latency;
- generic validation errors;
- aggregate accuracy and latency metrics.

It does **not** print provider credentials or raw provider exceptions. The current seed corpus is
synthetic, but this output policy is kept intentionally narrow before any sanitized historical
fixtures are introduced.

## Promotion boundary

This command is diagnostic only. It does not change routing, select a new default model, authorize
tools, or enable canary traffic.

The next candidate engine (including a future Jev adapter) must be evaluated against the same corpus
and compared to this baseline before any canary discussion.
