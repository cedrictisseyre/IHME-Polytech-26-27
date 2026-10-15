CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS classrooms (
  id UUID PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS classroom_members (
  classroom_id UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (classroom_id, student_id)
);

CREATE TABLE IF NOT EXISTS live_questions (
  id UUID PRIMARY KEY,
  classroom_id UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  choices JSONB NOT NULL CHECK (jsonb_array_length(choices) = 3),
  correct_choice CHAR(1) NOT NULL CHECK (correct_choice IN ('A', 'B', 'C')),
  explanation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  UNIQUE (id, classroom_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS live_one_open_question_idx ON live_questions(classroom_id) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS live_answers (
  question_id UUID NOT NULL,
  classroom_id UUID NOT NULL,
  student_id UUID NOT NULL,
  choice CHAR(1) NOT NULL CHECK (choice IN ('A', 'B', 'C', 'D')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (question_id, student_id),
  FOREIGN KEY (question_id, classroom_id) REFERENCES live_questions(id, classroom_id) ON DELETE CASCADE,
  FOREIGN KEY (classroom_id, student_id) REFERENCES classroom_members(classroom_id, student_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS live_questions_classroom_idx ON live_questions(classroom_id, created_at);
CREATE INDEX IF NOT EXISTS classroom_members_student_idx ON classroom_members(student_id);
