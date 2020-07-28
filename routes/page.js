const assert = require('assert');
const fs = require('fs').promises;
const path = require('path');
const util = require('util');
const execFile = util.promisify(require('child_process').execFile);
const createError = require('http-errors');
const db = require('../lib/db');
const {getDtParams} = require('../lib/datatables');
const convertCommand = '/usr/bin/convert';
const pdfInfoCommand = '/usr/bin/pdfinfo';

module.exports = {

    assignPages(req, res, next) {
        const pages = req.body;
        if (!Array.isArray(pages) || pages.filter(v => !/^\d+$/.test(v)).length) {
            throw createError(400, 'Invalid pages');
        }
        db.assignPages(req.project.id, req.params.username, pages)
            .then(() => res.sendStatus(204))
            .catch(next);
    },

    createOrUpdatePage(req, res, next) {
        const project = req.project;
        const data = req.body;
        const number = req.params.number;
        const id = data.id;
        const checker = data.checker;
        delete data.checker;
        delete data.circulator_name;
        delete data.date_paid;
        delete data.processed_lines;
        delete data.valid_lines;
        delete data.total_lines;
        db.createOrUpdatePage({project, data, number, id, checker})
            .then(page => res.json(page))
            .catch(next);
    },

    // Return page data in DataTables format
    async dtPages(req, res, next) {
        const projectId = req.project.id;
        const {criteria, search, start, length, order, draw} = getDtParams(req.query);
        const output = {draw};
        order.push('number'); // sort by page if nothing else
        try {
            output.recordsTotal = await db.getPageCount(projectId);
            output.recordsFiltered = await db.getPageCount(projectId, criteria, search);
            output.data = await db.getPages({projectId, criteria, search, start, length, order});
            res.json(output);
        }
        catch (err) {
            next(err); // eslint-disable-line callback-return
        }
    },

    async getPage(req, res, next) {
        const projectId = req.project.id;
        const pageNumber = +req.params.number;
        const page = await db.getPage(projectId, pageNumber);
        if (!page) {
            return next(createError(404, 'No such page'));
        }
        if (+req.query.with_lines) {
            page.lines = await db.getLinesForPage(projectId, pageNumber);
        }
        return res.json(page);
    },

    getPages(req, res, next) {
        db.getPages({projectId: req.project.id})
            .then(rows => res.json(rows))
            .catch(next);
    },

    async uploadPageImages(req, res, next) {
        const project = req.project;
        try {
            assert(project.imageDpi, createError(400, 'No images for this project'));
            assert(req.files.length, createError(400, 'No files in request'));
            const outputDir = path.resolve(__dirname, '../public/page-images/', req.project.code);
            const twoSided = project.getLinesPerPage > 10;
            const numbers = req.body.numbers.split(',');
            res.sendStatus(202);
            let i = 0;
            for (const file of req.files) {
                const inputFile = file.path;
                const startPage = numbers[i] || 1;
                const endPage = await createPageImages({
                    inputFile,
                    startPage,
                    mimeType: file.mimetype,
                    outputDir,
                    twoSided,
                });
                await fs.unlink(inputFile);
                let range = startPage;
                if (endPage !== startPage) {
                    range += '-' + endPage;
                }
                await db.createOrUpdatePage({project, data: {}, number: range});
                i++;
            }
        }
        catch (err) {
            next(err); // eslint-disable-line callback-return
        }
    },

};

async function createPageImages({inputFile, startPage, mimeType, outputDir, twoSided}) {
    const pageCount = await getPageCount(inputFile, mimeType);
    let page = 0;
    for (let i = 0; i < pageCount; i++) {
        page = +startPage + (twoSided ? Math.floor(i / 2) : i);
        const side = twoSided ? (i % 2 ? 'b' : 'a') : '';
        const outputFile = outputDir + '/' + page.toString().padStart(4, '0') + side + '.jpeg';
        const args = [
            '-density',
            '200',
            inputFile + '[' + i + ']',
            '-auto-orient',
            '-resize',
            '1700x', // equivalent to 200 dpi for 8.5in paper
            '-strip',
            '+profile',
            '*',
            '-interlace',
            'plane',
            '-gaussian-blur',
            '0.05',
            '-quality',
            '75%',
            outputFile,
        ];
        await execFile(convertCommand, args);
    }
    return page;
}

async function getPageCount(inputFile, mimeType) {
    if (mimeType !== 'application/pdf') {
        return 1;
    }
    const output = (await execFile(pdfInfoCommand, [inputFile])).stdout;
    const m = output.match(/Pages:\s+(\d+)/);
    assert(m, `No pages in ${inputFile}`);
    return +m[1];
}
