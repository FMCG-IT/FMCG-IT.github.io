# Manager Reports update

1. Supabase SQL Editor: paste and Run `supabase/migrations/20261108_ticket_reports.sql` in full. It preserves existing tickets and starts identity/time tracking. Prerequisites are the previously installed designations, storage, ticket-number and filter updates.
2. GitHub repository: upload this package's complete `src` folder to the repository root, replacing matching files. Include `src/assets/report-template.xlsx`. Commit once and wait for the Pages deployment.
3. Sign in as Manager, open Reports, choose created-date range and Generate report. Export Excel downloads a real `.xlsx` workbook with Summary, Officers, Tickets and Definitions.

No Edge Function or package.json update is required. Do not upload the SQL or this guide into src.

## Meaning of the report

- The range selects tickets CREATED on those Bangladesh dates. Counts describe their current state at report generation; they are not a count of actions performed during the date range.
- Response = creation to first recorded status change or written update. Assignment alone does not count. Hours include nights/weekends.
- Closing = creation to latest closure for tickets currently Closed. Reopening clears closing time until closed again.
- Worked = distinct tickets where an officer changed status or wrote an update. Multiple officers may work on a ticket, so work shares can total over 100%.
- Created and Closed are attributed by recorded officer ID, not name. Archived officers remain in relevant reports.
- Old creators and response times are Unknown. Unknown durations are excluded from averages; measured sample counts are shown. A future closure on a legacy ticket can supply a measured closing duration.
- Export refreshes the snapshot and includes all matching tickets, up to 50,000. Choose a shorter range for larger exports. It excludes tracking tokens, descriptions and update bodies.
- Excel values are a fixed report snapshot. Generate again to refresh; editing the workbook does not update the database.
- Tracking stores compact actor/time events without duplicating comment text. Storage usage includes the new reporting tables.

Validation: PostgreSQL-compatible migration tests cover legacy data, creator attribution, no-op writes, close/reopen, measured averages, export, rerun and Manager-only permissions. TypeScript and production build pass. XLSX checks cover archive/XML validity, actual row counts, numeric dates and literal handling of formula-like titles. Live installation still requires the two steps above.
