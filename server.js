'use strict';

const path = require('path');
const express = require('express');
const morgan = require('morgan');
const bodyParser = require('body-parser');

const controllers = require('./app/controllers');

const app = express();

var server;

app.set('view engine', 'pug');

if (process.env.NODE_ENV === 'production') {
    app.use(morgan('combined'));
} else {
    app.use(morgan('dev'));
}


app.get(controllers.ROOT, controllers.index);
app.get(controllers.USER_OBJECTS, controllers.getObjects);
app.use('/assets', express['static'](__dirname + '/public'));
app.get(controllers.VIEW_TEXT, controllers.getViewText);
app.get(controllers.OBJECT_INFO, controllers.getObjectInfo);
app.use(bodyParser.text());
app.post(controllers.POST_SQL, controllers.postSQL);

// Handle 404s - this only gets called if none of the routes above send a
// response.
app.use(function (req, res) {
    res.status(404).send();
});

server = app.listen(6462, '127.0.0.1', function () {
    var host = server.address().address;
    var port = server.address().port;
    var env = process.env.NODE_ENV || 'development';

    console.log('App listening at http://%s:%s in %s env', host, port, env);
});
