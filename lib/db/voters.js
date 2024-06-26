module.exports = function (db) {

    const {queryPromise, makeSqlCriteria} = db;

    db.searchForVoter = function ({q, voterId, name, address, limit, votersTable, projectId = 0}) {
        limit = Math.min(100, Math.max(0, Math.round(+limit))) || 10;
        const checkForDuplicates = !!projectId;
        let explanation = '';
        let match = '';
        if (q) {
            match = 'MATCH (v.firstname, v.lastname, v.res_house, v.res_street) AGAINST (? IN BOOLEAN MODE)';
            explanation += 'General query: ' + q + '\n';
        }
        let sql = 'SELECT v.registered, v.lastname, v.firstname, v.middle, v.suffix, v.status, v.res_house, ' +
            'v.res_frac, v.res_apt, v.res_street, v.ward, v.voter_id, v.party';
        const values = [];
        if (match) {
            sql += ', ' + match + ' AS score';
            values.push(q);
        }
        if (checkForDuplicates) {
            sql += ', p.page AS duplicate_page, p.line AS duplicate_line, p.date_signed AS duplicate_date';
        }
        sql += ' FROM ?? v';
        values.push(votersTable);
        if (checkForDuplicates) {
            sql += ' LEFT JOIN petition_lines p ON v.voter_id = p.voter_id AND p.finding = ? AND p.project_id = ?';
            values.push('OK', projectId);
        }
        sql += ' WHERE 1';
        if (name) {
            const m = /^(.*?)\s*,\s*(.+)/.exec(name);
            if (m) {
                sql += ' AND v.firstname LIKE ?';
                values.push(m[2] + '%');
                name = m[1];
                explanation += 'First name: ' + m[2] + '*\n';
            }
            if (name) {
                name = name.replace(/\s*,\s*$/, '');
                sql += ' AND v.lastname LIKE ?';
                values.push(name + '%');
                explanation += 'Last name: ' + name + '*\n';
            }
        }
        if (address) {
            const m = /^(\d+)\s+(.+)/.exec(address);
            if (m) {
                sql += ' AND v.res_house = ?';
                values.push(m[1]);
                address = m[2];
                explanation += 'House number: ' + m[1] + '\n';
            }
            sql += ' AND v.res_street LIKE ?';
            values.push(address + '%');
            explanation += 'Street name: ' + address + '*\n';
        }
        if (voterId) {
            sql += ' AND v.voter_id = ?';
            values.push(voterId);
            explanation += 'Voter ID: ' + voterId + '\n';
        }
        if (match) {
            sql += ' AND ' + match + ' ORDER BY score DESC';
            values.push(q);
        }
        else {
            sql += ' ORDER BY v.lastname, v.firstname, v.middle, v.suffix, v.voter_id';
        }
        sql += ' LIMIT ' + limit;
        return queryPromise(sql, values)
            .then(function (results) {
                explanation = results.length +
                    (results.length < limit ? '' : ' or more') +
                    ' record' + (results.length === 1 ? '' : 's') + '\n' +
                    explanation;
                return {explanation, results};
            });
    };

    db.getVoters = function ({criteria, offset = 0, limit = 1000, votersTable}) {
        const [sqlFragment, criteriaValues] = makeSqlCriteria(criteria);
        let sql = 'SELECT * FROM ??';
        if (sqlFragment) {
            sql += ' WHERE ' + sqlFragment;
        }
        sql += ' ORDER BY lastname, firstname, middle, suffix, voter_id LIMIT ?, ?';
        const values = [votersTable, ...criteriaValues, offset, limit];
        return queryPromise(sql, values);
    };

};
