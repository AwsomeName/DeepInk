# cclink-dev Official Integration Handoff

## Conclusion

`cclink-studio` now exposes a single main-process assembly seam for official builds:

```text
src/main/official/official-integration-loader.ts
```

The open source default returns `oss-noop`. `cclink-dev` should replace or alias this loader during official assembly, and should not patch Studio runtime startup files.

## Required Shape

The loader must export:

```ts
export async function loadOfficialIntegration(): Promise<OfficialIntegration>
```

The returned integration must satisfy:

```ts
export interface OfficialIntegration {
  readonly id: string
  readonly buildProfile: 'oss' | 'dev' | 'internal' | 'beta' | 'stable'
  getStatus(): OfficialIntegrationStatus
  registerMainServices?(context: OfficialMainContext): void | Promise<void>
  registerIpc?(context: OfficialIpcContext): void | Promise<void>
}
```

Studio will call the hooks in this order during main-process startup:

1. `loadOfficialIntegration()`
2. `registerMainServices(context)`
3. `registerIpc(context)`
4. Studio-owned read-only `official:getStatus` IPC registration

## Hard Rules

- Do not edit `src/main/runtime/core-services.ts` for official assembly.
- Do not import official account, message, quota, release, or runtime packages from Studio default runtime files.
- Do not expose secrets through preload, renderer stores, logs, diagnostics, screenshots, or localStorage.
- Do not add production endpoints to OSS defaults or `.env.example`.
- Do not make local Studio startup depend on `/Users/apple/Desktop/chat-cc/deploy` or `/Users/apple/Desktop/chat-cc/Agent`.

## Expected OSS Status

The OSS build must keep returning:

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

## Suggested cclink-dev Assembly Options

Pick one and keep it centralized:

- Replace `src/main/official/official-integration-loader.ts` in the build workspace before `pnpm build`.
- Alias `src/main/official/official-integration-loader.ts` to a generated official loader in the official Vite config.
- Generate the loader from `cclink-dev` release scripts, then run Studio validation.

The safest first integration is file replacement in the private build workspace, because the public source tree stays simple and the replacement surface is one file.

## Joint Debugging Acceptance

Run these from `cclink-studio` after official assembly:

```bash
pnpm typecheck
pnpm test
pnpm build
bash scripts/restart.sh restart
bash scripts/restart.sh status
bash scripts/restart.sh stop
```

Expected official dev-build logs:

```text
[CCLink Studio] 官方集成接口已注册 (id=<official-id>, profile=dev)
```

Expected OSS logs:

```text
[CCLink Studio] 官方集成接口已注册 (id=oss-noop, profile=oss)
```

## Failure Paths To Test

- Official loader missing: OSS no-op path still builds and starts.
- Official loader throws during startup: official build must fail loudly before partial account/message initialization.
- Account service unavailable: local workspace, browser, editor, terminal, and Android true-device shell still start.
- No adb installed: Studio starts; `agent-device` reports unavailable until adb is configured.
- Renderer status probe: `window.cclinkStudio.official.getStatus()` returns a non-secret snapshot only.
