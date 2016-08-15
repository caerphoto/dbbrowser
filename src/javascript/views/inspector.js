'use strict';
var Backbone = require('backbone');
var _ = require('underscore');
var Mustache = require('mustache');

var loadTemplate = require('load-template');

module.exports = Backbone.View.extend({
    tagName: 'div',
    className: 'object-inspector show-query-sql',

    events: {
        'click .sql-toggle': 'toggleSQL',
        'click .close-inspector': 'close',
        'click .expander': 'toggleExpanded',
        'click .show-view-sql': 'showViewSQL'
    },

    initialize: function (options) {
        var type = this.model.get('type');
        if (type === 'result') {
            this.template = loadTemplate('inspector/result');
        } else {
            this.template = loadTemplate('inspector/table');
        }

        this.el.id = this.getDOMId();
        this.$el.addClass(type);

        _.extend(this.el.style, {
            zIndex: options.zIndex,
            top: options.top,
            left: options.left
        });
    },

    render: function () {
        this.el.innerHTML = Mustache.render(this.template, this.model.toJSON());
        return this;
    },

    getDOMId: function () {
        return [
            'inspector',
            this.model.get('user'),
            this.model.get('name')
        ].join('-');
    }
});
