ALTER TABLE projects MODIFY `pay_per_signature` VARCHAR(64);
ALTER TABLE invoices ADD `detail` TEXT AFTER notes;
