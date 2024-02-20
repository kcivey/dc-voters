ALTER TABLE invoices ADD `check` VARCHAR(16) DEFAULT NULL AFTER date_paid, ADD additional DECIMAL(7,2) AFTER end_date;
