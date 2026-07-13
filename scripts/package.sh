#!/usr/bin/env bash
# package.sh — DeepInk 一键打包脚本
#
# 用法:
#   bash scripts/package.sh                  # 当前宿主架构（Apple Silicon → arm64）
#   bash scripts/package.sh --arm64          # Apple Silicon (M 系列)
#   bash scripts/package.sh --x64            # Intel Mac
#   bash scripts/package.sh --universal      # 通用（体积大，两种架构都能跑）
#   bash scripts/package.sh --bump           # 版本号 patch 自增 +1
#   bash scripts/package.sh --version 0.2.0  # 指定版本号
#   bash scripts/package.sh --no-clean       # 跳过清理 out/ dist/
#   bash scripts/package.sh --no-install     # 跳过 pnpm install
#   bash scripts/package.sh --dev            # 不压缩 (compression=store)，打包更快但体积更大
#   bash scripts/package.sh --open           # 打包后打开产物所在文件夹
#   bash scripts/package.sh --no-upload      # 跳过上传 COS（仅本地打包）
#   bash scripts/package.sh --help
#
# 说明: out/ 与 dist/ 均在 .gitignore 中，清理是安全的（可重新生成）。
#       打包后会自动上传更新产物到腾讯云 COS（凭证从项目根 .env 读取）。

set -e

# ── 颜色 & helper ────────────────────────────────────────
CYAN='\033[36m'; GREEN='\033[32m'; RED='\033[31m'; YELLOW='\033[33m'; BOLD='\033[1m'; RESET='\033[0m'
info() { echo -e "${CYAN}[DeepInk]${RESET} $1"; }
ok()   { echo -e "${GREEN}[DeepInk ✓]${RESET} $1"; }
warn() { echo -e "${YELLOW}[DeepInk !]${RESET} $1"; }
die()  { echo -e "${RED}[DeepInk ✗]${RESET} $1"; exit 1; }

# ── 参数解析 ──────────────────────────────────────────────
ARCH=""
SET_VERSION=""
BUMP=0
CLEAN=1
INSTALL=1
COMPRESSION=""
OPEN_FINDER=0
NO_UPLOAD=0

usage() {
  sed -n '3,19p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

while [ $# -gt 0 ]; do
  case "$1" in
    --arm64)    ARCH="arm64"; shift ;;
    --x64)      ARCH="x64"; shift ;;
    --universal) ARCH="universal"; shift ;;
    --version)  SET_VERSION="$2"; shift 2 ;;
    --bump)     BUMP=1; shift ;;
    --no-clean) CLEAN=0; shift ;;
    --no-install) INSTALL=0; shift ;;
    --dev)      COMPRESSION="store"; shift ;;
    --open)     OPEN_FINDER=1; shift ;;
    --no-upload) NO_UPLOAD=1; shift ;;
    -h|--help)  usage ;;
    *)          die "未知参数: $1（用 --help 查看用法）" ;;
  esac
done

# ── 预检：必须在项目根目录 ────────────────────────────────
[ -f package.json ] && [ -f electron-builder.yml ] \
  || die "请在项目根目录运行（需要 package.json + electron-builder.yml）"

# ── 加载 COS 凭证（项目根 .env，已 gitignore；不影响缺凭证时的本地打包）──
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

# ── 自动检测架构 ──────────────────────────────────────────
if [ -z "$ARCH" ]; then
  case "$(uname -m)" in
    arm64)  ARCH="arm64" ;;
    x86_64) ARCH="x64" ;;
    *)      die "无法识别架构 $(uname -m)，请用 --arm64 / --x64 显式指定" ;;
  esac
fi

# ── 互斥校验 ──────────────────────────────────────────────
[ "$BUMP" -eq 1 ] && [ -n "$SET_VERSION" ] && die "--bump 与 --version 不能同时使用"

info "目标架构: ${BOLD}$ARCH${RESET}"

# ── 1. 依赖安装 ───────────────────────────────────────────
if [ "$INSTALL" -eq 1 ]; then
  info "安装依赖（pnpm install）..."
  pnpm install
  ok "依赖就绪"
