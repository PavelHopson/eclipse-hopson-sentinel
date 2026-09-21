# Decision Layer + Recovery Controller PoC

Status: P0 contract slice, no production routing changes.

## Why this exists

Sentinel already has model/provider routing, Safe Operator approval boundaries, session recovery,
and fail-closed execution contracts. This slice adds two vendor-neutral contracts on top:

1. a typed decision envelope for fast classification/routing experiments;
2. a deterministic recovery policy for long-running agents.

The first target is a shadow evaluation of Jev-style decision models versus the existing
structured-output LLM path. Jev is intentionally **not** a runtime dependency in this PR.

## Safety boundary

- Decision output never grants tool or OS authority.
- The PoC exposes only `shadow` and `recommendation` modes.
- `executionAuthorized` is always `false`.
- Invalid schema, unknown enum values, engine exceptions, and invalid confidence fail closed.
- Recovery stops for human review on unexpected external side effects, protected-resource loss,
  invalid state, or critical invariant violations.
- Raw provider exceptions are not propagated from the safe runner.

## Decision evaluation

A candidate decision engine must return:

- `schemaVersion = sentinel.decision.v1`
- one decision from the request allowlist
- `confidence` in `[0, 1]`
- bounded `reasonCodes`
- a non-empty engine identifier

Before any promotion beyond shadow mode, compare candidate and baseline on the same fixed corpus:

- accuracy / false-positive / false-negative rates;
- confidence on correct vs incorrect cases;
- latency;
- cost;
- invalid-envelope rate;
- privacy/provider route.

## Recovery policy

The initial deterministic policy uses these signals:

- consecutive failures;
- no-progress steps;
- steps since checkpoint;
- goal drift;
- critical invariant violation;
- unexpected external side effect;
- protected-resource loss.

Actions are intentionally small: continue, checkpoint, replan, or stop for human review.
Rollback is not automated in this first slice because the current repository already treats
mutable/external actions as separate approval-gated contracts.

## Next slice

1. Build a fixed Sentinel incident/routing eval corpus.
2. Add a baseline structured-output adapter.
3. Add a Jev adapter only behind explicit configuration once API/terms are verified.
4. Record latency/cost/accuracy without storing sensitive raw prompts.
5. Integrate recovery signals into one supervised long-horizon workflow.
