/**
 * Sign-in, kept behind a neutral name so the rest of the app never names a
 * provider.
 *
 * This used to delegate to a hosted OAuth client that began its flow at
 * `/~oauth/initiate` on the current origin. That path is served by the platform
 * the app was authored on and by nothing else — self-hosted it returns 404, so
 * the sign-in button was a dead end and everything behind the login wall was
 * unreachable. Sign-in now goes straight to Supabase Auth, which is where the
 * sessions and the `user_roles` rows already lived.
 *
 * Magic links rather than a social provider: there is no OAuth app to register
 * and no client secret to rotate, and a client can open the link on whichever
 * device their mail happens to be on.
 *
 * Signup is open — migration 20260727082540 deliberately dropped the
 * `customer_whitelist` check from `handle_new_user` in favour of the
 * `access_requests` queue. A new address therefore gets an account and the
 * `customer` role, lands on /pending, and sees nothing until staff assign it a
 * project. Possession of the mailbox is what proves identity here, so the link
 * is the whole of the check.
 */
import { supabase } from "../supabase/client";

export interface SignInResult {
  error?: Error;
}

export const authProvider = {
  auth: {
    /**
     * Emails a one-time sign-in link that returns the recipient to `redirectTo`.
     *
     * `redirectTo` must be listed in the project's allowed redirect URLs, or
     * Supabase silently sends the user to the configured Site URL instead.
     *
     * An unrecognised address is not an error: it gets an account with no
     * project attached and is parked on /pending for staff to approve.
     */
    signInWithMagicLink: async (
      email: string,
      opts: { redirectTo: string },
    ): Promise<SignInResult> => {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: opts.redirectTo },
      });
      return error ? { error: new Error(error.message) } : {};
    },

    signOut: async (): Promise<SignInResult> => {
      const { error } = await supabase.auth.signOut();
      return error ? { error: new Error(error.message) } : {};
    },
  },
};
