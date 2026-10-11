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

## Quality rebuild — 12 October 2026

All 16 original games were rebuilt after the user requested higher quality games informed by the Steam research. The catalog keeps its 90 chapters, SOL terms and chain IDs. Campaigns now include larger scrolling worlds, original illustrated sprites, animated environments, locally synthesized music, persistent equipment, distinct enemy and boss behaviors, authored machinery and multi-room optical puzzles. The design and compact browser-game scope are documented in `src/games/DESIGN.md`; image-generation prompts and provenance are in `src/games/assets/PROMPTS.md`.

| Check | Result |
| --- | --- |
| Production TypeScript/Vite build and offline generation | Pass; 16 self-contained HTML files, 90 chapters |
| Action models | 26 cases pass; all 30 chapters through controls |
| Adventure models | 13 cases pass; all 24 chapters through controls |
| Strategy models | 78 cases pass; all 36 chapters and 18 nested optical rooms through controls |
| Full local app/game suite | All 238 checks reported passing, 102 intentional skips; local runner stalled during worker shutdown |
| Final offline/runtime checks after toolbar correction | 58 pass, 51.0 seconds; clean exit |
| Independent runtime/integration review | One keyboard-toolbar interception fixed; no other material finding |
| Git whitespace and ignored-key checks | Pass |

The full run includes every downloaded title opened with networking disabled and its embedded art loaded; save/resume, migration preserving old unlocks, invalid import rejection, controller and touch input, modal freeze, tactical focus, music gesture/mute/pause, a complete campaign ending, Store trials, Library full campaigns and downloads. The final runtime run repeats these checks after allowing native Enter/Space activation on focused toolbar controls and exits successfully. The local configuration used installed Google Chrome because the package-matched cached Chromium was absent. All full-suite assertions completed, but that runner did not exit cleanly during worker teardown; the final offline/runtime run exited cleanly, and GitHub CI must provide the complete clean-exit release check. Earlier interrupted local runs are not reported as complete passes. Logs remain ignored under `verification/quality-*.log`; temporary local configurations are excluded from Git.

The 102 skips are 90 duplicate Node model checks on the phone project (12 adventure and 78 strategy) and 12 existing duplicate Node/live or phone-only exclusions. One adventure fractional-HP regression executes on both projects, and action models also execute on both. Local integration screenshots: [desktop](quality-integrated-desktop.png) and [phone](quality-integrated-phone.png).

Rebuilt save schemas validate simulation state and title-specific equipment before replacing the current game. Old prototype saves preserve unlocks and start their changed chapter fresh. Repeated first-clear rewards cannot be farmed through replay or restored saves. Reviews also corrected legitimate failed-state restores, permissive tavern service quotas, functional optical upgrades, bounded card-event rewards, fractional enemy HP validation, boat/vehicle sprite orientation and decision/focus transitions.

No on-chain code, program configuration, repository deployment variable, funding or transaction changed. Recovery remains partial. The reviewed and merged rebuild passed GitHub CI; its publication and the loading follow-up are recorded below.

## Quality publication and loading optimization

PR [#6](https://github.com/gtjvv976mb-netizen/GamePad/pull/6) merged at `1fc323ba4aa39f46fe347c736b721c9c9fbfd5da`. Reviewed [CI 38154205972](https://github.com/gtjvv976mb-netizen/GamePad/actions/runs/38154205972) and merged-source [CI 38154517411](https://github.com/gtjvv976mb-netizen/GamePad/actions/runs/38154517411) passed both app and program jobs: **240 checks, 102 intentional skips**, native tests and SBF build. The reviewed browser run exited cleanly in 2.9 minutes. [Pages 38154538527](https://github.com/gtjvv976mb-netizen/GamePad/actions/runs/38154538527) succeeded. An HTTP audit confirmed the live manifest and all 16 game HTML files matched the tested build exactly.

The first live integration run exceeded the default five-second assertion timeout while the campaign document downloaded. Each roughly 9 MB file included every atlas. The follow-up packages only the atlas groups actually used by each title, preserving the artwork and reducing individual HTML to 2,810,808–5,980,350 bytes (about 34–69% smaller; 79,127,975 total HTML bytes). The manifest lists the included groups. Embedded play shows a loading status until the document arrives; live verification allows 30 seconds for assertions and runs separately from the multi-file HTTP audit. The production build and final local run pass: **61 checks, one intentional duplicate skip, clean exit in 1.4 minutes**. Coverage includes exact included-atlas bytes, all 16 games with networking disabled and delayed-document loading feedback. An independent review confirmed every included PNG matches its original source bytes.

PR [#7](https://github.com/gtjvv976mb-netizen/GamePad/pull/7) merged at release source `9b7ff4d562a09d05fd0d223003615eb5cf8b5acd`. Reviewed [CI 38155328591](https://github.com/gtjvv976mb-netizen/GamePad/actions/runs/38155328591) and merged-source [CI 38155656331](https://github.com/gtjvv976mb-netizen/GamePad/actions/runs/38155656331) passed both jobs: **243 browser/model checks, 103 intentional skips**, 11 native program tests and SBF build. The browser runs exited cleanly in 3.2 and 2.7 minutes respectively. The additional skip is the included-atlas Node audit on the duplicate phone project. [Pages 38155670404](https://github.com/gtjvv976mb-netizen/GamePad/actions/runs/38155670404) published this release successfully.

The live Store/Library integration case passed on desktop and phone: **2 passed, 15.8 seconds**. It checks a wallet-free trial, simulated Preview purchase, all six Hollow Crown chapters available in the Library launch, a self-contained download and return focus. Screenshots: [desktop](quality-live-desktop.png) and [phone](quality-live-phone.png). The log is retained locally as ignored `quality-live-final.log`; the temporary live-test configuration was removed.

The final independent HTTP audit fetched the manifest and all 16 HTML endpoints and confirmed every decoded file matches `dist/games/` by byte count and SHA-256. Results are recorded in [quality-live-audit.json](quality-live-audit.json). The published storefront entry also matches a local build using the Pages workflow's empty environment variables; that build was generated under `/tmp` without replacing the tested offline files or ZIP.

The offline collection is packaged locally as `dist/gamepad-offline-campaigns.zip` (57,550,083 bytes), SHA-256 `0995fc3a8524a85a797fd572fe91a0f6855e79102e920db5062b8ed510e86098`. ZIP integrity and all 16 bundled HTML files were checked against the tested build. This local download artifact is ignored by Git. No on-chain deployment, funding, transaction or repository configuration changed; the repository variable listing remains empty and purchases remain browser-only Preview. Recovery remains partial.
