CREATE OR REPLACE VIEW unique_sheets AS
SELECT DISTINCT sheet_name FROM items ORDER BY sheet_name;
