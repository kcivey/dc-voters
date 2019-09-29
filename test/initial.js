/* globals after before describe it */

const {spawn} = require('child_process');
const path = require('path');
const {expect} = require('chai');
const puppeteer = require('puppeteer');
const MailDev = require('maildev');
let port = 3000;
let maildev;
let browser;
let serverProcess;
let loginUrl;
let page;

before(
    function () {
        return new Promise(function (resolve, reject) {
            let started = false;
            startServer();
            function startServer() {
                serverProcess = spawn(
                    'npm',
                    ['start'],
                    {
                        cwd: path.dirname(__dirname),
                        env: {
                            PORT: port,
                            PATH: process.env.PATH,
                            EMAIL_USER: '',
                            EMAIL_PASSWORD: '',
                            EMAIL_HOST: 'localhost',
                            EMAIL_PORT: 1025,
                            EMAIL_SSL: false,
                            EMAIL_TLS: false,
                        },
                        detached: true,
                    }
                );
                serverProcess.on('error', reject);
                serverProcess.stderr.setEncoding('utf8');
                serverProcess.stdout.setEncoding('utf8');
                serverProcess.stderr.on('data', console.error);
                serverProcess.stdout.on('data', function (data) {
                    if (/listening on port/.test(data)) {
                        started = true;
                        resolve();
                    }
                });
                serverProcess.on('exit', function (code, signal) {
                    if (code || signal !== 'SIGTERM') {
                        console.log(`Server exited with code ${code} on signal ${signal}`);
                    }
                    if (port > 3200) {
                        reject(new Error('No port found'));
                    }
                    else if (!started) {
                        port++;
                        startServer();
                    }
                });
            }
        })
            .then(async function () {
                browser = await puppeteer.launch();
                page = await browser.newPage();
                await page.setViewport({width: 1200, height: 800});
                page.on('pageerror', function (err) {
                    throw err;
                });
            })
            .then(function () {
                maildev = new MailDev({silent: true});
                maildev.listen();
                maildev.on('new', function (email) {
                    const m = email.text.match(/http:\/\/\S+/);
                    loginUrl = m[0];
                });
            });
    }
);

after(
    function (done) {
        browser.close()
            .then(function () {
                process.kill(-serverProcess.pid); // negative means kill all processes in process group
                maildev.close(done);
            });
    }
);

describe(
    'Basic',
    function () {
        it(
            'Login',
            async function () {
                await page.goto(`http://localhost:${port}`);
                const loginHead = await page.$eval('h4.card-title', el => el.textContent);
                expect(loginHead).to.equal('Get Login Link');
                await page.type('#send-token-email', 'keith@iveys.org');
                await page.click('#send-token-form button');
                await waitForLoginUrl();
            }
        );
        it(
            'Search',
            async function () {
                await page.goto(loginUrl);
                await page.waitFor('#check-button', {visible: true});
                await page.click('#check-button');
                await page.type('#search-form-name', 'ivey,k');
                await page.waitFor('#voter-table tbody td', {visible: true});
                const foundName = await page.$eval('#voter-table tbody td:first-of-type', el => el.textContent);
                expect(foundName).to.equal('IVEY, KEITH C');
            }
        );
        it(
            'Not Found',
            async function () {
                this.timeout(10000);
                await page.click('.not-found');
                await page.waitFor('#line-form');
                await page.waitFor(2000);
                await page.screenshot({path: 'example.png'});
                const radio = await page.$('#line-finding-NR:checked');
                expect(radio).not.to.equal(null);
            }
        );
    }
);

function waitForLoginUrl() {
    return new Promise(function (resolve, reject) {
        const interval = 200;
        const repeats = 10;
        let count = 0;
        check();
        function check() {
            count++;
            if (loginUrl) {
                resolve(loginUrl);
            }
            else if (count > repeats) {
                reject(new Error("Didn't get email"));
            }
            else {
                setTimeout(check, interval);
            }
        }
    });
}
