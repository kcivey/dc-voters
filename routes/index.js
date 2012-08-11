module.exports = function (app) {
    var db = app.get('db');
    return {
        index: function(req, res){
          res.render('index', { title: 'Express' });
        },

        search: function (req, res) {
            var q = req.query.q,
                match = 'MATCH (firstname, lastname, res_house, res_street) AGAINST (? IN BOOLEAN MODE)',
                sql, values;
            if (q) {
                sql = 'SELECT *, ' + match + ' AS score FROM voters WHERE ' + match + ' ORDER BY score DESC LIMIT 5';
                values = [q, q];
                db.query(sql, values, function (err, results) {
                    if (err) {
                        throw err;
                    }
                    res.json(results);
                });
            }
        }
    };
};
