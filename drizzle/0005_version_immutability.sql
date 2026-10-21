-- CURRICULUM VERSION IMMUTABILITY
-- Once a version is approved, published, superseded or archived, its lessons, questions, answer keys and blueprints cannot be changed or deleted.
-- Churches pin a version through curriculum_assignments, so improving a lesson means publishing a NEW version; active programmes are never altered.
CREATE OR REPLACE FUNCTION fssa_guard_frozen_version() RETURNS trigger AS $$
DECLARE vid uuid; st text;
BEGIN
  IF TG_OP = 'DELETE' THEN vid := OLD.version_id; ELSE vid := NEW.version_id; END IF;
  SELECT status INTO st FROM curriculum_versions WHERE id = vid;
  IF st IN ('approved','published','superseded','archived') THEN
    RAISE EXCEPTION 'Curriculum version % is frozen (status %). Create a new version to change it.', vid, st USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fssa_guard_frozen_question_child() RETURNS trigger AS $$
DECLARE qid uuid; vid uuid; st text;
BEGIN
  IF TG_OP = 'DELETE' THEN qid := OLD.question_id; ELSE qid := NEW.question_id; END IF;
  SELECT version_id INTO vid FROM questions WHERE id = qid;
  IF vid IS NOT NULL THEN
    SELECT status INTO st FROM curriculum_versions WHERE id = vid;
    IF st IN ('approved','published','superseded','archived') THEN
      RAISE EXCEPTION 'Curriculum version % is frozen (status %). Create a new version to change it.', vid, st USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_frozen_lessons BEFORE INSERT OR UPDATE OR DELETE ON curriculum_lessons FOR EACH ROW EXECUTE FUNCTION fssa_guard_frozen_version();
--> statement-breakpoint
CREATE TRIGGER trg_frozen_questions BEFORE INSERT OR UPDATE OR DELETE ON questions FOR EACH ROW EXECUTE FUNCTION fssa_guard_frozen_version();
--> statement-breakpoint
CREATE TRIGGER trg_frozen_banks BEFORE UPDATE OR DELETE ON question_banks FOR EACH ROW EXECUTE FUNCTION fssa_guard_frozen_version();
--> statement-breakpoint
CREATE TRIGGER trg_frozen_blueprints BEFORE INSERT OR UPDATE OR DELETE ON assessment_blueprints FOR EACH ROW EXECUTE FUNCTION fssa_guard_frozen_version();
--> statement-breakpoint
CREATE TRIGGER trg_frozen_resources BEFORE INSERT OR UPDATE OR DELETE ON lesson_resources FOR EACH ROW EXECUTE FUNCTION fssa_guard_frozen_version();
--> statement-breakpoint
CREATE TRIGGER trg_frozen_options BEFORE INSERT OR UPDATE OR DELETE ON question_options FOR EACH ROW EXECUTE FUNCTION fssa_guard_frozen_question_child();
--> statement-breakpoint
CREATE TRIGGER trg_frozen_keys BEFORE INSERT OR UPDATE OR DELETE ON question_answer_keys FOR EACH ROW EXECUTE FUNCTION fssa_guard_frozen_question_child();
