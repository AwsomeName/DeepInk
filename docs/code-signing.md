# DeepInk Mac 签名与公证指南

> 状态：待操作。当前打包产物为未签名版本（`identity: null`），可用于本地测试。

## 背景

DeepInk 通过 DMG 分发（不上架 App Store），Apple 要求：
1. 用 **Developer ID Application** 证书签名
2. 提交 Apple **公证（Notarization）**
3. 否则用户打开时会看到"无法验证开发者"警告

## 当前证书情况

本机已有两个 **Apple Development** 证书（仅用于 Xcode 调试）：

```
2F1A7E85CADD071754422888D5BB3D6E39D96852 "Apple Development: liunux1992@gmail.com (P8YJC993J8)"
1E3DCF925B091FE65C5985466127842EF6239FFD "Apple Development: liuchang.hit.cs@gmail.com (28UT6B3B76)"
```

**缺少：Developer ID Application 证书**（Mac App Store 外分发必须）

## 操作步骤

### Step 1：生成证书签名请求（CSR）

1. 打开 **Keychain Access**
2. 菜单栏 → **Keychain Access → Certificate Assistant → Request a Certificate from a Certificate Authority**
3. 填写邮箱，选择 **Saved to disk**，保存 `.certSigningRequest` 文件

### Step 2：创建 Developer ID Application 证书

1. 登录 [developer.apple.com](https://developer.apple.com)
2. Certificates → **+** → 选择 **Developer ID Application**
3. 上传 Step 1 生成的 CSR 文件
4. 下载 `.cer` 文件
5. 双击 `.cer` 文件安装到 Keychain

### Step 3：验证证书安装成功

```bash
security find-identity -v -p codesigning
```

输出中应多出类似一行：

```
XXXXX "Developer ID Application: 你的名字 (TEAM_ID)"
```

记下这行的 hash 值和 Team ID。

### Step 4：创建 App 专用密码（用于公证）

1. 登录 [appleid.apple.com](https://appleid.apple.com)
2. App 专用密码 → 生成一个
3. 记下来（只显示一次，格式 `xxxx-xxxx-xxxx-xxxx`）

### Step 5：告知 Claude 完成配置

拿到以下三个信息后，告诉 Claude：

1. Developer ID Application 证书的 hash 或 Team ID
2. Apple ID 邮箱
3. App 专用密码

Claude 会完成：
- 修改 `electron-builder.yml`（签名 + 公证配置）
- 创建 `build/entitlements.mac.plist`（Electron 运行时权限声明）
- 添加 `.env.signing` 模板（排除敏感信息不被 git 追踪）

### Step 6：打包签名版本

```bash
# 设置环境变量（每次新终端需要重新设置，或写入 .env.signing）
export APPLE_ID="你的AppleID"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="你的TeamID"

pnpm package
```

产物将是签名 + 公证后的 DMG，用户可以直接双击打开。

## 证书类型速查

| 证书类型 | 用途 | DeepInk 需要？ |
|---------|------|--------------|
| Apple Development | Xcode 调试、真机测试 | ❌ |
| Developer ID Application | Mac App Store 外分发（DMG） | ✅ **需要** |
| Apple Distribution | App Store 上架（iPad / Mac） | ❌ 暂不需要 |

## 未签名版本的使用方式

当前未签名的 DMG 也可以用，用户首次打开需要：

1. 右键点击 `DeepInk.app` → **打开**
2. 弹窗中点击 **打开** 确认

或者在终端：

```bash
xattr -cr /path/to/DeepInk.app
```
