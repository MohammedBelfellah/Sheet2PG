# Desktop Data Importer — Development Handoff

Build a Windows-first Electron desktop application with React and TypeScript. Its single workspace imports local CSV, XLSX and XLS files into a local or remote PostgreSQL database. The user should not need SQL, manual CSV conversion, or copying filesystem paths.

This document is the implementation brief. Deliver the desktop application, not a website. The one-page requirement applies to the application interface, not the length of this brief. Use the decisions below without adding a setup wizard, cloud upload service, authentication system or separate backend server.

## 1. Confirmed scope and defaults

- Local file picker and drag-and-drop for CSV, XLSX and XLS. Excel sheet selection; one sheet per import.
- Connect directly to PostgreSQL on localhost or a remote host.
- Support importing into an existing table or creating a new table.
- Insert new rows and skip defined duplicates. Never update, replace, truncate or delete existing records; never automatically alter an existing table's structure.
- Automatically convert unambiguous values to destination types and display actionable errors when conversion is unsafe or impossible.
- Latitude, longitude and other coordinate values are ordinary columns. Preserve their values; no geometry generation, projection, CRS selection, coordinate swapping or spatial validation in this version. A PostgreSQL database with PostGIS installed works as a normal destination. An existing required geometry column without a default must produce a clear unsupported/required-field error if it cannot be omitted.
- Windows first. English interface by default, with labels centralized for later translation.
- No separate test database setup is required from the user during initial design or implementation. Developer checks can use fixtures and a disposable database later; never experiment on the user's real tables.
- Do not save passwords by default. Saving non-secret connection details is optional.

## 2. Visual layout: one desktop workspace

Use a light background, white panels, subtle borders, dark text and one blue accent. Use readable 14–16 px text, consistent 8 px spacing increments, 24 px outer padding and approximately 20 px between major panels. Target a 1280 × 800 window, with a usable minimum near 1000 × 700. Allow vertical scrolling at smaller sizes and horizontal scrolling inside wide data tables. No sidebar or multi-page navigation.

Reading order:

1. Compact top bar: application name at left; short subtitle “Excel & CSV to PostgreSQL”; connection status at right.
2. Two equal-width, top-aligned panels: Source on the left and Destination on the right. Keep these side by side at the minimum supported desktop width. Align input heights and primary controls.
3. A full-width “Columns & conversion” table beneath the panels.
4. A collapsible full-width preview showing source or prepared data.
5. A full-width validation/result area, collapsed when empty and expanded when issues occur.
6. A sticky bottom action bar with summary at left and Validate / Import at right. Reserve enough bottom padding so it never covers content.

The panels can be configured independently. Source sheet selection is a dropdown; Source and Destination are panels, not separate tabs.

## 3. Source panel

Empty state: a compact drop zone saying “Drop an Excel or CSV file here”, with a Browse files button. After selection show filename, extension, size, and Change file action. Put the full path in a tooltip or expandable details, not prominently across the layout.

For Excel, display a Sheet dropdown listing all sheets and select the first non-empty sheet initially. For CSV, hide sheet selection and expose detected delimiter and encoding under Format settings. Allow overrides for comma, semicolon, tab and encoding; preview refreshes immediately. Detect an actually supported file format and show an understandable error for malformed files, password-protected workbooks or unsupported content. Never execute workbook macros.

Header controls: Auto / Header row / No header. Suggest the likely header, show the selected row and make it editable. Auto-detection is a suggestion, not a guarantee. No header preserves the first data row and uses Column 1, Column 2, etc. Selecting a later header excludes preceding title rows, with the excluded count visible. Preserve original spreadsheet row numbers for errors. Show a small warning for duplicate/blank headers and assign stable internal column IDs independently of header text.

A scrollable column checklist supports Select all, Clear selection and individual selection. Preserve file column order. Zero selected columns disables validation. Provide a Preview button opening the inline preview below, never another application page. Skip completely empty records with a visible count; preserve partially empty records.

