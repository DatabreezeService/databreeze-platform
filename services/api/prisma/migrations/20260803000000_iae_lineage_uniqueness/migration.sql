-- IAE-007: one immutable lineage record is authoritative for each derived version.
CREATE UNIQUE INDEX "artifact_lineage_derived_version_key"
    ON "iae"."artifact_lineage"("derived_artifact_version_id");
