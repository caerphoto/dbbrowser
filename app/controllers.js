'use strict';

const db = require('oracledb');
const chalk = require('chalk');

const dbParams = {
    password: '*',
    connectString: process.env.DB_CONNECTION
};

if (!dbParams.connectString) {
    console.error('Error: DB_CONNECTION environment variable not set.');
    process.exit(1);
}

db.outFormat = db.OBJECT;
db.maxRows = 1000;
db.extendedMetaData = true;

db.fetchAsString = [ db.CLOB ];

const QUERIES = {
    getTables: 'select table_name from user_tables order by table_name',
    getViews: 'select view_name from user_views order by view_name',
    getSynonyms: 'select synonym_name, table_name from user_synonyms order by synonym_name',
    getDataSample: 'select * from :object where rownum < 50',
    describe: 'select column_id, column_name, data_type, data_length from user_tab_columns where table_name = :objectName order by column_id',
    dropTemp: 'DROP TABLE tmp_view_text',
    createTemp: 'CREATE TABLE tmp_view_text AS (SELECT TO_LOB(user_views.text) text FROM user_views WHERE view_name = \'###\')',
    getViewText: 'SELECT text FROM tmp_view_text'
};


exports.ROOT = '/';
exports.USER_OBJECTS = '/:user/objects';
exports.POST_SQL = '/:user/sql';
exports.VIEW_TEXT = '/:user/viewText/:viewName';
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
                connection.close();
                console.error(err.message);
                return res.status(500).send(err.message);
            }

            if (req.params.infoType === 'sql') {
                res.json(result);
            } else {
                res.json(result.rows);
            }
            connection.close();
        });
    });

};

exports.getViewText = function (req, res) {
    const viewName = req.params.viewName;
    console.log('getting view text for', req.params.user, viewName);

    dbParams.user = req.params.user;
    db.getConnection(dbParams, function (err, conn) {
        if (err) {
            conn.close();
            console.error(err.message);
            return res.status(500).send(err.message);
        }
        const query = QUERIES.createTemp.replace('###', viewName);
        conn.execute(query, function (err) {
            if (err) {
                // ORA-00955 means table already exists, so we can carry on as
                // intended.
                if (!/ORA-00955/.test(err.message)) {
                    conn.close();
                    console.error(err.message);
                    console.log(query);
                    return res.status(500).send(err.message);
                }
            }
            console.log('tmp_view_text created');
            conn.execute(QUERIES.getViewText, function (err, result) {
                if (err || result.rows.length === 0) {
                    conn.close();
                    console.error(err.message);
                    return res.status(500).send(err.message);
                }

                console.log('view text selected');

                conn.execute(QUERIES.dropTemp, function () {
                    conn.close();
                });
                res.json(result.rows[0].TEXT);
            });
        });
    });
};

const dataTypeMap = {
    2001: 'string',
    2002: 'number',
    2003: 'date',
    2004: 'cursor',
    2005: 'buffer',
    2006: 'clob',
    2007: 'blob'
};

function transformQueryResult(data) {
    if (!data) {
        return null;
    }
    if (!data.metaData) {
        return data;
    }
    const columnTypes = data.metaData.reduce(function (obj, column) {
        obj[column.name] = dataTypeMap[column.fetchType];
        return obj;
    }, {});

    return {
        columns: data.metaData.map(function (column) {
            return {
                name: column.name,
                type: columnTypes[column.name]
            };
        }),
        rows: data.rows.map(function (row) {
            return data.metaData.map(function (column) {
                return {
                    type: columnTypes[column.name],
                    value: row[column.name]
                };
            });
        })
    };
}

exports.postSQL = function (req, res) {
    let query = req.body;

    console.log('Running SQL:');
    console.log(chalk.blue(query));

    dbParams.user = req.params.user;
    db.getConnection(dbParams, function (err1, connection) {
        if (err1) {
            console.error('Error getting connection:', err1.message);
            return res.status(500).send(err1.message);
        }

        connection.execute(query, function (err2, result) {
            if (err2) {
                connection.close();
                console.error('Error executing query:', err2.message);
                return res.status(500).send(err2.message);
            }

            res.json(transformQueryResult(result));
        });
    });
};
