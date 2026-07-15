# Official Commercial Overlay Interface Requirements

## Conclusion

CCLink Studio should expose explicit extension seams for the official build, but the open source repository must not ship production endpoints, paid feature logic, account truth, message credentials, quota enforcement, signing material, notarization secrets, or artifact delivery credentials.

The official overlay should be a build-time and runtime augmentation layer owned by `cclink-dev`, backed by the CCLink service workspace under `/Users/apple/Desktop/chat-cc`.

## Required Inputs From The Official Side

To finalize the overlay interface, the official side needs to provide:

- Overlay package layout: where main-process, preload, renderer, and release hooks live.
- Build profile names: development, internal, beta, stable, and any region-specific profile.
- Endpoint injection schema: typed names, required/optional status, and validation rules.
- Account service contract: login, device registration, pairing, session refresh, logout, and error model.
- Message credential provider contract: how the desktop obtains short-lived messaging credentials without exposing secrets to renderer state.
- Entitlement and quota contract: local cache shape, refresh cadence, offline grace behavior, and failure semantics.
- Official runtime contract: how desktop tasks connect to the private runtime and how task state is surfaced.
- Release provider contract: update feed, artifact delivery adapter, signing, notarization, and rollout channel metadata.
- Telemetry and diagnostics boundary: what the open source shell may emit, what the official build may add, and how users can inspect it.
- Test matrix: open source build, official dev build, official production build, migrated user data, and downgrade scenarios.

## Open Source Extension Seams

The open source shell can provide these seams:

- Main-process service registry hooks.
- Preload API augmentation with a namespaced official object.
- Renderer feature slots for account status, entitlement status, device status, network runtime entries, and update status.
- IPC registration hooks with schema validation.
- Build-time config validation that rejects production values in open source defaults.
- Update provider abstraction with a no-production default implementation.
- Workspace snapshot downgrade hooks for unsupported official entries.

These seams should be inert by default. A clean open source build must not try to load an absent overlay.

## Hard Boundaries

- No official production endpoint in open source defaults.
- No paid feature gate that blocks local open source functionality.
- No long-lived secret in renderer state, preload globals, local storage, logs, screenshots, or diagnostics bundles.
- No direct dependency on commercial service packages from open source runtime entry points.
- No artifact delivery, signing, or notarization credential in this repository.
- No official runtime client initialized unless the official overlay is present and validated.

## Proposed Interface Shape

```ts
export interface CommercialOverlay {
  readonly id: string
  readonly buildProfile: 'dev' | 'internal' | 'beta' | 'stable'
  registerMainServices(context: OverlayMainContext): Promise<void>
  registerIpc?(context: OverlayIpcContext): Promise<void>
  exposePreload?(context: OverlayPreloadContext): OverlayPreloadApi
  registerRendererFeatures?(context: OverlayRendererContext): OverlayRendererFeatures
  createUpdateProvider?(context: OverlayReleaseContext): OverlayUpdateProvider
}
```

The open source shell owns the context interfaces and default no-op providers. The official overlay owns the implementations.

## Acceptance Standards

- `pnpm typecheck` passes with no overlay installed.
- `pnpm test` includes no-overlay startup and unsupported snapshot downgrade tests.
- A production endpoint scan over the open source repository returns empty.
- The official build can be assembled by `cclink-dev` without patching source files in place.
- Secrets never cross into renderer stores except as non-sensitive status snapshots.

## Questions For The Official Side

1. Which overlay package format should `cclink-dev` produce: source overlay copied before build, local package dependency, or generated virtual module?
2. Does the official runtime need a single connection manager or separate task, file, and terminal providers?
3. What is the minimum offline behavior for entitlement and quota?
4. Which update channels exist, and does channel selection belong to build config or user settings?
5. Should official diagnostics be exportable from the open source diagnostics panel, or kept behind an official-only panel?

Until these are answered, the safe default is a typed no-op overlay interface with compile-time validation and no production values in this repository.
