-- V30 compatibility baseline.
-- The application schema initializer adds customer_user_id and its index with
-- an idempotent PRAGMA/ALTER check, so existing Sites databases do not fail on
-- a duplicate-column migration during startup.
SELECT 1;
