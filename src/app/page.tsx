import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LandingPageView } from "@/app/landing/page";

export const metadata: Metadata = {
  title: { absolute: "FireMapSim-v2" },
  description:
    "A minimal research landing page for map-first wildfire simulation setup, agent-assisted workflows, and dashboard access.",
};

export default async function Home() {
  const { userId } = await auth();

  if (userId) {
    redirect("/dashboard");
  }

  return <LandingPageView />;
}