Changing the file, sheet, header, selected columns or format settings invalidates prior validation. Preserve mapping only when stable source column identity still matches; otherwise clear or mark affected mappings for review.

## 4. Destination panel

Local / Remote selector supplies useful defaults; both use the same connection mechanism. Local defaults: host localhost and port 5432. Remote leaves host for the user to enter.

Fields: Host; Port; Database; Username; Password with show/hide. Place Host and Port on one row. Include a collapsed Connection options section for SSL/TLS and connection timeout. Remote connections should offer certificate-verified TLS and custom CA configuration. Never silently bypass certificate verification or retry a failed secure connection without TLS. Show actionable certificate/network errors.

Connect button doubles as a connection check. States: Not connected, Connecting, Connected, Failed. On success load accessible schemas/tables and enable destination selection. Display the connected host/database so users know where data will go. Changing credentials or connection settings marks the connection stale and clears schema/table validation. Keep passwords out of logs, persisted settings and error reports.

Below the connection form use a segmented control: Existing table / Create table.

Existing table: schema dropdown (prefer public if available), searchable table dropdown, Refresh action, and a compact summary of columns. Inspect types, nullability, defaults, generated/identity columns and relevant constraints. No destination data preview is required for this version.

Create table: existing schema dropdown, new table name and editable proposed columns/types in the mapping area. Detect name collisions; never overwrite a table. Use available schema privileges and show a clear permission error if creation is not allowed. Do not create the table until Import runs successfully within the import transaction.

## 5. Columns & conversion table

One row per selected source column. Suggested columns: Include, Source field, Example value, Destination field/name, Target type, Conversion status. Show 2–3 representative examples in an expandable cell if useful.

Existing table mode: destination field is a dropdown. Suggest matches by normalized names, but do not accept uncertain positional matches automatically. One source field maps to at most one destination field, and a destination field cannot receive two sources. Target types are read-only. List required unmapped destination fields as blocking issues. Omit generated columns and unmapped fields with defaults from the insert so PostgreSQL can supply their values.

Create table mode: destination names and suggested types are editable. Suggest conservative types and flag sanitized/colliding names for review. Full-file validation may revise an inferred type; show the revision and invalidate previous approval. Do not silently widen an existing database column.

Keep common paths automatic. Expose per-column Date order, Decimal separator and blank handling only when needed, under conversion settings. The user selects a rule once for a column rather than manually editing individual cells.

Preview has Source / Prepared switches and shows up to 50 rows, with original row numbers. Prepared view displays the mapped, normalized values that would be sent to PostgreSQL. Mark converted cells with accessible status text/tooltips. Clearly state that preview is a sample while Validate checks all rows.

## 6. Automatic value handling

The database defines target types and constraints, not a visual Excel date format. Convert inputs into typed values or unambiguous representations before sending them. Never promise that all files can be converted without errors.

| Input | Required behaviour |
|---|---|
| Actual Excel date cells | Interpret workbook date metadata and its date system correctly; avoid timezone shifts for date-only values. |
| Text date 25/12/2026 | Convert when the interpretation is unambiguous. |
| Text date 03/04/2026 | Use an explicitly selected column date order; if none is established, request one inline rather than guessing. |
| Timestamp without timezone mapped to timestamptz | Require an explicit source timezone unless a configured rule already supplies it. |
| Code 00123 or a phone number | Prefer text in new tables; retain leading zeros. If a destination numeric type would remove significant formatting, flag it rather than silently corrupting the value. |
| Large integer or exact decimal | Preserve exact digits; avoid JavaScript floating-point coercion for values that exceed safe precision. |
| Comma decimal or thousands separators | Infer only from consistent unambiguous evidence or a chosen column rule. Ambiguous 1,234 needs a rule. |
| Blank cell | Default to NULL; distinguish empty string from missing value through an explicit option where needed. A selected blank value does not automatically invoke a database default. |
| Mixed-type column in a new table | Prefer text when a safe common numeric/date type is not justified. |
| Text too long for varchar, overflow or invalid value | Show a blocking error; never truncate, round, replace with zero or silently substitute NULL. |
| Formula | Import a saved result if available; do not calculate formulas. Flag missing saved results and explain that the workbook should be recalculated and saved. |
| Coordinates | Import as ordinary values; no spatial processing or deliberate rounding. |

