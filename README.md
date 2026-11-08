# IT Desk — GitHub Pages + Supabase

A standalone version of IT Desk. GitHub Pages serves the dashboard and tracking UI. Supabase Auth handles email/password sign-in and PostgreSQL stores tickets and team membership. This version starts with an empty database; it does not import data from the existing hosted IT Desk.

## 1. Configure Supabase

1. Create a Supabase project. In **SQL Editor**, run `supabase/schema.sql`.
2. In **Authentication**, enable the Email provider and keep **Confirm email** enabled. Set the minimum password length to at least 8.
3. Under **Authentication → URL Configuration**, set **Site URL** to the exact GitHub Pages URL, including the repository path and trailing slash (for example `https://OWNER.github.io/it-desk/`). Add that URL and the same URL with `?reset=1` to **Redirect URLs**. For local use, also add `http://localhost:5173/` and `http://localhost:5173/?reset=1`. Use the same browser profile that requested an email link to open it.
4. Set up **custom SMTP** for confirmation and reset emails to staff outside the Supabase project team. Keep SMTP credentials in Supabase settings.
5. Copy the **Project URL** and **Publishable key**. Never use a secret or service-role key in the app, GitHub variables, or repository.

## 2. Publish on GitHub Pages

1. Put the contents of this folder, including the hidden `.github` directory, in the root of your GitHub repository on the `main` branch.
2. In **Settings → Secrets and variables → Actions → Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. In **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**. Run **Deploy IT Desk to GitHub Pages** under **Actions** if it did not deploy automatically. Use the URL reported by Pages.

## 3. Set up the team

1. Open the site, select **Create account**, and confirm your email.
2. In the Supabase SQL Editor, open `supabase/first-manager.sql`, replace the email and name placeholders, and run it. Sign in to IT Desk.
3. In **IT team → Add IT officer**, add each officer using the email they will verify. They can create their own password. Signing up alone does not grant access to tickets.
4. Create a ticket, then open its tracking link in a private browser window. Confirm that the employee can see public updates but not internal notes.

## Local development

Use Node.js 24. Copy `.env.example` to `.env.local` and fill in the project URL and publishable key, then run:

```sh
npm ci
npm run dev
```

Run `npm run check` and `npm run build` to validate and build. Browser routes use hashes so section, officer, and tracking links work on GitHub Pages project URLs.

## Data access

Only approved IT team members can call the ticket API. Manager accounts can add officers. The public tracking endpoint requires an unguessable ticket token and returns only the ticket title, status, officer name, and public updates. Keep personal information out of ticket titles and public updates. A replaced tracking token stops working.
