-- One-off development repair: the seed's `buildSeriesPlans` falls back to the
-- Armonia student pool whenever the branch is not the Thessaloniki branch, so
-- every Melodia lesson series was populated with Armonia student ids. Series in
-- the Melodia tenant therefore had no participants of their own.
--
-- The corrective action mirrors what a staff member would do: drop the invalid
-- links and attach the tenant's own students to each series by round-robin.
-- It is scoped strictly by tenant and guarded so it is a no-op once corrected.
DO $$
DECLARE
  melodia uuid;
  serie record;
  target uuid;
  offset_index int := 0;
BEGIN
  SELECT id INTO melodia FROM tenants WHERE slug = 'melodia';
  IF melodia IS NULL THEN
    RAISE NOTICE 'melodia tenant missing; nothing to repair';
    RETURN;
  END IF;

  DELETE FROM lesson_students ls
  WHERE ls."tenantId" = melodia
    AND NOT EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = ls."studentId" AND s."tenantId" = melodia
    );

  DELETE FROM lesson_series_students lss
  WHERE lss."tenantId" = melodia
    AND NOT EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = lss."studentId" AND s."tenantId" = melodia
    );

  FOR serie IN
    SELECT id, type, "deletedAt" FROM lesson_series WHERE "tenantId" = melodia ORDER BY "createdAt"
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM lesson_series_students WHERE "lessonSeriesId" = serie.id AND "tenantId" = melodia
    ) THEN
      SELECT id INTO target FROM students
      WHERE "tenantId" = melodia AND "deletedAt" IS NULL
      ORDER BY "registrationNumber" OFFSET (offset_index % 12) LIMIT 1;
      IF target IS NOT NULL THEN
        INSERT INTO lesson_series_students (id, "tenantId", "lessonSeriesId", "studentId")
        VALUES (gen_random_uuid(), melodia, serie.id, target);
        INSERT INTO lesson_students (id, "tenantId", "lessonId", "studentId")
        SELECT gen_random_uuid(), melodia, l.id, target
        FROM lessons l WHERE l."lessonSeriesId" = serie.id AND l."tenantId" = melodia
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;
    offset_index := offset_index + 1;
  END LOOP;
END $$;
