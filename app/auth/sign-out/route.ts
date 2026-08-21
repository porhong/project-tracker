import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  return NextResponse.redirect(new URL("/login", request.url), {
    status: 303,
  });
}

/**
 * Redirect-reachable sign-out for guards in Server Components.
 *
 * A guard that must end the session (missing profile, DB-side suspension)
 * cannot clear cookies itself -- Server Components may not write them -- and
 * must not redirect straight to /login: the proxy bounces any still-signed-in
 * user from /login back to /dashboard, which is exactly the redirect loop this
 * route exists to break. Terminating the session here first means the proxy
 * sees no claims and lets /login render.
 *
 * `/auth/*` is public in the proxy, so this route always stays reachable.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const url = new URL("/login", request.url);
  const error = request.nextUrl.searchParams.get("error");
  if (error) url.searchParams.set("error", error);

  return NextResponse.redirect(url, { status: 303 });
}
