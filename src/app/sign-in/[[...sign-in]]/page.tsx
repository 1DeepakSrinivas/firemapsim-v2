import { redirect } from "next/navigation";

export default function ClerkSignInCatchallPage() {
  redirect("/login");
}
