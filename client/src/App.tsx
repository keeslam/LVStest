import { Switch, Route, Redirect } from "wouter";
import Dashboard from "@/pages/dashboard";
import VehiclesIndex from "@/pages/vehicles/index";
import VehicleDetails from "@/pages/vehicles/[id]";
import VehicleEdit from "@/pages/vehicles/[id]/edit";
import CustomersIndex from "@/pages/customers/index";
import CustomerDetails from "@/pages/customers/[id]";
import CustomerEdit from "@/pages/customers/[id]/edit";
import ReservationsIndex from "@/pages/reservations/index";
import ReservationDetails from "@/pages/reservations/[id]";
import ReservationEdit from "@/pages/reservations/edit/[id]";
import ReservationCalendar from "@/pages/reservations/calendar";
import ExpensesIndex from "@/pages/expenses/index";
import ExpenseAdd from "@/pages/expenses/add";
import ExpenseDetails from "@/pages/expenses/[id]";
import VehicleExpensesPage from "@/pages/expenses/vehicle/[id]";
import DocumentsIndex from "@/pages/documents/index";
import ContractViewer from "@/pages/documents/contract/[id]";
import ReportsPage from "@/pages/reports/index";
import DeliveryDashboard from "@/pages/delivery/dashboard";
import NotificationsPage from "@/pages/notifications/index";
import CustomNotificationsPage from "@/pages/notifications/custom-notifications";
import CustomerCommunications from "@/pages/CustomerCommunications";
import SearchResults from "@/pages/search-results";
import UsersIndex from "@/pages/users/index";
import UserAdd from "@/pages/users/add";
import UserDetails from "@/pages/users/[id]";
import UserEdit from "@/pages/users/[id]/edit";
import ProfilePage from "@/pages/profile";
import ProfileEditPage from "@/pages/profile/edit";
import ChangePasswordPage from "@/pages/profile/change-password";
import MileageOverridePasswordPage from "@/pages/profile/mileage-override-password";
import MaintenanceCalendar from "@/pages/maintenance/calendar";
import SettingsPage from "@/pages/settings/index";
import CommunicationsPage from "@/pages/communications";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import MainLayout from "@/layouts/MainLayout";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { SocketProvider } from "@/hooks/use-socket";
import { ProtectedRoute } from "@/components/protected-route";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";
import { GlobalDialogs } from "@/components/global-dialogs";
import { InactivityPrompt } from "@/components/InactivityPrompt";
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
              <ProtectedRoute path="/reservations/:id" component={ReservationDetails} />
              <ProtectedRoute path="/maintenance" component={MaintenanceCalendar} />
              <ProtectedRoute path="/expenses" component={ExpensesIndex} />
              <ProtectedRoute path="/expenses/add" component={ExpenseAdd} />
              <ProtectedRoute path="/expenses/vehicle/:id" component={VehicleExpensesPage} />
              <ProtectedRoute path="/expenses/edit/:id" component={ExpenseAdd} />
              <ProtectedRoute path="/expenses/:id" component={ExpenseDetails} />
              <ProtectedRoute path="/documents" component={DocumentsIndex} />
              <ProtectedRoute path="/documents/contract/:id" component={ContractViewer} />
              <ProtectedRoute path="/reports" component={ReportsPage} />
              <ProtectedRoute path="/delivery" component={DeliveryDashboard} />
              <ProtectedRoute path="/notifications" component={NotificationsPage} />
              <ProtectedRoute path="/notifications/custom" component={CustomNotificationsPage} />
              <ProtectedRoute path="/communications" component={CustomerCommunications} />
              <Route path="/search-results">
                {() => {
                  const { user } = useAuth();
                  return user ? <SearchResults /> : <Redirect to="/auth" />;
                }}
              </Route>
              <ProtectedRoute path="/users" component={UsersIndex} />
              <ProtectedRoute path="/users/add" component={UserAdd} />
              <ProtectedRoute path="/users/:id/edit" component={UserEdit} />
              <ProtectedRoute path="/users/:id" component={UserDetails} />
              <ProtectedRoute path="/profile" component={ProfilePage} />
              <ProtectedRoute path="/profile/edit" component={ProfileEditPage} />
              <ProtectedRoute path="/profile/change-password" component={ChangePasswordPage} />
              <ProtectedRoute path="/profile/mileage-override-password" component={MileageOverridePasswordPage} />
              <ProtectedRoute path="/communications" component={CommunicationsPage} />
              <ProtectedRoute path="/settings" component={SettingsPage} />
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
