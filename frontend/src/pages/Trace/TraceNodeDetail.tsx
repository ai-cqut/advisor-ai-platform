import { Collapse, Descriptions, Empty, Tag, Typography } from 'antd'
import { formatDuration, statusLabel } from './traceModel'
import type { TraceEvent, TraceNodeDefinition } from './traceTypes'
import styles from './TracePage.module.css'

interface TraceNodeDetailProps {
  definition?: TraceNodeDefinition
  event?: TraceEvent
  events: TraceEvent[]
}

function formatJson(value: unknown): string {
  if (value === undefined || value === null) return '暂无数据'
  return JSON.stringify(value, null, 2)
}

export function TraceNodeDetail({ definition, event, events }: TraceNodeDetailProps) {
  if (!definition) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选择一个节点查看详情" />
  }

  const nodeEvents = events.filter((item) => item.node === definition.id)
  const status = event?.status ?? 'WAITING'
  const statusColor = status === 'SUCCESS' ? 'green' : status === 'FAILED' ? 'red' : status === 'STARTED' ? 'blue' : 'default'

  return (
    <div className={styles.detail}>
      <div className={styles.detailIntro}>
        <Typography.Title level={4}>{definition.title}</Typography.Title>
        <Typography.Paragraph>{definition.description}</Typography.Paragraph>
      </div>
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="节点 ID">
          <Typography.Text code>{definition.id}</Typography.Text>
        </Descriptions.Item>
        <Descriptions.Item label="所属服务">{definition.service}</Descriptions.Item>
        <Descriptions.Item label="状态">
          <Tag color={statusColor}>{statusLabel(status)}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="耗时">{formatDuration(event?.durationMs)}</Descriptions.Item>
        <Descriptions.Item label="事件时间">
          {event ? new Date(event.timestamp).toLocaleString() : '尚未执行'}
        </Descriptions.Item>
        <Descriptions.Item label="事件来源">{event?.source ?? '暂无'}</Descriptions.Item>
        <Descriptions.Item label="事件次数">{nodeEvents.length}</Descriptions.Item>
      </Descriptions>
      <section className={styles.detailSection}>
        <Typography.Text strong>执行说明</Typography.Text>
        <div className={styles.detailMessage}>{event?.message ?? '请求尚未经过此节点。'}</div>
      </section>
      <Collapse
        items={[
          {
            key: 'metadata',
            label: '查看完整元数据',
            children: <pre className={styles.jsonBlock}>{formatJson(event?.metadata)}</pre>,
          },
          {
            key: 'event',
            label: '查看原始事件 JSON',
            children: <pre className={styles.jsonBlock}>{formatJson(event)}</pre>,
          },
          {
            key: 'history',
            label: `查看节点事件历史（${nodeEvents.length}）`,
            children: nodeEvents.length ? (
              <div className={styles.detailHistory}>
                {nodeEvents.map((item, index) => (
                  <div key={`${item.timestamp}-${index}`} className={styles.historyItem}>
                    <Tag>{statusLabel(item.status)}</Tag>
                    <span>{item.message || '事件已收到'}</span>
                    <Typography.Text type="secondary">{new Date(item.timestamp).toLocaleTimeString()}</Typography.Text>
                  </div>
                ))}
              </div>
            ) : (
              <Typography.Text type="secondary">暂无历史事件</Typography.Text>
            ),
          },
        ]}
      />
    </div>
  )
}
