# Verification — 11 October 2026

| Check | Result |
| --- | --- |
| Production TypeScript/Vite build | Pass |
| Native program tests, regenerated public-ID fixture | 11 pass (9 behavior/security, fixture, ID) |
| Solana/SBF release build | Pass; Agave 4.3.0, platform tools v1.57, Rust 1.95.0 |
| Desktop/phone browser suite, installed Google Chrome | 40 distinct cases pass; 12 intentional skips |
| Mocked live-mode regressions | 5 pass: price consent, inactive game access, platform fees, overlapping reads, wrong-ledger refusal before signing |
| Independent program/seed and client reviews | No remaining blocking finding |
| Git whitespace and ignored-key checks | Pass |

The full local browser run passed 38 cases, skipped 12 and hit a timeout in the new delayed-read test. The test compared an RPC URL without its normalized trailing slash; changing the comparison to URL origin fixed the harness. All five live regressions were then rerun successfully, including the case skipped after that serial-test failure. Production code did not change between those runs. Logs are retained locally as ignored `*.log` files in this directory.

Browser live-mode tests use the real app providers and transaction serialization with mocked RPC/wallet responses. Rust behavior tests use the offline Solana test bank. No live devnet purchase, funding or deployment occurred. The published site and GitHub Actions history were verified separately; its store program variable is still absent.

The SBF artifact is `program/target/deploy/gamepad_store.so` (372,696 bytes), SHA-256 `56444e6e8f1b525e8962466593170a0fb3cf64e871b20c73530cf4f50ce0eaed`. It is prepared for public program ID `7WBHwtN7nZELLnhKAC3GiwZ4RTBjZPaGTrL9LbqYowS5`, not yet deployed. Private keys and tool downloads are ignored and not included in Git.
