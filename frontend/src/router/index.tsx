import { lazy, Suspense, type ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from '../components/Layout/MainLayout'
import { useAuthStore } from '../store/authStore'

const Login = lazy(() => import('../pages/Login/Login'))
const Dashboard = lazy(() => import('../pages/Dashboard/Dashboard'))
const RAGPage = lazy(() => import('../pages/RAG/RAGPage'))
const ChatPage = lazy(() => import('../pages/Chat/ChatPage'))
const AuditPage = lazy(() => import('../pages/Audit/AuditPage'))
const MonitorPage = lazy(() => import('../pages/Monitor/MonitorPage'))
const StudentListPage = lazy(() => import('../pages/Student/StudentListPage'))
const StudentDetailPage = lazy(() => import('../pages/Student/StudentDetailPage'))
const CheckInManagementPage = lazy(() => import('../pages/Student/CheckInManagementPage'))
const AttendanceManagementPage = lazy(() => import('../pages/CheckIn/AttendanceManagementPage'))
const FeedbackIssueListPage = lazy(() => import('../pages/Feedback/FeedbackIssueListPage'))
const FeedbackIssueDetailPage = lazy(() => import('../pages/Feedback/FeedbackIssueDetailPage'))
const NotFound = lazy(() => import('../pages/NotFound'))
const TracePage = lazy(() => import('../pages/Trace/TracePage'))

function PageSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>
}

function PrivateRoute({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token)
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

function AdminRoute({ children }: { children: ReactNode }) {
  const role = useAuthStore((s) => s.role)
  return role === 'ADMIN' ? <>{children}</> : <Navigate to="/dashboard" replace />
}

function AdvisorRoute({ children }: { children: ReactNode }) {
  const role = useAuthStore((s) => s.role)
  return role === 'ADMIN' || role === 'ADVISOR' ? (
    <>{children}</>
  ) : (
    <Navigate to="/dashboard" replace />
  )
}

function AttendanceRoute({ children }: { children: ReactNode }) {
  const role = useAuthStore((s) => s.role)
  return role === 'ADMIN' || role === 'ADVISOR' || role === 'MONITOR' ? (
    <>{children}</>
  ) : (
    <Navigate to="/dashboard" replace />
  )
}

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<PageSuspense><Login /></PageSuspense>} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <MainLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<AdvisorRoute><PageSuspense><Dashboard /></PageSuspense></AdvisorRoute>} />
        <Route path="rag" element={<AdvisorRoute><PageSuspense><RAGPage /></PageSuspense></AdvisorRoute>} />
        <Route
          path="chat"
          element={
            <AdvisorRoute>
              <PageSuspense><ChatPage /></PageSuspense>
            </AdvisorRoute>
          }
        />
        <Route
          path="trace"
          element={
            <AdvisorRoute>
              <PageSuspense><TracePage /></PageSuspense>
            </AdvisorRoute>
          }
        />
        <Route
          path="audit"
          element={
            <AdminRoute>
              <PageSuspense><AuditPage /></PageSuspense>
            </AdminRoute>
          }
        />
        <Route
          path="monitor"
          element={
            <AdminRoute>
              <PageSuspense><MonitorPage /></PageSuspense>
            </AdminRoute>
          }
        />
        <Route path="student" element={<AdvisorRoute><PageSuspense><StudentListPage /></PageSuspense></AdvisorRoute>} />
        <Route path="student/:id" element={<AdvisorRoute><PageSuspense><StudentDetailPage /></PageSuspense></AdvisorRoute>} />
        <Route path="student/check-in" element={<AdvisorRoute><PageSuspense><CheckInManagementPage /></PageSuspense></AdvisorRoute>} />
        <Route path="issues" element={<PageSuspense><FeedbackIssueListPage /></PageSuspense>} />
        <Route path="issues/:id" element={<PageSuspense><FeedbackIssueDetailPage /></PageSuspense>} />
        <Route
          path="attendance"
          element={
            <AttendanceRoute>
              <PageSuspense><AttendanceManagementPage /></PageSuspense>
            </AttendanceRoute>
          }
        />
      </Route>
      <Route path="*" element={<PageSuspense><NotFound /></PageSuspense>} />
    </Routes>
  )
}
