ALTER TABLE invoices ADD start_date DATE NOT NULL AFTER circulator_id, ADD end_date DATE NOT NULL AFTER start_date;
