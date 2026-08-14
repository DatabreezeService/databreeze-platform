-- JRA-001/JRA-007/JRA-013/JRA-023
-- PostgreSQL remains authoritative for ready-work reconstruction. This index bounds the
-- exact-tenant FIFO scan used by authenticated cloud-worker assignment after Redis loss.
CREATE INDEX "jobs_worker_ready_scan_idx"
ON "jra"."jobs"("organization_id", "workspace_id", "project_id", "state", "created_at");
