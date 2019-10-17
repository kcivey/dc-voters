const {after, before, describe, it} = require('mocha');
const {expect} = require('chai');
const testing = require('./lib/testing').create();

before(() => testing.setUp());

after(() => testing.tearDown());

describe(
    'Basic',
    function () {
        it(
            'Failed Login',
            async function () {
                const page = testing.page;
                await page.goto(testing.startUrl);
                const loginHead = await page.$eval('h4.card-title', el => el.textContent);
                expect(loginHead).to.equal('Get Login Link');
                await page.type('#send-token-email', 'nonexistent@example.com');
                await page.click('#send-token-form button');
                const alertSelector = '#send-token-card .alert-danger';
                await page.waitFor(alertSelector, {visible: true});
                const errorAlert = await page.$eval(alertSelector, el => el.textContent);
                expect(errorAlert).to.contain('Problem sending link. Is this email address registered?');
            }
        );
        it(
            'Login',
            async function () {
                const page = testing.page;
                await page.goto(testing.startUrl);
                const loginHead = await page.$eval('h4.card-title', el => el.textContent);
                expect(loginHead).to.equal('Get Login Link');
                await page.type('#send-token-email', 'test@example.com');
                await page.click('#send-token-form button');
                const loginUrl = await testing.waitForLoginUrl();
                await page.goto(loginUrl);
            }
        );
        it(
            'Search',
            async function () {
                const page = testing.page;
                await page.waitFor('#search-button', {visible: true});
                await page.type('#check-form-name', 'ivey,k');
                await page.waitFor('#voter-table tbody td', {visible: true});
                const foundName = await page.$eval('#voter-table tbody td:first-of-type', el => el.textContent);
                expect(foundName).to.equal('IVEY, KEITH C');
            }
        );
        it(
            'Not Found',
            async function () {
                this.timeout(10000);
                const page = testing.page;
                await page.click('.not-found');
                await page.waitFor('#line-form');
                const radio = await page.$('#line-finding-NR:checked');
                expect(radio).not.to.equal(null);
            }
        );
    }
);
