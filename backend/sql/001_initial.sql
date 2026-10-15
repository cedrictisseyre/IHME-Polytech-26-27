CREATE TABLE IF NOT EXISTS questionnaire_versions (
  version TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS questions (
  version TEXT NOT NULL REFERENCES questionnaire_versions(version),
  id SMALLINT NOT NULL CHECK (id BETWEEN 1 AND 12),
  domain TEXT NOT NULL,
  title TEXT NOT NULL,
  choices JSONB NOT NULL,
  correct_choice CHAR(1) NOT NULL CHECK (correct_choice IN ('A', 'B', 'C')),
  explanation TEXT NOT NULL,
  PRIMARY KEY (version, id)
);

CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY,
  version TEXT NOT NULL REFERENCES questionnaire_versions(version),
  request_id UUID NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  owner_session_hash TEXT NOT NULL,
  last_name TEXT NOT NULL,
  first_name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (version, email),
  UNIQUE (id, version)
);

CREATE TABLE IF NOT EXISTS answers (
  submission_id UUID NOT NULL,
  version TEXT NOT NULL,
  question_id SMALLINT NOT NULL,
  choice CHAR(1) NOT NULL CHECK (choice IN ('A', 'B', 'C', 'D')),
  PRIMARY KEY (submission_id, question_id),
  FOREIGN KEY (submission_id, version) REFERENCES submissions(id, version) ON DELETE CASCADE,
  FOREIGN KEY (version, question_id) REFERENCES questions(version, id)
);

CREATE INDEX IF NOT EXISTS submissions_created_at_idx ON submissions(created_at);
CREATE INDEX IF NOT EXISTS answers_question_idx ON answers(version, question_id, choice);

CREATE TABLE IF NOT EXISTS teacher_sessions (
  sid TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON teacher_sessions(expires_at);
