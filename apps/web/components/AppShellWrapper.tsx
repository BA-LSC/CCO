"use client";

import { AppShell } from "@/components/AppShell";

type Props = {
  children: React.ReactNode;
};

export function AppShellWrapper({ children }: Props) {
  return <AppShell>{children}</AppShell>;
}
