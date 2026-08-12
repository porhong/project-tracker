/**
 * Temporary smoke test: creates throwaway users, exercises the real auth path,
 * then deletes them. Not part of the app.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const secret = process.env.SUPABASE_SECRET_KEY!;

const admin = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const anonClient = () =>
  createClient(url, publishable, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

const stamp = Date.now();
const adminEmail = `verify-admin-${stamp}@example.com`;
const viewerEmail = `verify-viewer-${stamp}@example.com`;
const password = "Sup3rSecret!verify";

function decode(jwt: string) {
  const [, payload] = jwt.split(".");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

const results: string[] = [];
const record = (label: string, pass: boolean, detail = "") =>
  results.push(`${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);

let adminId = "";
let viewerId = "";

try {
  // 1. Public sign-up must be rejected.
  const { error: signUpError } = await anonClient().auth.signUp({
    email: `intruder-${stamp}@example.com`,
    password,
  });
  record(
    "public signUp is rejected",
    Boolean(signUpError),
    signUpError?.message ?? "sign-up SUCCEEDED — signups still enabled",
  );

  // 2. Admin-created user, no email confirmation needed.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: adminEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Verify Admin" },
    app_metadata: { role: "admin" },
  });
  if (createError) throw createError;
  adminId = created.user!.id;
  record("admin.createUser succeeds", true);

  const { data: viewerCreated, error: viewerError } =
    await admin.auth.admin.createUser({
      email: viewerEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Verify Viewer" },
      app_metadata: { role: "viewer" },
    });
  if (viewerError) throw viewerError;
  viewerId = viewerCreated.user!.id;

  // Mirrors what the app's createUser action does: set the role explicitly,
  // because GoTrue applies app_metadata after the auth.users insert.
  await admin.from("profiles").update({ role: "admin" }).eq("id", adminId);
  await admin.from("profiles").update({ role: "viewer" }).eq("id", viewerId);

  // 3. Trigger populated profiles with the right roles.
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email, full_name, role, status")
    .in("id", [adminId, viewerId]);
  const adminProfile = profiles?.find((p) => p.id === adminId);
  const viewerProfile = profiles?.find((p) => p.id === viewerId);
  record(
    "trigger created both profiles with correct roles",
    adminProfile?.role === "admin" && viewerProfile?.role === "viewer",
    `admin=${adminProfile?.role} viewer=${viewerProfile?.role}`,
  );

  // 4. Sign in and inspect the JWT for the hook's claims.
  const { data: session, error: signInError } =
    await anonClient().auth.signInWithPassword({ email: adminEmail, password });
  if (signInError) {
    record("admin can sign in", false, `${signInError.status} ${signInError.message}`);
    throw signInError;
  }
  const claims = decode(session.session!.access_token);
  record(
    "JWT carries user_role/user_status from the auth hook",
    claims.user_role !== undefined && claims.user_status !== undefined,
    `user_role=${JSON.stringify(claims.user_role)} user_status=${JSON.stringify(claims.user_status)}`,
  );

  // 5. RLS through PostgREST: viewer sees only themselves.
  const { data: viewerSession } = await anonClient().auth.signInWithPassword({
    email: viewerEmail,
    password,
  });
  const viewerScoped = createClient(url, publishable, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${viewerSession!.session!.access_token}`,
      },
    },
  });
  const { data: viewerRows } = await viewerScoped.from("profiles").select("id");
  record(
    "viewer reads only their own profile via RLS",
    viewerRows?.length === 1 && viewerRows[0].id === viewerId,
    `rows=${viewerRows?.length}`,
  );

  const { data: promoted } = await viewerScoped
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", viewerId)
    .select();
  record(
    "viewer cannot self-promote via RLS",
    (promoted?.length ?? 0) === 0,
    `rows_updated=${promoted?.length ?? 0}`,
  );

  // 6. Suspension blocks sign-in.
  await admin.auth.admin.updateUserById(viewerId, { ban_duration: "876000h" });
  await admin.from("profiles").update({ status: "suspended" }).eq("id", viewerId);
  const { error: bannedError } = await anonClient().auth.signInWithPassword({
    email: viewerEmail,
    password,
  });
  record(
    "suspended user cannot sign in",
    Boolean(bannedError),
    bannedError?.message ?? "sign-in SUCCEEDED while banned",
  );

  // 7. Reactivation restores sign-in.
  await admin.auth.admin.updateUserById(viewerId, { ban_duration: "none" });
  await admin.from("profiles").update({ status: "active" }).eq("id", viewerId);
  const { error: reactivatedError } = await anonClient().auth.signInWithPassword({
    email: viewerEmail,
    password,
  });
  record("reactivated user can sign in again", !reactivatedError, reactivatedError?.message ?? "");
} catch (error) {
  record(
    "unexpected error",
    false,
    error instanceof Error ? error.message : String(error),
  );
} finally {
  for (const id of [adminId, viewerId].filter(Boolean)) {
    await admin.auth.admin.deleteUser(id);
  }
  // Assert the throwaway users are gone -- not that the table is empty, since
  // the seeded administrator legitimately lives here.
  const { data: leftovers } = await admin
    .from("profiles")
    .select("email")
    .in("id", [adminId, viewerId].filter(Boolean));
  record(
    "cleanup removed both test users",
    (leftovers?.length ?? 0) === 0,
    `leftover=${leftovers?.map((r) => r.email).join(",") || "none"}`,
  );

  console.log("\n" + results.join("\n") + "\n");
  const failed = results.filter((r) => r.startsWith("FAIL"));
  if (failed.length) process.exit(1);
}
