module.exports = function (app) {
    var db = app.get('db'),
        httpProxy = require('http-proxy'),
        proxy = new httpProxy.HttpProxy({target: {host: 'localhost', port: 8000}});
    return {
        index: function(req, res){
          res.render('index', { title: 'Express' });
        },

        search: function (req, res) {
            var q = req.query.q,
                name = req.query.name,
                address = req.query.address,
                values = [],
                limit = 10,
                explanation = '',
                match, sql, m;
            if (q) {
                match = 'MATCH (firstname, lastname, res_house, res_street) AGAINST (? IN BOOLEAN MODE)';
                explanation += 'General query: ' + q + '\n';
            }
            sql = 'SELECT registered, lastname, firstname, middle, suffix, status, res_house, res_frac, res_apt, res_street, ward, voter_id';
            if (match) {
                sql += ', ' + match + ' AS score';
                values.push(q);
            }
            sql += ' FROM voters WHERE 1';
            if (name) {
                if (m = /^([^,]*),\s*(.+)/.exec(name)) {
                    sql += ' AND firstname LIKE ?';
                    values.push(m[2] + '%');
                    name = m[1];
                    explanation += 'First name: ' + m[2] + '*\n';
                }
                if (name) {
                    sql += ' AND lastname LIKE ?';
                    values.push(name + '%');
                    explanation += 'Last name: ' + name + '*\n';
                }
            }
            if (address) {
                if (m = /^(\d+)\s+(.+)/.exec(address)) {
                    sql += ' AND res_house = ?';
                    values.push(m[1]);
                    address = m[2];
                    explanation += 'House number: ' + m[1] + '\n';
                }
                sql += ' AND res_street LIKE ?';
                values.push(address + '%');
                explanation += 'Street name: ' + address + '*\n';
            }
            if (match) {
                sql += ' AND ' + match + ' ORDER BY score DESC';
                values.push(q);
            }
            else {
                sql += ' ORDER BY lastname, firstname, middle, suffix';
            }
            sql += ' LIMIT ' + limit;
            console.log(sql);
            console.log(values);
            db.query(sql, values, function (err, results) {
                if (err) {
                    throw err;
                }
                explanation = results.length +
                    (results.length < limit ? '' : ' or more') +
                    ' record' + (results.length == 1 ? '' : 's') +  '\n' +
                    explanation;
                res.json({
                    explanation: explanation,
                    results: results
                });
            });
        },

        proxy: function (req, res) {
            proxy.proxyRequest(req, res);
        }
    };
};