Preserve raw values and cell formatting metadata during parsing where available. Do not indiscriminately trim text. Explain that digits/zeros already lost in the original workbook cannot be reliably reconstructed. Unsupported destination types must be flagged rather than guessed.

## 7. Duplicate policy

Display a compact control below mapping: “Skip duplicates using: Exact imported row / Selected key columns”. Suggest a mapped suitable primary/unique key when available, but make the selected rule visible. Exact imported row is the fallback when no key is selected.

Compare normalized typed values, not arbitrary display strings. Exact-row matching covers all mapped imported fields, excluding generated/unmapped database fields; define NULL as equal to NULL for this deduplication rule. Match with collision-safe comparisons, not an unchecked hash alone. Selected keys require non-empty values and can be composite.

Check duplicates inside the input and against the table. For matching keys with identical values, skip. For matching keys with different payloads, skip every ambiguous input candidate for that key and show a conflict warning; do not select an arbitrary winner or update the existing row. Count each skipped source record once. Other database uniqueness violations must be reported explicitly, not swallowed as generic duplicate skips.

Exact-match mode only detects equal imported values, not whether two different rows describe the same person. Include short help text explaining this. Coordinate columns participate as ordinary values if mapped.

## 8. Errors, progress and interaction states

Use an inline result panel, not a stack of blocking alert dialogs. Lead with a plain-language summary such as “12 rows need attention. No data has been imported.” Show errors in a filterable table: Severity, Sheet/record, Column, Original value, Problem, Suggested action. Use original sheet row numbers; for CSV use record numbers (quoted multiline values mean physical line numbers may differ).

Examples:
- Row 18 · registration_date · 03/04/2026 · Choose day/month/year or month/day/year for this column.
- Row 42 · age · twenty · This column requires an integer. Correct the source value and reload.
- Connection failed · Check host, port and network access.
- Permission denied · This account cannot insert into public.clients.

Show warnings separately: duplicates skipped, key conflicts, ignored blank records. Backend errors with no reliable row association remain operation-level errors; never invent a row number. Expandable technical details can expose a sanitized error code/message without passwords. Offer Export error report as local CSV, escaping spreadsheet formula-like text in exported cells.

States: Empty → File/connection configuration → Mapping → Validating → Ready → Importing → Success or Failed. Both source and connection can be configured in either order. Changed inputs return to an unvalidated state. Validate is enabled when the required configuration is complete. Import is enabled only after full validation has no blocking errors and configuration has not changed. Recheck source fingerprint and destination schema before import.

During validation/import show stage text and processed row counts. Show percentages only with a reliable total. Disable edits during an active import; expose Cancel. After success show inserted, duplicates skipped, conflicts skipped and blank records ignored. If every row is a duplicate, show “No new records to import” and write nothing. Preserve configuration for another file.

## 9. Backend architecture and frontend contract

Use Electron main/background processes for privileged operations and a React renderer for presentation. TypeScript types are shared across the boundary. No independent web server is required. Parsing and expensive work must not freeze the renderer or main event loop; use background workers, chunked processing and bounded preview payloads.

| Module | Responsibility |
|---|---|
| File service | Native selection, file identity, sheet metadata, CSV/XLSX/XLS reading, paged previews |
| Connection service | PostgreSQL lifecycle, TLS settings, timeouts and sanitized connection errors |
| Schema service | Schemas/tables, types, defaults, constraints, privileges and schema fingerprints |
| Conversion service | Column inference, deterministic conversion rules and original-value tracking |
| Validation service | Full-file checks, required mappings, duplicate analysis and issue reporting |
| Import service | Transaction, staging, deduplication, inserts, commit/rollback and cancellation |
| Report service | Structured results and local error-report export |

