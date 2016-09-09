'use strict';
var Backbone = require('backbone');
var $ = require('jquery');
var utils = require('utils');

module.exports = Backbone.Model.extend({
    defaults: {
        name: '',
        type: 'table',
        sql: null
    },
    initialize: function (options) {
        this.bookmark = options.bookmark;
    },
    loadViewSQL: function () {
        var path;
        var model = this;

        if (this.get('type') !== 'view') {
            throw new TypeError('Cannot fetch SQL of object type "' +
                this.get('type') + '".');
        }

        path = '/viewText';
        $.get(path, {
            name: this.get('name'),
            user: this.bookmark.get('user'),
            password: this.bookmark.get('password'),
            connection: this.bookmark.get('connection')
        }).done(function (sql) {
            model.set('sql', sql);
        }).fail(function (xhr, errorText) {
            utils.alertDialog('Error:\n\n' + errorText, 'error');
        });
    }
});

