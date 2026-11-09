# Office responsibility update

## Install in order

1. Supabase SQL Editor: run the complete `supabase/migrations/20261109_office_assignments.sql`. The previous Ticket Teams, Ticket Operations and Reports SQL updates must already be installed.
2. Supabase -> Edge Functions -> manage-officers -> Code: replace index.ts with `supabase/functions/manage-officers/index.ts` from this ZIP and deploy the function. Preserve the existing configuration and internal JWT validation setup. No new keys are needed.
3. GitHub: upload the complete src folder and index.html from this ZIP to the repository root, replacing matching files. Commit and wait for deployment.
4. IT team -> section -> Edit each existing member, choose one or more responsible offices and save. Existing offices are initially blank; no responsibilities were guessed. Assign your own Manager account's offices too if you receive tickets.

## Workflow

Member creation and editing support multiple offices: FMCG, Rangpur Area Office, Khulna Area Office, Kushtia Area Office, Mymensingh Area Office, Mymensing Pharma, 32 Bigha Project.

Ticket create/edit/manage forms select Office / area and Team. Assigned to lists only active members covering BOTH the office and team. Changing Office or Team clears the prior assignee. If nobody is dedicated to that combination, assign the office to a member through IT team first. Member cards and the signed-in profile show responsible offices. Ticket details show the selected office. Excel ticket export includes Office / area.

Existing tickets keep their history and have Office = Not set until edited. Member creation requires at least one office; Manager-only edits maintain office assignments. Removing an office from a member does not silently reassign old tickets: assign any affected tickets to an eligible officer when next updating them. Deleting a member requires a replacement covering the offices of their tickets.

No ticket or member was deleted. Designation and Manager privileges are unchanged. Account creation stores the profile's office list atomically with member registration; its existing Auth rollback behavior is retained.

Validation: TypeScript and production build passed; isolated SQL tests passed office creation/mismatch rejection, atomic office+team reassignment, response history preservation, Manager-only multi-office editing, empty office rejection and rerun. Edge Function tests passed multi-office registration and rejection before account creation. UI tests passed Office+Team intersection and stale-assignee clearing. Excel checks passed the new Office column and filter range. Live deployment requires the steps above.
