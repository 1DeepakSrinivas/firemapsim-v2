import { redirect } from "next/navigation";

/** @deprecated Use `/dashboard` */
export default function SimulationsRedirectPage() {
  redirect("/dashboard");
}
