module.exports = function (app) {
    var db = app.get('db');
    return {
        index: function(req, res){
          res.render('index', { title: 'Express' });
        },

        search: function (req, res) {
            var q = req.query.q;
            if (q) {
                db.query('SELECT * FROM voters WHERE MATCH ' +
                    '(firstname, lastname, res_house, res_street) ' +
                    'AGAINST (?) LIMIT 5',
                    [q],
                    function (err, results) {
                        if (err) {
                            throw err;
                        }
                        res.json(results);
                    }
                );
            }
        }
    };
};
