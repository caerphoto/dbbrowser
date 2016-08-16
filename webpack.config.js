'use strict';
const webpack = require('webpack');

module.exports = {
    entry: './src/javascript/entry.js',
    output: {
        path: __dirname + '/public/javascript',
        filename: 'application.js'
    },
    module: {
        loaders: [
            {
                test: /\.html$/,
                loader: 'underscore-template-loader',
                query: {
                    variable: 'o'
                }
            }
        ]
    },
    plugins: [
        new webpack.ProvidePlugin({
            _: 'underscore'
        })
    ],
    resolve: {
        root: __dirname + '/src/',
        modulesDirectories: [
            'javascript',
            __dirname + '/node_modules'
        ],
    },
    resolveLoader: {
        root: __dirname + '/node_modules'
    },
    devtool: 'source-map'
};
