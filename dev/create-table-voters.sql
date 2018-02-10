
-- Before running this, remove backslashes from CSV file
LOAD DATA INFILE 'voters.csv' INTO TABLE voters FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' LINES TERMINATED BY '\n' IGNORE 1 LINES;

