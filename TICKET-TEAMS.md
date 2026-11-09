# Ticket team update

1. Supabase SQL Editor: run `supabase/migrations/20261109_ticket_teams.sql` in full. The previous Reports and Ticket Operations migrations must already be installed.
2. Upload the complete `src` folder and `index.html` from this package to the GitHub repository root, replacing matching files. Commit and wait for deployment.

Category is replaced by Team in ticket creation and editing: Infrastructure, System/Software, SAP. The assignee dropdown contains only active officers in the chosen team. Changing team clears the old assignee and requires selecting a matching officer. A team with no officers cannot receive a ticket until a member is added. The same Team/Assigned to control is available in Manage ticket for reassignment.

Database validation rejects team/assignee mismatches. Editing team and assignee is atomic; status and response metrics are preserved for assignment-only changes. Existing records remain available. The current assignee's team is the source for ticket sections and Team details. Historical internal category values and the Software/System section identifier remain compatible with the existing database.

TypeScript and production build passed. Isolated SQL tests passed team matching, invalid assignment rejection, edit/reassign, preservation of response history and repeat migration. Upload and live checks are still required.
