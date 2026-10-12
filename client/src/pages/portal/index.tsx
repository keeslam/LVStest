import { Redirect, Route, Switch } from "wouter";
import { PortalAuthProvider } from "@/hooks/use-portal-auth";
import { PortalLayout } from "@/layouts/PortalLayout";
import PortalLoginPage from "./login";
import PortalActivatePage from "./activate";
import PortalConfirmEmailPage from "./confirm-email";
import PortalOverviewPage from "./overview";
import PortalReservationsPage from "./reservations";
import PortalVehiclesPage from "./vehicles";
import PortalFiscalPage from "@/pages/portal/fiscal";
import PortalDocumentsPage from "./documents";
import PortalDriversPage from "./drivers";
import PortalFinesPage from "./fines";
import PortalRequestsPage from "./requests";
import PortalNotFoundPage from "./not-found";
import { PortalDialogsProvider } from "@/hooks/use-portal-dialogs";

/** Everything under /portaal. Mounted from App.tsx with `nest`, so paths here are relative. */
export default function PortalApp() {
  return (
    <PortalAuthProvider>
      <PortalDialogsProvider>
      <PortalLayout>
        <Switch>
          <Route path="/login" component={PortalLoginPage} />
          <Route path="/activeren" component={PortalActivatePage} />
          <Route path="/email-bevestigen" component={PortalConfirmEmailPage} />
          <Route path="/reserveringen/:id" component={PortalReservationsPage} />
          <Route path="/reserveringen" component={PortalReservationsPage} />
          <Route path="/voertuigen" component={PortalVehiclesPage} />
          <Route path="/fiscaal" component={PortalFiscalPage} />
          <Route path="/documenten" component={PortalDocumentsPage} />
          {/* The menu says "Contracten": anyone who types or bookmarks that word lands on the right page. */}
          <Route path="/contracten">{() => <Redirect to="/documenten" />}</Route>
          <Route path="/bestuurders" component={PortalDriversPage} />
          <Route path="/account" component={PortalOverviewPage} />
          <Route path="/bekeuringen/:id" component={PortalFinesPage} />
          <Route path="/bekeuringen" component={PortalFinesPage} />
          <Route path="/aanvragen/nieuw" component={PortalRequestsPage} />
          <Route path="/aanvragen/:id" component={PortalRequestsPage} />
          <Route path="/aanvragen" component={PortalRequestsPage} />
          <Route path="/" component={PortalOverviewPage} />
          <Route component={PortalNotFoundPage} />
        </Switch>
      </PortalLayout>
      </PortalDialogsProvider>
    </PortalAuthProvider>
  );
}
