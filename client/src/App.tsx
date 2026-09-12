import { Switch, Route, useLocation } from "wouter";
import Dashboard from "@/pages/dashboard";
// OPT-001 — the work-day screen. A *sibling* of the dashboard, not a
// replacement: a new route plus a prominent entry is the smaller, reversible
// half of the choice B-17 left open, and no existing widget is removed.
import TodayPage from "@/pages/today";
import VehiclesIndex from "@/pages/vehicles/index";
import CustomersIndex from "@/pages/customers/index";
import ReservationEdit from "@/pages/reservations/edit/[id]";
import ReservationCalendar from "@/pages/reservations/calendar";
import ExpensesIndex from "@/pages/expenses/index";
import ExpenseAdd from "@/pages/expenses/add";
import DocumentsIndex from "@/pages/documents/index";
import ReportsPage from "@/pages/reports/index";
import DeliveryDashboard from "@/pages/delivery/dashboard";
import ScanPage from "@/pages/scan/index";
import CustomerCommunications from "@/pages/CustomerCommunications";
import MaintenanceCalendar from "@/pages/maintenance/calendar";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import PortalApp from "@/pages/portal/index";
import PortalAdminPage from "@/pages/portal-admin/index";
import MainLayout from "@/layouts/MainLayout";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { SocketProvider } from "@/hooks/use-socket";
import { ProtectedRoute } from "@/components/protected-route";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";
import { GlobalDialogs } from "@/components/global-dialogs";
import { InactivityPrompt } from "@/components/InactivityPrompt";
import { ApkDateChangesDialog } from "@/components/vehicles/apk-date-changes-dialog";
import { apiRequest } from "@/lib/queryClient";
import { ErrorBoundary } from "@/components/ErrorBoundary";

function AppRoutes() {
  const { user, logoutMutation } = useAuth();
  // FIX-Q (BUG-201): the boundary sits inside the layout, so a page that
  // throws while rendering loses the page and keeps the shell. Navigating
  // away clears it — the location is the reset key.
  const [location] = useLocation();

  const handleLogout = () => {
    logoutMutation.mutate();
  };
  
  return (
    <>
      {/* Inactivity prompt - only show for authenticated users */}
      {user && (
        <InactivityPrompt
          onLogout={handleLogout}
        />
      )}

      {/* RDW APK date change confirmation - only for authenticated users */}
      {user && <ApkDateChangesDialog />}
      
      <Switch>
      {/* Customer portal - own layout, own auth realm, embeddable in the website iframe */}
      <Route path="/portaal" nest>
        <PortalApp />
      </Route>
      {/* Staff Routes - With MainLayout */}
      <Route>
        {() => (
          <MainLayout>
            <ErrorBoundary resetKey={location}>
            <Switch>
              <ProtectedRoute path="/" component={Dashboard} />
              <ProtectedRoute path="/vandaag" component={TodayPage} />
              <ProtectedRoute path="/vehicles" component={VehiclesIndex} />
              <ProtectedRoute path="/scan" component={ScanPage} />
              <ProtectedRoute path="/customers" component={CustomersIndex} />
              <ProtectedRoute path="/reservations" component={ReservationCalendar} />
              <ProtectedRoute path="/reservations/edit/:id" component={ReservationEdit} />
              <ProtectedRoute path="/maintenance" component={MaintenanceCalendar} />
              <ProtectedRoute path="/expenses" component={ExpensesIndex} />
              <ProtectedRoute path="/expenses/add" component={ExpenseAdd} />
              <ProtectedRoute path="/documents" component={DocumentsIndex} />
              <ProtectedRoute path="/reports" component={ReportsPage} />
              <ProtectedRoute path="/delivery" component={DeliveryDashboard} />
              <ProtectedRoute path="/communications" component={CustomerCommunications} />
              <ProtectedRoute path="/portal-admin" component={PortalAdminPage} />
              <Route path="/auth" component={AuthPage} />
              <Route component={NotFound} />
            </Switch>
            </ErrorBoundary>
          </MainLayout>
        )}
      </Route>
    </Switch>
    </>
  );
}

function App() {
  return (
    <SocketProvider>
      <AuthProvider>
        <GlobalDialogProvider>
          <AppRoutes />
          <GlobalDialogs />
        </GlobalDialogProvider>
      </AuthProvider>
    </SocketProvider>
  );
}

export default App;
