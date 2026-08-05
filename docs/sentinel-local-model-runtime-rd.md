# Sentinel Local Model Runtime R&D

Source reference: [Colibri](https://github.com/JustVugg/colibri) — a pure C runtime for GLM-5.2 744B MoE with disk-streamed experts.

This is a research track, not an installed Sentinel dependency.

## Why this matters

Sentinel needs a credible local-provider story beyond "run Ollama and hope it works".
Colibri is useful because it treats local inference as an operational planning problem:

- model footprint is split into resident RAM, disk-backed experts, cache and optional GPU tier
- the runtime exposes `plan` and `doctor` concepts before starting inference
- unsafe RAM/disk placement is detected before the model loads
- output can be reported as stable JSON for UI, CLI and automation

That pattern fits Sentinel better than a simple model picker.

## What we do not do yet

- Do not download the ~370 GB Colibri model as part of normal setup.
- Do not advertise Colibri as a fast local chat experience.
- Do not make Colibri the default local backend.
- Do not hide disk-bound latency from users.

Colibri's own README reports cold decode as disk-bound. This belongs in R&D until we benchmark it on our hardware.

## Sentinel concepts to borrow

### Local provider doctor

Future command:

```powershell
sentinel doctor model
```

It should answer, in plain language:

- whether the selected provider is reachable
- whether the model path exists
- how much RAM, VRAM and disk the provider expects
- whether current hardware can run it safely
- whether inference is expected to be fast, slow, or unusable
- what the next safe action is

### Provider planning JSON

Future output shape:

```json
{
  "provider": "local-runtime",
  "model": "example-model",
  "status": "warning",
  "residentRamGb": 10,
  "peakRamGb": 20,
  "diskRequiredGb": 370,
  "expectedColdSpeed": "very_slow",
  "risks": ["disk_bound_decode", "large_model_download"],
  "nextAction": "Use Ollama for daily work; run this runtime only as R&D."
}
```

### UI / CLI copy principle

Bad:

- "Run 744B locally"

Better:

- "This model can start locally, but cold responses may be very slow because experts stream from disk."

The user should not need to understand MoE internals to make a safe choice.

## Backlog

1. Add `sentinel doctor model` as a deterministic provider readiness command.
2. Add provider profiles: `ollama`, `openai-compatible`, `router`, `experimental-local-runtime`.
3. Add a RAM/disk budget estimator before launching local providers.
4. Add a warning tier for disk-streamed models.
5. Add stable JSON output for desktop shell / future UI.
6. Benchmark Colibri only after a separate hardware/storage plan is approved.

## Acceptance criteria for first spike

- No large model is downloaded automatically.
- The doctor can run without starting inference.
- The user sees one obvious recommendation: safe default provider vs experimental provider.
- The output is useful for CLI and future desktop shell.
- Failure states are explicit: missing model path, insufficient disk, insufficient RAM, provider unreachable.

