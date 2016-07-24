/*global Mustache */
'use strict';

var D = document;
var elWorkspace = D.querySelector('#main-wrapper');
var elAddConnection = D.querySelector('#add-connection');
var elConnectionForm = D.querySelector('#connection-list-controls');
var elConnectionList = D.querySelector('#connection-list');
var elObjectInspectors = D.querySelector('#object-inspectors');
var elSQLPane = D.querySelector('#sql-pane');
var elCodeTabs = D.querySelector('#sql-pane-tabs');
var elSizerH = D.querySelector('#object-inspectors-sizer');
var templates = {
    connection: D.querySelector('#template-connection').innerHTML,
    tableInspector: D.querySelector('#template-table-inspector').innerHTML,
    codeTab: D.querySelector('#template-sql-pane-tab').innerHTML
};

var connections = {};

var dragData = {
    el: null,
    offsetX: 0,
    offsetY: 0
};

var highestZIndex = 0;

var inspectorPaneRect = elObjectInspectors.getBoundingClientRect();
var workspaceRect = elWorkspace.getBoundingClientRect();
var sizerSize = elSizerH.offsetHeight;

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
}

function fetchObjects(user, callback) {
    var path = '/' + user + '/objects';
    var xhr = new XMLHttpRequest();

    xhr.addEventListener("load", function () {
        var objects;

        if (xhr.status >= 400) {
            window.console.error('Error', xhr.status);
        } else {
            objects = JSON.parse(xhr.responseText);
            objects.user = user;
            flagBrokenSynonyms(objects);
            callback(objects);
        }
    }, false);

    xhr.open("GET", path, true);
    xhr.send();
}

function fetchObject(user, objectName, callback) {
    var path = '/' + user + '/object/' + objectName;
    var xhr = new XMLHttpRequest();

    xhr.addEventListener("load", function () {
        var object;

        if (xhr.status >= 400) {
            window.console.error('Error', xhr.status);
        } else {
            object = JSON.parse(xhr.responseText);
            callback(object);
        }
    }, false);

    xhr.open("GET", path, true);
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

    elCodeTabs.appendChild(tab);
    elSQLPane.appendChild(tabContent);

    return tab;
}

elAddConnection.addEventListener('click', function () {
    var user = window.prompt('Enter user for connection:');
    var connectionLabel;

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
            inspectors: {
                tables: {},
                views: {},
                synonyms: {}
            }
        };

        activateTab({ target: connections[user].codeTab.querySelector('a') });
    });
});

elConnectionForm.addEventListener('submit', function (evt) {
    evt.preventDefault();
});

function inArray(str, arr) {
    var rx = new RegExp('^' + str + '$');
    return arr.some(function (item) {
        return rx.test(item);
    });
}

function toggleLabelCollapsed(evt) {
    var classes = evt.target.className.split(' ');
    if (!inArray('expander', classes)) {
        return;
    }
    evt.target.classList.toggle('collapsed');
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
    return connections[user].inspectors[type + 's'][name];
}

function createInspector(objectData) {
    var elInspector = document.createElement('div');
    var inspectorType = objectData.type === 'synonym' ? objectData.type : 'table';
    var template = templates[inspectorType + 'Inspector'];

    objectData.isView = objectData.type === 'view';
    elInspector.className = 'object-inspector ' + objectData.type;
    elInspector.id = ['inspector', objectData.user, objectData.name].join('-');
    elInspector.style.zIndex = highestZIndex + 1;
    highestZIndex += 1;
    elInspector.innerHTML = Mustache.render(template, objectData);
    bringInspectorToFront(elInspector, true);

    return elInspector;
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

    fetchObject(user, objectName, function (object) {
        var elInspector;
        var objectData = {
            name: objectName,
            user: user,
            type: objectType,
            columnsData: object
        };

        elInspector = createInspector(objectData);
        elObjectInspectors.appendChild(elInspector);

        connections[user].inspectors[objectType + 's'][objectName] = {
            el: elInspector,
            object: object
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
        return window.alert('Synonym appears to be broken.');
    } else if (synonymTarget === 'cyclic') {
        el.classList.add('broken');
        return window.alert('Synonym refers to itself.');
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
        bringInspectorToFront(el.parentNode);
    }
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

function stopDragging(evt) {
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

elConnectionList.addEventListener('click', toggleLabelCollapsed);
elObjectInspectors.addEventListener('click', toggleLabelCollapsed);

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
elObjectInspectors.addEventListener('mousemove', dragElement);
D.body.addEventListener('mouseup', stopDragging);

elCodeTabs.addEventListener('click', activateTab);

elSizerH.addEventListener('mousedown', startDragging);
elWorkspace.addEventListener('mousemove', dragElement);
D.body.addEventListener('mouseup', stopDragging);
