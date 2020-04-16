#!/usr/bin/env node

const db = require('../lib/db');
const streetAbbrev = {
    STREET: 'ST',
    ROAD: 'RD',
    DRIVE: 'DR',
    AVENUE: 'AVE',
    COURT: 'CT',
    LANE: 'LN',
    TERRACE: 'TER',
    CIRCLE: 'CIR',
    BOULEVARD: 'BLVD',
    HIGHWAY: 'HWY',
    PLACE: 'PL',
};
const streetAbbrevRegexp = new RegExp('\\b(' + Object.keys(streetAbbrev).join('|') + ')\\b');
const ordinalAbbrev = {
    FIRST: '1ST',
    SECOND: '2ND',
    THIRD: '3RD',
    FOURTH: '4TH',
    FIFTH: '5TH',
    SIXTH: '6TH',
    SEVENTH: '7TH',
    EIGHTH: '8TH',
    NINTH: '9TH',
    TENTH: '10TH',
    ELEVENTH: '11TH',
    TWELFTH: '12TH',
    THIRTEENTH: '13TH',
    FOURTEENTH: '14TH',
    FIFTEENTH: '15TH',
    SIXTEENTH: '16TH',
    SEVENTEENTH: '17TH',
    EIGHTEENTH: '18TH',
    NINETEENTH: '19TH',
    TWENTIETH: '20TH',
};
const ordinalAbbrevRegexp = new RegExp('\\b(' + Object.keys(ordinalAbbrev).join('|') + ')\\b');
const stateAbbrToName = getStateAbbrToName();

main()
    .catch(console.trace)
    .finally(() => db.close());

async function main() {
    const rawAddresses = (await db.queryPromise(
        `SELECT DISTINCT(address_line_1) AS raw_address
         FROM i71
         WHERE address_line_1 > '1'
         AND normalized_address IS NULL
         ORDER BY raw_address`
    ))
        .map(r => r.raw_address);
    for (const rawAddress of rawAddresses) {
        const address = normalizeAddress(rawAddress);
        console.log(rawAddress, address);
        await db.queryPromise(
            'UPDATE i71 SET normalized_address = ? WHERE address_line_1 = ?',
            [address, rawAddress]
        );
    }
}

function normalizeAddress(address) {
    return address.toUpperCase()
        .replace(/[ ,]*,[ ,]*/g, ' ')
        .replace(/\./g, '')
        .replace(/'/g, '')
        .replace(/[()]/, '')
        .replace(/ [\d -]+$/, '') // remove zip
        .replace(/[- ]*-[- ]*/g, ' ')
        .replace(/^(?:SUITE|STE|APT|APARTMENT|UNIT)[ #]+\S+ /, '')
        .replace(/\b(?:SUITE|STE|APT|APARTMENT|UNIT)[ #]+/, '#')
        .replace(/ 1\/2\b/, '')
        .replace(/# /, '#')
        .replace(/( [NS][EW] )\S+ (?=WASHINGTON)/, '$1') // apt number with no #
        .replace(/ FL(?:OOR)? \d\d?(?:[NR]?D|ST|TH)?(?: |$)/, ' ')
        .replace(/ \d\d?(?:[NR]?D|ST|TH)? FL(?:OOR)?(?: |$)/, ' ')
        .replace(/ E CAPITOL/, ' EAST CAPITOL')
        .replace(/ N (CAPITOL|CAROLINA|DAKOTA)/, ' NORTH $1')
        .replace(/ S (CAPITOL|CAROLINA|DAKOTA)/, ' SOUTH $1')
        .replace(/ N (HAMPSHIRE|JERSEY|MEXICO)/, ' NEW $1')
        .replace(/ VIRGINIA$/, ' VA')
        .replace(/ MARYLAND$/, ' MD')
        .replace(/ DISTRICT OF COLUMBIA$/, ' DC')
        .replace(/ ([NS]) ([EW]) /, ' $1$2 ')
        .replace(/^(\d+\S*) ([NS][EW]) (.+)(?= WASHINGTON DC$)/, '$1 $3 $2')
        .replace(/ MC LEAN /g, ' MCLEAN ')
        .replace(/( \w+)(\1 [A-Z]{2})$/, '$2') // remove repeated city
        .replace(/( \w+ [A-Z]{2})\1$/, '$1') // remove repeated city and state
        .replace(/ #\S+/, '') // remove apartment number
        .replace(/\W+/g, ' ')
        .replace(streetAbbrevRegexp, (m, p1) => streetAbbrev[p1])
        .replace(/ EYE ST /, ' I ST ')
        .replace(/ QUE ST /, ' Q ST ')
        .replace(/ AV /, ' AVE ')
        .replace(/ MASS AVE/, ' MASSACHUSETTS AVE')
        .replace(/ CONN AVE/, ' CONNECTICUT AVE')
        .replace(/ (?:MARTIN L(?:UTHER)? KING|MLK|M L K)(?:J\W+)?\b/, ' MARTIN LUTHER KING')
        .replace(ordinalAbbrevRegexp, (m, p1) => ordinalAbbrev[p1])
        .replace(/\b([A-Z]{2})(?= AVE)/, (m, p1) => (stateAbbrToName[p1] || p1).toUpperCase())
        .replace(/ NORTHEAST$/, ' NE')
        .replace(/ NORTHWEST$/, ' NW')
        .replace(/ SOUTHEAST$/, ' SE')
        .replace(/ SOUTHWEST$/, ' SW')
        .trim();
}

function getStateAbbrToName() {
    return {
        AL: 'Alabama',
        AK: 'Alaska',
        AZ: 'Arizona',
        AR: 'Arkansas',
        CA: 'California',
        CO: 'Colorado',
        CT: 'Connecticut',
        DE: 'Delaware',
        DC: 'District of Columbia',
        FL: 'Florida',
        GA: 'Georgia',
        HI: 'Hawaii',
        ID: 'Idaho',
        IL: 'Illinois',
        IN: 'Indiana',
        IA: 'Iowa',
        KS: 'Kansas',
        KY: 'Kentucky',
        LA: 'Louisiana',
        ME: 'Maine',
        MD: 'Maryland',
        MA: 'Massachusetts',
        MI: 'Michigan',
        MN: 'Minnesota',
        MS: 'Mississippi',
        MO: 'Missouri',
        MT: 'Montana',
        NE: 'Nebraska',
        NV: 'Nevada',
        NH: 'New Hampshire',
        NJ: 'New Jersey',
        NM: 'New Mexico',
        NY: 'New York',
        NC: 'North Carolina',
        ND: 'North Dakota',
        OH: 'Ohio',
        OK: 'Oklahoma',
        OR: 'Oregon',
        PA: 'Pennsylvania',
        RI: 'Rhode Island',
        SC: 'South Carolina',
        SD: 'South Dakota',
        TN: 'Tennessee',
        TX: 'Texas',
        UT: 'Utah',
        VT: 'Vermont',
        VA: 'Virginia',
        WA: 'Washington',
        WV: 'West Virginia',
        WI: 'Wisconsin',
        WY: 'Wyoming',
        AS: 'American Samoa',
        GU: 'Guam',
        MP: 'Northern Mariana Islands',
        PR: 'Puerto Rico',
        VI: 'Virgin Islands',
    };
}
