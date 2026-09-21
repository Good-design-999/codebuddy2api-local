# WebUI guide

[Home](../README.md) · [简体中文](webui.zh-CN.md)

## Open the console

Start the gateway using the [deployment guide](deployment.md), then open `http://127.0.0.1:8787/dashboard` and sign in with the current API key. Source installs need a frontend build; Docker builds include it. Use HTTPS unless connecting locally.

The first unconfigured local startup generates and saves a default key, shown once in the terminal and reused afterward. An explicitly empty key locks management. After changing the effective key, sign in again and restart unfinished OAuth logins.

## Overview

Select 1/7/30/90 days and automatic/hourly/daily granularity. Automatic uses hours for one day and days otherwise; ranges follow UTC calendar days. Missing hourly history is marked, never reconstructed from daily totals, and detail cleanup preserves hourly aggregates. Official balances may include usage from other clients.

Hover or tap the trend for the period's requests, successes and failures; keyboard arrows and Home/End select points. Missing hourly spans stay empty.

## Credentials

Add accounts by browser login — Mainland China (CN), International WorkBuddy or International CodeBuddy — or import `.info`/ZIP files.

- **Runtime states:** distinguish manual disabling, credential-level authentication circuits and model-level 429 cooldowns. Disabling keeps files; deletion removes them and requires removing model bindings first. Exports preserve safe UTF-8 filenames (otherwise `credential.info`/`credentials.zip`) and contain plaintext credentials; do not share them.
- **Login drawer:** successful OAuth enrollment closes the drawer and refreshes the list. The official tab keeps `noopener` isolation and must be closed manually. Failures stay visible; closing the drawer stops polling.
- **Maintenance actions:** each row offers token refresh, check-in and balance sync; batch check-in and sync stay separate. Sync updates balances, catalogs and usage without check-in, travel or trial claims. Busy maintenance returns 409; a client timeout does not cancel server work.

### Automation

Automatic check-in and travel are persisted per account and apply live: on by default for domestic accounts, off internationally. Disabled accounts run no automatic tasks; inactive or unconfirmed activities never authorize claims. Saving a preference does not claim immediately and cannot retract sent requests; the console shows last results, partial completion and uncertainty.

- **Domestic travel** follows its own switch, including when check-in is already complete or disabled. "Travel status" only queries; "Claim / dispatch" claims arrivals, rechecks idle state and the daily limit, then chooses a current upstream location. Invalid location configuration stops dispatch.
- **First-Buddy onboarding:** one agreement checkbox completes `first_buddy` through one real WorkBuddy conversation if needed, then adopts and dispatches. No separate task acceptance is required. The conversation requests at most 32 output tokens and may use credits; an eligible zero-rate model is preferred, and official completion is checked before adoption. `CODEBUDDY2API_AUTO_ACCEPT_BUDDY=true` preauthorizes enabled domestic accounts, including future imports, after restart; default is false, automatic follow-up respects the travel switch, and no other reward tasks, paid boxes or trial claims run.
- **International WorkBuddy trial credits** require manual confirmation in the credential row's drawer. "Refresh claim status" only reads the local ledger and never claims. On network or persistence failure, verify status before another attempt; environment-driven automatic claims are retired.

Reward claims and departures are durably reserved before sending. Stale or failed readbacks block repeat writes across restarts, without time-based expiry; only a reconciled state or definite pre-send cancellation/rejection releases them, and unconfirmed first-claim sends only reconcile through reads, even after 24 hours or a restart. Definitely unsent conversations may resume after settings or models recover; uncertain conversations are not repeated. Consent and outcomes are audited, and blocked automatic travel adds at most one warning per account per local day without failing check-in or balance sync. Keep `control.sqlite3` when upgrading.

## Models

Add independent mappings with public/upstream IDs and local enablement. Choose either specific accounts or a region with an optional product filter; switching modes clears the opposite binding. Unavailable candidates never cause out-of-scope fallback.

