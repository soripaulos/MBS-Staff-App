import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/auth/AuthProvider";
import { SessionProvider } from "@/providers/SessionProvider";
import { AcademicProvider } from "@/providers/AcademicProvider";
import { ThemeProvider } from "@/providers/ThemeProvider";
import AppShell from "@/app/AppShell";
import LoginPage from "@/auth/LoginPage";
import CallbackPage from "@/auth/CallbackPage";
import { ListSkeleton } from "@/components/ui";

const Dashboard = lazy(() => import("@/features/dashboard/DashboardPage"));
const Timetable = lazy(() => import("@/features/timetable/TimetablePage"));
const Results = lazy(() => import("@/features/results/ResultsPage"));
const StudentResults = lazy(() => import("@/features/results/StudentResultsPage"));
const Attendance = lazy(() => import("@/features/attendance/AttendancePage"));
const TakeAttendance = lazy(() => import("@/features/attendance/TakeAttendancePage"));
const Students = lazy(() => import("@/features/students/StudentsPage"));
const StudentDetail = lazy(() => import("@/features/students/StudentDetailPage"));
const Notifications = lazy(() => import("@/features/notifications/NotificationsPage"));
const Messages = lazy(() => import("@/features/messages/MessagesPage"));
const Evaluations = lazy(() => import("@/features/evaluations/EvaluationsPage"));
const Analytics = lazy(() => import("@/features/analytics/AnalyticsPage"));
const StaffLeave = lazy(() => import("@/features/leave/StaffLeavePage"));
const More = lazy(() => import("@/features/more/MorePage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: (count, error) => {
        const status = (error as { status?: number })?.status;
        if (status && status >= 400 && status < 500) return false;
        return count < 2;
      },
    },
  },
});

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="p-6">
        <ListSkeleton rows={6} />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/oauth/callback" element={<CallbackPage />} />
              <Route
                element={
                  <RequireAuth>
                    <SessionProvider>
                      <AcademicProvider>
                        <AppShell />
                      </AcademicProvider>
                    </SessionProvider>
                  </RequireAuth>
                }
              >
                <Route
                  path="/"
                  element={
                    <Suspense fallback={<ListSkeleton rows={6} />}>
                      <Dashboard />
                    </Suspense>
                  }
                />
                {(
                  [
                    ["/timetable", Timetable],
                    ["/results", Results],
                    ["/results/student/:id", StudentResults],
                    ["/attendance", Attendance],
                    ["/attendance/take/:scheduleId", TakeAttendance],
                    ["/students", Students],
                    ["/students/:id", StudentDetail],
                    ["/notifications", Notifications],
                    ["/messages", Messages],
                    ["/evaluations", Evaluations],
                    ["/analytics", Analytics],
                    ["/leave", StaffLeave],
                    ["/more", More],
                  ] as const
                ).map(([path, Comp]) => (
                  <Route
                    key={path}
                    path={path}
                    element={
                      <Suspense fallback={<ListSkeleton rows={6} />}>
                        <Comp />
                      </Suspense>
                    }
                  />
                ))}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
