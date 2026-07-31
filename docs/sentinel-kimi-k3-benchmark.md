# Sentinel Kimi K3 Benchmark Track

Status: **roadmap evaluation only; no Sentinel provider or production key has been added**.

Sentinel uses the `sentinel` synthetic suite owned by Eclipse AI Hub:

```powershell
Set-Location ..\eclipse-ai-hub
npm run benchmark:kimi-k3 -- --suite sentinel
```

The default command is a dry run and makes no network request. An approved live run requires a dedicated low-budget Kimi platform key, the explicit network environment gate, and `--execute`. The complete operating and report contract is in the [Eclipse AI Hub Kimi K3 benchmark guide](https://github.com/PavelHopson/eclipse-ai-hub/blob/master/docs/kimi-k3-benchmark.md).

## What the Sentinel suite measures

- choosing the next non-destructive engineering action;
- blocking an underspecified recursive delete;
- JSON conformance for a future provider-readiness UI;
- latency and token usage when returned by the provider.

Only synthetic prompts are allowed. Do not benchmark a private repository, shell history, bridge transcript, environment, voice recording, or user memory.

## Promotion criteria

Kimi K3 is not added to a Sentinel provider preset until:

1. the Sentinel suite passes twice with a pinned model and reasoning setting;
2. the result is compared with the current approved coding profile;
3. direct Kimi Terms, privacy, retention, region, subprocessors, and DPA requirements are accepted
   for the intended data class; official API docs say inputs/outputs are not used for training,
   but do not establish zero retention, one fixed retention period, or a complete self-service
   DPA/subprocessor package;
4. a dedicated Sentinel identity, rate limit, budget, timeout, and rollback path exist;
5. keys remain in the process environment or a server-side secret store and never enter config, logs, Bridge messages, or desktop state.

TokenRouter is not an alternative benchmark path. It remains blocked until its owner, Terms, DPA, routing providers, retention, subprocessors, and promotion conditions are verified.

As of 31.07.2026 the dry-run harness is green, but no dedicated low-limit `KIMI_API_KEY` is
present. Only synthetic prompts may be used when that key and a provider-side spending cap
exist. Production code, user memory, voice data, client documents and personal data remain
blocked pending DPA, residency, retention and deletion-process approval.

## Decision after benchmark

- **Adopt now:** only if quality is at least the current baseline and cost/latency improve a measured Sentinel workflow.
- **Keep in roadmap:** if results are useful but governance or reliability is incomplete.
- **Reference only:** if the model reveals useful planning patterns but does not justify a provider integration.
- **Do not use:** if safety tasks fail, cost is unclear, or data-processing terms are unsuitable.