- **Model details** shows descriptions, capability states, token limits, reasoning options and safe raw metadata by product; differences remain separate. Declarations are read-only and do not guarantee native or measured support. Route previews use the draft binding scope.
- International catalogs are shared and deduplicated. Inherited entries show "Shared catalog source" with expandable safe originals; native declarations and shared references remain distinguishable.

## Logs

Filter requests and inspect failed attempts. Closing details or switching log type cancels pending detail loads. Clearing details keeps historical statistics.

Clearing **all logs and statistics** is irreversible. Enter the confirmation text shown in the dialog and re-enter the current API key. This does not delete credentials or gateway settings.

## Settings

Edit unlocked options; hot changes apply immediately, while restart-marked settings require a manual restart. Change locked options in the startup configuration; see [configuration precedence](advanced.md#configuration-and-cli).

- "Keep tool descriptions" is off by default and works across all three protocols, independently of prompt compaction; see [tool metadata retention](advanced.md#tool-metadata-retention).
- "Model capability preflight" defaults to on. Disabling it affects new requests only, not metadata display, international image-run merging or existing security limits; see [model declarations](advanced.md#model-declarations-and-image-compatibility).
- "Extra trusted management origins" (`admin_allowed_origins`) fixes sign-in behind HTTPS reverse proxies; see [Management Origin checks](advanced.md#management-origin--csrf-switch).

## Interface behavior

The sidebar remembers its icon-only mode. Drawers lock background scrolling, close on backdrop clicks or Esc, and restore focus; saves, imports and deletions prevent accidental dismissal while pending. Details use labeled fields and status groups with folded raw diagnostics. Glass surfaces fall back to solid colors when transparency is reduced or blur is unsupported.

The appearance icon offers light, dark and system-following modes. Four palettes affect light mode only; dark mode stays fixed and the light preference is retained. Preferences are browser-local. Drawers fade/slide in and out, retaining the scroll lock through exit; reduced-motion settings skip animation.

## Model mappings and statistics API

Multiple independent mappings may share an upstream model. Custom mapping IDs are management-only; clients use `public_id`. Existing account capability, balance and avoidance checks still apply. Legacy combined account/region scopes keep their original intersection until an explicit mode is selected during editing.

- Create: `POST /admin/models` with `public_id`, `upstream_id` and scope; edit: `PUT /admin/models/{id}`; delete: `DELETE /admin/models/{id}` (custom mappings only). Writes require the current `revision`.
- Preview: `POST /admin/models/preview` or `POST /admin/models/{id}/preview`. `credential_ids` is mutually exclusive with `region`/`profile`.
- Statistics: `GET /admin/dashboard?days=1&granularity=auto`, with `auto`, `hour` or `day`. Responses identify `range.granularity`, `range.partial` and UTC buckets without inventing missing hourly history.

## Data and backups

Data defaults to `auth/`, or `/data/auth` inside Docker. Local installs can set `CODEBUDDY_AUTH_DIR`; Compose uses `CODEBUDDY2API_AUTH_PATH` for the host directory.

| File | Contents |
|------|----------|
| `*.info` | Official plaintext credentials; never migrated into SQLite |
| `control.sqlite3` | Settings, private default key, model rules, sessions, cooldowns, credit/reward state, usage and catalogs |
| `logs.sqlite3` | Request details and independent aggregate statistics |

Auditing defaults to 30-day detail retention and a 256 MiB logical detail budget, **not a hard limit on database or directory disk usage**. Detail cleanup and eviction preserve aggregates. SQLite failure diagnostics have a separate budget, defaulting to 8192 bytes. Existing text logs are retained, not backfilled as precise statistics.

Mount the whole data directory on writable local storage, not just a single database file, and do not share it between gateway instances.

Stop the gateway before copying the entire directory, including databases, WAL/SHM files, credentials and migration backups; do not back up only `.info`. Protect the control database: it contains the default key and management sessions.

Legacy JSON is imported once; SQLite is authoritative afterward. Downgrades require a stopped gateway and matching state migration, never stale JSON overwriting new claims or revoked sessions. See [upgrade and state migration](deployment.md#upgrade-and-state-migration).

See [client configuration](clients.md) for API keys and URLs.
