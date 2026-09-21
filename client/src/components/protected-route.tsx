import { Redirect, Route, RouteComponentProps, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { canOpenPage, firstOpenablePage, pageAccessFor } from "@shared/page-access";
import { NoAccessPage } from "@/components/no-access-page";

interface ProtectedRouteProps {
  path: string;
  component: React.ComponentType<any>;
}

export function ProtectedRoute({ path, component: Component }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  // Enforce redirection when auth state changes
  useEffect(() => {
    if (!isLoading && !user && location !== "/auth") {
      setLocation("/auth");
    }
  }, [user, isLoading, location, setLocation]);

  if (isLoading) {
    return (
      <Route path={path}>
        {(params) => (
          <div className="flex items-center justify-center min-h-screen">
            <Loader2 className="h-8 w-8 animate-spin text-border" />
          </div>
        )}
      </Route>
    );
  }

  if (!user) {
    return (
      <Route path={path}>
        {() => <Redirect to="/auth" />}
      </Route>
    );
  }

  // B-28 (docs/superpowers/specs/2026-09-21-toegang-design.md, §2): a
  // logged-in user who lacks every permission `shared/page-access.ts` lists
  // for this address gets the no-access page instead of the page component —
  // the component below is never rendered, so none of its queries fire.
  // `path` here is the route's own pattern (e.g. "/reservations/edit/:id"),
  // the same value canOpenPage()/pageAccessFor() are built to match; a path
  // with no row in the table (a route this table was never meant to cover)
  // is left open by canOpenPage()'s own contract, so this never blocks an
  // address the sidebar/table doesn't manage.
  if (!canOpenPage(user, path)) {
    const anyOf = pageAccessFor(path)?.anyOf ?? [];
    const wayOut = firstOpenablePage(user);
    return (
      <Route path={path}>
        {() => <NoAccessPage anyOf={anyOf} wayOut={wayOut} />}
      </Route>
    );
  }

  return (
    <Route path={path}>
      {(params) => <Component {...params} />}
    </Route>
  );
}