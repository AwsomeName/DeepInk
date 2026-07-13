# CCLink 账号同步事故复盘（2026-07-10）

## 结论

这次故障不是用户操作错误，也不是单纯缓存问题，而是两处云端链路 bug 叠加：

1. DeepInk auth 云函数 `findUser(id)` 未兼容 CloudBase `doc().get()` 返回数组，导致 `/auth/me` 返回用户字段缺失。
2. `/auth/cclink/paired-agents` 在 DeepInk 本环境 `agents` 表为空时提前返回空数组，没有桥接旧 ChatCC。

最终修复后，当前 DeepInk token 能正确返回手机号，并能从旧 ChatCC 同步 3 台远程 Agent。

## 影响

用户现象：

- 远程 Agent 面板显示“账户身份未同步”。
- 旧账号导入预检显示“云端无手机号”。
- 即使修复了 `cclinkAccountUserId` 映射，服务器列表仍为空。

实际影响：

- 用户无法从 DeepInk 看到旧 ChatCC 已配对服务器。
- 反复清缓存、退出登录、重新导入都无法真正修复。

## 正确链路

```text
本地 auth.json
  ↓ 解密 accessToken
JWT payload.sub
  ↓
GET /auth/me
  ↓
DeepInk users._id + phone
  ↓
DeepInk users.cclinkAccountUserId
  ↓
旧 ChatCC users.im_user_id
  ↓
旧 ChatCC users.paired_agents
  ↓
GET /auth/cclink/paired-agents
  ↓
远程 Agent 面板 servers
```

## 发现过程

### 1. 错误方向

前期排查被以下线索误导：

- UI 显示“当前账号无手机号”。
- 本地缓存里有旧手机号。
- 运维台最初能查到云端映射不一致。
- 退出登录、重启、清缓存后状态仍反复。

这些现象都是真实的，但不是最终根因。它们只能说明状态异常，不能说明异常发生在哪一层。

### 2. 关键证据

用真实 Electron app name 解密 `auth.json` 后，直接调用 `/auth/me`：

```json
{
  "tokenPayload": {
    "sub": "e9b9167e-25e8-4a21-93a0-de0e8facc7d8"
  },
  "authMe": {
    "success": true,
    "user": {
      "loginMethod": "wechat",
      "subscriptionTier": "free",
      "subscriptionExpiresAt": null
    }
  }
}
```

同一用户在 CloudBase `users` 表中实际有手机号：

```json
{
  "_id": "e9b9167e-25e8-4a21-93a0-de0e8facc7d8",
  "phone": "15063036754",
  "cclinkAccountUserId": "ccu_e95a76525235",
  "cclinkPhone": "15063036754"
}
```

因此断点不是登录态、不是用户表，而是 `/auth/me` 的用户读取/格式化。

### 3. 第一根因

旧代码：

```js
function findUser(id) {
  return usersCol.doc(id).get().then(doc => doc.data || null)
}
```

在当前 CloudBase CLI/SDK 返回结构里，`doc.data` 可能是数组，导致后续：

```js
formatUser(user, loginMethod)
```

取不到 `user._id`、`user.phone`、`user.nickname`。

修复：

```js
function findUser(id) {
  return usersCol.doc(id).get().then(doc => {
    const data = doc.data
    if (Array.isArray(data)) return data[0] || null
    return data || null
  })
}
```

### 4. 第二根因

修复 `/auth/me` 后，`/auth/cclink/paired-agents` 仍返回空数组。

原因是 DeepInk 自己的 `agents` 表没有旧 ChatCC 服务器副本，而旧代码在 `agentIds.length === 0` 时提前返回：

```js
if (agentIds.length === 0) {
  return { agents: [] }
}
```

这导致旧 ChatCC fallback 永远不会执行。

修复后逻辑：

```js
if (agentIds.length === 0) {
  const legacyAgents = await fetchLegacyPairedAgents(accountUserId)
  return { agents: legacyAgents, source: legacyAgents.length > 0 ? 'legacy-chatcc' : 'deepink' }
}
```

并新增 `fetchLegacyPairedAgents(accountUserId)`，使用 DeepInk 云函数环境里的 CCLink IM secret 生成旧 ChatCC auth token，调用旧 ChatCC `getPairedAgents`。

## 最终验证

部署版本：

```text
2026.07.10-cclink-legacy-agents-bridge.1
```

验证 `/auth/me`：

```json
{
  "id": "e9b9167e-25e8-4a21-93a0-de0e8facc7d8",
  "phone": "15063036754",
  "loginMethod": "phone"
}
```

验证 `/auth/cclink/paired-agents`：

```json
{
  "success": true,
  "source": "legacy-chatcc",
  "agents": [
    { "name": "supermicro" },
    { "name": "lcs-MacBook-Air.local" },
    { "name": "appledeMacBook-Pro.local" }
  ]
}
```

UI 最终看到三台服务器。

## 经验教训

### 必须做

- 账号类问题先解 token，看 `payload.sub`。
- 用 token 直接调 `/auth/me`，不要只看本地 `user.json`。
- 查 CloudBase users 表确认数据库事实。
- 业务接口必须单独验证，不能因为 `/auth/me` 正常就认为服务器同步正常。
- 修云函数后必须验证线上版本和真实 token 调用结果。

### 禁止做

- 禁止把“清缓存/重启/重新登录”当成主要排障路径。
- 禁止从 UI 文案直接推断云端根因。
- 禁止在没有证据时反复修改账号映射。
- 禁止把运维台查询结果当成完整链路验证。

## 后续改进

### 1. 自动化链路诊断

本地运维台应加入“一键链路诊断”：

- 解当前 token。
- 展示 `payload.sub`。
- 调 `/auth/me`。
- 查 DeepInk users 表。
- 查 ChatCC users 表。
- 调 `/auth/cclink/paired-agents`。
- 标记断点位置。

### 2. 云函数测试

至少覆盖：

- `findUser()` 支持 `doc.data` 为对象。
- `findUser()` 支持 `doc.data` 为数组。
- `/auth/me` 必须返回 `id` 和 `phone`。
- DeepInk `agents` 空表时，`paired-agents` 必须 fallback 旧 ChatCC。

### 3. 日志规范

关键链路必须能看到：

- route
- token sub
- user id
- has phone
- cclink account id
- paired agent source
- paired agent count

不能打印：

- access token
- refresh token
- auth token
- UserSig

## 关联文档

- `docs/ops/cclink-troubleshooting-runbook.md`
- `docs/ops/local-admin-console.md`
- `docs/features/cclink-integration.md`

