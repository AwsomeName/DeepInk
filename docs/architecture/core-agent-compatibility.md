# coreAgent Compatibility Layer

Status: accepted

CCLink Studio keeps a pure re-export compatibility layer for the Agent files that were
moved to `coreAgent`.

Decision:
- Keep the existing CCLink Studio import paths as shims during the split.
- Each shim must contain exactly one `export * from 'core-agent/...'` line.
- New Agent core code belongs in `coreAgent`; CCLink Studio owns only host adapters,
  Electron IPC, BrowserWindow delivery, browser/editor/android concrete modules,
  and product integration.

Reason:
- This keeps the split low-risk while preserving existing CCLink Studio imports.
- The boundary is enforced by `npm run deepink:shim-check` and
  `npm run check:boundaries`.

Removal criteria:
- Remove the shims only after all CCLink Studio imports have moved directly to
  `core-agent/*` public entry points.
- The removal must be paired with a successful `npm run deepink:build`.
