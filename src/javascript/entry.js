'use strict';

var D = document;

var Mustache = require('mustache');
var InspectorModel = require('models/inspector');
var InspectorView = require('views/inspector');

var elWorkspace = D.querySelector('#main-wrapper');

var elGlobalControls = D.querySelector('#global-controls');

var elAddConnection = D.querySelector('#add-connection');
var elConnectionForm = D.querySelector('#connection-list-controls');
var elConnectionList = D.querySelector('#connection-list');
var elObjectInspectors = D.querySelector('#object-inspectors');
var elSQLPane = D.querySelector('#sql-pane');
var elCodeTabs = D.querySelector('#sql-pane-tabs');
var elSizerH = D.querySelector('#object-inspectors-sizer');
//var elDebug = D.querySelector('#debug');

var elStatusbar = D.querySelector('footer.status-bar');

var Dialog = function (selector) {
    this.el = D.querySelector(selector);
    this.el.addEventListener('click', this.cancel.bind(this));
    this.el.addEventListener('click', this.ok.bind(this));
    this.el.addEventListener('submit', this.ok.bind(this));
    this.elInput = this.el.querySelector('input');
    this.elMessage = this.el.querySelector('.message');
};

Dialog.prototype = {
    show: function (message, callbackOrType) {
        this.elMessage.innerHTML = message;
        this.el.classList.add('active');
        if (this.elInput) {
            this.elInput.value = '';
            this.elInput.focus();
        }
        if (!callbackOrType) {
            return;
        }

        this.el.classList.remove(this.type);

        if (typeof callbackOrType === 'function') {
            this.onSubmit = callbackOrType;
        } else if (typeof callbackOrType === 'string') {
            this.type = callbackOrType;
            this.el.classList.add(this.type);
        }
    },
    hide: function () {
        this.el.classList.remove('active');
    },
    cancel: function (evt) {
        if (!/cancel/.test(evt.target.className)) {
            return;
        }
        this.hide();
    },
    ok: function (evt) {
        if (!/ok/.test(evt.target.className) && evt.target.nodeName !== 'FORM') {
            return;
        }

        evt.preventDefault();
        this.hide();

        if (this.onSubmit) {
            this.onSubmit(this.elInput ? this.elInput.value : undefined);
            this.onSubmit = null;
        }
    }
};

var alertDialog = new Dialog('#dialog-alert');
var promptDialog = new Dialog('#dialog-text-prompt');
var statusDialog = new Dialog('#dialog-status');

var templates = {
    connection: D.querySelector('#template-connection').innerHTML,
    codeTab: D.querySelector('#template-sql-pane-tab').innerHTML
};

var connections = {};

var dragData = {
    el: null,
    offsetX: 0,
    offsetY: 0
};

var startingInspectorPosition = {
    left: 10,
    top: 15
};
var newInspectorPosition = {
    left: 10,
    top: 15
};

var highestZIndex = 0;
var inspectorPaneRect = elObjectInspectors.getBoundingClientRect();
var workspaceRect = elWorkspace.getBoundingClientRect();
var sizerSize = elSizerH.offsetHeight;

var NULL_TEXT = '<span class="null">(null)</span>';

function escapeForHTML(text) {
    if (!text || typeof text !== 'string') {
        return text;
    }

    return text.replace(/&<>"'/, function (match) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            '\'': '&#39;'
        }[match] || match;
    });
}

function getAncestorMatchingClass(el, className) {
    var elParent = el.parentNode;
    var rx = new RegExp(className);

    while (!rx.test(elParent.className)) {
        if (elParent === document.body) {
            return null;
        }
        elParent = elParent.parentNode;
    }

    return elParent;
}

