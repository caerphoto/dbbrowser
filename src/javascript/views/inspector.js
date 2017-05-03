'use strict';
var Marionette = require('backbone.marionette');
var _ = require('underscore');

module.exports = Marionette.ItemView.extend({
    tagName: 'div',
    className: 'object-inspector show-query-sql',

    ui: {
        chkToggleSQL: '.toggle-sql',
        btnClose: '.close-inspector',
        btnExpander: '.expander',
        btnShowViewSQL: '.show-view-sql'
    },

    events: {
        'click @ui.chkToggleSQL': 'toggleSQL',
        'click @ui.btnClose': 'close',
        'click @ui.btnExpander': 'toggleExpanded',
        'click @btnShowViewSQL': 'showViewSQL'
    },

    template: function (data) {
        var template;

        if (data.type === 'result') {
            if (data.rows.length === 1) {
                data.row = data.rows[0];
                template = require('templates/inspector-single-result.html');
            } else {
                template = require('templates/inspector-result.html');
            }
        } else {
            template = require('templates/inspector-table.html');
        }

        return template(data);
    },

    initialize: function (options) {
        this.$el.addClass(this.model.get('type'));
        _.extend(this.el.style, {
            zIndex: options.zIndex,
            top: options.top,
            left: options.left
        });
        // Using attr because $.data() uses some internal jQuery data property
        // rather than the data-* attribute, and we need that attribute so the
        // CSS can add a pseudo-element based on it.
        this.$el.attr('data-user', this.model.get('user'));
    }
});
