const NumberList = require('number-list');

module.exports = function (db) {

    const {queryPromise, makeSqlCriteria} = db;

    db.getChallengeLines = function (projectId, pages) {
        let sql = 'SELECT l.*, c.status as circulator_status, c.name as circulator_name, ' +
            'c.notes AS circulator_notes ' +
            'FROM petition_lines l LEFT JOIN pages p ON l.project_id = p.project_id AND l.page = p.number ' +
            'LEFT JOIN circulators c ON p.circulator_id = c.id ' +
            'WHERE l.project_id = ?';
        const values = [projectId];
        if (pages) {
            sql += ' AND l.page in (?)';
            values.push(Array.isArray(pages) ? pages : NumberList.parse(pages));
        }
        sql += ' ORDER BY l.page, l.line';
        return queryPromise(sql, values);
    };

    db.getCompletedLines = function (project, findings = []) {
        let sql =
            `SELECT l.*, c.name AS circulator_name, v.party
            FROM petition_lines l LEFT JOIN pages p ON l.project_id = p.project_id AND l.page = p.number
                LEFT JOIN circulators c ON p.circulator_id = c.id
                LEFT JOIN ?? v ON l.voter_id = v.voter_id
            WHERE l.project_id = ? AND l.finding `;
        const values = [project.votersTable, project.id];
        if (findings.length) {
            sql += 'IN (?)';
            values.push(findings);
        }
        else {
            sql += '<> ?';
            values.push('');
        }
        sql += '\nORDER BY page, line';
        return queryPromise(sql, values);
    };

    db.getProcessedLineCount = function (projectId, criteria = {}, search = '') {
        let sql = 'SELECT COUNT(*) AS `count` FROM petition_lines WHERE project_id = ? AND finding <> ?';
        const values = [projectId, ''];
        const [criteriaSql, criteriaValues] = makeSqlCriteria(criteria);
        if (criteriaSql) {
            sql += ' AND ' + criteriaSql;
            values.push(...criteriaValues);
        }
        if (search) {
            const sqlFragments = [];
            const searchPattern = '%' + search + '%';
            for (const column of ['voter_name', 'address', 'checker']) {
                sqlFragments.push('?? LIKE ?');
                values.push(column, searchPattern);
            }
            sql += ' AND (' + sqlFragments.join(' OR ') + ')';
        }
        return queryPromise(sql, values)
            .then(rows => rows[0].count);
    };

    db.getProcessedLines = function ({projectId, criteria, search, start, length, order}) {
        let sql = `SELECT l.*, c.name AS circulator_name
            FROM petition_lines l INNER JOIN pages p ON l.project_id = p.project_id AND l.page = p.number
                LEFT JOIN circulators c ON p.circulator_id = c.id
            WHERE l.project_id = ? AND l.finding <> ?`;
        const values = [projectId, ''];
        const [criteriaSql, criteriaValues] = makeSqlCriteria(criteria);
        if (criteriaSql) {
            sql += ' AND ' + criteriaSql;
            values.push(...criteriaValues);
        }
        if (search) {
            const sqlFragments = [];
            const searchPattern = '%' + search + '%';
            for (const column of ['voter_name', 'address', 'checker']) {
                sqlFragments.push('?? LIKE ?');
                values.push(column, searchPattern);
            }
            sql += ' AND (' + sqlFragments.join(' OR ') + ')';
        }
        if (order) {
            sql += ' ORDER BY ' + order.map(c => 'l.' + c).join(', ');
        }
        sql += ` LIMIT ${+start}, ${+length}`;
        return queryPromise(sql, values);
    };

    db.getLine = function ({projectId, id, page, line}) {
        let sql = 'SELECT * FROM petition_lines WHERE project_id = ? AND ';
        const values = [projectId];
        if (id) {
            sql += 'id = ?';
            values.push(id);
        }
        else {
            sql += 'page = ? AND line = ?';
            values.push(page, line);
        }
        sql += ' LIMIT 1';
        return queryPromise(sql, values)
            .then(rows => rows[0] || null);
    };

    db.getLinesForPage = function (projectId, page) {
        return queryPromise(
            'SELECT * FROM petition_lines WHERE project_id = ? AND page = ? ORDER BY line',
            [projectId, page]
        );
    };

    db.removeExtraneousVotersFromLines = function (projectId) {
        return queryPromise(
            `UPDATE petition_lines SET voter_id = NULL
            WHERE voter_id IS NOT NULL AND project_id = ? AND finding IN (?)`,
            [projectId, ['B', 'I', 'MA', 'NR', 'S']]
        );
    };

    db.getDuplicateLines = function (projectId) {
        const sql =
            `SELECT
                l1.page AS original_page,
                l1.line AS original_line,
                l1.finding AS original_finding,
                l2.page AS duplicate_page,
                l2.line AS duplicate_line,
                l2.finding AS duplicate_finding,
                l2.notes AS duplicate_notes
            FROM petition_lines l1
                INNER JOIN petition_lines l2 ON l1.voter_id = l2.voter_id
            WHERE l1.project_id = ?
                AND l2.project_id = ?
                AND l1.voter_id IS NOT NULL
                AND l1.id < l2.id
                AND l1.finding <> 'D'
                AND l2.finding <> 'D'
                AND (l1.notes NOT LIKE '%Duplicate%' OR l1.notes IS NULL)
                AND (l2.notes NOT LIKE '%Duplicate%' OR l2.notes IS NULL)
                AND l1.id = (
                    SELECT l3.id FROM petition_lines l3
                    WHERE l3.voter_id = l1.voter_id
                    ORDER BY IF(l3.finding = 'OK', 0, 1), id
                    LIMIT 1
                )
            ORDER BY l1.page, l1.line`;
        const values = [projectId, projectId];
        return queryPromise(sql, values);
    };

    // @todo avoid updating if user is not the checker or an admin?
    db.updateLineOrRange = async function ({projectId, id, page, line, updates}) {
        delete updates.project_id;
        delete updates.id;
        delete updates.page;
        delete updates.line;
        let sql = 'UPDATE petition_lines SET ? WHERE project_id = ? AND ';
        const values = [updates, projectId];
        if (id) {
            sql += 'id = ?';
            values.push(id);
        }
        else {
            sql += 'page = ? AND line ';
            values.push(page);
            const [start, end] = line.toString().split('-');
            if (end) {
                sql += 'BETWEEN ? AND ?';
                values.push(start, end);
                line = start; // for returning the first line
            }
            else {
                sql += '= ?';
                values.push(line);
            }
        }
        await queryPromise(sql, values);
        return db.getLine({projectId, id, page, line});
    };

    db.getResponseLinesWithRegisteredVoters = function (project) {
        return queryPromise(
            `SELECT l.page, l.line, v.registered, v.firstname, v.lastname, v.middle, v.suffix,
                v.res_house, v.res_frac, v.res_street, v.res_apt
            FROM petition_lines l INNER JOIN ?? v ON l.voter_id = v.voter_id
            WHERE l.project_id = ? AND l.finding = ?
            ORDER BY page, line`,
            [project.votersTable, project.id, 'OK']
        );
    };

    db.getResponseAddressChanges = function (project) {
        return queryPromise(
            `SELECT l.page, l.line, l.address, v.registered, v.firstname, v.lastname, v.middle, v.suffix,
                v.res_house, v.res_frac, v.res_street, v.res_apt
            FROM petition_lines l INNER JOIN ?? v ON l.voter_id = v.voter_id
            WHERE l.project_id = ? AND l.finding = ?
            ORDER BY lastname, firstname, middle, suffix, page, line`,
            [project.votersTable, project.id, 'A']
        );
    };

    db.getLineCountsForCirculator = function ({project, circulatorId, startDate, endDate}) {
        let sql =
            `SELECT SUM(IF(l.finding = 'OK', 1, 0)) AS valid,
                SUM(IF(l.finding NOT IN ('S', ''), 1, 0)) AS processed,
                SUM(IF(l.finding <> 'B', 1, 0)) AS nonblank
            FROM petition_lines l INNER JOIN pages p
                ON l.project_id = p.project_id AND l.page = p.number
            WHERE l.project_id = ? AND p.circulator_id = ?`;
        const values = [project.id, circulatorId];
        if (startDate) {
            sql += ' AND p.date_checked >= ?';
            values.push(startDate);
        }
        if (endDate) {
            sql += ' AND p.date_checked <= ?';
            values.push(endDate);
        }
        return queryPromise(sql, values);
    };

};
