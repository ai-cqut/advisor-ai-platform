import { Collapse, Descriptions, Empty, List, Tag, Typography } from 'antd'
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

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function textValue(value: unknown, fallback = '暂无'): string {
  if (value === undefined || value === null || value === '') return fallback
  if (Array.isArray(value)) return value.map((item) => textValue(item)).join('、')
  if (typeof value === 'object') return formatJson(value)
  return String(value)
}

function statusColorFor(passed: unknown, executed: unknown): string {
  if (executed === false) return 'default'
  return passed === false ? 'red' : 'green'
}

interface ToolExecution {
  id: string
  call?: TraceEvent
  result?: TraceEvent
}

function toolExecutions(events: TraceEvent[]): ToolExecution[] {
  const executions: ToolExecution[] = []
  const byId = new Map<string, ToolExecution>()
  const toolEvents = events.filter((item) => item.node === 'tool.execute')

  for (const event of toolEvents) {
    const metadata = asRecord(event.metadata)
    const eventType = String(metadata.event ?? '')
    const payload = metadata
    const id = String(payload.tool_call_id ?? `${event.timestamp}-${executions.length}`)
    let execution = byId.get(id)
    if (!execution) {
      execution = { id }
      byId.set(id, execution)
      executions.push(execution)
    }
    if (eventType === 'tool_result' || eventType === 'tool_error') {
      execution.result = event
    } else {
      execution.call = event
    }
  }
  return executions
}

function toolName(execution: ToolExecution): string {
  const metadata = asRecord((execution.result ?? execution.call)?.metadata)
  return textValue(metadata.tool_name, '未知工具')
}

function toolStatus(execution: ToolExecution): 'STARTED' | 'SUCCESS' | 'FAILED' {
  if (execution.result?.status === 'FAILED') return 'FAILED'
  if (execution.result) return 'SUCCESS'
  return 'STARTED'
}

function ToolExecutionDetails({ executions }: { executions: ToolExecution[] }) {
  return (
    <section className={styles.detailSection}>
      <div className={styles.toolSummaryHeader}>
        <Typography.Text strong>工具调用明细</Typography.Text>
        <Tag color="blue">{executions.length} 次调用</Tag>
      </div>
      <List
        className={styles.toolExecutionList}
        size="small"
        dataSource={executions}
        locale={{ emptyText: '当前链路没有工具调用' }}
        renderItem={(execution, index) => {
          const event = execution.result ?? execution.call
          const metadata = asRecord(event?.metadata)
          const status = toolStatus(execution)
          return (
            <List.Item>
              <div className={styles.toolExecutionItem}>
                <div className={styles.toolExecutionHeader}>
                  <strong>{index + 1}. {toolName(execution)}</strong>
                  <Tag color={status === 'FAILED' ? 'red' : status === 'SUCCESS' ? 'green' : 'blue'}>
                    {statusLabel(status)}
                  </Tag>
                </div>
                <div className={styles.toolExecutionMeta}>
                  调用 ID：{textValue(metadata.tool_call_id, execution.id)}
                </div>
                <div className={styles.toolExecutionMeta}>
                  输入参数：{textValue(metadata.tool_args)}
                </div>
                {metadata.tool_output !== undefined && (
                  <pre className={styles.toolOutput}>{textValue(metadata.tool_output)}</pre>
                )}
              </div>
            </List.Item>
          )
        }}
      />
    </section>
  )
}

