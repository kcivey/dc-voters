CREATE TABLE users (
  `id` MEDIUMINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(10),
  `password` VARCHAR(64),
  PRIMARY KEY (`id`),
  UNIQUE KEY (`username`)
);
