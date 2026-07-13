/**
 * ProBadge — Pro 等级徽章组件
 *
 * 在 StatusBar 等位置显示当前订阅等级。
 * Free 用户不显示，Pro 用户显示金色 "PRO" 徽章。
 */

import { useSubscriptionStore } from '../../stores'
import { IconCrown } from '../common/Icons'

export function ProBadge(): React.ReactElement | null {
  const tier = useSubscriptionStore((s) => s.tier)

  if (tier !== 'pro') return null

  return (
    <div className="pro-badge">
      <IconCrown size={12} />
      <span>PRO</span>
    </div>
  )
}
