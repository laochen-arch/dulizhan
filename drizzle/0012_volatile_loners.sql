-- V27 compatibility baseline.
-- The application schema initializer owns these legacy tables and columns so
-- existing Sites databases can roll forward without replaying a generated
-- full-snapshot migration. Keep this journal entry as a safe no-op.
SELECT 1;
