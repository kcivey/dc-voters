dc-voters
=========

Searching registered voter records for the District of Columbia

Getting voter file
------------------

Get voter file from the DC Board of Elections in Excel format. To convert to CSV, use ssconvert utility
from gnumeric package (can be installed on Ubuntu with `apt install gnumeric`). This takes a lot of
memory; I had to close some other programs when running with 8 GB.

    ssconvert voters.xlsx voters.csv

Remove extraneous backslashes that are somehow in BOE's file:

    perl -pi.bak -e's/\\//g' voters.csv

Setting up database
-------------------

    mysql -uvoter -p dc_voters < create-tables.sql
    ./create-lines-table.js
    ./add-user.js admin 1234 --admin
