/**
 * Seeds the default administrator.
 *
 * Run with: bun run seed:admin
 *
 * A SQL seed file cannot do this -- password hashing for `auth.users` belongs
 * to the Auth API -- so the account is created through the admin API instead.
 * The script is idempotent: re-running it repairs an existing account's role
 * and status rather than failing.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/database.types";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Set it in .env.local before seeding.`);
    process.exit(1);
  }
  return value;
}

const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const secretKey = requireEnv("SUPABASE_SECRET_KEY");
const email = requireEnv("SEED_ADMIN_EMAIL").trim().toLowerCase();
const password = requireEnv("SEED_ADMIN_PASSWORD");

if (password.length < 8) {
  console.error("SEED_ADMIN_PASSWORD must be at least 8 characters.");
  process.exit(1);
}

const admin = createClient<Database>(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(target: string) {
  // listUsers is paginated; walk until the address is found or pages run out.
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;

    const match = data.users.find(
      (user) => user.email?.toLowerCase() === target,
    );
    if (match) return match;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  const existing = await findUserByEmail(email);

  if (!existing) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      // No verification email: the account is usable straight away.
      email_confirm: true,
      user_metadata: { full_name: "Administrator" },
      app_metadata: { role: "admin" },
    });
    if (error) throw error;

    // GoTrue applies custom app_metadata after the auth.users insert, so the
    // on_auth_user_created trigger defaulted the profile to 'viewer'. Promote.
    // Upsert, not update: if the profile row is missing entirely (e.g. the
    // public schema was rebuilt while auth.users survived), an update matches
    // zero rows and PostgREST still reports success -- the login then
    // redirect-loops because requireProfile() finds no profile for a valid
    // session.
    const { error: promoteError } = await admin.from("profiles").upsert(
      {
        id: data.user!.id,
        email,
        full_name: "Administrator",
        role: "admin",
        status: "active",
      },
      { onConflict: "id" },
    );
    if (promoteError) throw promoteError;

    console.log(`Created admin ${email} (${data.user?.id}).`);
    return;
  }

  // Already present -- make sure it is still a usable admin.
  const { error: authError } = await admin.auth.admin.updateUserById(
    existing.id,
    { app_metadata: { role: "admin" }, ban_duration: "none" },
  );
  if (authError) throw authError;

  // Same upsert reasoning as the create path above.
  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: existing.id,
      email,
      full_name:
        (existing.user_metadata?.full_name as string | undefined) ??
        "Administrator",
      role: "admin",
      status: "active",
    },
    { onConflict: "id" },
  );
  if (profileError) throw profileError;

  console.log(`Admin ${email} already exists (${existing.id}); role reset to admin.`);
}

main().catch((error: unknown) => {
  console.error("Seeding failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