function StructuredEventDetails({
  nodeId,
  metadata,
  events,
}: {
  nodeId: string
  metadata: Record<string, unknown>
  events: TraceEvent[]
}) {
  if (nodeId === 'gateway.risk.input') {
    const checks = Array.isArray(metadata.checks) ? metadata.checks.map(asRecord) : []
    return (
      <section className={styles.detailSection}>
        <Typography.Text strong>风控检查明细</Typography.Text>
        <List
          className={styles.checkList}
          size="small"
          dataSource={checks}
          locale={{ emptyText: '当前事件没有返回检查器明细' }}
          renderItem={(check) => (
            <List.Item>
              <div className={styles.checkItem}>
                <div className={styles.checkItemHeader}>
                  <strong>{textValue(check.displayName, textValue(check.name))}</strong>
                  <Tag color={statusColorFor(check.passed, check.executed)}>
                    {check.executed === false ? '未执行' : check.passed === false ? '命中' : '通过'}
                  </Tag>
                </div>
                <div className={styles.checkItemMeta}>
                  {textValue(check.matchingMethod, '未说明')} · {textValue(check.details)}
                  {check.ruleCount !== undefined ? ` · 规则 ${textValue(check.ruleCount, '0')} 条` : ''}
                  {check.durationMs !== undefined ? ` · ${textValue(check.durationMs)} ms` : ''}
                </div>
                {(check.matchedRule !== undefined ||
                  check.action !== undefined ||
                  check.reason !== undefined) && (
                  <div className={styles.checkItemExtra}>
                    {check.matchedRule !== undefined && `规则：${textValue(check.matchedRule)}`}
                    {check.action !== undefined && ` · 动作：${textValue(check.action)}`}
                    {check.reason !== undefined && ` · 原因：${textValue(check.reason)}`}
                  </div>
                )}
              </div>
            </List.Item>
          )}
        />
      </section>
    )
  }

  if (nodeId === 'agent.intent.route') {
    return (
      <section className={styles.detailSection}>
        <Typography.Text strong>路由决策摘要</Typography.Text>
        <Descriptions className={styles.detailDescription} column={1} size="small">
          <Descriptions.Item label="路由类别">{textValue(metadata.categories)}</Descriptions.Item>
          <Descriptions.Item label="匹配方式">{textValue(metadata.matched_by)}</Descriptions.Item>
          <Descriptions.Item label="置信度">{textValue(metadata.confidence)}</Descriptions.Item>
          <Descriptions.Item label="匹配工具">{textValue(metadata.matched_tools)}</Descriptions.Item>
          <Descriptions.Item label="Fallback 原因">{textValue(metadata.fallback_reason)}</Descriptions.Item>
          <Descriptions.Item label="路由原因">{textValue(metadata.reason)}</Descriptions.Item>
        </Descriptions>
      </section>
    )
  }

  if (nodeId === 'agent.task.plan') {
    const steps = Array.isArray(metadata.steps) ? metadata.steps.map(asRecord) : []
    return (
      <section className={styles.detailSection}>
        <Typography.Text strong>任务规划摘要</Typography.Text>
        <Descriptions className={styles.detailDescription} column={1} size="small">
          <Descriptions.Item label="执行模式">{textValue(metadata.mode)}</Descriptions.Item>
          <Descriptions.Item label="目标">{textValue(metadata.goal)}</Descriptions.Item>
          <Descriptions.Item label="所需工具">{textValue(metadata.required_tools)}</Descriptions.Item>
          <Descriptions.Item label="停止条件">{textValue(metadata.stop_when)}</Descriptions.Item>
          <Descriptions.Item label="是否已满足">{textValue(metadata.sufficient)}</Descriptions.Item>
        </Descriptions>
        <List
          className={styles.planList}
          size="small"
          header="执行步骤"
          dataSource={steps}
          locale={{ emptyText: '暂无规划步骤' }}
          renderItem={(step, index) => (
            <List.Item>
              <strong>步骤 {index + 1}</strong>
              <span>{textValue(step.tool_name || step.action, '未命名动作')} · {textValue(step.reason, '暂无说明')}</span>
            </List.Item>
          )}
        />
      </section>
    )
  }

  if (nodeId === 'tool.execute') {
    return <ToolExecutionDetails executions={toolExecutions(events)} />
  }

  if (nodeId === 'agent.reasoning') {
    return (
      <section className={styles.detailSection}>
        <Typography.Text strong>Agent / Subagent 摘要</Typography.Text>
        <Descriptions className={styles.detailDescription} column={1} size="small">
          <Descriptions.Item label="Agent 名称">{textValue(metadata.agent_name)}</Descriptions.Item>
          <Descriptions.Item label="阶段">{textValue(metadata.stage)}</Descriptions.Item>
          <Descriptions.Item label="模式">{textValue(metadata.mode)}</Descriptions.Item>
          <Descriptions.Item label="说明">{textValue(metadata.message)}</Descriptions.Item>
        </Descriptions>
      </section>
    )
  }

  if (nodeId === 'llm.stream') {
    return (
      <section className={styles.detailSection}>
        <Typography.Text strong>模型流摘要</Typography.Text>
        <Descriptions className={styles.detailDescription} column={1} size="small">
          <Descriptions.Item label="输出片段">{textValue(metadata.text)}</Descriptions.Item>
          <Descriptions.Item label="结束原因">{textValue(metadata.finish_reason)}</Descriptions.Item>
        </Descriptions>
      </section>
    )
  }

  return null
}

export function TraceNodeDetail({ definition, event, events }: TraceNodeDetailProps) {
  if (!definition) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选择一个节点查看详情" />
  }

  const nodeEvents = events.filter((item) => item.node === definition.id)
  const status = event?.status ?? 'WAITING'
  const statusColor = status === 'SUCCESS' ? 'green' : status === 'FAILED' ? 'red' : status === 'STARTED' ? 'blue' : 'default'
  const metadata = asRecord(event?.metadata)

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
      {event && <StructuredEventDetails nodeId={definition.id} metadata={metadata} events={events} />}
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
