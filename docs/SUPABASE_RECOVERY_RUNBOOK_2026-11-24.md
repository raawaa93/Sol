# Sol / Volterra Supabase recovery runbook

**Checked:** 24 November 2026, 08:20 UTC  
**Project:** `Ghaiooth-core` / `oyoyozdugicmnkfhjovo`  
**Repository:** `raawaa93/Sol` (public)  
**Database:** PostgreSQL 17.11, Supabase Free

## 1. Current recoverable application footprint

The live application schema is deliberately small:

- `public.volterra_rate_limit_windows` — the only application table; RLS enabled, no direct client or service-role table privileges.
- `public.volterra_check_rate_limit(text, integer, integer)` — service-side RPC, `SECURITY DEFINER`, pinned `search_path`, executable only by `service_role`.
- `volterra-binance-market-data` Edge Function — active v10; source is stored in `supabase/functions/volterra-binance-market-data/index.ts` and uses Supabase's injected `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` runtime values. No user-supplied API key is required by this public market-data proxy.
- Six old Edge Function deployments are inert HTTP 410 handlers and still registered; they are not part of the Sol deploy path.
- Current snapshot: 1 Auth user, 0 Storage objects, 58 ephemeral rate-limit rows. The Auth user is not included in the standard CLI dump described below.

The three tracked migrations rebuild the Sol application table/function and remove the two old application schemas. The 19 older remote migration records belong to retired systems and must not be copied into the active migration directory or blindly replayed.

## 2. What Supabase Free does and does not back up

Supabase's current Free-plan FAQ says there are **no automatic database backups**; manual CLI exports are supported. Pro and above receive daily backups, with separate paid PITR options. See:

