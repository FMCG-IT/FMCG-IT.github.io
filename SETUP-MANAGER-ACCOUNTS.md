# Manager-created email/password accounts

This update removes public Create account from the site. Only an active IT Manager can create new officer accounts. Existing accounts and passwords are unchanged.

## Apply in this order

1. In Supabase Authentication settings, turn OFF **Allow new users to sign up** and Save. Do not disable email/password sign-in. Existing users can still sign in. This server setting is required; hiding the signup button alone does not stop public signup.
2. In SQL Editor, run **supabase/migrations/20261108_manager_accounts.sql**. This assumes the previous team-management migration has already been applied. Do not rerun first-manager.sql.
3. In Supabase **Edge Functions**, create a function named **manage-officers**, using the dashboard editor. Replace its index.ts with **supabase/functions/manage-officers/index.ts** and deploy.
4. For this function, set the gateway **Verify JWT** option to OFF. The function independently calls Supabase Auth getUser() to verify every bearer token, then checks current manager membership before any admin action. No anonymous account creation is allowed. CLI deployments use the included config.toml.
5. Supabase supplies the server keys to Edge Functions. Confirm that SUPABASE_URL and either SUPABASE_PUBLISHABLE_KEYS/SUPABASE_SECRET_KEYS or the legacy SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY are present in Edge Functions secrets. Never copy a secret key into the website, GitHub variables, or chat.
6. This function accepts browser requests from https://fmcg-it.github.io by default. If you use a different site, set the Edge Function secret ALLOWED_ORIGIN to its origin, with no path or trailing slash.
7. Upload the **src** folder to the root of your GitHub repository, commit, wait for Actions to succeed, and reload the site.

## Use

Manager: IT team → Add IT officer → name, email, password, IT section → Add officer.

The officer signs in with that email and password. No signup or email confirmation is required for an account created by this manager function. Passwords are handled by Supabase Auth and are not stored in the ticket/member tables or returned in the response.

Use a unique initial password for each officer. Do not send passwords into this chat. Forgot password still needs working SMTP configuration. Creating an account with an email that already belongs to an Auth account returns an error; it never resets that user's password.

## Validation

Tested locally: frontend TypeScript/build, Edge handler rejects anonymous/non-manager callers, password validation, account rollback after failed member registration, SQL execution grants, active manager validation, and confirmed account membership.
Real account creation requires deployment of the Edge Function and the Supabase Auth signup setting above.
