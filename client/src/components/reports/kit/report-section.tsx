/**
 * Rapporten herontwerp deel 1, Task 6: the frame of a report card. On its own page (old tests, other
 * screens) it is a Card with a title; inside the report pane the pane shows the title already, so the
 * card gives only its body. The test id stays on the wrapper either way.
 */
import { createContext, useContext, type ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const InReportPaneContext = createContext(false);

export function InReportPaneProvider({ children }: { children?: ReactNode }) {
  return <InReportPaneContext.Provider value={true}>{children}</InReportPaneContext.Provider>;
}

/** True when the report is shown inside the report pane (which has its own title). */
export function useInReportPane(): boolean {
  return useContext(InReportPaneContext);
}

export function ReportSection({ title, description, testId, children, bodyClassName }: {
  title: string;
  description?: string;
  testId: string;
  children?: ReactNode;
  bodyClassName?: string;
}) {
  const inPane = useInReportPane();
  const body = bodyClassName ?? "space-y-6";
  if (inPane) {
    return (
      <div className={body} data-testid={testId}>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        {children}
      </div>
    );
  }
  return (
    <Card data-testid={testId}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className={body}>{children}</CardContent>
    </Card>
  );
}
