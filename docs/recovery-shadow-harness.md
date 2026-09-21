# Recovery shadow harness

The Recovery Controller now has an end-to-end shadow harness that exercises the same components used
by the opt-in runtime observer:

1. normalized tool-result batches;
2. `RecoveryToolBatchObserver`;
3. `SupervisedRecoverySession`;
4. `SessionRecoveryJournalSink`;
5. persisted `.recovery.jsonl` sidecar;
6. bounded sidecar reader;
7. operator diagnostics summary.

The harness uses an isolated temporary session path and deletes it before returning.

## Run

Default failure-threshold scenario:

```bash
bun run recovery:shadow:simulate
```

Explicit scenarios:

```bash
bun run recovery:shadow:simulate -- --scenario healthy
bun run recovery:shadow:simulate -- --scenario checkpoint
bun run recovery:shadow:simulate -- --scenario replan
```

## Expected scenarios

- `healthy`: three successful tool batches -> latest action `continue`, no attention.
- `checkpoint`: eight successful batches -> latest action `checkpoint`, no control-flow authority.
- `replan`: three failed batches -> latest action `replan`, attention reason `latest-replan`.

## Safety boundary

Every report explicitly contains:

```json
{
  "controlFlowAuthorized": false,
  "externalActionAuthorized": false,
  "automatedRollbackAuthorized": false
}
```

The harness does not call the real provider, execute tools, mutate the user's transcript, change
permissions, retry work, or drive the query loop.

It is meant to validate the full recovery evidence pipeline before any future control-flow
integration.
