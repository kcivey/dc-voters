ALTER TABLE projects ADD `paid_circulators` TINYINT(1) NOT NULL DEFAULT 0, ADD `pay_per_signature` DECIMAL(4,2),
    MODIFY `type` ENUM('petition', 'challenge', 'response') NOT NULL DEFAULT 'petition';
ALTER TABLE circulators ADD `pay_per_signature` DECIMAL(4,2);
CREATE TABLE IF NOT EXISTS invoices (
    `id` MEDIUMINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `project_id` SMALLINT UNSIGNED NOT NULL,
    `number` MEDIUMINT UNSIGNED NOT NULL,
    `date_created` DATE NOT NULL,
    `date_paid` DATE NOT NULL,
    `circulator_id` MEDIUMINT UNSIGNED NOT NULL,
    `amount` DECIMAL(7,2) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY (`project_id`, `number`),
    FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`),
    FOREIGN KEY (`circulator_id`) REFERENCES `circulators` (`id`)
);
ALTER TABLE pages ADD `invoice_id` MEDIUMINT UNSIGNED, ADD FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`);
