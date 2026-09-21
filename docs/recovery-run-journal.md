# Recovery Run Journal

The supervised recovery path now emits bounded, append-only evidence entries without gaining any
execution authority.

## Contract

Each journal entry uses `sentinel.recovery-journal.v1` and records only:

- monotonically increasing sequence;
- timestamp;
- recovery event type;
- action and reason code;
- human-approval requirement;
- checkpoint / continuation flags;
- bounded recovery counters and safety flags.

It does **not** contain:

- prompts;
- model output;
- tool input or output;
- file paths;
- credentials;
- arbitrary workflow context;
- rollback commands.

Every entry explicitly carries:

- `automatedRollbackAuthorized: false`
- `externalActionAuthorized: false`

## SupervisedRecoverySession integration

`SupervisedRecoverySession` accepts an optional `RecoveryJournalSink`.

Calling `record(...)` automatically attempts to append the resulting recovery directive. Explicit
supervisor reset is journaled as `supervisor-reset`.

Journal persistence is best-effort and **cannot change the recovery decision**. If a sink throws or
hits capacity, the returned snapshot contains `journalRecorded: false`, while the policy decision
and authority boundaries remain unchanged. A critical stop therefore cannot be hidden by a broken
journal.

## In-memory journal

`InMemoryRecoveryRunJournal` is the first sink implementation.

- bounded to 2,048 entries by default;
- append-only;
- returns defensive copies to readers;
- exposes stored/dropped entry counts;
- throws on capacity overflow rather than silently overwriting old evidence.

The supervised session catches sink failures so evidence loss is visible without changing runtime
authority.

## Next boundary

A future persistence adapter may project these already-sanitized entries into session/transcript
storage. That adapter must remain evidence-only: it must not execute recovery actions, alter tool
permissions, or automatically resume a stopped workflow.
