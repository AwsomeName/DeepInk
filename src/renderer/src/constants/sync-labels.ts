/**
 * 同步阶段标签映射（共享常量）
 */

import type { SyncPhase } from '@shared/ipc/sync'

/** 同步阶段 → 中文标签 */
export const SYNC_PHASE_LABEL: Record<SyncPhase, string> = {
  idle: '已同步',
  connecting: '连接中...',
  'scanning-local': '扫描本地...',
  'scanning-remote': '扫描远程...',
  comparing: '比较中...',
  syncing: '同步中...',
  done: '同步完成',
  error: '同步失败',
}
