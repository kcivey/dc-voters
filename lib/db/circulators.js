const createError = require('http-errors');
const NumberList = require('number-list');

module.exports = function (db) {

    const {queryPromise} = db;

    db.createOrUpdateCirculator = function (projectId, id, updates) {
        delete updates.project_id;
        delete updates.id;
        const values = [updates];
        let sql;
        if (updates.hasOwnProperty('notes') && !updates.notes) {
            updates.notes = '';
        }
        if (updates.hasOwnProperty('number') && !updates.number) {
            updates.number = null;
        }
        if (id) {
            sql = 'UPDATE circulators SET ? WHERE project_id = ? AND id = ?';
            values.push(projectId, id);
        }
        else {
            if (!updates.name) {
                throw createError(400, 'Missing name');
            }
            updates.project_id = projectId;
            sql = 'INSERT INTO circulators SET ?';
        }
        return queryPromise(sql, values)
            .then(function (result) {
                if (!id) {
                    id = result.insertId;
                }
                if (!id) {
                    throw createError(500, 'No insert ID');
                }
                return db.getCirculator(projectId, id);
            });
    };

    db.deleteCirculator = function (projectId, id) {
        return queryPromise(
            'DELETE FROM circulators WHERE project_id = ? AND id = ?',
            [projectId, id]
        )
            .then(results => results.affectedRows);
    };

    db.getCirculator = function (projectId, id) {
        return queryPromise(
            'SELECT * FROM circulators WHERE project_id = ? AND id = ?',
            [projectId, id]
        )
            .then(rows => rows[0] || null);
    };

    db.getCirculatorsForProject = async function (projectId) {
        await queryPromise('SET group_concat_max_len = 8192'); // so GROUP_CONCAT can get all pages
        const sql =
            `SELECT c.*, COUNT(DISTINCT p.number) AS page_count,
                GROUP_CONCAT(DISTINCT p.number ORDER BY p.number) AS pages,
                SUM(CASE WHEN l.finding NOT IN ('', 'S', 'B') THEN 1 ELSE 0 END) AS processed_lines,
                SUM(CASE WHEN l.finding = 'OK' THEN 1 ELSE 0 END) AS valid_lines
            FROM circulators c LEFT JOIN pages p ON p.circulator_id = c.id
                LEFT JOIN petition_lines l ON l.project_id = p.project_id AND l.page = p.number
            WHERE c.project_id = ?
            GROUP BY c.id ORDER BY c.name`;
        const rows = await queryPromise(sql, [projectId]);
        rows.forEach(function (row) {
            row.pages = row.pages ? NumberList.stringify(row.pages.split(',')) : '';
        });
        return rows;
    };

    db.getNextCirculatorNumber = function (projectId) {
        return queryPromise(
            'SELECT MAX(number) AS max FROM circulators WHERE project_id = ?',
            [projectId]
        )
            .then(rows => (rows[0].max || 0) + 1);
    };

};
