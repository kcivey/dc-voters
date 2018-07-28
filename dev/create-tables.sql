CREATE TABLE IF NOT EXISTS pages (
  `id` SMALLINT UNSIGNED NOT NULL,
  `circulator_id` SMALLINT UNSIGNED NOT NULL,
  `date_signed` DATE DEFAULT NULL,
  `notes` TEXT,
  PRIMARY KEY (`id`),
  KEY (`circulator_id`)
);

CREATE TABLE IF NOT EXISTS circulators (
  `id` SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `notes` TEXT,
  PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS users (
  `id` MEDIUMINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(10),
  `password` VARCHAR(64),
  `email` VARCHAR(256),
  `admin` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY (`username`)
);

CREATE TABLE IF NOT EXISTS voters (
  registered VARCHAR(255) DEFAULT '' NOT NULL,
  lastname VARCHAR(255) DEFAULT '' NOT NULL,
  firstname VARCHAR(255) DEFAULT '' NOT NULL,
  middle VARCHAR(255) DEFAULT '' NOT NULL,
  suffix VARCHAR(255) DEFAULT '' NOT NULL,
  status VARCHAR(255) DEFAULT '' NOT NULL,
  party VARCHAR(255) DEFAULT '' NOT NULL,
  res_house VARCHAR(255) DEFAULT '' NOT NULL,
  res_frac VARCHAR(255) DEFAULT '' NOT NULL,
  res_apt VARCHAR(255) DEFAULT '' NOT NULL,
  res_street VARCHAR(255) DEFAULT '' NOT NULL,
  res_city VARCHAR(255) DEFAULT '' NOT NULL,
  res_state VARCHAR(255) DEFAULT '' NOT NULL,
  res_zip VARCHAR(255) DEFAULT '' NOT NULL,
  res_zip4 VARCHAR(255) DEFAULT '' NOT NULL,
  precinct VARCHAR(255) DEFAULT '' NOT NULL,
  ward VARCHAR(255) DEFAULT '' NOT NULL,
  anc VARCHAR(255) DEFAULT '' NOT NULL,
  smd VARCHAR(255) DEFAULT '' NOT NULL,
  h061918p CHAR(1) DEFAULT '' NOT NULL,
  h110816g CHAR(1) DEFAULT '' NOT NULL,
  h061416p CHAR(1) DEFAULT '' NOT NULL,
  h042815s CHAR(1) DEFAULT '' NOT NULL,
  h110414g CHAR(1) DEFAULT '' NOT NULL,
  h071514s CHAR(1) DEFAULT '' NOT NULL,
  h040114p CHAR(1) DEFAULT '' NOT NULL,
  h042313s CHAR(1) DEFAULT '' NOT NULL,
  h112012g CHAR(1) DEFAULT '' NOT NULL,
  h052012s CHAR(1) DEFAULT '' NOT NULL,
  h042012p CHAR(1) DEFAULT '' NOT NULL,
  h022012s CHAR(1) DEFAULT '' NOT NULL,
  h042011s CHAR(1) DEFAULT '' NOT NULL,
  h112010g CHAR(1) DEFAULT '' NOT NULL,
  h092010p CHAR(1) DEFAULT '' NOT NULL,
  h112008g CHAR(1) DEFAULT '' NOT NULL,
  h092008p CHAR(1) DEFAULT '' NOT NULL,
  h022008p CHAR(1) DEFAULT '' NOT NULL,
  h082007s CHAR(1) DEFAULT '' NOT NULL,
  h052007s CHAR(1) DEFAULT '' NOT NULL,
  h112006g CHAR(1) DEFAULT '' NOT NULL,
  h092006p CHAR(1) DEFAULT '' NOT NULL,
  h112004g CHAR(1) DEFAULT '' NOT NULL,
  h092004p CHAR(1) DEFAULT '' NOT NULL,
  h042004s CHAR(1) DEFAULT '' NOT NULL,
  h012004p CHAR(1) DEFAULT '' NOT NULL,
  h112002g CHAR(1) DEFAULT '' NOT NULL,
  h092002p CHAR(1) DEFAULT '' NOT NULL,
  h112000g CHAR(1) DEFAULT '' NOT NULL,
  h092000p CHAR(1) DEFAULT '' NOT NULL,
  h082000p CHAR(1) DEFAULT '' NOT NULL,
  h012000s CHAR(1) DEFAULT '' NOT NULL,
  h111999g CHAR(1) DEFAULT '' NOT NULL,
  h111998g CHAR(1) DEFAULT '' NOT NULL,
  h091998p CHAR(1) DEFAULT '' NOT NULL,
  h081998p CHAR(1) DEFAULT '' NOT NULL,
  h111997g CHAR(1) DEFAULT '' NOT NULL,
  h091997p CHAR(1) DEFAULT '' NOT NULL,
  h011997s CHAR(1) DEFAULT '' NOT NULL,
  h111996g CHAR(1) DEFAULT '' NOT NULL,
  h091996p CHAR(1) DEFAULT '' NOT NULL,
  h081996p CHAR(1) DEFAULT '' NOT NULL,
  h111995g CHAR(1) DEFAULT '' NOT NULL,
  h091995p CHAR(1) DEFAULT '' NOT NULL,
  h011995s CHAR(1) DEFAULT '' NOT NULL,
  h111994g CHAR(1) DEFAULT '' NOT NULL,
  voter_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (voter_id),
  INDEX (lastname),
  INDEX (firstname),
  INDEX (res_house),
  INDEX (res_street)
);
