import type { ReactNode } from "react";
import { ConfirmProvider } from "./ConfirmDialog";
import { ToastProvider } from "./Toast";

export default function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </ToastProvider>
  );
}
