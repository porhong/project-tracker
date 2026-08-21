import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAdminPath, isPublicPath, readRoleClaims } from "@/lib/auth/roles";
import type { Database } from "./database.types";

export async function updateSession(request: NextRequest) {
  // The MCP endpoint authenticates with a Bearer token and enforces the admin
  // check itself (see app/api/mcp/route.ts) -- the cookie session flow would
  // just redirect token clients to /login.
  if (request.nextUrl.pathname === "/api/mcp") {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          // Cache headers keep CDNs from caching a response that carries
          // auth cookies, which would leak one user's session to another.
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and supabase.auth.getClaims().
  // A simple mistake could make it very hard to debug issues with users being
  // randomly logged out.

  // IMPORTANT: If you remove getClaims() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  const { data } = await supabase.auth.getClaims();

  // Any redirect below must carry the cookies Supabase just wrote, otherwise
  // the browser and server go out of sync and the session dies. See the note
  // at the bottom of this function.
  const redirectTo = (pathname: string, params?: Record<string, string>) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = "";
    Object.entries(params ?? {}).forEach(([key, value]) =>
      url.searchParams.set(key, value),
    );

    const response = NextResponse.redirect(url);
    supabaseResponse.cookies
      .getAll()
      .forEach((cookie) => response.cookies.set(cookie));
    return response;
  };

  const { pathname } = request.nextUrl;
  const claims = data?.claims ?? null;
  const { role, status } = readRoleClaims(claims);

  if (!claims) {
    if (isPublicPath(pathname)) return supabaseResponse;
    return redirectTo("/login", pathname === "/" ? undefined : { next: pathname });
  }

  // A suspended user is banned at the Auth layer, so they cannot refresh their
  // token -- but an already-issued one stays valid until it expires. Cut the
  // session short here rather than waiting that out.
  if (status === "suspended") {
    await supabase.auth.signOut();
    return redirectTo("/login", { error: "suspended" });
  }

  // Signed in already: bounce off the entry points. `/auth/*` is deliberately
  // excluded -- sign-out lives there and must stay reachable.
  if (pathname === "/" || pathname === "/login") {
    return redirectTo("/dashboard");
  }

  // `user_role` is a cache of `profiles.role` baked into the access token, so
  // it can be a full token lifetime behind a role change. Two cases must not
  // ride on a stale value:
  //
  //   promoted -- the nav reads the profile and offers Users, but the claim
  //     still says viewer, so this check would bounce them off a page they are
  //     entitled to;
  //   demoted -- the claim still says admin, and RLS reads the claim rather
  //     than the row, so it keeps granting reads the profile no longer allows.
  //
  // Refreshing re-runs the access-token hook and settles both. The profile read
  // costs one indexed lookup, and only for admin claims or admin paths.
  let effectiveRole = role;

  if (role === "admin" || isAdminPath(pathname)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", claims.sub)
      .single();

    if (profile && profile.role !== role) {
      await supabase.auth.refreshSession();
      const { data: refreshed } = await supabase.auth.getClaims();
      // The refreshed claim wins when present (the access-token hook re-ran
      // during the refresh). Fall back to the profile row when the token
      // carries no role claim at all -- e.g. the hook is not enabled on the
      // project, where every JWT lacks user_role and admins would otherwise
      // be bounced off admin paths as forbidden forever. The row is the same
      // source of truth requireProfile() authorizes from.
      effectiveRole = readRoleClaims(refreshed?.claims).role ?? profile.role;
    }
  }

  if (isAdminPath(pathname) && effectiveRole !== "admin") {
    return redirectTo("/dashboard", { error: "forbidden" });
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
}
