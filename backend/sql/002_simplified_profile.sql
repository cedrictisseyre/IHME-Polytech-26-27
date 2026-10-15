ALTER TABLE submissions
  DROP COLUMN IF EXISTS phone,
  DROP COLUMN IF EXISTS formation,
  DROP COLUMN IF EXISTS formation_detail,
  DROP COLUMN IF EXISTS pathway,
  DROP COLUMN IF EXISTS project_experience,
  DROP COLUMN IF EXISTS project_description,
  DROP COLUMN IF EXISTS expectation,
  DROP COLUMN IF EXISTS expectation_detail,
  DROP COLUMN IF EXISTS concern,
  DROP COLUMN IF EXISTS experience;
