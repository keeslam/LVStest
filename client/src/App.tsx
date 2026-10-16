import { Suspense, lazy } from "react";
import { Switch, Route, useLocation } from "wouter";
import Dashboard from "@/pages/dashboard";
// OPT-001 — the work-day screen. A *sibling* of the dashboard, not a
// replacement: a new route plus a prominent entry is the smaller, reversible
// half of the choice B-17 left open, and no existing widget is removed.
import VehiclesIndex from "@/pages/vehicles/index";
import CustomersIndex from "@/pages/customers/index";
import ReservationEdit from "@/pages/reservations/edit/[id]";
import ReservationCalendar from "@/pages/reservations/calendar";
import ExpensesIndex from "@/pages/expenses/index";
import ExpenseAdd from "@/pages/expenses/add";
// A-19-4: the three heaviest screens load on first use; PageLoading shows meanwhile.
const DocumentsIndex = lazy(() => import("@/pages/documents/index"));
const ReportsPage = lazy(() => import("@/pages/reports/index"));
import DeliveryDashboard from "@/pages/delivery/dashboard";
import ScanPage from "@/pages/scan/index";
const CustomerCommunications = lazy(() => import("@/pages/CustomerCommunications"));
import MaintenanceCalendar from "@/pages/maintenance/calendar";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import PortalApp from "@/pages/portal/index";
import PortalAdminPage from "@/pages/portal-admin/index";
import FinesPage from "@/pages/fines/index";
const ManualPage = lazy(() => import("@/pages/manual/index"));
import MainLayout from "@/layouts/MainLayout";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { SocketProvider } from "@/hooks/use-socket";
import { ProtectedRoute } from "@/components/protected-route";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";
import { GlobalDialogs } from "@/components/global-dialogs";
import { InactivityPrompt } from "@/components/InactivityPrompt";
import { ApkDateChangesDialog } from "@/components/vehicles/apk-date-changes-dialog";
import { OfficeTimeZoneLoader } from "@/components/office-time-zone-loader";
import { useOfficeTimeZone } from "@/lib/office-timezone";
import { apiRequest } from "@/lib/queryClient";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageLoading } from "@/components/ui/page-loading";

function AppRoutes() {
  const { user, logoutMutation } = useAuth();
  // D11: the routes render again when the office time zone is loaded or changed, so a screen that was
  // drawn before the answer arrived does not stay on Europe/Amsterdam dates.
  useOfficeTimeZone();
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

      {/* RDW APK date change confirmation: staff only, and never on the customer portal. A staff member who is
          logged in in the same browser would otherwise see this fleet data on top of the portal pages. */}
      {user && !location.startsWith("/portaal") && <ApkDateChangesDialog />}

      {/* D11: the office time zone (app setting) for every "today" on screen */}
      {user && <OfficeTimeZoneLoader />}
      
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
            <Suspense fallback={<PageLoading />}>
            <Switch>
              <ProtectedRoute path="/" component={Dashboard} />
              <ProtectedRoute path="/vehicles" component={VehiclesIndex} />
              <ProtectedRoute path="/scan" component={ScanPage} />
              <ProtectedRoute path="/customers" component={CustomersIndex} />
              <ProtectedRoute path="/reservations" component={ReservationCalendar} />
              {/* B-21: de werklijst met verhuringen die nog buiten staan. */}
              <ProtectedRoute path="/reservations/edit/:id" component={ReservationEdit} />
              <ProtectedRoute path="/maintenance" component={MaintenanceCalendar} />
              <ProtectedRoute path="/expenses" component={ExpensesIndex} />
              <ProtectedRoute path="/expenses/add" component={ExpenseAdd} />
              <ProtectedRoute path="/documents" component={DocumentsIndex} />
              <ProtectedRoute path="/reports" component={ReportsPage} />
              <ProtectedRoute path="/delivery" component={DeliveryDashboard} />
              <ProtectedRoute path="/communications" component={CustomerCommunications} />
              <ProtectedRoute path="/portal-admin" component={PortalAdminPage} />
              <ProtectedRoute path="/fines" component={FinesPage} />
              <ProtectedRoute path="/handleiding/:chapter" component={ManualPage} />
              <ProtectedRoute path="/handleiding" component={ManualPage} />
              <Route path="/auth" component={AuthPage} />
              <Route component={NotFound} />
            </Switch>
            </Suspense>
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
    // SocketProvider reads the signed-in user, so it sits inside AuthProvider.
    <AuthProvider>
      <SocketProvider>
        <GlobalDialogProvider>
          <AppRoutes />
          <GlobalDialogs />
        </GlobalDialogProvider>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;
