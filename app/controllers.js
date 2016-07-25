'use strict';

const db = require('oracledb');

const dbParams = {
    password: '*',
    connectString: process.env.DB_NAME
};

db.outFormat = db.OBJECT;
const QUERIES = {
    getTables: 'select table_name from user_tables order by table_name',
    getViews: 'select view_name from user_views order by view_name',
    getSynonyms: 'select synonym_name, table_name from user_synonyms order by synonym_name',
    getDataSample: 'select * from :object where rownum < 50',
    describe: 'select column_id, column_name, data_type, data_length from user_tab_columns where table_name = :objectName order by column_id',
    getViewText: 'select text from user_views where view_name = :objectName'
};


exports.ROOT = '/';
exports.USER_OBJECTS = '/:user/objects';
exports.POST_SQL = '/:user/sql';
exports.OBJECT_INFO = '/:user/:infoType/:objectName';

exports.index = function (req, res) {
    res.render('index');
};

function getObjects(user, type, callback) {
    let query = '';

    switch (type) {
    case 'tables':
        query = QUERIES.getTables;
        break;
    case 'views':
        query = QUERIES.getViews;
        break;
    case 'synonyms':
        query = QUERIES.getSynonyms;
        break;
    default:
        return callback('Invalid object type.');
    }

    dbParams.user = user;

    db.getConnection(dbParams, function (err, connection) {
        if (err) {
            console.error(err.message);
            return callback(err);
        }

        connection.execute(query, function (err, result) {
            connection.close();
            if (err) {
                console.error(err.message);
                return callback(err);
            }

            callback(null, result);
        });
    });

}

function getOnlyNames(result) {
    const property = result.metaData[0].name;
    return result.rows.map(function (row){
        return row[property];
    });
}

exports.getObjects = function (req, res) {
    const user = req.params.user;
    let objects = {};

    getObjects(user, 'tables', function (err, tables) {
        if (err) {
            return res.status(500).send(err.message);
        }
        objects.tables = getOnlyNames(tables);
        getObjects(user, 'views', function (err, views) {
            if (err) {
                return res.status(500).send(err.message);
            }
            objects.views = getOnlyNames(views);
            getObjects(req.params.user, 'synonyms', function (err, synonyms) {
                if (err) {
                    return res.status(500).send(err.message);
                }
                objects.synonyms = synonyms.rows;
                res.json(objects);
            });
        });
    });

};

exports.getObjectInfo = function (req, res, next) {
    let query;
    let queryParams = {};

    switch (req.params.infoType) {
    case 'object':
        query = QUERIES.describe;
        break;
    case 'viewText':
        query = QUERIES.getViewText;
        break;
    case 'sql':
        query = req.body;
        break;
    default:
        return next();
    }

    if (req.params.infoType !== 'sql') {
        queryParams = { objectName: req.params.objectName };
    }

    dbParams.user = req.params.user;
    db.getConnection(dbParams, function (err, connection) {
        if (err) {
            console.error(err.message);
            return res.status(500).send(err.message);
        }

        connection.execute(query, queryParams , function (err, result) {
            if (err) {
                console.error(err.message);
                return res.status(500).send(err.message);
            }

            if (req.params.infoType === 'sql') {
                res.json(result);
            } else {
                res.json(result.rows);
            }
        });
    });

};

exports.postSQL = function (req, res, next) {
    req.params.infoType = 'sql';
    exports.getObjectInfo(req, res, next);
};
