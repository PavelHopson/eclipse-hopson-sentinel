# Persisted recovery session journal

Recovery evidence can now be persisted to a sidecar file without changing the conversation
transcript format or parent-UUID chain.

## Sidecar path

For a transcript such as:

```
<project-dir>/<sessionId>.jsonl
```

the recovery journal is:

```
<project-dir>/<sessionId>.recovery.jsonl
```

This keeps recovery evidence outside the transcript loader, compaction chain, resume message graph,
and model context.

## Writer

`SessionRecoveryJournalSink` implements the existing synchronous `RecoveryJournalSink`.

The write path:

- validates `sentinel.recovery-journal.v1` again before persistence;
- caps one serialized entry at 8 KiB by default;
- creates parent directories with private permissions;
- creates/writes the sidecar with mode `0600`;
- tightens an existing POSIX sidecar back to `0600`;
- uses `O_APPEND`;
- uses `O_NOFOLLOW` on POSIX to reject symbolic-link redirection;
- performs no recovery action itself.

A successful `append` means the line was written before the method returns, so
`SupervisedRecoverySession.journalRecorded` can represent the actual persistence result.

## Reader

`readSessionRecoveryJournal` is bounded:

- maximum file size: 2 MiB by default;
- maximum returned entries: 2,048;
- when more valid lines exist, only the most recent bounded window is considered;
- malformed JSON is skipped and counted;
- entries that violate the recovery journal schema or try to set execution-authority flags are
  skipped and counted;
- the transcript file is never read or modified by this adapter.

The reader returns diagnostics with total lines, valid entries, invalid lines and truncated
historical entries.

## Authority boundary

Persisting or reading a journal cannot:

- authorize rollback;
- authorize external actions;
- run tools;
- change permissions;
- resume a stopped workflow;
- write to the main transcript.

Every valid journal entry still requires:

```json
{
  "automatedRollbackAuthorized": false,
  "externalActionAuthorized": false
}
```

## Next runtime boundary

The next slice may instantiate this sink for one supervised long-horizon runtime path and expose
journal diagnostics to operators. That integration should consume recovery directives as evidence
only; execution remains separately approval-gated.
