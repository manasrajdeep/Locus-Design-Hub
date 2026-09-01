/**
 * Creates a client account with a password the admin sets by hand.
 *
 * The portal's normal route in is a magic link, which needs a working mail
 * sender. On the shared Supabase sender that is capped at two emails an hour,
 * so the third client trying to sign in within an hour simply cannot — and this
 * firm onboards its clients in person or over the phone anyway. This lets staff
 * create the account and hand over the password directly, with no mail involved.
 *
 * Runs server-side only: it needs the service-role key, which bypasses row-level
 * security entirely and must never reach a browser. The caller's staff role is
 * checked in provision-client.functions.ts through their *own* session before
 * this is ever reached.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface ProvisionInput {
  email: string;
  password: string;
  fullName?: string;
  projectName?: string;
}

export interface ProvisionResult {
  userId: string;
  email: string;
  projectId?: string;
}

/** Supabase's own floor is 6; 10 is a more defensible minimum for a shared secret. */
const MIN_PASSWORD = 10;

export async function provisionClient(input: ProvisionInput): Promise<ProvisionResult> {
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("That email address does not look valid.");
  }
  if (password.length < MIN_PASSWORD) {
    throw new Error(`Password must be at least ${MIN_PASSWORD} characters.`);
  }

  // `email_confirm` is the point of the whole flow: without it Supabase holds the
  // account unconfirmed until the user clicks a link in an email we are not
  // sending, and they could never sign in.
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: input.fullName ? { full_name: input.fullName } : undefined,
  });

  if (error) {
    // Surfaced verbatim would leak Supabase's phrasing; this is the case staff hit.
    if (/already|exists|registered/i.test(error.message)) {
      throw new Error("An account with that email already exists.");
    }
    throw new Error(error.message);
  }
  const userId = data.user?.id;
  if (!userId) throw new Error("Account was not created.");

  // The handle_new_user trigger has already written the profile and the
  // 'customer' role by this point — this only attaches the project.
  let projectId: string | undefined;
  const name = input.projectName?.trim();
  if (name) {
    const { data: project, error: pErr } = await supabaseAdmin
      .from("projects")
      .insert({ name, customer_id: userId })
      .select("id")
      .single();
    if (pErr) {
      // Leaving an account with no project would strand the client on /pending
      // with no way for staff to tell it apart from a self-signup.
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(`Account rolled back — could not create the project: ${pErr.message}`);
    }
    projectId = project?.id;
  }

  return { userId, email, projectId };
}

/**
 * Resets a client's password to one the admin chooses.
 *
 * Clients cannot reset their own: self-service needs a working mail sender, and
 * on the shared Supabase sender that is capped at two emails an hour. Without
 * this, a client who forgets their password can only be helped through the
 * Supabase dashboard, which is not something to hand to a site owner.
 *
 * Staff accounts are deliberately excluded. An admin resetting another admin's
 * — or a superadmin's — password would be a straightforward takeover of the
 * account that controls the public site, and no support case needs it: those
 * passwords are changed in the Supabase dashboard by whoever owns the project.
 */
export async function resetClientPassword(
  userId: string,
  password: string,
): Promise<{ email: string }> {
  if (password.length < MIN_PASSWORD) {
    throw new Error(`Password must be at least ${MIN_PASSWORD} characters.`);
  }

  const { data: roles, error: rErr } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (rErr) throw new Error(`Could not check the account: ${rErr.message}`);
  if (roles?.some((r) => r.role === "admin" || r.role === "superadmin")) {
    throw new Error("Staff passwords are changed in Supabase, not here.");
  }

  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
  if (error) throw new Error(error.message);
  return { email: data.user?.email ?? "" };
}
