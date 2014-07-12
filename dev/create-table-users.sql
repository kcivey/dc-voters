CREATE TABLE users (
  `id` MEDIUMINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(10),
  `password` VARCHAR(64),
  `email` VARCHAR(256),
  `admin` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY (`username`)
);
