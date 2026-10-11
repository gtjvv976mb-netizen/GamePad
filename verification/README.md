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

## Original offline campaigns

| Check | Result |
| --- | --- |
| Production TypeScript/Vite build and offline generation | Pass; 16 games, 90 chapters |
| Action engine models | 13 cases pass; all 30 chapters complete through controls |
| Adventure engine models | 34 cases pass; all 24 chapters complete through controls |
| Strategy engine models | 41 cases pass; all 36 chapters complete through controls |
| Offline/runtime browser checks | 44 pass across desktop and phone |
| Full app and game Playwright suite | 185 pass, 87 intentional skips, 32.1 seconds |
| Git whitespace and ignored-key checks | Pass |

Every downloaded game was opened with a `file://` URL and network disabled. Checks cover meaningful input, rendering, pause, exact save/resume, malformed saves, export/import, wrong-game rejection, blocked-storage fallback, standard controller input and touch controls. A complete six-chapter Lumen Cascade campaign was solved through board taps and keys, with unlocks, reload and a persistent ending. Store trials, Library full campaigns, standalone downloads, phone text legibility and short desktop windows were also verified. Existing store, resale, wallet, motion and mocked live-mode regressions pass.

The 87 skips comprise 75 duplicate Node model cases on the phone project (34 adventure and 41 strategy) and 12 existing duplicate Node/live or phone-only exclusions. The local run used installed Google Chrome with a temporary local Playwright configuration because the package-matched cached Chromium was unavailable. CI uses the repository configuration and installs its matching Chromium. The temporary configuration is not committed. Final local logs remain ignored at `verification/offline-build.log` and `verification/offline-final-suite.log`.

Screenshots show the full Hollow Crown campaign running inside GamePad: [desktop](gamepad-campaign-desktop.png) and [phone](gamepad-campaign-phone.png).

The on-chain program is unchanged by this feature; its prior native and SBF validation above applies to the merged baseline. Local offline-games development did not perform funding, transactions, deployment, Pages publication or account settings. The later authorized frontend publication is recorded below. Recovery remains partial as recorded in `HANDOFF.md`.

## Live site integration

PR [#5](https://github.com/gtjvv976mb-netizen/GamePad/pull/5) was merged into `main` at source `ceb94e0ff0e2401ef4fade71d3895594d7d26cb5`. The reviewed feature and merged source passed both GitHub CI jobs: 185 browser/model checks (87 intentional skips), native program tests and SBF build. The merged-source CI run is [38150142190](https://github.com/gtjvv976mb-netizen/GamePad/actions/runs/38150142190). Authorized Pages publication [run 38150162564](https://github.com/gtjvv976mb-netizen/GamePad/actions/runs/38150162564) succeeded.

The existing Store/Library integration case was then run against **https://gamedotpad.com/** using isolated desktop and phone browser contexts: 2 passed in 9.9 seconds. Each checked a wallet-free trial, return to Store, simulated Preview purchase, Library launch with all six chapters, offline HTML download with all code inline and the network-blocking CSP, and return focus. Live screenshots: [desktop](gamepad-live-desktop.png) and [phone](gamepad-live-phone.png). The ignored log is `verification/live-pages-integration.log`; the temporary live-test configuration was removed.

An independent HTTP audit fetched the live manifest and all 16 game HTML endpoints successfully. Each was SHA-256-identical to the tested file under `dist/games/`; all game HTML contains inline code/styles and a network-blocking CSP. The published frontend bundle was also checked for the trial, full-play and download controls.

Frontend publication did not configure the store program, change deployment variables or perform on-chain transactions. Purchases remain Preview mode.
