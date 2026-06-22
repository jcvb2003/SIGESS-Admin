CREATE TABLE backup_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            uuid NOT NULL,
  project_id        uuid NOT NULL REFERENCES projetos(id) ON DELETE RESTRICT,
  project_ref       text NOT NULL,
  backup_label      text NOT NULL,    -- tenant_code (isolated) ou '_full' (shared)
  backup_date       date NOT NULL,
  mode              text NOT NULL CHECK (mode IN ('single', 'batch')),
  status            text NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  schema_path       text,
  data_path         text,
  schema_size_bytes bigint,
  data_size_bytes   bigint,
  schema_checksum   text,
  data_checksum     text,
  error_detail      text,
  started_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz,
  triggered_by      text NOT NULL      -- 'cli:manual' | 'cli:batch' | 'admin:ui'
);

ALTER TABLE backup_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read" ON backup_runs FOR SELECT TO authenticated USING (true);

CREATE INDEX backup_runs_project_date ON backup_runs (project_ref, backup_date DESC);
CREATE INDEX backup_runs_run_id ON backup_runs (run_id);
CREATE INDEX backup_runs_status ON backup_runs (status, started_at DESC);

COMMENT ON COLUMN backup_runs.run_id IS 'Batch id: em --all agrupa múltiplos projetos num mesmo run; em execução single (--tenant / --project-ref) é semanticamente equivalente ao próprio id.';
