"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ADMIN_SETTINGS_LINKS = [
  { href: "/settings/integrations", label: "Integrations" },
  { href: "/settings/updates", label: "Updates" },
] as const;

export function AdminSettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="admin-settings-nav" aria-label="Admin settings">
      {ADMIN_SETTINGS_LINKS.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={`admin-settings-nav-link${active ? " admin-settings-nav-link-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
