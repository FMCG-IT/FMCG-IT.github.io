# IT Desk support portal

1. If missing from Supabase, run the included migrations in this order: `20261115_department_roles.sql`, `20261115_employee_portal.sql`, `20261115_manual_employee_tickets.sql`.
2. Run `20261115_password_routing.sql`.
3. Redeploy `manage-officers` using the included `supabase/functions/manage-officers/index.ts`.
4. Upload `src` and `index.html` to GitHub. Verify that each department has an active Department Manager.
5. From a signed-out browser, submit two tickets. Both should appear in My tickets on the same browser. From a Department Manager account, click a new-ticket notification and assign the ticket. Open the guest tracking link to verify the resulting status.
6. From IT staff login, submit a password reset request for a Department member. Verify it goes to their Department Manager. A Department Manager's request goes to the Overall IT Manager. Staff who know their password can still change it while signed in.

The public form uses self-reported contact details. Tickets are saved in My tickets on the submitting browser using private tracking links. The list is shared with anyone using that same browser profile. Save private links if you need to track tickets on a different device. Microsoft sign-in configuration is not required.
