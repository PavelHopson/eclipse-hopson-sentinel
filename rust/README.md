# Eclipse Hopson Sentinel Rust Runtime

High-performance Rust runtime for `Eclipse Hopson Sentinel`.

This workspace is the next-generation engine layer of Sentinel and is being developed in parallel with the current TypeScript runtime.

## Build

```bash
cargo build --release
```

## Run

```bash
./target/release/sentinel-rust
```

Example:

```bash
./target/release/sentinel-rust prompt "explain this codebase"
```

## Notes

- this workspace is not yet the default production runtime
- the primary operational engine still lives in the root TypeScript runtime
- the binary name is `sentinel-rust`