function getObjectFromSynonym(objectName, objects) {
    var matchingObjectName;

    var cyclic = objects.synonyms.some(function (synonym) {
        if (objectName === synonym.SYNONYM_NAME) {
            return synonym.SYNONYM_NAME === synonym.TABLE_NAME;
        }
    });

    if (cyclic) {
        return 'cyclic';
    }

    var found = objects.synonyms.some(function (synonym) {
        var matches = synonym.SYNONYM_NAME === objectName;
        if (matches) {
            matchingObjectName = synonym.TABLE_NAME;
        }

        return matches;
    });

    // If synonym points to another synonym, follow the chain.
    if (found) {
        return getObjectFromSynonym(matchingObjectName, objects);
    }

    found = objects.tables.some(function (tableName) {
        var matches = tableName === objectName;
        if (matches) {
            matchingObjectName = tableName;
        }
        return matches;
    });

    if (found) {
        return { name: matchingObjectName, type: 'table' };
    } else {
        found = objects.views.some(function (viewName) {
            var matches = viewName === objectName;
            if (matches) {
                matchingObjectName = viewName;
            }
            return matches;
        });

        if (found) {
            return { name: matchingObjectName, type: 'view' };
        }
    }

    return 'no match';
}

function flagBrokenSynonyms(objects) {
    objects.synonyms.forEach(function (synonym) {
        var target = getObjectFromSynonym(synonym.TABLE_NAME, objects);
        if (target === 'cyclic') {
            synonym.broken = true;
            synonym.cyclic = true;
        }

        if (target === 'no match') {
            synonym.broken = true;
        }
    });
    objects.hasOnlyBroken = objects.synonyms.every(function (synonym) {
        return synonym.broken;
    });
}

function fetchObjects(user, callback) {
    var path = '/' + user + '/objects';
    var xhr = new XMLHttpRequest();

    statusDialog.show('Loading objects...');
    xhr.addEventListener('load', function () {
        var objects;

        statusDialog.hide();
        if (xhr.status < 400) {
            objects = JSON.parse(xhr.responseText);
            objects.user = user;
            flagBrokenSynonyms(objects);
            callback(objects);
        } else {
            alertDialog.show('Error:\n\n' + xhr.responseText, 'error');
        }
    }, false);

    xhr.open('GET', path, true);
    xhr.send();
}

function fetchObject(options, callback) {
    var infoType = options.infoType || 'object';
    var path = '/' + [options.user, infoType, options.objectName].join('/');
    var xhr = new XMLHttpRequest();

    statusDialog.show('Loading object details...');
    xhr.addEventListener('load', function () {
        var object;

        statusDialog.hide();
        if (xhr.status < 400) {
            object = JSON.parse(xhr.responseText);
            callback(object);
        } else {
            alertDialog.show('Error:\n\n' + xhr.responseText, 'error');
        }
    }, false);

    xhr.open('GET', path, true);
    xhr.send();
}

function createCodeTab(user) {
    var tab = document.createElement('li');
    var tabContent = document.createElement('textarea');
    tab.innerHTML = Mustache.render(templates.codeTab, {
        connectionName: user
    });

    tabContent.className = 'code-editor';
    tabContent.id = 'sql-' + user;
    tabContent.spellcheck = false;
    tabContent.autocapitalize = 'none';

    elCodeTabs.appendChild(tab);
    elSQLPane.appendChild(tabContent);

    return tab;
}

function toggleLabelCollapsed(evt) {
    if (!/expander/.test(evt.target.className)) {
        return;
    }
    evt.target.classList.toggle('collapsed');
}

function closeInspector(evt) {
    var el = evt.target;
    var elLink;
    if (!/close-inspector/.test(el.className)) {
        return;
    }

    elLink = connections[el.dataset.user].inspectors[el.dataset.name].link;
    if (elLink) {
        elLink.classList.remove('has-inspector');
    }

    delete connections[el.dataset.user].inspectors[el.dataset.name];
    elObjectInspectors.removeChild(el.parentNode);
}

function getUserFromElement(el) {
    if (el === document.body) {
        return null;
    }

    if (el.dataset.user) {
        return el.dataset.user;
    }

    return getUserFromElement(el.parentNode);
}

