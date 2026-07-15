# agent-device Integration

CCLink Studio uses the published `agent-device` npm package for Android semantic UI
automation. The upstream source checkout is not vendored in this repository.

Ownership split:

- `CCLink Studio/src/main/android/agent-device-manager.ts` owns desktop integration,
  ADB environment setup, runtime availability, and graceful fallback.
- `CCLink Studio/src/main/mcp/modules/agent-device` owns the CCLink Studio MCP adapter.
- `coreAgent` owns only generic tool protocol, scope filtering, and prompt
  context that can mention whether the host reports agent-device availability.

License note: `agent-device` is MIT licensed upstream. Keep the exact version in
`CCLink Studio/package.json` / lockfile and review upstream license changes before
upgrading.
