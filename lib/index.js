'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _stringify = require('@nkduy/babel-runtime/core-js/json/stringify');

var _stringify2 = _interopRequireDefault(_stringify);

var _toConsumableArray2 = require('@nkduy/babel-runtime/helpers/toConsumableArray');

var _toConsumableArray3 = _interopRequireDefault(_toConsumableArray2);

var _map = require('@nkduy/babel-runtime/core-js/map');

var _map2 = _interopRequireDefault(_map);

var _slicedToArray2 = require('@nkduy/babel-runtime/helpers/slicedToArray');

var _slicedToArray3 = _interopRequireDefault(_slicedToArray2);

var _set = require('@nkduy/babel-runtime/core-js/set');

var _set2 = _interopRequireDefault(_set);

exports.default = function () {
    function getModuleSourceName(opts) {
        return opts.moduleSourceName || 'dulcet-intl';
    }

    function getMessageDescriptorKey(path) {
        if (path.isIdentifier() || path.isJSXIdentifier()) {
            return path.node.name;
        }

        var evaluated = path.evaluate();
        if (evaluated.confident) {
            return evaluated.value;
        }

        throw path.buildCodeFrameError('[Dulcet Intl] Messages must be statically evaluate-able for extraction.');
    }

    function getMessageDescriptorValue(path) {
        if (path.isJSXExpressionContainer()) {
            path = path.get('expression');
        }

        var evaluated = path.evaluate();
        if (evaluated.confident) {
            return evaluated.value;
        }

        throw path.buildCodeFrameError('[Dulcet Intl] Messages must be statically evaluate-able for extraction.');
    }

    function createMessageDescriptor(propPaths) {
        var options = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];
        var _options$isJSXSource = options.isJSXSource;
        var isJSXSource = _options$isJSXSource === undefined ? false : _options$isJSXSource;


        return propPaths.reduce(function (hash, _ref) {
            var _ref2 = (0, _slicedToArray3.default)(_ref, 2);

            var keyPath = _ref2[0];
            var valuePath = _ref2[1];

            var key = getMessageDescriptorKey(keyPath);

            if (!DESCRIPTOR_PROPS.has(key)) {
                return hash;
            }

            var value = getMessageDescriptorValue(valuePath).trim();

            if (key === 'defaultMessage') {
                try {
                    hash[key] = (0, _printIcuMessage2.default)(value);
                } catch (parseError) {
                    if (isJSXSource && valuePath.isLiteral() && value.indexOf('\\\\') >= 0) {

                        throw valuePath.buildCodeFrameError('[Dulcet Intl] Message failed to parse. ' + 'It looks like `\\`s were used for escaping, ' + 'this won\'t work with JSX string literals. ' + 'Wrap with `{}`. ' + 'See: http://khanhduy1407.github.io/dulcet/docs/jsx-gotchas.html');
                    }

                    throw valuePath.buildCodeFrameError('[Dulcet Intl] Message failed to parse.', parseError);
                }
            } else {
                hash[key] = value;
            }

            return hash;
        }, {});
    }

    function storeMessage(_ref3, path, state) {
        var id = _ref3.id;
        var description = _ref3.description;
        var defaultMessage = _ref3.defaultMessage;
        var opts = state.opts;
        var dulcetIntl = state.dulcetIntl;


        if (!(id && defaultMessage)) {
            throw path.buildCodeFrameError('[Dulcet Intl] Message Descriptors require an `id` and `defaultMessage`.');
        }

        if (dulcetIntl.messages.has(id)) {
            var existing = dulcetIntl.messages.get(id);

            if (description !== existing.description || defaultMessage !== existing.defaultMessage) {

                throw path.buildCodeFrameError('[Dulcet Intl] Duplicate message id: "' + id + '", ' + 'but the `description` and/or `defaultMessage` are different.');
            }
        }

        if (opts.enforceDescriptions && !description) {
            throw path.buildCodeFrameError('[Dulcet Intl] Message must have a `description`.');
        }

        dulcetIntl.messages.set(id, { id: id, description: description, defaultMessage: defaultMessage });
    }

    function referencesImport(path, mod, importedNames) {
        if (!(path.isIdentifier() || path.isJSXIdentifier())) {
            return false;
        }

        return importedNames.some(function (name) {
            return path.referencesImport(mod, name);
        });
    }

    return {
        visitor: {
            Program: {
                enter: function enter(path, state) {
                    state.dulcetIntl = {
                        messages: new _map2.default()
                    };
                },
                exit: function exit(path, state) {
                    var file = state.file;
                    var opts = state.opts;
                    var dulcetIntl = state.dulcetIntl;
                    var _file$opts = file.opts;
                    var basename = _file$opts.basename;
                    var filename = _file$opts.filename;


                    var descriptors = [].concat((0, _toConsumableArray3.default)(dulcetIntl.messages.values()));
                    file.metadata['dulcet-intl'] = { messages: descriptors };

                    if (opts.messagesDir && descriptors.length > 0) {
                        // Make sure the relative path is "absolute" before
                        // joining it with the `messagesDir`.
                        var relativePath = p.join(p.sep, p.relative(process.cwd(), filename));

                        var messagesFilename = p.join(opts.messagesDir, p.dirname(relativePath), basename + '.json');

                        var messagesFile = (0, _stringify2.default)(descriptors, null, 2);

                        (0, _mkdirp.sync)(p.dirname(messagesFilename));
                        (0, _fs.writeFileSync)(messagesFilename, messagesFile);
                    }
                }
            },

            JSXOpeningElement: function JSXOpeningElement(path, state) {
                var file = state.file;
                var opts = state.opts;

                var moduleSourceName = getModuleSourceName(opts);

                var name = path.get('name');

                if (name.referencesImport(moduleSourceName, 'FormattedPlural')) {
                    file.log.warn('[Dulcet Intl] Line ' + path.node.loc.start.line + ': ' + 'Default messages are not extracted from ' + '<FormattedPlural>, use <FormattedMessage> instead.');

                    return;
                }

                if (referencesImport(name, moduleSourceName, COMPONENT_NAMES)) {
                    var attributes = path.get('attributes').filter(function (attr) {
                        return attr.isJSXAttribute();
                    });

                    var descriptor = createMessageDescriptor(attributes.map(function (attr) {
                        return [attr.get('name'), attr.get('value')];
                    }), { isJSXSource: true });

                    // In order for a default message to be extracted when
                    // declaring a JSX element, it must be done with standard
                    // `key=value` attributes. But it's completely valid to
                    // write `<FormattedMessage {...descriptor} />`, because it
                    // will be skipped here and extracted elsewhere. When the
                    // `defaultMessage` prop exists, the descriptor will be
                    // checked.
                    if (descriptor.defaultMessage) {
                        storeMessage(descriptor, path, state);
                    }
                }
            },
            CallExpression: function CallExpression(path, state) {
                var moduleSourceName = getModuleSourceName(state.opts);
                var callee = path.get('callee');

                function assertObjectExpression(node) {
                    if (!(node && node.isObjectExpression())) {
                        throw path.buildCodeFrameError('[Dulcet Intl] `' + callee.node.name + '()` must be ' + 'called with an object expression with values ' + 'that are Dulcet Intl Message Descriptors, also ' + 'defined as object expressions.');
                    }
                }

                function processMessageObject(messageObj) {
                    assertObjectExpression(messageObj);

                    var properties = messageObj.get('properties');

                    var descriptor = createMessageDescriptor(properties.map(function (prop) {
                        return [prop.get('key'), prop.get('value')];
                    }));

                    if (!descriptor.defaultMessage) {
                        throw path.buildCodeFrameError('[Dulcet Intl] Message is missing a `defaultMessage`.');
                    }

                    storeMessage(descriptor, path, state);
                }

                if (referencesImport(callee, moduleSourceName, FUNCTION_NAMES)) {
                    var messagesObj = path.get('arguments')[0];

                    assertObjectExpression(messagesObj);

                    messagesObj.get('properties').map(function (prop) {
                        return prop.get('value');
                    }).forEach(processMessageObject);
                }
            }
        }
    };
};

var _path = require('path');

var p = _interopRequireWildcard(_path);

var _fs = require('fs');

var _mkdirp = require('mkdirp');

var _printIcuMessage = require('./print-icu-message');

var _printIcuMessage2 = _interopRequireDefault(_printIcuMessage);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/*
 * Copyright 2022, NKDuy
 * Copyrights licensed under the New BSD License.
 * See the accompanying LICENSE file for terms.
 */

var COMPONENT_NAMES = ['FormattedMessage', 'FormattedHTMLMessage'];

var FUNCTION_NAMES = ['defineMessages'];

var DESCRIPTOR_PROPS = new _set2.default(['id', 'description', 'defaultMessage']);
