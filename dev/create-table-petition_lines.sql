CREATE TABLE petition_lines (
  `id` MEDIUMINT UNSIGNED NOT NULL AUTO_INCREMENT,
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
  `notes` TEXT DEFAULT '' NOT NULL,
  PRIMARY KEY (`id`),
  KEY `page_line` (`page`, `line`),
  KEY (`checker`),
  KEY (`check_time`),
  KEY (`voter_id`),
  KEY (`date_signed`),
  KEY (`finding`),
  KEY (`ward`)
);