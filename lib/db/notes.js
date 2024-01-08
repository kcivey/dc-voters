const createError = require('http-errors');

module.exports = function (db) {

    const {queryPromise} = db;

    db.createOrUpdateNote = async function ({projectId, id, data}) {
        const noteData = {...data}; // clone
        delete noteData.project_id;
        delete noteData.id;
        let sql;
        let values;
        if (id) {
            sql = 'UPDATE notes SET ? WHERE project_id = ? AND id = ?';
            values = [noteData, projectId, id];
        }
        else {
            if (!noteData.user_id) {
                throw createError(400, 'Missing user ID');
            }
            if (noteData.hasOwnProperty('note_text') && !noteData.note_text) {
                noteData.note_text = ''; // can't set default in table for text column
            }
            noteData.project_id = projectId;
            sql = 'INSERT INTO notes (??) VALUES (?)';
            values = [Object.keys(noteData), Object.values(noteData)];
        }
        const result = await queryPromise(sql, values);
        if (!id) {
            id = result.insertId;
        }
        if (!id) {
            throw createError(500, 'No insert ID');
        }
        return db.getNote(projectId, id);
    };

    db.getNote = function (projectId, id) {
        const sql = 'SELECT * FROM notes WHERE project_id = ? AND id = ?';
        return queryPromise(sql, [projectId, id])
            .then(rows => rows[0]);
    };

    db.getNoteByVoterAndUser = function (projectId, voterId, userId) {
        const sql = 'SELECT * FROM notes WHERE project_id = ? AND voter_id = ? AND user_id = ?';
        return queryPromise(sql, [projectId, voterId, userId])
            .then(rows => rows[0]);
    };

    db.deleteNote = function (projectId, id) {
        return queryPromise(
            'DELETE FROM notes WHERE project_id = ? AND id = ?',
            [projectId, id]
        )
            .then(results => results.affectedRows);
    };

};
