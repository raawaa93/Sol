-- Keep the Sol / Volterra public application schema intact.
-- Retire all legacy Rawaa and Commerce application schemas.
DROP SCHEMA IF EXISTS commerce CASCADE;
DROP SCHEMA IF EXISTS rawaa_store CASCADE;
