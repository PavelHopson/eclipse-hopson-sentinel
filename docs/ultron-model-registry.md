# Eclipse Ultron model registry

Updated: 2026-09-18

## Production voice profile

| Role | Model | Endpoint | Reason |
|---|---|---|---|
| Live voice | `qwen3:8b` Q4_K_M | `127.0.0.1:11434` | Fastest installed local profile; no tool access; suitable for short spoken turns. |

The voice surface pins this model. A stored Lab selection cannot silently replace it.

## Isolated Lab inventory

| Model | Status | Runtime boundary | Decision |
|---|---|---|---|
| `huihui_ai/qwen3.8-abliterated:27b` Q4_K_M | Installed | Ollama Lab on `127.0.0.1:11435`; no tools, files, shell, network, secrets, or Operator execute | Retain for comparisons. Measured cold start on this PC was about 233 seconds, so it is excluded from live voice. |
| `hf.co/chimingw/Qwen3.8-27B-Uncensored-OrcaRouter-GGUF:Q4_K_M` | Installed, benchmark pending | Same Lab boundary; never a voice default | Keep as a local Q4 experiment and benchmark against HuiHui before any promotion. |
| `qwen3.8-cyber-iq4xs:27b` | Import script ready, benchmark pending | Non-MTP GGUF from `cyjin-yl`, imported into the same Lab endpoint; no tools, files, shell, network, secrets, or Operator execute | Use the explicit installer, verify the pinned SHA-256, then benchmark before any promotion. |

### Qwen3.8 Cyber IQ4_XS

- Source: <https://huggingface.co/cyjin-yl/Qwen3.8-27B-Uncensored-Cyber-agentic-imatrix-GGUF>
- Import artifact: `Qwen3.8-27B-Uncensored-Cyber-IQ4_XS-imatrix-fromq8.gguf` (about 14.96 GiB).
- Pinned SHA-256: `d11d28b9b253fb7fc9de277a46af5bbd790c000d6bfdfe5648fd7b62ec2560b7`.
- The repository also publishes a `plus-mtp` artifact. It is intended for a runtime that supports the grafted MTP tensors; the Lab installer deliberately uses the conventional non-MTP file.
- The model card reports a 262,144-token architectural/production configuration, but that result was measured with FastLLM on a V100. The Ultron pilot starts at `num_ctx=8192` and `num_predict=4096`; raise those only after measuring VRAM, RAM, cold start and sustained tokens/sec on the target machine.
- The vision projector is a separate artifact and is not included in the imported GGUF. The current Ultron chat is text-only, so this integration does not claim image understanding.
- The publisher describes the upstream model as de-refusal/abliterated and cyber/offensive-security oriented. Treat its output as untrusted text; it receives no tools or credentials and cannot authorize actions.

## Evidence review: OrcaRouter and AEON

### OrcaRouter FP8 / GGUF

- Direct source: <https://huggingface.co/orcarouter/Qwen3.8-27B-Uncensored-FP8>
- Ollama-compatible pinned GGUF conversion: <https://huggingface.co/chimingw/Qwen3.8-27B-Uncensored-OrcaRouter-GGUF>
- Apache-2.0 is stated by both repositories.
- The publisher reports preserved reasoning and vision and benchmark deltas within 1.3 points of the base. These are publisher results, not independent Eclipse Forge validation.
- Native FP8 weighs about 31 GB and the publisher states a minimum of about 40 GB VRAM; the current RTX 4060 Ti has 16 GB VRAM. The native build is therefore rejected for this workstation.
- Q4_K_M is the practical local candidate. With 64 GB system RAM it can run with partial CPU offload, but it is expected to be too slow for live conversation.
- The pinned Q4 build is installed in the E-drive Lab runtime. Ollama verified the downloaded blobs and registered manifest digest `6e33a17b4eac0310b9bef6f005815e68d41b72f4ddaaa7c04fdca80245239b7b`; the local inventory reports 17,741,872,653 bytes, 27.3B parameters, vision capability, and a 262,144-token architectural context limit.
- Installation does not equal promotion: latency, memory use, Russian conversation quality, visual understanding, and refusal/safety behavior still require a recorded benchmark against the existing HuiHui build.
- The advertised 262K context is an architectural maximum. Actual usable context depends on KV cache and available memory; Eclipse Ultron does not claim 262K on this PC.

### AEON BF16

- Source: <https://huggingface.co/AEON-7/Qwen3.8-27B-AEON-ULTIMATE-UNCENSORED-BF16>
- The author explicitly labels it an Early Access Draft, not GA, and documents repetition and coherence degradation on very long answers.
- BF16 is far beyond the practical memory target for this workstation. It is not approved for installation.

## Safety gate

All abliterated or “uncensored” models are untrusted text generators. They never receive tools or credentials and cannot authorize actions. Their output requires human review. Claims about “no censorship”, coding quality, context length, multimodality, or safety are treated as hypotheses until reproduced locally with recorded model revision, prompt set, latency, memory, and result receipts.
