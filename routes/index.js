module.exports = function (app) {
    var db = app.get('db');
    return {
        index: function(req, res){
          res.render('index', { title: 'Express' });
        },

        search: function (req, res) {
            var q = req.query.q,
                name = req.query.name,
                address = req.query.address,
                values = [],
                match, sql, m;
            if (q) {
                match = 'MATCH (firstname, lastname, res_house, res_street) AGAINST (? IN BOOLEAN MODE)';
            }
            sql = 'SELECT *';
            if (match) {
                sql += ', ' + match + ' AS score';
                values.push(q);
            }
            sql += ' FROM voters WHERE 1';
            if (name) {
                if (m = /^([^,]+),\s*(.+)/.exec(name)) {
                    sql += ' AND firstname LIKE ?';
                    values.push(m[2] + '%');
                    name = m[1];
                }
                sql += ' AND lastname LIKE ?';
                values.push(name + '%');
            }
            if (address) {
                if (m = /^(\d+)\s+(.+)/.exec(address)) {
                    sql += ' AND res_house = ?';
                    values.push(m[1]);
                    address = m[2];
                }
                sql += ' AND res_street LIKE ?';
                values.push(address + '%');
            }
            if (match) {
                sql += ' AND ' + match + ' ORDER BY score DESC';
                values.push(q);
            }
            else {
                sql += ' ORDER BY lastname, firstname, middle, suffix DESC';
            }
            sql += ' LIMIT 10';
            console.log(sql);
            console.log(values);
            db.query(sql, values, function (err, results) {
                if (err) {
                    throw err;
                }
                res.json(results);
            });
        }
    };
};
