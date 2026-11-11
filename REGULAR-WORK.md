# Regular work update

1. In Supabase SQL Editor, run the full `supabase/migrations/20261111_regular_work.sql`. Keep previously installed IT Desk migrations in place.
2. Upload the complete `src` folder and `index.html` to GitHub and commit. No Edge Function changes are needed.
3. Open **Regular work** next to the status cards in My portal or Overview. The card counts your own tasks for today. Managers can add tasks for themselves, one officer, or all active members.

Tasks recur at midnight Bangladesh time, including weekends. Checking a task records completion for that date. Past missed tasks appear in the dated history (past seven days by default); choose an older date range of up to 31 days to see earlier work. The member can submit a reason for a past missed task. The Manager sees it in Notifications and Approval requests. Approval marks that dated item Completed; rejection lets the member submit a new reason.

Members request edits and removal. Managers can approve or reject, or manage and permanently transfer tasks directly. Changes take effect the following day in Bangladesh time, preserving today's checklist and earlier records. A transfer changes ownership of future occurrences only.

Manager Reports links to the dated Regular work report for all members. This report is separate from the ticket Excel export. Daily history is calculated from task schedules and completion records, so no scheduled job is needed.

Validated with TypeScript, a production build, and isolated SQL tests on the full migration chain for checklist completion, dated missed work, permissions, requests, approval, permanent transfer, and migration rerun. Deployment remains to be done.
