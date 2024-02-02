#!/usr/bin/env bash
mysqldump -uroot -p dc_voters \
  circulators \
  invoices \
  notes \
  pages \
  passwordless \
  petition_lines \
  project_users \
  projects \
  sessions \
  users \
  voters_base \
  | gzip > dc_voters-$(date +%F-%H-%M).sql.gz
