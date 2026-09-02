import { Route, Switch } from "wouter";
import { PortalAuthProvider } from "@/hooks/use-portal-auth";
import { PortalLayout } from "@/layouts/PortalLayout";
import PortalLoginPage from "./login";
import PortalActivatePage from "./activate";
import PortalOverviewPage from "./overview";

/** Everything under /portaal. Mounted from App.tsx with `nest`, so paths here are relative. */
export default function PortalApp() {
  return (
    <PortalAuthProvider>
      <PortalLayout>
        <Switch>
          <Route path="/login" component={PortalLoginPage} />
          <Route path="/activeren" component={PortalActivatePage} />
          <Route path="/" component={PortalOverviewPage} />
          <Route>{() => <PortalOverviewPage />}</Route>
        </Switch>
      </PortalLayout>
    </PortalAuthProvider>
  );
}
