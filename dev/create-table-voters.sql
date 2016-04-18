
-- Before running this, remove backslashes from CSV file
LOAD DATA INFILE '/data/voters.csv' INTO TABLE voters FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' LINES TERMINATED BY '\r\n' IGNORE 1 LINES;

