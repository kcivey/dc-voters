CREATE TABLE notes (
  `id` MEDIUMINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id` SMALLINT UNSIGNED NOT NULL,
  `user_id` MEDIUMINT UNSIGNED NOT NULL,
  `voter_id` INT UNSIGNED DEFAULT NULL,
  `name` VARCHAR(255) NOT NULL,
  `address` VARCHAR(255) NOT NULL,
  `note_text` TEXT,
  `note_time` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY (`project_id`, `voter_id`, `user_id`),
  FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
);
