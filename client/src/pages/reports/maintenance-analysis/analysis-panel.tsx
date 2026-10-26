import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** A titled block of the maintenance analysis window (a chart or a table). */
export function AnalysisPanel({ title, description, children, testId }: {
  title: string;
  description?: string;
  children?: ReactNode;
  testId?: string;
}) {
  return (
    <Card data-testid={testId} className="min-w-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}
