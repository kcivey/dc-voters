CREATE TABLE IF NOT EXISTS projects (
  `id` SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(16),
  `name` VARCHAR(64),
  `finding_codes` TEXT,
  `circulator_statuses` TEXT,
  `party` VARCHAR(32),
  `ward` TINYINT UNSIGNED,
  `image_dpi` SMALLINT UNSIGNED,
  `challenge_header` VARCHAR(128),
  PRIMARY KEY (`id`),
  UNIQUE KEY (`code`)
);

CREATE TABLE IF NOT EXISTS circulators (
  `id` MEDIUMINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `status` varchar(10) NOT NULL DEFAULT '',
  `notes` TEXT,
  UNIQUE KEY (`name`),
  PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS pages (
  `id` MEDIUMINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id` SMALLINT UNSIGNED NOT NULL,
  `number` SMALLINT UNSIGNED NOT NULL,
  `circulator_id` MEDIUMINT UNSIGNED NOT NULL,
  `date_signed` DATE DEFAULT NULL,
  `notes` TEXT,
  PRIMARY KEY (`id`),
  UNIQUE KEY (`project_id`, `number`),
  KEY (`circulator_id`),
  FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`),
  FOREIGN KEY (`circulator_id`) REFERENCES `circulators` (`id`)
);

CREATE TABLE petition_lines (
  `id` MEDIUMINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id` SMALLINT UNSIGNED NOT NULL,
  `page` SMALLINT UNSIGNED NOT NULL,
  `line` TINYINT UNSIGNED NOT NULL,
  `checker` VARCHAR(10) DEFAULT '' NOT NULL,
  `check_time` DATETIME DEFAULT NULL,
  `voter_id` VARCHAR(10) DEFAULT '' NOT NULL,
  `finding` VARCHAR(10) DEFAULT '' NOT NULL,
  `voter_name` VARCHAR(255) DEFAULT '' NOT NULL,
  `address` VARCHAR(255) DEFAULT '' NOT NULL,
  `ward` VARCHAR(1) DEFAULT '' NOT NULL,
  `date_signed` DATE DEFAULT NULL,
  `notes` TEXT,
  PRIMARY KEY (`id`),
  UNIQUE `page_line` (`project_id`, `page`, `line`),
  KEY (`checker`),
  KEY (`check_time`),
  KEY (`voter_id`),
  KEY (`date_signed`),
  KEY (`finding`),
  KEY (`ward`),
  FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`),
  FOREIGN KEY (`project_id`, `page`) REFERENCES pages (`project_id`, `number`)
);

CREATE TABLE IF NOT EXISTS users (
  `id` MEDIUMINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255),
  `username` VARCHAR(10),
  `admin` TINYINT(1) NOT NULL DEFAULT 0,
  `blocked` TINYINT(1) NOT NULL DEFAULT 0,
  `notes` TEXT,
  PRIMARY KEY (`id`),
  UNIQUE KEY (`email`),
  UNIQUE KEY (`username`)
);

CREATE TABLE IF NOT EXISTS project_users (
  `project_id` SMALLINT UNSIGNED NOT NULL,
  `user_id` MEDIUMINT UNSIGNED NOT NULL,
  PRIMARY KEY (`project_id`, `user_id`),
  FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
);

CREATE TABLE IF NOT EXISTS voters (
  registered DATE,
  lastname VARCHAR(20) DEFAULT '' NOT NULL,
  firstname VARCHAR(20) DEFAULT '' NOT NULL,
  middle CHAR(1) DEFAULT '' NOT NULL,
  suffix VARCHAR(3) DEFAULT '' NOT NULL,
  status CHAR(1) DEFAULT '' NOT NULL,
  party VARCHAR(15) DEFAULT '' NOT NULL,
  res_house VARCHAR(20) DEFAULT '' NOT NULL,
  res_frac VARCHAR(10) DEFAULT '' NOT NULL,
  res_apt VARCHAR(15) DEFAULT '' NOT NULL,
  res_street VARCHAR(25) DEFAULT '' NOT NULL,
  res_city VARCHAR(25) DEFAULT '' NOT NULL,
  res_state CHAR(2) DEFAULT '' NOT NULL,
  res_zip CHAR(5) DEFAULT '' NOT NULL,
  res_zip4 CHAR(4) DEFAULT '' NOT NULL,
  precinct TINYINT UNSIGNED,
  ward TINYINT UNSIGNED,
  anc CHAR(2) DEFAULT '' NOT NULL,
  smd CHAR(4) DEFAULT '' NOT NULL,
  h110618g CHAR(1) DEFAULT '' NOT NULL,
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

CREATE TABLE IF NOT EXISTS sessions (
  session_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  expires INT(11) UNSIGNED NOT NULL,
  data TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  PRIMARY KEY (session_id)
);

CREATE TABLE passwordless
(
  `id`     bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `uid`    varchar(160) DEFAULT NULL,
  `token`  varchar(60)         NOT NULL,
  `origin` text,
  `ttl`    bigint(20)   DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id` (`id`),
  UNIQUE KEY `passwordless_token_key` (`token`),
  UNIQUE KEY `passwordless_uid_key` (`uid`)
);
