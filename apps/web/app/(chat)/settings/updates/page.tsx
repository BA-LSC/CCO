import { redirect } from "next/navigation";

export default function UpdatesSettingsRedirectPage() {
  redirect("/settings/admin");
}
