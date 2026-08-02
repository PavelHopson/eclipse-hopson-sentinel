# Sentinel browser and Ads Operator boundaries

Sentinel may coordinate two read-only operational capabilities, but it does not own browser profiles,
advertising credentials or write access.

## JS-heavy browser requests

1. Eclipse Claw HTTP extraction remains the default path.
2. A planner may request an isolated browser worker only when the page requires JavaScript.
3. `decideBrowserCapability()` must approve the request before a worker call.
4. The policy accepts public HTTPS reads to an explicit domain allowlist. Cookie import and external
   telemetry are disabled. Payments, publishing, form submission and account changes stay blocked even
   after a human approval; those require a separate product-specific executor and risk review.
5. Page text is untrusted data. It never modifies the plan, tool policy, allowlist or approval state.

`safeCamofoxEnvironment()` documents the minimum adapter environment: loopback bind, a 32+ character
access key and crash telemetry disabled. It does not install or start Camofox. The wrapper and Camoufox
binary remain supply-chain gated until exact versions, checksums, bundled licenses and container policy
are reviewed.

## Advertising spend checks

`detectSpendAnomalies()` compares sanitized observations with an explicit baseline and hard limit.
Its only possible action is `notify_only`. A scheduled Sentinel task may send these findings to an
Eclipse Chat Advertising room, but cannot pause a campaign or change a budget.
