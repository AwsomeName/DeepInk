# CCLink Studio Compatibility Migration Plan

## Conclusion

Do not mechanically rename legacy runtime identifiers in one release. CCLink Studio needs a compatibility bridge that can read old local state, write the new shape, and downgrade unsupported commercial workspace entries without pulling commercial modules back into the open source shell.

The migration is part of the open source shell boundary. It must be deterministic, local, observable in diagnostics, and safe to run repeatedly.

## Scope

The compatibility layer covers:

- Preload bridge namespace aliases.
- Electron application id and protocol ownership.
- Electron user data directory migration.
- Local storage and session storage keys.
- Project/account metadata filenames from older local projects.
- Workspace and tab snapshot entries that referred to official network entries.
- Browser profile partitions and download folders.
- Test fixtures that encode old persisted state.

It does not cover:

- Reintroducing account, subscription, quota, message, cloud sync, or official runtime services into the open source shell.
- Moving secrets into renderer state.
- Creating new production endpoints in this repository.
- Preserving unsupported commercial sessions as live tabs in the open source shell.

## Phase 0: Inventory Freeze

Goal: make every legacy identifier explicit before changing defaults.

Plan:

- Create a single compatibility inventory module for runtime identifiers.
- Add tests that prove the open source shell can start with old persisted settings.
- Add a document-only inventory for identifiers that must not be exposed in product copy.
- Mark each identifier as `read-only alias`, `dual-write`, `migrate-once`, or `drop-with-placeholder`.

Acceptance:

- No migration rule is hidden in random UI code.
- A scan can distinguish intentional compatibility identifiers from stale product naming.
- Unsupported commercial workspace entries restore as inert placeholders, not broken tabs.

## Phase 1: Read-Through Aliases

Goal: new code reads old local state without changing it yet.

Plan:

- Add alias readers for preload, settings, workspace snapshots, and local storage.
- Prefer new keys when both new and old keys exist.
- Add diagnostics that report which alias was used.
- Keep all alias reads behind small helper functions.

Acceptance:

- Existing local installs open without data loss.
- Fresh installs do not create old keys.
- Typecheck and tests prove renderer stores do not receive secrets.

## Phase 2: Dual-Write Window

Goal: move active users to the new names while old releases can still read critical state during rollback.

Plan:

- Write new keys as primary.
- Optionally mirror non-sensitive compatibility state to old keys for one release window.
- Never dual-write credentials or service secrets.
- Add a migration version marker.

Acceptance:

- Downgrade to the previous compatible release does not strand local workspace state.
- Sensitive account/runtime material remains outside renderer-accessible storage.
- Re-running migration is idempotent.

## Phase 3: One-Time Local Migration

Goal: move durable local data to the new storage layout.

Plan:

- Create a migration transaction with backup, copy, verify, and commit steps.
- Back up only local non-secret metadata by default.
- For protected secrets, require the platform encrypted store to be available before migration.
- If protected storage is unavailable, leave a clear local diagnostic and do not create plaintext replacements.

Acceptance:

- A failed migration can be retried.
- Backups are bounded and named by migration version.
- Tests cover missing old data, corrupted old data, partial migration, and repeated migration.

## Phase 4: Commercial Snapshot Downgrade

Goal: old commercial workspace entries should not crash the open source shell.

Plan:

- Convert unsupported commercial tabs into inert restore notices.
- Preserve enough metadata for the official build to recover the session later.
- Do not load commercial providers, service clients, or IPC contracts.
- Add a user-facing action to remove unsupported entries from the local workspace.

Acceptance:

- Open source startup succeeds with snapshots produced by the official build.
- Unsupported entries are visible as placeholders, not silently lost.
- The open source shell never attempts to contact official services while restoring them.

## Phase 5: Default Switch

Goal: new installs only create CCLink Studio names and paths.

Plan:

- Change defaults only after read-through and one-time migration are covered by tests.
- Keep alias readers for at least two stable releases.
- Update packaging metadata and product copy after persistence migration is already safe.

Acceptance:

- Clean install contains no old product-facing names.
- Existing install migrates once and continues on the new defaults.
- The official build can inject its overlay without changing open source defaults.

## Phase 6: Removal Window

Goal: retire compatibility reads only after evidence says they are no longer needed.

Plan:

- Keep migration diagnostics in support bundles.
- Set a minimum release count before deleting alias reads.
- Delete aliases only with fixture tests proving unsupported old snapshots degrade intentionally.

Acceptance:

- Removal is tied to releases, not calendar guesses.
- Support can still explain what happened to old local state.
- No commercial implementation returns to this repository as part of cleanup.

## Risk Questions

1. What if we rename app identifiers before storage migration exists?
   Users can appear to lose local work because the app reads a new empty data directory.

2. What if unsupported commercial tabs are deleted silently?
   The open source shell becomes destructive when opened on a machine that also uses the official build.

3. What if we keep old identifiers throughout product copy?
   The migration never finishes; users keep seeing the wrong product model.

4. What if we migrate secrets without encrypted storage?
   We recreate the exact security failure the split was meant to prevent.

The next implementation step is a small compatibility inventory module plus fixture tests, not a global search-and-replace.
