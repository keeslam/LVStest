import { Switch, Route } from "wouter";
import Dashboard from "@/pages/dashboard";
import VehiclesIndex from "@/pages/vehicles/index";
import VehicleDetails from "@/pages/vehicles/[id]";
import VehicleEdit from "@/pages/vehicles/[id]/edit";
import CustomersIndex from "@/pages/customers/index";
import CustomerDetails from "@/pages/customers/[id]";
import CustomerEdit from "@/pages/customers/[id]/edit";
import ReservationEdit from "@/pages/reservations/edit/[id]";
import ReservationCalendar from "@/pages/reservations/calendar";
import ExpensesIndex from "@/pages/expenses/index";
import ExpenseAdd from "@/pages/expenses/add";
import ExpenseDetails from "@/pages/expenses/[id]";
import VehicleExpensesPage from "@/pages/expenses/vehicle/[id]";
import DocumentsIndex from "@/pages/documents/index";
import ReportsPage from "@/pages/reports/index";
import DeliveryDashboard from "@/pages/delivery/dashboard";
import CustomerCommunications from "@/pages/CustomerCommunications";
import MaintenanceCalendar from "@/pages/maintenance/calendar";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import MainLayout from "@/layouts/MainLayout";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { SocketProvider } from "@/hooks/use-socket";
import { ProtectedRoute } from "@/components/protected-route";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";
import { GlobalDialogs } from "@/components/global-dialogs";
import { InactivityPrompt } from "@/components/InactivityPrompt";
import { ApkDateChangesDialog } from "@/components/vehicles/apk-date-changes-dialog";
import { apiRequest } from "@/lib/queryClient";

function AppRoutes() {
  const { user, logoutMutation } = useAuth();

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
      {/* Staff Routes - With MainLayout */}
      <Route>
        {() => (
          <MainLayout>
            <Switch>
              <ProtectedRoute path="/" component={Dashboard} />
              <ProtectedRoute path="/vehicles" component={VehiclesIndex} />
              <ProtectedRoute path="/vehicles/:id/edit" component={VehicleEdit} />
              <ProtectedRoute path="/vehicles/:id" component={VehicleDetails} />
              <ProtectedRoute path="/customers" component={CustomersIndex} />
              <ProtectedRoute path="/customers/:id/edit" component={CustomerEdit} />
              <ProtectedRoute path="/customers/:id" component={CustomerDetails} />
              <ProtectedRoute path="/reservations" component={ReservationCalendar} />
              <ProtectedRoute path="/reservations/edit/:id" component={ReservationEdit} />
              <ProtectedRoute path="/maintenance" component={MaintenanceCalendar} />
              <ProtectedRoute path="/expenses" component={ExpensesIndex} />
              <ProtectedRoute path="/expenses/add" component={ExpenseAdd} />
              <ProtectedRoute path="/expenses/vehicle/:id" component={VehicleExpensesPage} />
              <ProtectedRoute path="/expenses/edit/:id" component={ExpenseAdd} />
              <ProtectedRoute path="/expenses/:id" component={ExpenseDetails} />
              <ProtectedRoute path="/documents" component={DocumentsIndex} />
              <ProtectedRoute path="/reports" component={ReportsPage} />
              <ProtectedRoute path="/delivery" component={DeliveryDashboard} />
              <ProtectedRoute path="/communications" component={CustomerCommunications} />
              <Route path="/auth" component={AuthPage} />
              <Route component={NotFound} />
            </Switch>
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
