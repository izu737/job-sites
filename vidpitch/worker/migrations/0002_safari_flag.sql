-- Result of the Safari compatibility check, for diagnostics only.
-- 1 = plays in Safari and on iPhone, 0 = does not, NULL = not checked.
ALTER TABLE videos ADD COLUMN safari_ready INTEGER;
ALTER TABLE videos ADD COLUMN safari_notes TEXT;
