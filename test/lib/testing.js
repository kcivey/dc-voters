const {spawn} = require('child_process');
const path = require('path');
const puppeteer = require('puppeteer');
const MailDev = require('maildev');

class Testing {

    constructor() {
        this.maildev = null;
        this.browser = null;
        this.page = null;
        this.serverProcess = null;
        this.startUrl = null;
        this.loginUrl = null;
    }

    setUp() {
        const that = this;
        const serverStart = new Promise(function (resolve, reject) {
            let started = false;
            startServer();

            function startServer() {
                let port = 3000;
                const serverProcess = spawn(
                    'npm',
                    ['start'],
                    {
                        cwd: path.normalize(__dirname + '/../..'),
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
                        const startUrl = `http://localhost:${port}`;
                        resolve([serverProcess, startUrl]);
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
            .then(results => [this.serverProcess, this.startUrl] = results);
        return Promise.all([serverStart, startMailServer(), startBrowser()]);

        function startMailServer() {
            that.maildev = new MailDev({silent: true});
            that.maildev.listen();
            that.maildev.on('new', function (email) {
                const m = email.text.match(/http:\/\/\S+/);
                that.loginUrl = m[0];
            });
        }

        async function startBrowser() {
            const browser = await puppeteer.launch();
            const page = await browser.newPage();
            page.on('pageerror', function (err) {
                throw err;
            });
            that.browser = browser;
            that.page = page;
        }

    }

    tearDown() {
        process.kill(-this.serverProcess.pid); // negative means kill all processes in process group
        return Promise.all([
            this.browser.close(),
            new Promise(resolve => this.maildev.close(resolve)),
        ]);
    }

    waitForLoginUrl() {
        const that = this;
        return new Promise(function (resolve, reject) {
            const interval = 200;
            const repeats = 10;
            let count = 0;
            check();
            function check() {
                count++;
                if (that.loginUrl) {
                    resolve(that.loginUrl);
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

}

function create() {
    return new Testing();
}

module.exports = {Testing, create};
