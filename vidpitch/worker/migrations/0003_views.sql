-- View count shown to the owner on the video page and in the library.
ALTER TABLE videos ADD COLUMN views INTEGER NOT NULL DEFAULT 0;
