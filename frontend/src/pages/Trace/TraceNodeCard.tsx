import { CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined, MinusCircleOutlined } from '@ant-design/icons'
import { Tag } from 'antd'
import { formatDuration, statusLabel } from './traceModel'
import type { TraceEvent, TraceNodeDefinition } from './traceTypes'
import styles from './TracePage.module.css'

interface TraceNodeCardProps {
  definition: TraceNodeDefinition
  event?: TraceEvent
}

export function TraceNodeCard({ definition, event }: TraceNodeCardProps) {
  const status = event?.status ?? 'WAITING'
  const icon = {
    STARTED: <LoadingOutlined spin />,
    SUCCESS: <CheckCircleOutlined />,
    FAILED: <CloseCircleOutlined />,
    SKIPPED: <MinusCircleOutlined />,
    WAITING: <MinusCircleOutlined />,
  }[status]

  return (
    <div className={`${styles.node} ${styles[`node${status}`]}`}>
      <div className={styles.nodeIcon}>{icon}</div>
      <div className={styles.nodeBody}>
        <div className={styles.nodeTitle}>{definition.title}</div>
        <div className={styles.nodeSubtitle}>{definition.subtitle}</div>
        <div className={styles.nodeMessage}>{event?.message ?? '等待真实请求经过此节点'}</div>
      </div>
      <div className={styles.nodeMeta}>
        <Tag color={status === 'SUCCESS' ? 'green' : status === 'FAILED' ? 'red' : status === 'STARTED' ? 'blue' : 'default'}>
          {statusLabel(status)}
        </Tag>
        <span>{formatDuration(event?.durationMs)}</span>
      </div>
    </div>
  )
}
