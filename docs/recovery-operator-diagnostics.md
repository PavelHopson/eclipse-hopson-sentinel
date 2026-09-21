# Recovery operator diagnostics

Recovery sidecars now have a read-only operator summary surface.

## Command

Inspect from the session transcript path:

```bash
bun run recovery:journal:inspect -- --transcript <session.jsonl>
```

Or inspect the recovery sidecar directly:

```bash
bun run recovery:journal:inspect -- --journal <session.recovery.jsonl>
```

The command prints only bounded aggregate diagnostics. It does not print raw journal lines, tool
outputs, prompts, credentials or the local file path.

## Summary

The JSON includes:

- observed valid entry count;
- invalid-line count;
- truncated-history count;
- event counts;
- action counts;
- latest bounded recovery directive;
- latest recovery counters / safety flags;
- `attentionRequired`;
- explicit attention reasons.

Current attention reasons are:

- `human-approval-required`;
- `latest-replan`;
- `invalid-journal-lines`;
- `truncated-journal-history`.

## Read-only contract

`attentionRequired` is diagnostic only.

The CLI intentionally does **not** return a special exit code for `replan` or
`stop-for-human`. A successful inspection returns success even when operator attention is
recommended. This prevents scripts from accidentally turning a read-only diagnostic into recovery
control flow.

The command cannot:

- retry tools;
- stop or resume a query;
- authorize rollback;
- change permissions;
- execute external actions.

Any future operator-console integration should consume this same summary as read-only evidence.
