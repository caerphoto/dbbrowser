'use strict';
var Backbone = require('backbone');
var $ = require('jquery');
var utils = require('utils');

module.exports = Backbone.Model.extend({
    defaults: {
        name: '',
        user: '',
        type: '',
        sql: null
    },
    loadViewSQL: function () {
        var path;
        var model = this;

        if (this.get('type') !== 'view') {
            return;
        }

        path = ['', this.get('user'), 'viewText', this.get('name')].join('/');
        $.get(path).done(function (sql) {
            model.set('sql', sql);
        }).fail(function (xhr, errorText) {
            utils.alertDialog('Error:\n\n' + errorText, 'error');
        });
    }
});

