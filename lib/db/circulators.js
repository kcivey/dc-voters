const createError = require('http-errors');
const NumberList = require('number-list');

module.exports = function (db) {

    const {queryPromise} = db;

    // @todo Handle connection of circulators to projects (not in database yet)
    db.createOrUpdateCirculator = function (projectId, id, updates) {
        delete updates.project_id;
        delete updates.id;
        const values = [updates];
        let sql;
        if (updates.hasOwnProperty('notes') && !updates.notes) {
            updates.notes = '';
        }
        if (id) {
            sql = 'UPDATE circulators SET ? WHERE id = ?';
            values.push(id);
        }
        else {
            if (!updates.name) {
                throw createError(400, 'Missing name');
            }
            sql = 'INSERT INTO circulators SET ?';
        }
        return queryPromise(sql, values)
            .then(function (result) {
                if (!result.insertId) {
                    throw createError(500, 'No insert ID');
                }
                return db.getCirculator(result.insertId);
            });
    };

    // @todo Handle connection of circulators to projects (not in database yet)
    db.deleteCirculator = function (projectId, id) {
        return queryPromise('DELETE FROM circulators WHERE id = ?', [id])
            .then(results => results.affectedRows);
    };

    // @todo Handle connection of circulators to projects (not in database yet)
    db.getCirculator = function (projectId, id) {
        return queryPromise('SELECT * FROM circulators WHERE id = ?', [id])
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
            WHERE p.project_id = ?
            GROUP BY c.id ORDER BY c.name`;
        const rows = await queryPromise(sql, [projectId]);
        rows.forEach(function (row) {
            row.pages = row.pages ? NumberList.stringify(row.pages.split(',')) : '';
        });
        return rows;
    };

};
