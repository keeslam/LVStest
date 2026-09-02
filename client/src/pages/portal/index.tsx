import { Route, Switch } from "wouter";
import { PortalAuthProvider } from "@/hooks/use-portal-auth";
import { PortalLayout } from "@/layouts/PortalLayout";
import PortalLoginPage from "./login";
import PortalActivatePage from "./activate";
import PortalOverviewPage from "./overview";
import PortalReservationsPage from "./reservations";
import PortalReservationDetailPage from "./reservation-detail";
import PortalDocumentsPage from "./documents";
import PortalDriversPage from "./drivers";
import PortalAccountPage from "./account";

/** Everything under /portaal. Mounted from App.tsx with `nest`, so paths here are relative. */
export default function PortalApp() {
  return (
    <PortalAuthProvider>
      <PortalLayout>
        <Switch>
          <Route path="/login" component={PortalLoginPage} />
          <Route path="/activeren" component={PortalActivatePage} />
          <Route path="/reserveringen/:id" component={PortalReservationDetailPage} />
          <Route path="/reserveringen" component={PortalReservationsPage} />
          <Route path="/documenten" component={PortalDocumentsPage} />
          <Route path="/bestuurders" component={PortalDriversPage} />
          <Route path="/account" component={PortalAccountPage} />
          <Route path="/" component={PortalOverviewPage} />
          <Route>{() => <PortalOverviewPage />}</Route>
        </Switch>
      </PortalLayout>
    </PortalAuthProvider>
  );
}
