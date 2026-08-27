import "./lib/csrf-fetch-interceptor";
import "./i18n";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AdminPasswordPromptDialog } from "@/components/admin-password-prompt-dialog";

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <AdminPasswordPromptDialog />
      <App />
    </TooltipProvider>
  </QueryClientProvider>
);
