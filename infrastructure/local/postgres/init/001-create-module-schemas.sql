-- Local bootstrap only. Authentication is supplied by Compose environment
-- variables; no credentials belong in this script.
DO $$
DECLARE
  schema_name text;
BEGIN
  FOREACH schema_name IN ARRAY ARRAY[
    'iam', 'aud', 'bua', 'iae', 'dsm', 'jra', 'dso', 'nco', 'int',
    'fa', 'sa', 'qi', 'oc', 'ild', 'crf', 'pda', 'mr', 'dqg', 'ei'
  ]
  LOOP
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', schema_name);
  END LOOP;
END
$$;
