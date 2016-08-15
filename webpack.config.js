'use strict';
const path = require('path');

module.exports = {
    entry: './src/javascript/entry.js',
    output: {
        path: './public/javascript',
        filename: 'application.js'
    },
    resolve: {
        root: path.join(__dirname, 'src/javascript'),
        modulesDirectories: ['lib'],
        alias: {
            underscore: 'underscore-1.8.3.min.js',
            jquery: 'jquery-3.1.0.min.js',
            backbone: 'backbone-1.3.3.min.js',
            mustache: 'mustache-2.2.1.min.js'
        }
    },
    devtool: 'source-map'
};
