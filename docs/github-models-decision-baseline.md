# GitHub Models baseline workflow

The repository includes a manual GitHub Actions workflow named **Decision Baseline Evidence**.

It exists to produce the first reproducible live Decision Layer baseline without storing a new
provider secret in the repository.

## Why GitHub Models

Sentinel already supports GitHub Models through its existing OpenAI-compatible provider shim:

- `CLAUDE_CODE_USE_GITHUB=1`
- `GITHUB_TOKEN` or `GH_TOKEN`
- `models.github.ai`

GitHub Actions can grant the built-in `GITHUB_TOKEN` read-only GitHub Models inference access with
the workflow permission `models: read`.

The workflow asks only for:

```yaml
permissions:
  contents: read
  models: read
```

No PAT or repository secret is required.

## Running it

1. Open the repository's **Actions** tab.
2. Select **Decision Baseline Evidence**.
3. Choose **Run workflow**.
4. Keep the default `github:copilot` alias for the first baseline, or explicitly select another
   GitHub Models model ID.
5. After the run completes, download the `decision-baseline-<run id>-<short sha>` artifact.

The workflow is **manual only**. It is not triggered by push, pull request, schedule, or merge.

## What the workflow does

1. checks out the exact requested commit;
2. installs the frozen lockfile with Bun;
3. runs `decision:shadow:baseline`;
4. locates the timestamped JSON evidence file;
5. validates the file against `sentinel.decision-shadow-report.v1`;
6. requires at least one schema-valid live decision before treating the run as baseline evidence;
7. uploads only the validated evidence JSON as an Actions artifact.

The workflow does not modify repository contents, open PRs, update model defaults, or enable canary
traffic.

## Cost / quota boundary

Running the workflow invokes GitHub Models inference for the fixed 18-case seed corpus. Because
model access can be subject to account-specific quotas or billing, the workflow requires an
explicit human **Run workflow** action and is never automatic.


## Invalid diagnostic runs

A workflow can produce a schema-valid JSON file even when the decision engine itself failed before
inference. Such a file is diagnostic evidence, not a model baseline.

The workflow therefore uses `--require-live-engine`. If the report contains zero valid decisions,
the job fails before artifact upload.

The first diagnostic run on 2026-09-21 exposed a raw-script compatibility bug: `sideQuery` and
the attribution header referenced build-time `MACRO.VERSION` directly. In a raw Bun script that
symbol can be absent, causing every case to fail locally before any provider request. The runtime
now resolves the version through a raw-script-safe fallback instead.


## Fresh-run provenance

A Decision Baseline Evidence run is accepted only when its checked-out commit exactly matches the
current `origin/main`.

The workflow fetches `origin/main`, prints both SHAs, and fails before inference when they differ.
The artifact name includes the short source SHA.

Do not use **Re-run jobs** on an older Decision Baseline Evidence run. GitHub re-runs the historical
workflow against that run's original `head_sha`, which can execute obsolete runner code even after
fixes have merged.

To obtain a fresh baseline, open the workflow page and choose **Run workflow** on branch `main`.