function bringInspectorToFront(el, ping) {
    // This may cause us to eventually run out of z index values I guess?
    if (el.style.zIndex < highestZIndex) {
        highestZIndex += 1;
        el.style.zIndex = highestZIndex;
    }

    if (ping) {
        el.classList.add('pinged');
        setTimeout(function () {
            el.classList.remove('pinged');
        }, 500);
    }
}

function getInspector(user, type, name) {
    return connections[user].inspectors[name];
}

function createInspector(objectData) {
    var inspectorModel = new InspectorModel(objectData);
    var inspector = new InspectorView({
        model: inspectorModel,
        top: newInspectorPosition.top + 'px',
        left: newInspectorPosition.left + 'px',
        zIndex: highestZIndex
    });

    inspector.render();
    highestZIndex += 1;

    bringInspectorToFront(inspector.el, true);

    if (newInspectorPosition.top < elObjectInspectors.offsetHeight - 50) {
        newInspectorPosition.top += 10;
    } else {
        newInspectorPosition.top = startingInspectorPosition.top;
    }
    if (newInspectorPosition.left < elObjectInspectors.offsetWidth - 50) {
        newInspectorPosition.left += 10;
    } else {
        newInspectorPosition.left = startingInspectorPosition.left;
    }

    return inspector.el;
}

function getObjectNameFromLink(a) {
    return a.getAttribute('href').replace('#', '');
}

function loadObjectInspector(evt) {
    var el = evt.target;
    var objectName;
    var objectType;
    var user;
    var existingInspector;

    objectName = getObjectNameFromLink(el);
    objectType = el.dataset.type;
    user = getUserFromElement(el);

    if (!user) {
        window.console.error('no user found :( ');
        return;
    }

    existingInspector = getInspector(user, objectType, objectName);

    if (existingInspector) {
        bringInspectorToFront(existingInspector.el, true);
        return;
    }

    fetchObject({ user: user, objectName: objectName }, function (object) {
        var elInspector;
        var objectData = {
            name: objectName,
            user: user,
            type: objectType,
            columnsData: object
        };

        elInspector = createInspector(objectData);
        elObjectInspectors.appendChild(elInspector);

        connections[user].inspectors[objectName] = {
            el: elInspector,
            object: object,
            link: el
        };

        el.classList.add('has-inspector');
    });
}

function showSynonymTarget(evt) {
    var el = evt.target;
    var objectName = el.dataset.target;
    var user = getUserFromElement(el);
    var synonymTarget = getObjectFromSynonym(objectName, connections[user].objects);

    if (synonymTarget === 'no match') {
        el.classList.add('broken');
        return alertDialog.show('Synonym appears to be broken.', 'info');
    } else if (synonymTarget === 'cyclic') {
        el.classList.add('broken');
        return alertDialog.show('Synonym refers to itself.', 'info');
    }

    var targetLink = connections[user].el.querySelector('[href="#' +
        synonymTarget.name + '"]');

    loadObjectInspector({ target: targetLink });
    connections[user].el.querySelector('.object-list-label.' +
        synonymTarget.type + 's').classList.remove('collapsed');
    targetLink.classList.add('pinged');
    el.classList.add('has-inspector');
    targetLink.scrollIntoView();
    setTimeout((function (link) {
        return function () {
            link.classList.remove('pinged');
        };
    }(targetLink)), 2000);
}

function startDragging(evt) {
    var el = evt.target;

    if (!el || !/inspector-title|pane-sizer/.test(el.className)) {
        return;
    }

    if (evt.button !== 0) {
        // only interested in left-clicks
        return;
    }

    evt.preventDefault();

    dragData.offsetX = evt.offsetX;
    if (evt.target === elSizerH) {
        dragData.el = el;
        dragData.offsetY = evt.offsetY;
    } else {
        dragData.el = el.parentNode;
        dragData.offsetY = evt.offsetY - elObjectInspectors.scrollTop;
    }
}

