const createError = require('http-errors');
const NumberList = require('number-list');

module.exports = function (db) {

    const {queryPromise} = db;

    db.assignPages = async function (projectId, username, pages) {
        const user = await db.getUser({username});
        if (!user) {
            throw createError(404, 'User does not exist');
        }
        return queryPromise(
            'UPDATE petition_lines SET checker = ? WHERE project_id = ? AND finding = ? AND page IN (?)',
            [username, projectId, '', pages],
        )
            .then(results => results.affectedRows);
    };

    db.createOrUpdatePage = async function ({projectId, data, number, id, checker}) {
        const pageData = {...data}; // clone
        delete pageData.project_id;
        delete pageData.id;
        delete pageData.number;
        if (pageData.date_signed) {
            pageData.date_signed = pageData.date_signed
                .replace(/^(\d+)\/(\d+)\/(\d+)$/, '$3-$1-$2');
        }
        let numbers;
        let sql;
        let values;
        if (id) {
            sql = 'UPDATE pages SET ? WHERE id = ? AND project_id = ? AND number = ?';
            values = [pageData, id, projectId, number];
            numbers = [number];
        }
        else if (!number) {
            throw createError(400, 'Missing page number');
        }
        else {
            if (pageData.hasOwnProperty('notes') && !pageData.notes) {
                pageData.notes = ''; // can't set default in table for text column
            }
            pageData.project_id = projectId;
            sql = 'INSERT INTO pages (??) VALUES ?';
            pageData.number = null; // just to set in keys
            const columnNames = Object.keys(pageData);
            numbers = NumberList.parse(number);
            const valuesForPageRecords = numbers.map(function (n) {
                pageData.number = n;
                return Object.values(pageData);
            });
            values = [columnNames, valuesForPageRecords];
            number = numbers[0];
        }
        await queryPromise(sql, values);
        if (!checker) {
            checker = null;
        }
        const linesPerPage = 20;
        const valuesForLineRecords = [];
        for (const n of numbers) {
            for (let line = 1; line <= linesPerPage; line++) {
                valuesForLineRecords.push([projectId, n, line]);
            }
        }
        await queryPromise(
            'INSERT IGNORE INTO petition_lines (project_id, page, line) VALUES ?',
            [valuesForLineRecords]
        );
        if (checker) {
            await db.assignPages(projectId, checker, numbers);
        }
        return queryPromise(
            'SELECT * FROM pages WHERE project_id = ? AND number = ?',
            [projectId, number]
        )
            .then(rows => rows[0]);
    };

    db.getPage = function (projectId, pageNumber) {
        const sql = 'SELECT * FROM pages WHERE project_id = ? AND number = ?';
        return queryPromise(sql, [projectId, pageNumber])
            .then(rows => rows[0]);
    };

    db.getPages = function (projectId) {
        const sql = 'SELECT p.*, c.name AS circulator_name, ' +
            "SUM(IF(l.finding IN ('', 'S'), 0, 1)) AS processed_lines, " +
            'COUNT(l.id) AS total_lines, ' +
            'GROUP_CONCAT(DISTINCT l.checker ORDER BY l.checker) AS checker ' +
            'FROM pages p LEFT JOIN circulators c ON p.circulator_id = c.id ' +
            'INNER JOIN petition_lines l ON p.project_id = l.project_id AND p.number = l.page ' +
            'WHERE p.project_id = ? ' +
            'GROUP BY p.number ORDER BY p.number';
        return queryPromise(sql, [projectId]);
    };

};
