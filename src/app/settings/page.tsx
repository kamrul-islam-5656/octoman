import { redirect } from "next/navigation";

// The dedicated /settings route has been retired — Organization & Users
// administration now lives in the home page's sidebar icon rail.
export default function SettingsPage() {
  redirect("/");
}