function bringToFront(evt) {
    var elInspector = getAncestorMatchingClass(evt.target, 'object-inspector');
    if (!elInspector) {
        return;
    }

    bringInspectorToFront(elInspector);
}

function dragElement(evt) {
    var parentRect;
    var newTop;

    if (!dragData.el) {
        return;
    }

    if (dragData.el === elSizerH) {
        parentRect = workspaceRect;
    } else {
        parentRect = inspectorPaneRect;
    }

    evt.preventDefault();
    newTop = evt.clientY - dragData.offsetY - parentRect.top;
    dragData.el.style.top = newTop + 'px';
    if (dragData.el === elSizerH) {
        elObjectInspectors.style.height = newTop + 'px';
        elSQLPane.style.top = (newTop + sizerSize) + 'px';
    } else {
        dragData.el.style.left = (evt.clientX - dragData.offsetX -
            parentRect.left) + 'px';
    }
}

function stopDragging() {
    if (!dragData.el) {
        return;
    }
    dragData.el = null;
}

function activateTab(evt) {
    var editor;
    var el = evt.target;
    var previousTab;
    var previousEditor;

    if (el.nodeName !== 'A') {
        return;
    }

    previousTab = elCodeTabs.querySelector('.active');
    if (previousTab) {
        previousTab.classList.remove('active');
    }
    el.classList.add('active');

    previousEditor = elSQLPane.querySelector('textarea.active');
    if (previousEditor) {
        previousEditor.classList.remove('active');
    }
    editor = elSQLPane.querySelector(el.getAttribute('href'));
    editor.classList.add('active');
}

function loadSQLForView(evt) {
    var el = evt.target;
    if (!el || !/show-view-sql/.test(el.className)) {
        return;
    }

    fetchObject({
        user: el.dataset.user,
        infoType: 'viewText',
        objectName: el.dataset.name
    }, function (objectData) {
        var elTabLink = connections[el.dataset.user].codeTab.firstChild;
        activateTab({ target: elTabLink });
        elSQLPane.querySelector('textarea.active').value += '\n\n' + objectData;
    });
}

function toggleSQL(evt) {
    var el = evt.target;
    if (!el) {
        return;
    }

    if (!/sql-toggle/.test(el.className) || el.nodeName !== 'INPUT') {
        return;
    }

    el = getAncestorMatchingClass(el, 'object-inspector');
    el.classList.toggle('show-query-sql');
}

function getCurrentSQLStatement(editor) {
    var editorContent;
    var statementStart, statementEnd;
    var inQuote = false;

    editorContent = editor.value.split('');

    statementEnd = editor.selectionStart;
    if (statementEnd >= editorContent.length ||
        (editorContent[statementEnd] === '\n' && statementEnd > 0)) {
        statementEnd -= 1;
    }
    statementStart = statementEnd - 1;

    while (statementEnd <= editorContent.length) {
        if (editorContent[statementEnd] === '\'') {
            inQuote = !inQuote;
        }
        if (editorContent[statementEnd] === ';' && !inQuote) {
            break;
        }
        statementEnd += 1;
    }

    inQuote = false;
    while (statementStart >= 0) {
        if (editorContent[statementStart] === '\'') {
            inQuote = !inQuote;
        }
        if (editorContent[statementStart] === ';' && !inQuote) {
            break;
        }
        statementStart -= 1;
    }

    statementStart += 1;

    return editorContent.slice(statementStart, statementEnd)
        .join('')
        .replace(/^\s*/g, '')
        .replace(/\n/g, ' ')
        .replace(/\s\s+/g, ' ')
        .replace(/;?\s*$/, '');
}

