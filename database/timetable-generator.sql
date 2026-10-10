BEGIN;
CREATE TABLE IF NOT EXISTS timetable_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
 created_at timestamptz NOT NULL DEFAULT now(), input jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS timetable_slots (
 version_id uuid NOT NULL REFERENCES timetable_versions(id) ON DELETE CASCADE,
 section text NOT NULL, day integer NOT NULL CHECK(day BETWEEN 0 AND 5),
 period integer NOT NULL CHECK(period BETWEEN 1 AND 6), subject text NOT NULL,
 teachers text[] NOT NULL, room text[] NOT NULL, kind text NOT NULL,
 span_start integer NOT NULL, span_len integer NOT NULL CHECK(span_len IN (1,3)),
 UNIQUE(version_id,section,day,period)
);
-- Expanded occupancy provides database guarantees for every teacher and lab room.
CREATE TABLE IF NOT EXISTS timetable_generator_resources (
 version_id uuid NOT NULL REFERENCES timetable_versions(id) ON DELETE CASCADE,
 day integer NOT NULL, period integer NOT NULL, kind text NOT NULL, resource text NOT NULL,
 UNIQUE(version_id,day,period,kind,resource)
);
-- Maintain per-resource rows in the database, including direct slot writes.
CREATE OR REPLACE FUNCTION timetable_generator_occupancy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP <> 'INSERT' THEN
  DELETE FROM timetable_generator_resources WHERE version_id=OLD.version_id AND day=OLD.day AND period=OLD.period
   AND ((kind='teacher' AND resource=ANY(OLD.teachers)) OR (kind='room' AND resource=ANY(OLD.room)));
 END IF;
 IF TG_OP <> 'DELETE' THEN
  IF cardinality(NEW.teachers)=0 OR cardinality(NEW.room)=0 OR NEW.kind NOT IN ('theory','lab')
    OR NEW.span_start NOT BETWEEN 1 AND 6 OR NEW.period NOT BETWEEN NEW.span_start AND NEW.span_start+NEW.span_len-1
    OR (NEW.kind='lab' AND (NEW.span_len<>3 OR NEW.span_start NOT IN (1,4)))
    OR (NEW.kind='theory' AND (NEW.span_len<>1 OR NEW.span_start<>NEW.period)) THEN
   RAISE EXCEPTION 'Invalid timetable slot or lab span' USING ERRCODE='23514';
  END IF;
  INSERT INTO timetable_generator_resources(version_id,day,period,kind,resource)
   SELECT NEW.version_id,NEW.day,NEW.period,'teacher',unnest(NEW.teachers);
  INSERT INTO timetable_generator_resources(version_id,day,period,kind,resource)
   SELECT NEW.version_id,NEW.day,NEW.period,'room',unnest(NEW.room);
 END IF;
 RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS timetable_generator_slot_occupancy ON timetable_slots;
CREATE TRIGGER timetable_generator_slot_occupancy AFTER INSERT OR UPDATE OR DELETE ON timetable_slots
 FOR EACH ROW EXECUTE FUNCTION timetable_generator_occupancy();
CREATE INDEX IF NOT EXISTS timetable_generator_version_status ON timetable_versions(status,created_at DESC);
CREATE INDEX IF NOT EXISTS timetable_generator_teacher_lookup ON timetable_generator_resources(resource,kind,version_id,day,period);
CREATE OR REPLACE FUNCTION timetable_generator_lock_version() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE version_status text;
BEGIN
 SELECT status INTO version_status FROM timetable_versions WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.version_id ELSE NEW.version_id END FOR UPDATE;
 IF version_status='published' THEN RAISE EXCEPTION 'Published generated timetables are immutable; save a new draft' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
DROP TRIGGER IF EXISTS timetable_generator_slot_lock ON timetable_slots;
CREATE TRIGGER timetable_generator_slot_lock BEFORE INSERT OR UPDATE OR DELETE ON timetable_slots FOR EACH ROW EXECUTE FUNCTION timetable_generator_lock_version();
COMMIT;
