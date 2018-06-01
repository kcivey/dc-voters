dc-voters
=========

Searching registered voter records for the District of Columbia

Getting voter file
------------------

Get voter file from the DC Board of Elections in Excel format. To convert to CSV, use ssconvert utility
from gnumeric package (can be installed on Ubuntu with `apt install gnumeric`).

    ssconvert voters.xlsx voters.csv
