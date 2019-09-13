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
            values.push(NumberList.parse(pages));
        }
        sql += ' ORDER BY l.page, l.line';
        return queryPromise(sql, values);
    };

    db.getCompletedLines = function (projectId, party) {
        let sql = 'SELECT l.*, c.name AS circulator_name';
        if (party) {
            sql += ', v.party';
        }
        sql += ` FROM petition_lines l LEFT JOIN pages p ON l.project_id = p.project_id AND l.page = p.number
            LEFT JOIN circulators c ON p.circulator_id = c.id
            LEFT JOIN voters v ON l.voter_id = v.voter_id
            WHERE l.project_id = ? AND l.finding <> '' ORDER BY page, line`;
        return queryPromise(sql, [projectId]);
    };

    db.getProcessedLineCount = function (projectId, criteria = {}) {
        let sql = 'SELECT COUNT(*) AS `count` FROM petition_lines WHERE project_id = ? AND finding <> ?';
        const values = [projectId, ''];
        const [criteriaSql, criteriaValues] = makeSqlCriteria(criteria);
        if (criteriaSql) {
            sql += ' AND ' + criteriaSql;
            values.push(...criteriaValues);
        }
        return queryPromise(sql, values)
            .then(rows => rows[0].count);
    };

    db.getProcessedLines = function ({projectId, criteria, search, start, length, order}) {
        const searchColumns = ['voter_name', 'address', 'checker'];
        let sql = 'SELECT * FROM petition_lines WHERE project_id = ? AND finding <> ?';
        const values = [projectId, ''];
        const [criteriaSql, criteriaValues] = makeSqlCriteria(criteria);
        if (criteriaSql) {
            sql += ' AND ' + criteriaSql;
            values.push(...criteriaValues);
        }
        if (search) {
            const sqlFragments = [];
            const searchPattern = '%' + search + '%';
            for (const column of searchColumns) {
                sqlFragments.push('?? LIKE ?');
                values.push(column, searchPattern);
            }
            sql += ' AND (' + sqlFragments.join(' OR ') + ')';
        }
        if (order) {
            sql += ' ORDER BY ' + order.join(', ');
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

};