- [Free-plan backup FAQ](https://supabase.com/kb/faqs/platform/free-plan-backups)
- [Database backups](https://supabase.com/docs/guides/platform/backups)
- [CLI backup and restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)

The standard `supabase db dump` excludes Supabase-managed schemas such as `auth`, `storage`, and extension schemas. A default schema dump does not contain table data or custom roles. Storage object bytes are not part of a database dump. Therefore, do not call a three-file CLI dump a complete clone of the entire Supabase project.

## 3. Required credential boundary

A complete logical database export requires a PostgreSQL connection string with the database password. It is available in Supabase Dashboard → Project → Connect → Session pooler. The password can be reset in Database Settings, but rotating it can affect existing connections and should not be done just to make this runbook work.

The connected tools do not expose the database password, and no existing GitHub secret names could be inspected through the available GitHub connector. Do not send the password or a service-role key in chat. A future scheduled workflow can use a repository Actions secret named `SUPABASE_DB_URL`, but this secret must be configured by the repository owner.

Because the repository is public, any workflow artifact is downloadable by anyone with repository read access. Any backup artifact must therefore be encrypted before upload. A separate offline-held encryption passphrase/key is required; never store the decryption key in the public repository or in the same downloadable artifact.

## 4. Manual export procedure (not yet run)

Run from a trusted environment with Docker and a current Supabase CLI. Prefer the Session Pooler connection string. Do not paste it into terminal logs or commit it.

```bash
mkdir -p sol-backup
umask 077

supabase db dump --remote="$SUPABASE_DB_URL" -f sol-backup/roles.sql --role-only
supabase db dump --remote="$SUPABASE_DB_URL" -f sol-backup/schema.sql
supabase db dump --remote="$SUPABASE_DB_URL" -f sol-backup/data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"

sha256sum sol-backup/*.sql > sol-backup/SHA256SUMS
```

This creates roles, application schema, and database data dumps supported by the CLI. It does **not** export Auth users, Storage object bytes, project Auth configuration, Edge Function secrets, or every Supabase-managed setting. The current Storage object count is zero; the one Auth user still needs an explicit decision on whether it is required for recovery.

Encrypt the resulting archive with a strong encryption tool and a key held outside GitHub before storing it off-site. Do not upload plaintext SQL or plaintext archive files to this public repository or its Actions artifacts.

## 5. Automated encrypted backups (workflow added; credentials still required)

The repository now contains `.github/workflows/supabase-backup.yml` and `scripts/backup-supabase.sh`. Once configured, the workflow runs weekly (Sunday 04:23 UTC) or on manual dispatch:

1. Uses Supabase CLI v3 with explicit `--remote=<database-url>` for all three dumps.
2. Exports cluster roles, non-managed schema, and non-managed schema data.
3. Verifies the expected Sol rate-limit table and RPC are present in the schema dump.
4. Writes a manifest and SHA-256 checksums.
5. Encrypts the archive with age before publishing it as a GitHub Release asset. The repository is public, so only ciphertext is ever uploaded.
6. Does not automatically delete older releases; retain restore points until a separate retention policy is chosen.

### One-time setup required from the repository owner

The connected GitHub tools cannot inspect or write Actions secrets, and the database password is not available to the connected tools. Do not paste either secret or private key into chat.

1. On a trusted device, install age and generate a key pair offline:
   `age-keygen -o age-identity.txt`
2. Keep the `AGE-SECRET-KEY-...` identity in an offline password manager or encrypted offline storage. Never upload it to GitHub.
3. Copy only the public `age1...` recipient printed by age-keygen into GitHub repository **Settings → Secrets and variables → Actions → Variables** as `AGE_RECIPIENT`.
4. In GitHub **Settings → Secrets and variables → Actions → Secrets**, add `SUPABASE_DB_URL` containing the PostgreSQL connection URL for project `oyoyozdugicmnkfhjovo`. Use the Session Pooler URL where possible. The workflow validates that the URL identifies this project and never prints it.
5. Open **Actions → Encrypted Supabase backup → Run workflow**. Confirm that a new `sol-db-backup-...` release appears and contains only a `.age` ciphertext asset.

A one-time trigger was executed on 24 November 2026 at 08:55 UTC. The workflow completed successfully but **skipped the export** because both `SUPABASE_DB_URL` and `AGE_RECIPIENT` were absent; its configuration check confirms that no database connection was attempted and no backup artifact was created. The temporary push trigger was then removed; the weekly schedule and manual `workflow_dispatch` remain. The skipped-state summary quoting was also corrected.

The scheduled workflow intentionally skips with a warning while either setting is missing. A successful workflow run before configuration is not a backup. A successful encrypted export still is not a verified restore; the matching private identity is needed to decrypt and test it in an isolated environment.

The release asset is publicly downloadable because this repository is public. Its contents are protected only by age encryption and the offline private key. If the private key is lost, the backup cannot be decrypted.

### Automated export scope

The script includes database roles, non-managed schema definitions, and non-managed schema data. Supabase CLI excludes managed `auth`, `storage`, and extension schemas. It does not include Auth users/sessions, Storage object bytes, Edge Function secrets, or project settings. Do not describe this as a complete project clone.

## 6. Restore verification plan

Before loading a dump into a fresh Supabase project, revoke the platform's default privileges for client roles so the target project's defaults do not accidentally widen access. Apply and review these statements before restoring the schema:

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
```

Then:

1. Restore into an isolated disposable PostgreSQL/Supabase environment, never over the live project.
2. Restore roles first, then schema, then data, following the official CLI guide and its privilege/default-grant cautions.
3. Verify the `public.volterra_rate_limit_windows` table, its RLS state, index, RPC definition and exact grants.
4. Deploy the versioned Volterra Edge Function source and verify the read-only GET/OPTIONS contract, origin allowlist, and shared rate-limit RPC.
5. Run app unit/property tests, browser journeys, production smoke tests, and a market-data proxy smoke test.
6. Record the backup timestamp, artifact digest, restore duration, and any missing Auth/Storage/Edge configuration.

No isolated restore has been run yet; the current state is **not** a verified backup.

## 7. Migration-history reconciliation

The remote migration ledger contains 22 rows; the Sol repository tracks only the three migrations listed above. The other 19 historical rows refer to removed legacy application objects. Their SQL text remains stored in the remote migration ledger, but the corresponding live application schemas, tables and functions are absent.

Do not replay or re-add those historical migrations to `supabase/migrations`. After capturing a fresh schema dump and verifying the clean Sol schema, use the Supabase CLI v3 command below to remove only the 19 obsolete history records, then verify that local and remote migration lists contain the same three Sol migrations:

```bash
supabase migration list --remote="$SUPABASE_DB_URL"
# After reviewing the list and backup/restore evidence:
supabase migration repair <legacy-version> --status reverted --remote="$SUPABASE_DB_URL" --yes
supabase migration list --remote="$SUPABASE_DB_URL"
```

Repeat the repair command only for the 19 explicitly listed legacy versions. In CLI v3, `--remote` can target a database URL; URLs must be RFC 3986 encoded. Do not run this against the production database until the schema dump and isolated restore have passed. Supabase documents that `reverted` deletes the history record and does not reverse SQL objects: [migration repair reference](https://supabase.com/docs/reference/cli/supabase-migration-repair).

This repair has **not** been run. The history rows are intentionally retained until the dump and restore path are proven.

## 8. Remaining blockers

- [ ] Repository owner configures `SUPABASE_DB_URL` as an Actions secret and `AGE_RECIPIENT` as an Actions variable; neither is visible/writable through the connected GitHub tools.
- [ ] Generate an age key pair offline and keep the private identity outside GitHub.
- [ ] Dispatch the encrypted-backup workflow; verify the first ciphertext release asset and checksum.
- [ ] Run an isolated restore test.
- [ ] Decide whether the single Auth user needs separate preservation; the standard CLI dump excludes Auth.
- [ ] Reconcile the 19 obsolete remote migration history rows only after backup/restore verification.
- [ ] Protect `main` with PR + required checks. The repository currently has no rulesets and `main` is not protected; the connected GitHub tool cannot write repository administration settings.
- [ ] Remove six retired Edge Function deployments if/when a Supabase delete-function action or authorized CLI/Management API path becomes available.

## 9. Incident boundary

The earlier `commerce` and `rawaa_store` schema deletion removed the two Telegram pairing/recipient rows. Those records are absent from the live database. No backup has been located in the connected project, Storage, or Library. This runbook does not recreate placeholders and does not claim the deleted records can be recovered. An external pre-cleanup backup, if one exists, must be located separately.
