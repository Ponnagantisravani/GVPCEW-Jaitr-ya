-- Retire the test timetable after testing so it cannot repeat next week.
-- Keeps attendance records for inspection.
UPDATE timetable SET status='draft',updated_at=now()
WHERE subject_id IN (SELECT id FROM subjects WHERE code='CSE3-ATTENDANCE-TEST');
-- Remove only the test column/cells from the dashboard document.
DO $$ DECLARE record_doc record; field_name text; payload jsonb; cleaned_grid jsonb;
BEGIN
 FOR record_doc IN SELECT id,draft,published FROM academic_documents WHERE kind='timetable' AND key='cse_sec3_year3' LOOP
  FOREACH field_name IN ARRAY ARRAY['draft','published'] LOOP
   payload := CASE WHEN field_name='draft' THEN record_doc.draft ELSE record_doc.published END;
   IF payload IS NULL THEN CONTINUE; END IF;
   SELECT coalesce(jsonb_object_agg(key,value-'attendance_test'),'{}'::jsonb) INTO cleaned_grid FROM jsonb_each(coalesce(payload->'grid','{}'::jsonb));
   payload := jsonb_set(payload,'{grid}',cleaned_grid);
   payload := jsonb_set(payload,'{periods}',coalesce((SELECT jsonb_agg(p) FROM jsonb_array_elements(coalesce(payload->'periods','[]'::jsonb)) p WHERE p->>'id'<>'attendance_test'),'[]'::jsonb));
   IF field_name='draft' THEN UPDATE academic_documents SET draft=payload,updated_at=now() WHERE id=record_doc.id;
   ELSE UPDATE academic_documents SET published=payload,updated_at=now() WHERE id=record_doc.id; END IF;
  END LOOP;
 END LOOP;
END $$;
