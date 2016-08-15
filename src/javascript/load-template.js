'use strict';
module.exports = function (templateName) {
    var id = ['#template'].concat(templateName.split('/')).join('-');
    return window.document.querySelector(id).innerHTML;
};
