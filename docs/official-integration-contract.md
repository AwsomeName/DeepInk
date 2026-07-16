# Official Integration Contract

## Conclusion

CCLink Studio should expose explicit extension seams for the official build, but the open source repository must not ship production endpoints, paid feature logic, account truth, message credentials, quota enforcement, signing material, notarization secrets, or artifact delivery credentials.

The official integration layer is owned by `cclink-dev`, backed by the CCLink service workspace under `/Users/apple/Desktop/chat-cc`.

## Required Inputs From The Official Side

To finalize the integration interface, the official side needs to provide:

- Integration package layout: where main-process, preload, renderer, and release hooks live.
- Build profile names: development, internal, beta, stable, and any region-specific profile.
- Endpoint injection schema: typed names, required/optional status, and validation rules.
- Account service contract: login, device registration, pairing, session refresh, logout, and error model.
- Message credential provider contract: how the desktop obtains short-lived messaging credentials without exposing secrets to renderer state.
- Entitlement and quota contract: local cache shape, refresh cadence, offline grace behavior, and failure semantics.
- Official runtime contract: how desktop tasks connect to the private runtime and how task state is surfaced.
- Release provider contract: update feed, artifact delivery adapter, signing, notarization, and rollout channel metadata.
- Telemetry and diagnostics boundary: what the open source shell may emit, what the official build may add, and how users can inspect it.
- Test matrix: open source build, official dev build, official production build, migrated user data, and downgrade scenarios.

## Studio Extension Seams

The open source shell can provide these seams:

- Main-process service registry hooks.
- Preload API augmentation with a namespaced official object.
- Renderer feature slots for account status, entitlement status, device status, network runtime entries, and update status.
- IPC registration hooks with schema validation.
- Build-time config validation that rejects production values in open source defaults.
- Update provider abstraction with a no-production default implementation.
- Workspace snapshot handling hooks for official entries.

These seams should be inert by default. A clean open source build must not try to load an absent official integration layer.

## Hard Boundaries

- No official production endpoint in open source defaults.
- No paid feature gate that blocks local open source functionality.
- No long-lived secret in renderer state, preload globals, local storage, logs, screenshots, or diagnostics bundles.
- No direct dependency on official service packages from open source runtime entry points.
- No artifact delivery, signing, or notarization credential in this repository.
- No official runtime client initialized unless the official integration layer is present and validated.

## Proposed Interface Shape

```ts
export interface OfficialIntegration {
  readonly id: string
  readonly buildProfile: 'oss' | 'dev' | 'internal' | 'beta' | 'stable'
  registerMainServices(context: OfficialMainContext): Promise<void>
  registerIpc?(context: OfficialIpcContext): Promise<void>
  exposePreload?(context: OfficialPreloadContext): OfficialPreloadApi
  registerRendererFeatures?(context: OfficialRendererContext): OfficialRendererFeatures
  createUpdateProvider?(context: OfficialReleaseContext): OfficialUpdateProvider
}
```

The open source shell owns the context interfaces and default no-op providers. The official integration layer owns the implementations.

## Acceptance Standards

- `pnpm typecheck` passes with no official integration layer installed.
- `pnpm test` includes no-integration startup tests.
- A production endpoint scan over the open source repository returns empty.
- The official build can be assembled by `cclink-dev` without patching source files in place.
- Secrets never cross into renderer stores except as non-sensitive status snapshots.

## Questions For The Official Side

1. Which integration package format should `cclink-dev` produce: source copied before build, local package dependency, or generated virtual module?
2. Does the official runtime need a single connection manager or separate task, file, and terminal providers?
3. What is the minimum offline behavior for entitlement and quota?
4. Which update channels exist, and does channel selection belong to build config or user settings?
5. Should official diagnostics be exportable from the open source diagnostics panel, or kept behind an official-only panel?

Until these are answered, the safe default is a typed no-op integration interface with compile-time validation and no production values in this repository.

## Current OSS Implementation

The open source shell now owns a minimal inert integration surface:

- Shared status contract: `src/shared/ipc/official.ts`.
- Main-process no-op implementation: `src/main/official/official-integration.ts`.
- Assembly seam: `src/main/official/official-integration-loader.ts`.
- Read-only IPC probe: `official:getStatus`.
- Preload namespace: `window.cclinkStudio.official.getStatus()`.
- Runtime hook points: `registerMainServices()` and `registerIpc()` are invoked with typed contexts, but the OSS implementation is a no-op.

`loadOfficialIntegration()` is the only main-process assembly point the official build should replace or alias. The default implementation always returns `createNoopOfficialIntegration()`. Core runtime startup must not import official account, message, quota, release, or runtime packages directly.

In OSS builds this returns:

```ts
{
  id: 'oss-noop',
  buildProfile: 'oss',
  available: false,
  reason: 'official-integration-not-installed',
  features: {
    account: false,
    deviceRegistry: false,
    messageNetwork: false,
    entitlement: false,
    quota: false,
    officialRuntime: false,
    releaseProvider: false,
  },
}
```

This is intentionally a status probe only. It does not expose login, message credentials, device registry, entitlement, quota, release upload, signing, notarization, or official runtime APIs.
