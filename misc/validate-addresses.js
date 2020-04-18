#!/usr/bin/env node

const util = require('util');
const USPS = require('usps-webtools');
const db = require('../lib/db');
const usps = new USPS({
    server: 'https://secure.shippingapis.com/ShippingAPI.dll', // http://production.shippingapis.com/ShippingAPI.dll',
    userId: process.env.USPS_USERNAME,
    ttl: 10000, // TTL in milliseconds for request
});
const verify = util.promisify(usps.verify).bind(usps);

main().then();

async function main() {
    const result = await verify({
        street1: '3828 Georgia Ave NW',
        street2: 'Apt 425',
        city: 'Washington',
        state: 'DC',
    });
    console.warn(result);
}
