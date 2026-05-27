import { redirect } from "next/navigation";

export default function IntegrationsSettingsRedirectPage() {
  redirect("/settings/admin");
}
