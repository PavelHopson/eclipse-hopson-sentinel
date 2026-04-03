# Eclipse Hopson Sentinel on Android via Termux

Running `Eclipse Hopson Sentinel` on Android usually means using `Termux` together with a Linux environment through `proot`.

## Short path

1. Install `Termux`
2. Create Ubuntu with `proot-distro`
3. Install `git`, `curl`, `unzip`, `nodejs`
4. Install Bun inside the Ubuntu environment
5. Clone the repository:

```bash
git clone https://github.com/PavelHopson/eclipse-hopson-sentinel.git
cd eclipse-hopson-sentinel
```

6. Install dependencies and build:

```bash
bun install
bun run build
```

7. Run the core:

```bash
node dist/cli.mjs
```

## OpenAI-compatible mode

```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_API_KEY=sk-your-key-here
export OPENAI_MODEL=gpt-4o
node dist/cli.mjs
```

## Local Ollama mode

```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_BASE_URL=http://localhost:11434/v1
export OPENAI_MODEL=qwen2.5-coder:7b
node dist/cli.mjs
```

## Notes

- inherited `CLAUDE_CODE_*` variables are still used for compatibility
- weaker devices should use lighter models
- rebuild after pulling source updates
