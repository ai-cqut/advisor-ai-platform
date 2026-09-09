import { Empty, Tag } from 'antd'
import { formatDuration, statusLabel } from './traceModel'
import type { TraceEvent } from './traceTypes'
import styles from './TracePage.module.css'

export function TraceEventTimeline({ events }: { events: TraceEvent[] }) {
  if (events.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="发送请求后，这里会实时出现链路事件" />
  }

  return (
    <div className={styles.timeline}>
      {[...events].reverse().map((event, index) => (
        <div className={styles.timelineItem} key={`${event.node}-${event.timestamp}-${index}`}>
          <div className={styles.timelineDot} />
          <div className={styles.timelineContent}>
            <div className={styles.timelineHeader}>
              <strong>{event.node}</strong>
              <Tag>{statusLabel(event.status)}</Tag>
              <span>{formatDuration(event.durationMs)}</span>
            </div>
            <div className={styles.timelineMessage}>{event.message ?? '事件已收到'}</div>
            <div className={styles.timelineSource}>{event.source ?? 'unknown'} · {new Date(event.timestamp).toLocaleTimeString()}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
