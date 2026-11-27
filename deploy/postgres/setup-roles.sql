-- ============================================================================
-- SwiftSweeps PostgreSQL Database & Least-Privilege Role Bootstrap Template
-- ============================================================================
-- Run as PostgreSQL superuser (`sudo -u postgres psql`) during initial host
-- provisioning ONLY. Replace all `__CHANGE_ME_*__` placeholders before running.
--
-- Separation of duties:
-- 1. `swiftsweeps_migrator`: Owns the database and schema; used ONLY during
--    maintenance runs of `npm run db:migrate:up` and `npm run auth:migrate:up`.
-- 2. `swiftsweeps_app`: Runtime role used by `myapp-api.service`. Has DML
--    access only (SELECT, INSERT, UPDATE, DELETE) — NO DDL, NO SUPERUSER,
--    NO CREATEDB, NO CREATEROLE.
-- 3. `swiftsweeps_backup`: Read-only role for automated `pg_dump` backups.
-- ============================================================================

-- 1. Create roles (replace passwords from your secret manager / CSPRNG)
CREATE ROLE swiftsweeps_migrator
  WITH LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  PASSWORD '__CHANGE_ME_MIGRATOR_DB_PASSWORD__';

CREATE ROLE swiftsweeps_app
  WITH LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  PASSWORD '__CHANGE_ME_APP_DB_PASSWORD__';

CREATE ROLE swiftsweeps_backup
  WITH LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  PASSWORD '__CHANGE_ME_BACKUP_DB_PASSWORD__';

-- 2. Create database owned by the migrator role
CREATE DATABASE swiftsweeps
  OWNER swiftsweeps_migrator
  ENCODING 'UTF8'
  LC_COLLATE 'C.UTF-8'
  LC_CTYPE 'C.UTF-8'
  TEMPLATE template0;

-- Lock down default public access on the cluster database
REVOKE ALL ON DATABASE swiftsweeps FROM PUBLIC;

\connect swiftsweeps

-- Required by db/migrations/0001_core_users_auth_links_and_audit.sql (`CREATE EXTENSION IF NOT EXISTS pgcrypto`)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Lock down public schema creation so runtime roles cannot create arbitrary tables
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO swiftsweeps_migrator;
GRANT USAGE ON SCHEMA public TO swiftsweeps_app;
GRANT USAGE ON SCHEMA public TO swiftsweeps_backup;

-- Ensure future tables and sequences created by `swiftsweeps_migrator` grant
-- minimal required privileges automatically to `swiftsweeps_app` and `swiftsweeps_backup`.
ALTER DEFAULT PRIVILEGES FOR ROLE swiftsweeps_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO swiftsweeps_app;

ALTER DEFAULT PRIVILEGES FOR ROLE swiftsweeps_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO swiftsweeps_app;

ALTER DEFAULT PRIVILEGES FOR ROLE swiftsweeps_migrator IN SCHEMA public
  GRANT SELECT ON TABLES TO swiftsweeps_backup;

ALTER DEFAULT PRIVILEGES FOR ROLE swiftsweeps_migrator IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO swiftsweeps_backup;

-- Allow runtime and backup roles to connect to the application database
GRANT CONNECT ON DATABASE swiftsweeps TO swiftsweeps_app;
GRANT CONNECT ON DATABASE swiftsweeps TO swiftsweeps_backup;

-- NOTE: After running `npm run db:migrate:up` and `npm run auth:migrate:up` as
-- `swiftsweeps_migrator`, verify grants on any tables created inside a transaction:
--   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO swiftsweeps_app;
--   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO swiftsweeps_app;
--   GRANT SELECT ON ALL TABLES IN SCHEMA public TO swiftsweeps_backup;
