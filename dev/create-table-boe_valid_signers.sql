CREATE TABLE boe_valid_signers (
  `id` MEDIUMINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `page` SMALLINT UNSIGNED NOT NULL,
  `line` TINYINT UNSIGNED NOT NULL,
  `voter_id` VARCHAR(10) DEFAULT '' NOT NULL,
  `signed_by` VARCHAR(255) DEFAULT '' NOT NULL,
  PRIMARY KEY (`id`),
  KEY `page_line` (`page`, `line`),
  KEY (`voter_id`)
);
