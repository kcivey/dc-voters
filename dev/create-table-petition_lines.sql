CREATE TABLE petition_lines (
  `id` MEDIUMINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `page` SMALLINT UNSIGNED NOT NULL,
  `line` TINYINT UNSIGNED NOT NULL,
  `checker` VARCHAR(10) DEFAULT '' NOT NULL,
  `boe_markings` VARCHAR(255) DEFAULT '' NOT NULL,
  `voter_id` VARCHAR(10) DEFAULT '' NOT NULL,
  `dcpt_code` VARCHAR(10) DEFAULT '' NOT NULL,
  `voter_name` VARCHAR(255) DEFAULT '' NOT NULL,
  `address` VARCHAR(255) DEFAULT '' NOT NULL,
  `ward` VARCHAR(1) DEFAULT '' NOT NULL,
  `notes` TEXT DEFAULT '' NOT NULL,
  PRIMARY KEY (`id`),
  KEY `page_line` (`page`, `line`),
  KEY (`checker`),
  KEY (`ward`)
);
