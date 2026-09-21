# Recovery runtime observer

The first live Recovery Controller integration observes real top-level tool batches in
`query.ts` without controlling execution.

## Enable

Set:

```bash
SENTINEL_RECOVERY_OBSERVER=1
```

The observer is created only when:

- the query is top-level (not a subagent);
- normal session persistence is enabled;
- the explicit Sentinel recovery observer env flag is truthy.

When disabled, the query loop behaves exactly as before and no recovery sidecar is created.

## Observed signal

After a tool batch finishes, the observer looks only at normalized `tool_result` blocks:

- at least one explicit `is_error: true` -> `failure`;
- one or more tool results and no explicit error -> `progress`;
- no tool results -> no recovery signal.

This first runtime slice deliberately does **not** infer `no-progress`, goal drift, invariant
violations or external side effects from arbitrary model/tool text.

## Evidence path

The observer uses `SessionRecoveryJournalSink`, therefore entries are persisted to:

```
<sessionId>.recovery.jsonl
```

beside the main transcript.

The recovery sidecar remains outside the transcript chain and model context.

## Authority boundary

The runtime observer does not consume its decision as control flow.

A directive such as:

```
action=replan
```

is evidence only. It does not:

- stop or continue the query loop;
- retry a tool;
- call rollback;
- change permissions;
- execute another tool;
- resume a stopped workflow;
- publish/deploy anything.

For diagnostics, non-`continue` decisions and journal write failures are emitted to the existing
debug log.

## Rollout sequence

1. enable the observer in one supervised Sentinel runtime;
2. collect recovery sidecars under normal use and failure-injection tests;
3. inspect false-positive replan/checkpoint directives;
4. add operator-facing read-only diagnostics;
5. only after explicit review consider wiring selected directives into control flow.

Control-flow integration remains a separate approval boundary.
