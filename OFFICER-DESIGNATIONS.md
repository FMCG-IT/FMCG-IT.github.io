# Officer designations

1. In Supabase SQL Editor run supabase/migrations/20261108_officer_designations.sql.
2. In Edge Functions → manage-officers → Code, replace index.ts with the supplied supabase/functions/manage-officers/index.ts and deploy. Keep the current authorization settings.
3. Upload the supplied src folder into the root of the GitHub repository. Commit, wait for Actions and reload.
4. Open IT team → select a section → Edit on a member. Select Designation and save. The sidebar profile and member card show that designation. The Add IT officer form also includes the dropdown.

Choices: Officer, Sr. Officer, Executive, Sr. Executive, Asst Manager, Deputy Manager, Manager, AGM, GM, Others.

An officer's job designation is independent of application permissions. Choosing Manager, AGM or GM does not grant admin access. Existing managers receive Manager as their initial title; other existing members receive Officer. Rerunning the migration preserves chosen titles. The manager can edit their own designation using their member card.

This update assumes previous team-management, manager-account and archived-account restoration migrations are installed. It preserves existing tickets, identities and permissions.
