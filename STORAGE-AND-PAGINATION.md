# Storage usage and efficient ticket loading

## Apply this update

1. Run supabase/migrations/20261108_storage_pagination.sql in the Supabase SQL Editor.
2. Upload the supplied src folder into the root of the GitHub repository. Commit, wait for the GitHub Pages workflow, and refresh.
3. Log in as Manager. Open Storage in the sidebar. Ordinary officers cannot use the database metrics API.
4. No Edge Function changes are needed.

## What changes

- Startup loads team membership and aggregate counts, not every ticket and comment.
- Each ticket list loads at most 25 summaries. Search, status, officer and section filters run in PostgreSQL over the entire matching set, not just the current page.
- Descriptions, tracking tokens and full private history are fetched only when a ticket is opened.
- Ticket details load 50 updates initially; Load older updates fetches the next batch.
- Public tracking loads 25 public updates initially and offers Load older updates.
- Saving a ticket with no status, assignment or comment changes skips the redundant database write.
- Manager Storage shows measured PostgreSQL database usage, an estimated remaining allowance, IT Desk table/index usage, record counts and a manual Refresh usage button.

## Meaning of the storage figures

The default reference allowance is 500,000,000 bytes (500 MB). Measured size is pg_database_size(current_database()). IT Desk table size includes its data and indexes. Estimated remaining is max(reference allowance minus measured database size, 0).

These are project-level database measurements, not Supabase's official billing usage, organization-wide quota, file storage, monthly transfer quota or physical disk/WAL free space. Plan restrictions and billing averages can differ. Supabase Usage is authoritative.

If the project changes plans, its owner can set a new reference in SQL Editor:
  update desk_private.storage_settings set reference_limit_bytes = YOUR_LIMIT_IN_BYTES where singleton;

## Storage savings and data retention

Pagination primarily reduces transferred data and browser memory; it does not reduce existing database size. Skipping unchanged saves avoids unnecessary row rewrites and activity growth. Existing tickets, comments and audit history are preserved. The small assignee/status index adds some storage in return for efficient filtering. This update does not automatically delete old tickets, logs, user accounts or history.

Validation: frontend TypeScript/production build; isolated PostgreSQL checks of scopes, search, pagination, counts, lazy history, public data exclusion, no-op saves and manager-only metrics; interface checks of page navigation, row opening, history loading and used/remaining display.