fi

# ── 2. 版本号 ─────────────────────────────────────────────
if [ -n "$SET_VERSION" ]; then
  info "设置版本号 → $SET_VERSION"
  export NEW_VERSION="$SET_VERSION"
  node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync("package.json","utf8"));p.version=process.env.NEW_VERSION;fs.writeFileSync("package.json",JSON.stringify(p,null,2)+"\n")'
fi
if [ "$BUMP" -eq 1 ]; then
  NEWV=$(node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync("package.json","utf8"));const s=p.version.split(".").map(Number);s[2]++;p.version=s.join(".");fs.writeFileSync("package.json",JSON.stringify(p,null,2)+"\n");console.log(p.version)')
  ok "版本号 patch 自增 → $NEWV"
fi
VERSION=$(node -p "require('./package.json').version")
info "当前版本: ${BOLD}$VERSION${RESET}"

# ── 3. 清理旧产物 ─────────────────────────────────────────
if [ "$CLEAN" -eq 1 ]; then
  info "清理旧的 out/ 与 dist/ ..."
  rm -rf out dist
  ok "已清理"
else
  warn "跳过清理（--no-clean），旧产物将被覆盖"
fi

# ── 4. 构建（electron-vite build） ────────────────────────
info "构建（pnpm build → electron-vite build）..."
pnpm build > /tmp/deepink-build.log 2>&1 || { tail -30 /tmp/deepink-build.log; die "构建失败，详见 /tmp/deepink-build.log"; }
ok "构建完成"

# ── 5. 打包（electron-builder） ───────────────────────────
EB_ARGS=(--mac)
case "$ARCH" in
  arm64)    EB_ARGS+=(--arm64) ;;
  x64)      EB_ARGS+=(--x64) ;;
  universal) EB_ARGS+=(--universal) ;;
esac
[ -n "$COMPRESSION" ] && EB_ARGS+=("--config.compression=$COMPRESSION")

info "打包（electron-builder ${EB_ARGS[*]}）..."
npx electron-builder "${EB_ARGS[@]}" > /tmp/deepink-package.log 2>&1 \
  || { tail -40 /tmp/deepink-package.log; die "打包失败，详见 /tmp/deepink-package.log"; }
ok "打包完成"

# ── 5.5 上传更新产物到 COS（有凭证且未指定 --no-upload 才上传） ──
if [ "$NO_UPLOAD" -ne 1 ]; then
  if [ -n "$COS_SECRET_ID" ] && [ -n "$COS_SECRET_KEY" ] && [ -n "$COS_BUCKET" ] && [ -n "$COS_REGION" ]; then
    info "上传更新产物到 COS ..."
    node scripts/upload-cos.mjs || warn "COS 上传失败（不影响本地产物，详见上方报错）"
    ok "COS 上传完成"
  else
    warn "未配置 COS_* 凭证（.env 缺失），跳过上传 — 产物在 dist/，可手动上传"
  fi
fi

# ── 6. 结果摘要 ───────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}✅ 打包成功${RESET} — 版本 $VERSION / 架构 $ARCH"
echo ""
info "产物清单:"
ls -lh dist/*.dmg dist/*.zip 2>/dev/null | awk '{printf "    %s  %s\n", $5, $9}' || true
echo ""
echo -e "${CYAN}搬到另一台 Mac 的提示:${RESET}"
echo -e "  • 默认未签名 → 目标机安装后执行:  ${BOLD}xattr -cr /Applications/DeepInk.app${RESET}"
echo -e "  • Intel Mac 需另行用 ${BOLD}--x64${RESET} 打包；当前产物仅适用于 ${BOLD}$ARCH${RESET}"
echo -e "  • Agent 用 http-api 后端（国内模型 / OpenAI 兼容）零外部依赖；claude-code 后端需目标机装 claude CLI"
echo -e "  • 内嵌浏览器用 Electron 自带 Chromium，无需额外下载"

[ "$OPEN_FINDER" -eq 1 ] && open dist/
