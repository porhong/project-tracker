import { redirect } from "next/navigation";

// proxy.ts sends unauthenticated visitors to /login before this ever renders.
export default function Home() {
  redirect("/dashboard");
}