function executeSQL(evt) {
    var editor = evt.target;
    var sql;
    var user;
    var path;
    var xhr;

    if (!editor || editor.nodeName !== 'TEXTAREA') {
        return;
    }

    if (evt.key !== 'Enter' || !evt.ctrlKey) {
        return;
    }

    evt.preventDefault();

    sql = getCurrentSQLStatement(editor);
    if (sql === '') {
        return;
    }

    elStatusbar.innerHTML = 'Executing query...';

    user = editor.id.replace(/^sql-/, '');
    path = '/' + user + '/sql';
    xhr = new XMLHttpRequest();

    xhr.addEventListener('load', function () {
        var result;
        var objectData = {
            name: 'sql-result-' + highestZIndex,
            user: user,
            type: 'result',
            sql: sql
        };
        var elInspector;

        elStatusbar.innerHTML = 'Query complete.';

        if (xhr.status < 400) {
            result = JSON.parse(xhr.response);
            if (!result.metaData || !result.rows) {
                return alertDialog.show(xhr.response, 'error');
            }
            objectData.columns = result.metaData.map(function (columnData) {
                return columnData.name;
            });
            objectData.rows = result.rows.map(function (rowData, rowIndex) {
                return {
                    rowIndex: rowIndex + 1,
                    rowData: objectData.columns.map(function (columnName) {
                        var value = rowData[columnName];
                        if (typeof value === 'object' && value !== null) {
                            value = JSON.stringify(value);
                        }
                        return {
                            value: escapeForHTML(value) || NULL_TEXT,
                            type: typeof value
                        };
                    })
                };
            });
            elInspector = createInspector(objectData);
            elObjectInspectors.appendChild(elInspector);
            connections[user].inspectors[objectData.name] = {
                el: elInspector,
                object: objectData
            };
        } else {
            alertDialog.show('Error:\n\n' + xhr.responseText, 'error');
        }
    });

    xhr.open('POST', path, true);
    xhr.send(sql);

    return false;
}

elAddConnection.addEventListener('click', function () {
    promptDialog.show('Enter user for connection:', function (user) {
        var connectionLabel;
        if (!user) {
            return;
        }

        if (connections[user]) {
            connectionLabel = connections[user].el.querySelector('.connection-name');
            connectionLabel.classList.remove('collapsed');
            connectionLabel.scrollIntoView();
            return;
        }

        fetchObjects(user, function (objects) {
            var elConnection = document.createElement('li');
            var html = Mustache.render(templates.connection, objects);

            elConnection.innerHTML = html;
            elConnection.className = 'connection-item';
            elConnection.dataset.user = user;
            elConnectionList.appendChild(elConnection);

            connections[user] = {
                el: elConnection,
                objects: objects,
                codeTab: createCodeTab(user),
                inspectors: {}
            };

            activateTab({ target: connections[user].codeTab.querySelector('a') });
        });
    });
});

elConnectionForm.addEventListener('submit', function (evt) {
    evt.preventDefault();
});

elGlobalControls.addEventListener('change', function (evt) {
    var checkbox = evt.target;
    if (!checkbox || checkbox.nodeName !== 'INPUT') {
        return;
    }
    D.body.classList.toggle(checkbox.dataset.classToToggle);
});

elConnectionList.addEventListener('click', toggleLabelCollapsed);
elObjectInspectors.addEventListener('click', toggleLabelCollapsed);
elObjectInspectors.addEventListener('click', closeInspector);

elConnectionList.addEventListener('click', function (evt) {
    var el = evt.target;

    if (!el || el.nodeName !== 'A') {
        return;
    }

    if (el.dataset.type === 'synonym') {
        showSynonymTarget(evt);
    } else {
        loadObjectInspector(evt);
    }
});

elObjectInspectors.addEventListener('mousedown', startDragging);
elObjectInspectors.addEventListener('mousedown', bringToFront);
elObjectInspectors.addEventListener('mousemove', dragElement);
D.body.addEventListener('mouseup', stopDragging);
elObjectInspectors.addEventListener('click', loadSQLForView);
elObjectInspectors.addEventListener('change', toggleSQL);
elCodeTabs.addEventListener('click', activateTab);
elSizerH.addEventListener('mousedown', startDragging);
elWorkspace.addEventListener('mousemove', dragElement);
D.body.addEventListener('mouseup', stopDragging);
elSQLPane.addEventListener('keydown', executeSQL);
