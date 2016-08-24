'use strict';
var Backbone = require('backbone');
var Marionette = require('backbone.marionette');

var DialogModel = Backbone.Model.extend({
    defaults: {
        text: '',
        type: ''
    }
});

var Dialog = Marionette.ItemView.extend({
    tagName: 'div',
    className: 'dialog',
    template: require('templates/dialog-alert.html'),

    ui: {
        message: '.message',
        input: 'input',
        btnOk: '.ok',
        btnCancel: '.cancel'
    },
    events: {
        'click @ui.btnOk': 'apply',
        'click @ui.btnCancel': 'cancel'
    },
    apply: function () {
        if (this.okCallback) {
            this.okCallback(this.ui.input.val());
        }

        this.cancel();
    },
    cancel: function () {
        this.ui.input.val('');
        this.close();
    }
});

var Prompt = Dialog.extend({
    template: require('templates/dialog-prompt')
});

var alertDialog = new Dialog({
    model: new DialogModel()
});
var promptDialog = new Prompt({
    model: new DialogModel()
});

exports.alertDialog = function (text, type) {
    alertDialog.model.set({
        text: text,
        type: type
    });
    alertDialog.show();
};

exports.promptDialog = function (text, type, callback) {
    if (typeof type === 'function') {
        callback = type;
        type = 'prompt';
    }
    promptDialog.okCallback = callback;
    promptDialog.model.set({
        text: text,
        type: type
    });
    promptDialog.show();
};
