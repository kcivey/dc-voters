#!/usr/bin/env node

const db = require('../lib/db');

main()
    .catch(console.trace)
    .finally(() => db.close());

async function main() {
}

/*

create table voters_extra (
    voter_id int unsigned not null,
    address varchar(255),
    van_id varchar(32),
    primary key (voter_id),
    index (address)
);

insert into voters_extra
select voter_id,
    ucase(trim(
        replace(
            concat(
                res_house,
                ' ',
                res_street
            ),
            '  ',
            ' '
        )
    )) as address,
    null
from voters_20200513;

create table voters_van (
    voter_file_vanid varchar(32),
    maddress varchar(255),
    mcity varchar(32),
    mstate varchar(2),
    mzip5 varchar(5),
    mzip4 varchar(4),
    sex char(1),
    address varchar(255),
    city varchar(32),
    state varchar(2),
    zip5 varchar(5),
    zip4 varchar(4),
    lastname varchar(255),
    firstname varchar(255),
    middlename varchar(255),
    suffix varchar(255),
    preferredemail varchar(255),
    preferred_phone varchar(255),
    cell_phone varchar(255),
    dob varchar(255),
    home_phone varchar(255),
    vendorid varchar(255),
    primary key (voter_file_vanid)
);

load data local infile 'ForKeith20200522-15489295435.txt' into table voters_van
fields terminated by '\t' optionally enclosed by '"' lines terminated by '\n' ignore 1 lines;
load data local infile 'ForKeith20200522-3359558114.txt' into table voters_van
fields terminated by '\t' optionally enclosed by '"' lines terminated by '\n' ignore 1 lines;
load data local infile 'ForKeith20200522-3762549314.txt' into table voters_van
fields terminated by '\t' optionally enclosed by '"' lines terminated by '\n' ignore 1 lines;
load data local infile 'ForKeith20200522-4017312623.txt' into table voters_van
fields terminated by '\t' optionally enclosed by '"' lines terminated by '\n' ignore 1 lines;
load data local infile 'ForKeith20200522-4149674031.txt' into table voters_van
fields terminated by '\t' optionally enclosed by '"' lines terminated by '\n' ignore 1 lines;

 */
