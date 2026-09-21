# Supervised Recovery Workflow

This slice makes the recovery policy usable by one supervised long-horizon workflow without
granting any new execution authority.

## What it does

`SupervisedRecoverySession` converts workflow signals into deterministic recovery directives:

- progress;
- no progress;
- failure;
- checkpoint persisted;
- goal drift;
- critical invariant violation;
- unexpected external side effect;
- protected resource loss.

It tracks only bounded counters/flags and delegates the actual decision to
`sentinel.recovery.v1`.

## What it does not do

- no automatic rollback;
- no file/system mutation;
- no tool invocation;
- no publish/deploy/payment action;
- no clearing of critical stop flags;
- no autonomous resume after a human-stop condition.

A `stop-for-human` decision remains sticky for critical external/invariant failures.

## Failure-injection coverage

The tests exercise:

1. normal progress until a checkpoint is required;
2. repeated failures causing replan instead of blind retry;
3. no-progress budget exhaustion;
4. goal-drift detection and explicit supervisor reset;
5. unexpected external side effect causing a sticky human stop;
6. protected-resource loss;
7. critical invariant violation.

## Next integration boundary

After this contract is merged, wire it into one supervised runtime path where step outcomes are
already observable. The first integration should remain non-mutating and should emit recovery
directives to the Run Journal rather than performing rollback automatically.
