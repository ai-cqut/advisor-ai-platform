import { Menu } from 'antd'
import {
  AuditOutlined,
  CheckCircleOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  IssuesCloseOutlined,
  LineChartOutlined,
  MessageOutlined,
  NodeIndexOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import styles from './MainLayout.module.css'

interface MainNavigationProps {
  role?: string | null
  selectedPath: string
  onNavigate: (path: string) => void
}

export default function MainNavigation({ role, selectedPath, onNavigate }: MainNavigationProps) {
  const menuItems = [
    ...(role === 'ADMIN' || role === 'ADVISOR'
      ? [
          { key: '/dashboard', icon: <DashboardOutlined />, label: '工作台' },
          { key: '/student', icon: <TeamOutlined />, label: '学生管理' },
          { key: '/student/check-in', icon: <CheckCircleOutlined />, label: '打卡管理' },
          { key: '/attendance', icon: <CheckCircleOutlined />, label: '课堂考勤' },
          { key: '/rag', icon: <DatabaseOutlined />, label: '知识库管理' },
          { key: '/chat', icon: <MessageOutlined />, label: 'AI 对话' },
          { key: '/trace', icon: <NodeIndexOutlined />, label: '链路追踪' },
        ]
      : []),
    ...(role === 'MONITOR'
      ? [{ key: '/attendance', icon: <CheckCircleOutlined />, label: '课堂考勤' }]
      : []),
    ...(role ? [{ key: '/issues', icon: <IssuesCloseOutlined />, label: '反馈' }] : []),
    ...(role === 'ADMIN'
      ? [
          { key: '/audit', icon: <AuditOutlined />, label: '审计日志' },
          { key: '/monitor', icon: <LineChartOutlined />, label: '监控中心' },
        ]
      : []),
  ]

  return (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[selectedPath]}
      items={menuItems}
      onClick={({ key }) => onNavigate(key)}
      className={styles.menu}
    />
  )
}