Expose narrow IPC operations such as selectSource, inspectSource, previewSource, connectDatabase, listSchemas, listTables, describeTable, validateImport, startImport, cancelJob and exportIssues. Do not expose arbitrary SQL execution or arbitrary filesystem reads to the renderer. Validate IPC inputs and sender identity. Use a preload bridge, context isolation, renderer sandboxing and disabled renderer Node integration. Render file content as text, never raw HTML.

An import plan contains source identity/fingerprint, sheet and header settings, selected columns, destination connection ID/schema/table/mode, column mappings, conversion rules and duplicate policy. Credentials remain in the connection service; do not serialize them with the plan.

Validation returns a plan fingerprint, totals, structured issues and canImport. Each issue has a stable code, severity, message, optional source record/column/value, suggested action and sanitized technical detail. Jobs emit jobId, phase, processedRows, optional totalRows and counters. Ignore stale responses after configuration changes; job cancellation must be explicit and acknowledged.

## 10. Import transaction and reliability

Read source data locally. Stream normalized rows through the PostgreSQL client connection, using COPY FROM STDIN into temporary staging where appropriate. A remote server must never be asked to open the local laptop file path. Keep source row identity in staging for diagnostics.

Quote database identifiers correctly and parameterize values. Treat source headers and user-entered table names as untrusted identifiers. Handle delimiters, quotes, multiline text, NULL and empty strings correctly in COPY encoding.

Within one transaction, recheck target compatibility, create a table if requested, stage normalized data, resolve duplicates and insert allowed rows. Let PostgreSQL enforce constraints. Commit only on success. Cancel/failure rolls back transaction-owned data/schema changes and removes temporary resources. Do not claim sequence counters or external side effects from database triggers are rolled back.

Do not rely solely on an earlier duplicate preview: other writers can change a table between validation and import. Use applicable database uniqueness constraints and a suitable concurrency strategy. For exact-row guarantees without a suitable constraint, use a brief transactional write lock with timeout and recheck; report a busy table rather than silently permitting duplicates. Keep locks brief and avoid holding them during initial file parsing.

If a connection drops during COMMIT, the outcome may be uncertain. Show “Connection lost; import outcome could not be confirmed” rather than falsely claiming rollback. Do not automatically retry; reconnect and reconcile before another import. Never label a job successful before commit is acknowledged.

Some constraints and triggers can fail only at actual insertion. Validation reduces errors but does not guarantee that the server will accept every row. Convert final database failures into readable operation-level or row-level issues where evidence permits.

## 11. Delivery order and acceptance criteria

1. Build the one-page shell and source preview using real local files.
2. Add local/remote PostgreSQL connections and schema inspection.
3. Implement mapping, full validation and append-only existing-table import.
4. Add new-table creation, conservative type inference and duplicate policies.
5. Finish errors, cancellation, remote TLS, progress and Windows packaging.

Acceptance: all three file formats open; sheet/header controls preserve the intended data; dates and codes preview correctly; existing schemas govern conversion; create-table mode does not write early; a repeated unchanged import inserts zero new records under the same duplicate rule; existing records are never modified; coordinates remain ordinary columns; failures explain the problem; remote imports use local file bytes; the window remains responsive.

The implementing agent should supply source code, run/build instructions, Windows packaging instructions, and a short list of supported conversions and known limitations. Use maintained dependencies with verified XLS and XLSX support; verify their current documentation, licenses and installation sources when implementing rather than assuming any Excel reader supports both formats.

## 12. Implementation references

- Electron security and IPC boundaries: https://www.electronjs.org/docs/latest/tutorial/security/
- PostgreSQL date/time input and ambiguity: https://www.postgresql.org/docs/current/datatype-datetime.html
- PostgreSQL COPY and client streaming: https://www.postgresql.org/docs/current/sql-copy.html

These references support implementation details. Product behaviour above is the agreed design specification, not a claim that PostgreSQL automatically performs this entire workflow.
