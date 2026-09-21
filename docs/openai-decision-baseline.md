# OpenAI API decision baseline

The manual **Decision Baseline Evidence** workflow produces reproducible structured-decision
baseline evidence with the OpenAI API.

## Provider

The workflow uses Sentinel's existing OpenAI-compatible provider path:

- `CLAUDE_CODE_USE_OPENAI=1`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`

The default model is:

```
gpt-5.6-luna
```

It is chosen for the first baseline because the fixed corpus is small and classification-oriented,
so a low-cost fast model is a better reference point than spending flagship-model budget before the
evaluation harness itself is established.

## Required repository secret

Create a GitHub Actions repository secret named:

```
OPENAI_API_KEY
```

The workflow never prints the secret. If the secret is absent, the job fails before installing or
calling the model.

## Running it

1. Open **Actions**.
2. Select **Decision Baseline Evidence**.
3. Choose **Run workflow**.
4. Select branch `main`.
5. Keep `gpt-5.6-luna` for the first baseline unless intentionally testing another OpenAI model.
6. Run the workflow.

Do not use **Re-run jobs** on an older baseline run because GitHub preserves the historical
workflow revision.

## Execution sequence

The workflow:

1. verifies the checked-out SHA is the current `origin/main`;
2. verifies that `OPENAI_API_KEY` is present;
3. installs the frozen Bun lockfile;
4. runs one safe structured-decision preflight;
5. runs the fixed 18-case baseline only when preflight succeeds;
6. validates `sentinel.decision-shadow-report.v1`;
7. uploads the validated JSON evidence artifact.

## Safe preflight diagnostics

The preflight prints only bounded categories such as:

- `reference-error`
- `type-error`
- `http-401`
- `http-403`
- `http-404`
- `http-429`
- `http-5xx`
- `network`
- `tool-response-missing`
- `invalid-envelope`
- `unknown`

It does not print raw exception text, response bodies, prompts, case context or credentials.

## Promotion boundary

A valid baseline artifact is evidence only.

It does not authorize:

- canary traffic;
- production routing;
- tool execution;
- permission changes;
- rollback;
- model promotion.

Candidate comparison remains a separate explicit review step.
