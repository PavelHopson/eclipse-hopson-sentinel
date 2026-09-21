# Decision Shadow Evaluation

This slice turns the Decision Layer contract into a measurable shadow experiment.

## Components

### StructuredOutputDecisionEngine

A vendor-neutral adapter around an existing structured-output invocation.

The model/provider may return only:

- `decision`
- `confidence`
- `reasonCodes`

Trusted metadata (`schemaVersion`, `engine`, `model`) is injected by Sentinel.
Model-supplied engine/model values are ignored.

The adapter does not repair invalid outputs. Validation remains fail-closed in
`runDecisionSafely`.

### Shadow evaluator

`evaluateDecisionEngineInShadow` runs a fixed corpus and records:

- accuracy;
- valid/invalid envelope counts;
- invalid rate;
- mean latency;
- p50 latency;
- p95 latency;
- confidence on correct vs incorrect decisions.

All runs use Decision Layer `shadow` mode, therefore they cannot authorize execution.

### Seed corpus

`sentinelIncidentSeedCorpus` contains 18 synthetic labelled cases for:

- login anomalies;
- privilege changes;
- Safe Operator requests;
- provider failures;
- secret exposure;
- dependency findings;
- maintenance events.

This corpus is a **seed fixture**, not production ground truth.
Before any model promotion it must be expanded with reviewed real-world or carefully
sanitized historical cases.

## Promotion rule

A candidate model/provider must not become default because of vendor benchmarks.

Recommended sequence:

1. fixed offline corpus;
2. structured-output baseline;
3. candidate in shadow mode;
4. compare accuracy, invalid-rate, latency and cost;
5. inspect false positives / false negatives;
6. bounded canary only after explicit review.

Jev remains a future adapter behind the same contract. This slice intentionally avoids
an early-access runtime dependency.
