/**
 * 旧版本项目运营账号文件的只读迁移路径。
 *
 * 旧产品名只允许存在于这个受控迁移边界。新建和写回始终使用
 * `cclink-accounts.json`，删除本模块前必须先完成兼容性评估。
 */
export const LEGACY_PROJECT_OPS_ACCOUNT_PATHS = [
  ['deepink-accounts.json'],
  ['.cclink-studio', 'accounts.json'],
  ['.deepink', 'accounts.json'],
] as const
