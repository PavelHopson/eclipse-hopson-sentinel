# Decision evidence and promotion gate

The Decision Layer now separates three different concepts:

1. **measurement** — run an engine on a fixed corpus;
2. **eligibility review** — compare candidate evidence against baseline;
3. **execution authority** — remains separate and is never granted by this gate.

## Persisted baseline evidence

`decision:shadow:baseline` writes the latest safe report to:

```
reports/decision-shadow/baseline-<timestamp>.json
```

The `reports/` directory is already gitignored. Every run creates a new timestamped file, so prior evidence is preserved. Writes are atomic: a unique temporary file is written in the same directory and then renamed to a new final path.

The report contains no raw decision contexts or credentials. It contains only:

- engine/provider/model identifiers;
- corpus name;
- aggregate metrics;
- case IDs;
- expected/actual decisions;
- confidence;
- accepted/invalid state;
- latency;
- bounded generic validation errors.

## Promotion gate

Compare two validated reports:

```bash
bun run decision:shadow:compare -- \
  --baseline reports/decision-shadow/baseline-<timestamp>.json \
  --candidate reports/decision-shadow/candidate-latest.json
```

Exit codes:

- `0`: eligible for **canary review**;
- `2`: evidence failed the promotion gate;
- `1`: input/report error.

A PASS never enables canary traffic. Output always includes:

```json
{ "canaryAuthorized": false }
```

## Blocking rules

The first P0 gate is deliberately conservative:

- exact same corpus;
- exact case alignment and expected labels;
- candidate accuracy must not be lower;
- candidate invalid-rate must not be higher;
- zero regressions on cases the baseline classified correctly;
- any regression on an expected `escalate` case is explicitly critical.

Latency is reported as a warning rather than an automatic blocker in this first slice. This avoids
rejecting a materially safer/better engine solely for being slower while still surfacing the cost.

These rules are intentionally strict for the 18-case seed corpus. Once the corpus grows to reviewed
historical/sanitized cases, promotion criteria should evolve toward statistically meaningful
thresholds rather than case-by-case monotonicity.
