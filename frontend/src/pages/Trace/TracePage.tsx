import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, Space, Tag, Typography, message } from 'antd'
import { PlayCircleOutlined, StopOutlined } from '@ant-design/icons'
import { chatApi } from '../../api/chatApi'
import { streamChat } from '../../api/chatStreamClient'
import { subscribeTrace } from './traceApi'
import { latestEventForNode, TRACE_NODES } from './traceModel'
import type { TraceEvent } from './traceTypes'
import { TraceEventTimeline } from './TraceEventTimeline'
import { TraceNodeCard } from './TraceNodeCard'
import styles from './TracePage.module.css'

const { TextArea } = Input

export default function TracePage() {
  const [question, setQuestion] = useState('请介绍一下这个平台的 AI 对话链路')
  const [traceId, setTraceId] = useState('')
  const [events, setEvents] = useState<TraceEvent[]>([])
  const [answer, setAnswer] = useState('')
  const [running, setRunning] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const stopTimerRef = useRef<number | null>(null)
  const traceCompletedRef = useRef(false)

  useEffect(
    () => () => {
      eventSourceRef.current?.close()
      if (stopTimerRef.current !== null) {
        window.clearTimeout(stopTimerRef.current)
      }
    },
    [],
  )

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

  const scheduleStop = (delayMs: number) => {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current)
    }
    stopTimerRef.current = window.setTimeout(stop, delayMs)
  }

  const runTrace = async () => {
    if (!question.trim() || running) return
    setRunning(true)
    setAnswer('')
    setEvents([])
    const nextTraceId = crypto.randomUUID()
    setTraceId(nextTraceId)
    traceCompletedRef.current = false

    eventSourceRef.current = subscribeTrace(
      nextTraceId,
      (event) => setEvents((previous) => [...previous, event]),
      () => message.error('链路事件订阅失败'),
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
          onError: (error) => message.error(error),
        },
      )
    } catch (error) {
      message.error(error instanceof Error ? error.message : '链路请求失败')
    } finally {
      if (!traceCompletedRef.current) {
        scheduleStop(10_000)
      }
    }
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
        <Space>
          <Button type="primary" icon={<PlayCircleOutlined />} loading={running} onClick={() => void runTrace()}>
            发送真实请求
          </Button>
          <Button icon={<StopOutlined />} disabled={!running} onClick={stop}>
            停止监听
          </Button>
          {currentNode && <Tag color="blue">当前节点：{currentNode}</Tag>}
        </Space>
      </section>

      <div className={styles.contentGrid}>
        <section className={styles.flowSection}>
          <div className={styles.sectionHeading}>
            <div>
              <Typography.Title level={4}>请求执行路径</Typography.Title>
              <Typography.Text type="secondary">节点状态和耗时来自同一次真实请求</Typography.Text>
            </div>
            <Tag>{events.length} 个事件</Tag>
          </div>
          <div className={styles.flow}>
            {TRACE_NODES.map((definition, index) => (
              <div key={definition.id}>
                <TraceNodeCard definition={definition} event={latestEventForNode(events, definition.id)} />
                {index < TRACE_NODES.length - 1 && <div className={styles.connector} />}
              </div>
            ))}
          </div>
        </section>

        <aside className={styles.sideColumn}>
          <section className={styles.panel}>
            <Typography.Title level={4}>事件时间线</Typography.Title>
            <TraceEventTimeline events={events} />
          </section>
          <section className={`${styles.panel} ${styles.answerPanel}`}>
            <Typography.Title level={4}>AI 实时回答</Typography.Title>
            <div className={styles.answer}>{answer || '等待模型流式输出...'}</div>
          </section>
        </aside>
      </div>
    </div>
  )
}
