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
const userEmail = `verify-user-${stamp}@example.com`;
const password = "Sup3rSecret!verify";

function decode(jwt: string) {
  const [, payload] = jwt.split(".");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

const results: string[] = [];
const record = (label: string, pass: boolean, detail = "") =>
  results.push(`${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);

function errorDetail(error: unknown) {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

let adminId = "";
let viewerId = "";
let userId = "";
let projectId = "";
let unassignedProjectId = "";
const avatarPaths: string[] = [];

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

  const { data: userCreated, error: userError } =
    await admin.auth.admin.createUser({
      email: userEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Verify User" },
      app_metadata: { role: "user" },
    });
  if (userError) throw userError;
  userId = userCreated.user!.id;

  // Mirrors what the app's createUser action does: set the role explicitly,
  // because GoTrue applies app_metadata after the auth.users insert.
  await admin.from("profiles").update({ role: "admin" }).eq("id", adminId);
  await admin.from("profiles").update({ role: "viewer" }).eq("id", viewerId);
  await admin.from("profiles").update({ role: "user" }).eq("id", userId);

  // 3. Trigger populated profiles with the right roles.
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email, full_name, role, status")
    .in("id", [adminId, viewerId, userId]);
  const adminProfile = profiles?.find((p) => p.id === adminId);
  const viewerProfile = profiles?.find((p) => p.id === viewerId);
  const userProfile = profiles?.find((p) => p.id === userId);
  record(
    "trigger created all profiles with correct roles",
    adminProfile?.role === "admin" &&
      viewerProfile?.role === "viewer" &&
      userProfile?.role === "user",
    `admin=${adminProfile?.role} viewer=${viewerProfile?.role} user=${userProfile?.role}`,
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
  const adminScoped = createClient(url, publishable, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${session.session!.access_token}` } },
  });

  // 5. A User can replace their own plan for an active sprint, but cannot
  // touch another user’s rows or a draft sprint.
  const { data: userSession, error: userSignInError } =
    await anonClient().auth.signInWithPassword({ email: userEmail, password });
  if (userSignInError || !userSession.session) throw userSignInError;
  const userScoped = createClient(url, publishable, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${userSession.session.access_token}` } },
  });
  const { data: project, error: projectError } = await admin
    .from("projects")
    .insert({ name: `Verify User Project ${stamp}` })
    .select("id")
    .single();
  if (projectError || !project) throw projectError;
  projectId = project.id;
  const { error: memberError } = await admin
    .from("project_members")
    .insert({ project_id: projectId, user_id: userId });
  if (memberError) throw memberError;
  const { data: activeSprint, error: activeSprintError } = await admin
    .from("sprints")
    .insert({
      project_id: projectId,
      sprint_number: 1,
      version: "verify",
      name: "Verify active sprint",
      start_date: "2026-08-10",
      end_date: "2026-08-21",
      working_days: [1, 2, 3, 4, 5],
      daily_work_hours: 8,
      status: "active",
    })
    .select("id")
    .single();
  if (activeSprintError || !activeSprint) throw activeSprintError;
  const { data: activity, error: activityError } = await admin
    .from("activity_types")
    .select("id")
    .eq("is_active", true)
    .limit(1)
    .single();
  if (activityError || !activity) throw activityError;
  const { error: savePlanError } = await userScoped.rpc(
    "replace_my_active_sprint_plan",
    {
      p_sprint_id: activeSprint.id,
      p_allocations: [{ activity_id: activity.id, hours: 72 }],
      p_time_off: [{ start_date: "2026-08-12", end_date: "2026-08-12" }],
      p_activity_notes: [{ activity: "Verification", note: "Own active plan" }],
    },
  );
  record("user saves their own active sprint plan", !savePlanError, savePlanError?.message ?? "");
  const { data: ownPlan } = await userScoped
    .from("sprint_member_allocations")
    .select("user_id, activity_id")
    .eq("sprint_id", activeSprint.id);
  record(
    "user reads only their own saved allocation",
    ownPlan?.length === 1 && ownPlan[0].user_id === userId,
    `rows=${ownPlan?.length}`,
  );
  const { error: crossUserWriteError } = await userScoped
    .from("sprint_member_allocations")
    .insert({
      sprint_id: activeSprint.id,
      user_id: viewerId,
      activity_id: activity.id,
      hours: 1,
    });
  record(
    "user cannot write another member’s sprint activity",
    Boolean(crossUserWriteError),
    crossUserWriteError?.message ?? "write SUCCEEDED",
  );
  const { data: draftSprint, error: draftSprintError } = await admin
    .from("sprints")
    .insert({
      project_id: projectId,
      sprint_number: 2,
      version: "verify",
      name: "Verify draft sprint",
      start_date: "2026-08-24",
      end_date: "2026-09-04",
      working_days: [1, 2, 3, 4, 5],
      daily_work_hours: 8,
      status: "draft",
    })
    .select("id")
    .single();
  if (draftSprintError || !draftSprint) throw draftSprintError;
  const { error: draftPlanError } = await userScoped.rpc(
    "replace_my_active_sprint_plan",
    {
      p_sprint_id: draftSprint.id,
      p_allocations: [],
      p_time_off: [],
      p_activity_notes: [],
    },
  );
  record(
    "user cannot manage a draft sprint",
    Boolean(draftPlanError),
    draftPlanError?.message ?? "write SUCCEEDED",
  );
  const { error: incompletePlanError } = await userScoped.rpc(
    "replace_my_active_sprint_plan",
    {
      p_sprint_id: activeSprint.id,
      p_allocations: [{ activity_id: activity.id, hours: 1 }],
      p_time_off: [],
      p_activity_notes: [],
    },
  );
  const { data: preservedPlan } = await userScoped
    .from("sprint_member_allocations")
    .select("hours")
    .eq("sprint_id", activeSprint.id);
  record(
    "user cannot save an allocation below available hours",
    Boolean(incompletePlanError) && preservedPlan?.[0]?.hours === 72,
    incompletePlanError?.message ?? `hours=${preservedPlan?.[0]?.hours}`,
  );

  // 6. RLS through PostgREST: viewer sees only themselves.
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
  const { error: viewerMemberError } = await admin
    .from("project_members")
    .insert({ project_id: projectId, user_id: viewerId });
  if (viewerMemberError) throw viewerMemberError;
  const { data: viewerProgress, error: viewerProgressError } =
    await viewerScoped.rpc("get_client_project_sprint_progress", {
      p_project_id: projectId,
    });
  const clientProgressRows = (viewerProgress ?? []) as Array<
    Record<string, unknown>
  >;
  const clientProgress = clientProgressRows[0];
  record(
    "assigned viewer reads the client sprint overview",
    !viewerProgressError &&
      clientProgressRows.some((row) => row.sprint_id === activeSprint.id) &&
      clientProgress !== undefined,
    viewerProgressError?.message ?? `rows=${clientProgressRows.length}`,
  );
  const excludesPrivateFields = clientProgress
    ? !["email", "role", "status", "user_id", "time_off"].some((field) =>
        Object.hasOwn(clientProgress, field),
      )
    : false;
  record(
    "client overview excludes private member fields",
    excludesPrivateFields,
    clientProgress ? Object.keys(clientProgress).join(",") : "no progress row",
  );
  const { data: unassignedProject, error: unassignedProjectError } = await admin
    .from("projects")
    .insert({ name: `Verify Unassigned Project ${stamp}` })
    .select("id")
    .single();
  if (unassignedProjectError || !unassignedProject) throw unassignedProjectError;
  unassignedProjectId = unassignedProject.id;
  const { error: unassignedProgressError } = await viewerScoped.rpc(
    "get_client_project_sprint_progress",
    { p_project_id: unassignedProjectId },
  );
  record(
    "viewer cannot read an unassigned client project",
    Boolean(unassignedProgressError),
    unassignedProgressError?.message ?? "RPC SUCCEEDED",
  );
  const { data: viewerRows } = await viewerScoped.from("profiles").select("id");
  record(
    "viewer reads only their own profile via RLS",
    viewerRows?.length === 1 && viewerRows[0].id === viewerId,
    `rows=${viewerRows?.length}`,
  );

  // 7. Self-service profile fields and private avatar storage stay scoped to
  // the signed-in user. Use real authenticated requests, not the secret key.
  const ownAvatarPath = `${userId}/11111111-1111-4111-8111-111111111111.png`;
  const adminAvatarPath = `${viewerId}/22222222-2222-4222-8222-222222222222.png`;
  const avatarBody = new Blob(["profile-avatar"], { type: "image/png" });
  const { error: ownProfileUpdateError } = await userScoped
    .from("profiles")
    .update({ full_name: "Updated Verify User", avatar_path: ownAvatarPath })
    .eq("id", userId)
    .select();
  record(
    "user updates only their own profile fields",
    !ownProfileUpdateError,
    ownProfileUpdateError?.message ?? "",
  );
  const { data: crossProfileUpdate } = await userScoped
    .from("profiles")
    .update({ full_name: "Cross-user write" })
    .eq("id", viewerId)
    .select();
  record(
    "user cannot update another profile",
    (crossProfileUpdate?.length ?? 0) === 0,
    `rows_updated=${crossProfileUpdate?.length ?? 0}`,
  );
  const { data: privilegeUpdate } = await userScoped
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", userId)
    .select();
  record(
    "user cannot change protected profile fields",
    (privilegeUpdate?.length ?? 0) === 0,
    `rows_updated=${privilegeUpdate?.length ?? 0}`,
  );
  const { error: ownAvatarUploadError } = await userScoped.storage
    .from("avatars")
    .upload(ownAvatarPath, avatarBody, { contentType: "image/png", upsert: false });
  if (!ownAvatarUploadError) avatarPaths.push(ownAvatarPath);
  record(
    "user uploads an avatar only in their own folder",
    !ownAvatarUploadError,
    ownAvatarUploadError?.message ?? "",
  );
  const { data: ownAvatarUrl, error: ownAvatarReadError } = await userScoped.storage
    .from("avatars")
    .createSignedUrl(ownAvatarPath, 60);
  record(
    "user reads their own private avatar",
    !ownAvatarReadError && Boolean(ownAvatarUrl?.signedUrl),
    ownAvatarReadError?.message ?? "",
  );
  const { error: crossAvatarUploadError } = await userScoped.storage
    .from("avatars")
    .upload(`${viewerId}/33333333-3333-4333-8333-333333333333.png`, avatarBody, {
      contentType: "image/png",
      upsert: false,
    });
  record(
    "user cannot upload into another avatar folder",
    Boolean(crossAvatarUploadError),
    crossAvatarUploadError?.message ?? "upload SUCCEEDED",
  );
  const { error: crossAvatarDeleteError } = await viewerScoped.storage
    .from("avatars")
    .remove([ownAvatarPath]);
  record(
    "user cannot delete another user's avatar",
    Boolean(crossAvatarDeleteError),
    crossAvatarDeleteError?.message ?? "delete SUCCEEDED",
  );
  const { error: adminAvatarUploadError } = await adminScoped.storage
    .from("avatars")
    .upload(adminAvatarPath, avatarBody, { contentType: "image/png", upsert: false });
  if (!adminAvatarUploadError) avatarPaths.push(adminAvatarPath);
  record(
    "admin manages any user's avatar folder",
    !adminAvatarUploadError,
    adminAvatarUploadError?.message ?? "",
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

  // 8. Suspension blocks sign-in.
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

  // 9. Reactivation restores sign-in.
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
    errorDetail(error),
  );
} finally {
  if (avatarPaths.length) {
    await admin.storage.from("avatars").remove(avatarPaths);
  }
  if (projectId) {
    await admin.from("sprints").delete().eq("project_id", projectId);
    await admin.from("projects").delete().eq("id", projectId);
  }
  if (unassignedProjectId) {
    await admin.from("projects").delete().eq("id", unassignedProjectId);
  }
  for (const id of [adminId, viewerId, userId].filter(Boolean)) {
    await admin.auth.admin.deleteUser(id);
  }
  // Assert the throwaway users are gone -- not that the table is empty, since
  // the seeded administrator legitimately lives here.
  const { data: leftovers } = await admin
    .from("profiles")
    .select("email")
    .in("id", [adminId, viewerId, userId].filter(Boolean));
  record(
    "cleanup removed all test users",
    (leftovers?.length ?? 0) === 0,
    `leftover=${leftovers?.map((r) => r.email).join(",") || "none"}`,
  );

  console.log("\n" + results.join("\n") + "\n");
  const failed = results.filter((r) => r.startsWith("FAIL"));
  if (failed.length) process.exit(1);
}
