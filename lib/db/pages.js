const createError = require('http-errors');
const NumberList = require('number-list');

module.exports = function (db) {

    const {queryPromise, makeSqlCriteria} = db;

    db.assignPages = async function (projectId, username, pages) {
        const user = await db.getUser({username});
        if (!user) {
            throw createError(404, 'User does not exist');
        }
        return queryPromise(
            `UPDATE petition_lines SET checker = ?
            WHERE project_id = ? AND finding = ? AND page IN (?)`,
            [username, projectId, '', pages]
        )
            .then(results => results.affectedRows);
    };

    db.createOrUpdatePage = async function ({project, data, number, id, checker}) {
        const pageData = {...data}; // clone
        delete pageData.project_id;
        delete pageData.id;
        delete pageData.number;
        if (pageData.date_signed) {
            pageData.date_signed = pageData.date_signed
                .replace(/^(\d+)\/(\d+)\/(\d+)$/, '$3-$1-$2');
        }
        const projectId = project.id;
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
            sql = 'INSERT IGNORE INTO pages (??) VALUES ?';
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
        const linesPerPage = project.linesPerPage;
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
        return db.getPages({projectId, criteria: {'p.number': pageNumber}})
            .then(rows => rows[0]);
    };

    db.getPageCount = function (projectId, criteria = {}, search = '') {
        let sql = 'SELECT COUNT(DISTINCT p.number) AS count ' +
            'FROM pages p LEFT JOIN circulators c ON p.circulator_id = c.id ' +
            'INNER JOIN petition_lines l ON p.project_id = l.project_id AND p.number = l.page ' +
            'LEFT JOIN invoices i ON p.invoice_id = i.id ' +
            'WHERE p.project_id = ?';
        const values = [projectId];
        const [criteriaSql, criteriaValues] = makeSqlCriteria(criteria);
        if (criteriaSql) {
            sql += ' AND ' + criteriaSql;
            values.push(...criteriaValues);
        }
        if (search) {
            const sqlFragments = [];
            const searchPattern = '%' + search + '%';
            for (const column of ['l.checker', 'c.name', 'p.notes']) {
                sqlFragments.push('?? LIKE ?');
                values.push(column, searchPattern);
            }
            sql += ' AND (' + sqlFragments.join(' OR ') + ')';
        }
        return queryPromise(sql, values)
            .then(rows => rows[0].count);
    };

    db.getPages = function ({projectId, criteria, search = '', start = 0, length = 1000, order = ['number']}) {
        let sql = 'SELECT p.*, c.name AS circulator_name, i.date_paid, ' +
            'SUM(IF(l.challenged, 1, 0)) AS challenged_lines, ' +
            "SUM(IF(l.finding IN ('', 'S'), 0, 1)) AS processed_lines, " +
            "SUM(IF(l.finding = 'OK', 1, 0)) AS valid_lines, " +
            'COUNT(l.id) AS total_lines, ' +
            'GROUP_CONCAT(DISTINCT l.checker ORDER BY l.checker) AS checker ' +
            'FROM pages p LEFT JOIN circulators c ON p.circulator_id = c.id ' +
            'INNER JOIN petition_lines l ON p.project_id = l.project_id AND p.number = l.page ' +
            'LEFT JOIN invoices i ON p.invoice_id = i.id ' +
            'WHERE p.project_id = ?';
        const values = [projectId];
        const [criteriaSql, criteriaValues] = makeSqlCriteria(criteria);
        if (criteriaSql) {
            sql += ' AND ' + criteriaSql;
            values.push(...criteriaValues);
        }
        if (search) {
            const sqlFragments = [];
            const searchPattern = '%' + search + '%';
            for (const column of ['l.checker', 'c.name', 'p.notes']) {
                sqlFragments.push('?? LIKE ?');
                values.push(column, searchPattern);
            }
            sql += ' AND (' + sqlFragments.join(' OR ') + ')';
        }
        sql += ' GROUP BY p.number';
        sql += ' ORDER BY ' + order.map(c => 'p.' + c).join(', ');
        sql += ` LIMIT ${+start}, ${+length}`;
        return queryPromise(sql, values);
    };

    db.updateProcessedLines = function (project) {
        const projectId = project.id;
        const sql =
            `UPDATE pages p
            SET processed_lines = (
                    SELECT COUNT(*) FROM petition_lines l
                    WHERE l.project_id = p.project_id
                        AND l.page = p.number
                        AND finding NOT IN ('S', '')
                ),
                valid_lines = (
                    SELECT COUNT(*) FROM petition_lines l
                    WHERE l.project_id = p.project_id
                        AND l.page = p.number
                        AND finding = 'OK'
                )
                WHERE project_id = ?
                  AND (processed_lines IS NULL OR processed_lines < ?)`;
        return queryPromise(sql, [projectId, project.linesPerPage])
            .then(function () {
                const sql =
                    `UPDATE pages p
                    SET p.date_checked = (
                        SELECT DATE(MAX(l.check_time))
                        FROM petition_lines l
                        WHERE l.project_id = p.project_id
                            AND l.page = p.number
                    )
                    WHERE project_id = ?
                        AND processed_lines = ?
                        AND date_checked IS NULL`;
                return queryPromise(sql, [projectId, project.linesPerPage]);
            });
    };

    db.getUnpaidPagesForCirculator = function ({project, circulatorId, startDate, endDate}) {
        const sql =
            `SELECT * FROM pages
            WHERE project_id = ?
                AND circulator_id = ?
                AND date_checked BETWEEN ? AND ?
                AND invoice_id IS NULL`;
        return queryPromise(sql, [project.id, circulatorId, startDate, endDate]);
    };

};
