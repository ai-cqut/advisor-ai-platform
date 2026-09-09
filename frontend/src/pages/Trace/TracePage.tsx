import { useEffect, useMemo, useRef, useState } from 'react'
import { App, Button, Drawer, Input, Segmented, Space, Statistic, Tag, Typography } from 'antd'
import {
  BranchesOutlined,
  ClearOutlined,
  CopyOutlined,
  PauseOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { chatApi } from '../../api/chatApi'
import { streamChat } from '../../api/chatStreamClient'
import { subscribeTrace } from './traceApi'
import {
  definitionForNode,
  latestEventForNode,
  TRACE_NODES,
  TRACE_TOPOLOGY_EDGES,
  TRACE_TOPOLOGY_NODES,
} from './traceModel'
import type { TraceEvent } from './traceTypes'
import { TraceEventTimeline } from './TraceEventTimeline'
import { TraceNodeCard } from './TraceNodeCard'
import { TraceNodeDetail } from './TraceNodeDetail'
import { TRACE_DEMO_PROMPT_GROUPS } from './traceDemoPrompts'
import styles from './TracePage.module.css'

const { TextArea } = Input

export default function TracePage() {
  const { message: messageApi } = App.useApp()
  const [question, setQuestion] = useState('请介绍一下这个平台的 AI 对话链路')
  const [traceId, setTraceId] = useState('')
  const [events, setEvents] = useState<TraceEvent[]>([])
  const [answer, setAnswer] = useState('')
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [viewMode, setViewMode] = useState<'flow' | 'topology'>('flow')
  const [selectedNodeId, setSelectedNodeId] = useState<string>()
  const [startedAt, setStartedAt] = useState<number>()
  const [elapsedMs, setElapsedMs] = useState(0)
  const [selectedDemoId, setSelectedDemoId] = useState('')
  const eventSourceRef = useRef<EventSource | null>(null)
  const stopTimerRef = useRef<number | null>(null)
  const traceCompletedRef = useRef(false)
  const pausedRef = useRef(false)
  const pendingEventsRef = useRef<TraceEvent[]>([])

  useEffect(
    () => () => {
      eventSourceRef.current?.close()
      if (stopTimerRef.current !== null) {
        window.clearTimeout(stopTimerRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    if (!running || !startedAt) return undefined
    const timer = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 200)
    return () => window.clearInterval(timer)
  }, [running, startedAt])

  const currentNode = useMemo(
    () => {
      const latestEvent = events[events.length - 1]
      return latestEvent?.status === 'STARTED' ? latestEvent.node : undefined
    },
    [events],
  )

  const stop = () => {
    eventSourceRef.current?.close()
    eventSourceRef.current = null
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current)
      stopTimerRef.current = null
    }
    setRunning(false)
  }

  const clearTrace = () => {
    stop()
    setTraceId('')
    setEvents([])
    setAnswer('')
    setPaused(false)
    pausedRef.current = false
    pendingEventsRef.current = []
    setPendingCount(0)
    setSelectedNodeId(undefined)
    setStartedAt(undefined)
    setElapsedMs(0)
  }

  const scheduleStop = (delayMs: number) => {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current)
    }
    stopTimerRef.current = window.setTimeout(stop, delayMs)
  }

  const appendEvent = (event: TraceEvent) => {
    if (pausedRef.current) {
      pendingEventsRef.current.push(event)
      setPendingCount(pendingEventsRef.current.length)
      return
    }
    setEvents((previous) => [...previous, event])
  }

  const resumeDisplay = () => {
    setPaused(false)
    pausedRef.current = false
    if (pendingEventsRef.current.length > 0) {
      setEvents((previous) => [...previous, ...pendingEventsRef.current])
      pendingEventsRef.current = []
      setPendingCount(0)
    }
  }

  const copyTraceId = async () => {
    if (!traceId) return
    await navigator.clipboard.writeText(traceId)
    messageApi.success('Trace ID 已复制')
  }

  const selectNode = (nodeId: string) => {
    setSelectedNodeId(nodeId)
  }

  const runTrace = async () => {
    if (!question.trim() || running) return
    setRunning(true)
    setAnswer('')
    setEvents([])
    setPaused(false)
    pausedRef.current = false
    pendingEventsRef.current = []
    setPendingCount(0)
    setSelectedNodeId(undefined)
    const requestStartedAt = Date.now()
    setStartedAt(requestStartedAt)
    setElapsedMs(0)
    const nextTraceId = crypto.randomUUID()
    setTraceId(nextTraceId)
    traceCompletedRef.current = false

    eventSourceRef.current = subscribeTrace(
      nextTraceId,
      appendEvent,
      () => messageApi.error('链路事件订阅失败'),
      () => {
        traceCompletedRef.current = true
        scheduleStop(300)
      },
    )

    try {
      const sessionResponse = await chatApi.createSession()
      const sessionId = sessionResponse.data.id
      await streamChat(
        {
          sessionId,
          traceId: nextTraceId,
          messages: [{ role: 'user', content: question.trim() }],
        },
        {
          onDelta: (chunk) => setAnswer((previous) => previous + chunk),
          onError: (error) => messageApi.error(error),
        },
      )
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '链路请求失败')
    } finally {
      if (!traceCompletedRef.current) {
        scheduleStop(10_000)
      }
    }
  }

  const fillDemoPrompt = (demoId: string, prompt: string) => {
    if (running) return
    setQuestion(prompt)
    setSelectedDemoId(demoId)
    messageApi.success('演示 Prompt 已填入')
  }

  const selectedDefinition = selectedNodeId ? definitionForNode(selectedNodeId) : undefined
  const selectedEvent = selectedNodeId ? latestEventForNode(events, selectedNodeId) : undefined
  const receivedEventCount = events.length + pendingCount
  const successCount = events.filter((event) => event.status === 'SUCCESS').length
  const failedCount = events.filter((event) => event.status === 'FAILED').length
  const executedNodeCount = new Set(events.map((event) => event.node)).size

  const topologyEventFor = (topologyGroup: string) => {
    const nodeIds = TRACE_NODES.filter((node) => node.topologyGroup === topologyGroup).map((node) => node.id)
    return [...events].reverse().find((event) => nodeIds.includes(event.node))
  }

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div>
          <Typography.Text className={styles.eyebrow}>REAL REQUEST OBSERVABILITY</Typography.Text>
          <Typography.Title level={2}>AI 请求链路追踪</Typography.Title>
          <Typography.Paragraph>
            发送一次真实对话请求，观察它如何经过 Gateway、业务服务、Agent、工具和模型执行核心。
          </Typography.Paragraph>
        </div>
        <div className={styles.identity}>
          <span>Trace ID</span>
          <strong>{traceId || '等待请求'}</strong>
          {running ? <Tag color="processing">请求进行中</Tag> : traceId ? <Tag color="success">请求已结束</Tag> : null}
        </div>
      </div>

      <section className={styles.requestPanel}>
        <TextArea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          autoSize={{ minRows: 2, maxRows: 4 }}
          placeholder="输入一个问题，触发真实 AI 链路"
        />
        <div className={styles.demoPanel}>
          <div className={styles.demoHeading}>
            <div>
              <Typography.Text strong>演示场景</Typography.Text>
              <Typography.Text type="secondary">一键填充 Prompt，再发送真实请求</Typography.Text>
            </div>
            <Tag color="blue">面试演示</Tag>
          </div>
          <div className={styles.demoGroups}>
            {TRACE_DEMO_PROMPT_GROUPS.map((group) => (
              <div className={styles.demoGroup} key={group.id}>
                <div className={styles.demoGroupTitle}>
                  <strong>{group.title}</strong>
                  <span>{group.description}</span>
                </div>
                <div className={styles.demoButtons}>
                  {group.prompts.map((demo) => (
                    <Button
                      key={demo.id}
                      size="small"
                      type={selectedDemoId === demo.id ? 'primary' : 'default'}
                      danger={demo.tone === 'risk' && selectedDemoId !== demo.id}
                      disabled={running}
                      onClick={() => fillDemoPrompt(demo.id, demo.prompt)}
                    >
                      {demo.title}
                      <span className={styles.demoButtonHint}>{demo.description}</span>
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <Space>
          <Button type="primary" icon={<PlayCircleOutlined />} loading={running} onClick={() => void runTrace()}>
            发送真实请求
          </Button>
          <Button icon={<ReloadOutlined />} disabled={running} onClick={() => void runTrace()}>
            重新执行
          </Button>
          <Button
            icon={paused ? <PlayCircleOutlined /> : <PauseOutlined />}
            disabled={!running && pendingCount === 0}
            onClick={() => (paused ? resumeDisplay() : (pausedRef.current = true, setPaused(true)))}
          >
            {paused ? '继续展示' : '暂停展示'}
          </Button>
          <Button icon={<StopOutlined />} disabled={!running} onClick={stop}>
            停止监听
          </Button>
          <Button icon={<ClearOutlined />} disabled={!traceId && events.length === 0} onClick={clearTrace}>
            清空链路
          </Button>
          {currentNode && <Tag color="blue">当前节点：{currentNode}</Tag>}
        </Space>
        <div className={styles.controlFooter}>
          <Space wrap>
            <Button size="small" icon={<CopyOutlined />} disabled={!traceId} onClick={() => void copyTraceId()}>
              复制 Trace ID
            </Button>
            {paused && <Tag color="gold">{pendingCount} 个事件待展示</Tag>}
          </Space>
          <Segmented
            value={viewMode}
            onChange={(value) => setViewMode(value as 'flow' | 'topology')}
            options={[
              { value: 'flow', label: '流程视图', icon: <PlayCircleOutlined /> },
              { value: 'topology', label: '服务拓扑', icon: <BranchesOutlined /> },
            ]}
          />
        </div>
      </section>

      <section className={styles.statsGrid}>
        <Statistic title="链路耗时" value={elapsedMs} suffix="ms" />
        <Statistic title="事件总数" value={receivedEventCount} />
        <Statistic title="成功事件" value={successCount} valueStyle={{ color: '#389e0d' }} />
        <Statistic title="失败事件" value={failedCount} valueStyle={{ color: '#cf1322' }} />
        <Statistic title="已执行节点" value={executedNodeCount} suffix={`/ ${TRACE_NODES.length}`} />
      </section>

      <div className={styles.contentGrid}>
        <section className={styles.flowSection}>
          <div className={styles.sectionHeading}>
            <div>
              <Typography.Title level={4}>请求执行路径</Typography.Title>
              <Typography.Text type="secondary">节点状态和耗时来自同一次真实请求</Typography.Text>
            </div>
            <Tag>{receivedEventCount} 个事件</Tag>
          </div>
          {viewMode === 'flow' ? (
            <div className={styles.flow}>
              {TRACE_NODES.map((definition, index) => (
                <div key={definition.id}>
                  <TraceNodeCard
                    definition={definition}
                    event={latestEventForNode(events, definition.id)}
                    selected={selectedNodeId === definition.id}
                    onClick={() => selectNode(definition.id)}
                  />
                  {index < TRACE_NODES.length - 1 && <div className={styles.connector} />}
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.topology}>
              {TRACE_TOPOLOGY_NODES.map((node) => {
                const event = topologyEventFor(node.id)
                const selected = event?.node === selectedNodeId
                return (
                  <button
                    type="button"
                    className={`${styles.topologyNode} ${selected ? styles.topologyNodeSelected : ''}`}
                    key={node.id}
                    onClick={() => event && selectNode(event.node)}
                  >
                    <span className={styles.topologyKicker}>{node.id.toUpperCase()}</span>
                    <strong>{node.title}</strong>
                    <span>{node.subtitle}</span>
                    <Tag color={event?.status === 'FAILED' ? 'red' : event ? 'green' : 'default'}>
                      {event ? event.status : 'WAITING'}
                    </Tag>
                  </button>
                )
              })}
              <div className={styles.topologyEdges}>
                {TRACE_TOPOLOGY_EDGES.map(([from, to]) => (
                  <span key={`${from}-${to}`} className={styles.topologyEdge}>
                    {from} <span>→</span> {to}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        <aside className={styles.sideColumn}>
          <section className={styles.panel}>
            <Typography.Title level={4}>事件时间线</Typography.Title>
            <TraceEventTimeline events={events} onSelect={(event) => selectNode(event.node)} />
          </section>
          <section className={`${styles.panel} ${styles.answerPanel}`}>
            <Typography.Title level={4}>AI 实时回答</Typography.Title>
            <div className={styles.answer}>{answer || '等待模型流式输出...'}</div>
          </section>
        </aside>
      </div>
      <Drawer
        title={selectedDefinition?.title ?? '节点详情'}
        open={Boolean(selectedNodeId)}
        onClose={() => setSelectedNodeId(undefined)}
        width={460}
      >
        <TraceNodeDetail definition={selectedDefinition} event={selectedEvent} events={events} />
      </Drawer>
    </div>
  )
}
