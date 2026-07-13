// upload-cos.mjs — Maintainer's publish script for Tencent Cloud COS
//
// This script is used by project maintainers during release.
// It is NOT required for building or running DeepInk from source.
// Contributors do not need this script.
//
// Requirements (maintainer only):
//   COS_SECRET_ID / COS_SECRET_KEY / COS_BUCKET / COS_REGION in .env
//
// Uploads: latest-mac.yml + *.dmg + *.zip + *.blockmap

import COS from 'cos-nodejs-sdk-v5'
import { readdirSync, readFileSync } from 'fs'
import { join, resolve } from 'path'

const { COS_SECRET_ID, COS_SECRET_KEY, COS_BUCKET, COS_REGION } = process.env
const distDir = resolve(process.cwd(), 'dist')

// 缺凭证：不报错，静默跳过（本地测试不强制上传）
if (!COS_SECRET_ID || !COS_SECRET_KEY || !COS_BUCKET || !COS_REGION) {
  console.warn('[upload-cos] 缺少 COS_* 环境变量，跳过上传')
  process.exit(0)
}

const cos = new COS({ SecretId: COS_SECRET_ID, SecretKey: COS_SECRET_KEY })

const targets = readdirSync(distDir).filter((f) => /\.(yml|dmg|zip|blockmap)$/.test(f))

console.log(`[upload-cos] 上传 ${targets.length} 个文件到 ${COS_BUCKET} (${COS_REGION}) ...`)
for (const file of targets) {
  const filePath = join(distDir, file)
  await new Promise((resolveP, rejectP) => {
    // 单次 putObject（COS 单次上传上限 5GB，130MB dmg 远在限内）。
    // 不用 uploadFile 分片：CAM 的数据策略默认不含分片权限，会 403。
    cos.putObject(
      {
        Bucket: COS_BUCKET,
        Region: COS_REGION,
        Key: file,
        Body: readFileSync(filePath),
      },
      (err) => (err ? rejectP(err) : resolveP()),
    )
  })
  console.log(`  ✓ ${file}`)
}
console.log('[upload-cos] 上传完成')
