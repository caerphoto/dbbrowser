'use strict';
var Backbone = require('backbone');

module.exports = Backbone.Model.extend({
    defaults: {
        name: '',
        user: '',
        type: ''
    },
    initialize: function () {
        // Table and View inspectors are basically the same except the latter
        // have a green titlebar and an 'SQL' button to show their source. This
        // attribute allows the template to tell the difference by checking a
        // property, rather than performing this logic itself.
        this.set('isView', this.get('type') === 'view');
    }
});

