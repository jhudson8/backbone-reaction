/*!
 * backbone-reaction v0.11.0
 * https://github.com/jhudson8/backbone-reaction
 *
 * Copyright (c) 2014 Joe Hudson<joehud_AT_gmail.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

/*
  Container script which includes the following:
  https://github.com/jhudson8/react-mixin-manager v0.8.0
  https://github.com/jhudson8/react-events v0.5.2
  https://github.com/jhudson8/backbone-xhr-events v0.8.1
  https://github.com/jhudson8/react-backbone v0.11.2
*/
 (function(main) {
  if (typeof define === 'function' && define.amd) {
    define(['react', 'backbone', 'underscore'], main);
  } else if (typeof exports !== 'undefined' && typeof require !== 'undefined') {
    module.exports = function(React, Backbone) {
      main(React, Backbone, require('underscore'));
    };
  } else {
    main(React, Backbone, _);
  }
})(function(React, Backbone, _) {


(function() {
/*******************
 * backbone-xhr-events
 * https://github.com/jhudson8/backbone-xhr-events
********************/

  // ANY OVERRIDES MUST BE DEFINED BEFORE LOADING OF THIS SCRIPT
  // Backbone.xhrCompleteEventName: event triggered on models when all XHR requests have been completed
  var xhrCompleteEventName = Backbone.xhrCompleteEventName = Backbone.xhrCompleteEventName || 'xhr:complete';
  // the model attribute which can be used to return an array of all current XHR request events
  var xhrLoadingAttribute = Backbone.xhrModelLoadingAttribute = Backbone.xhrModelLoadingAttribute || 'xhrActivity';
  // Backbone.xhrEventName: the event triggered on models and the global bus to signal an XHR request
  var xhrEventName = Backbone.xhrEventName = Backbone.xhrEventName || 'xhr';
  // Backbone.xhrGlobalAttribute: global event handler attribute name (on Backbone) used to subscribe to all model xhr events
  var xhrGlobalAttribute = Backbone.xhrGlobalAttribute = Backbone.xhrGlobalAttribute || 'xhrEvents';

  // initialize the global event bus
  var globalXhrBus = Backbone[xhrGlobalAttribute] = _.extend({}, Backbone.Events);
  var SUCCESS = 'success';
  var ERROR = 'error';

  var Context = function(method, model, options) {
    this.method = method;
    this.model = model;
    this.options = options;
  }
  Context.prototype.abort = function() {
    if (!this.aborted) {
      this.aborted = true;
      this.preventDefault = true;
      if (this.xhr) {
        this.xhr.abort();
      }
    }
  }
  _.extend(Context.prototype, Backbone.Events);

  // allow backbone to send xhr events on models
  var _sync = Backbone.sync;
  Backbone.sync = function (method, model, options) {

    options = options || {};
    // Ensure that we have a URL.
    if (!options.url) {
      options.url = _.result(model, 'url');
    }

    var context = initializeXHRLoading(method, model, model, options);
    if (context.preventDefault) {
      // it is assumed that either context.options.success or context.options.error will be called
      return;
    }
    var xhr = _sync.call(this, method, model, options);
    context.xhr = xhr;
    return xhr;
  };

  // provide helper flags to determine model fetched status
  globalXhrBus.on(xhrEventName + ':read', function (model, events) {
    events.on(SUCCESS, function () {
      model.hasBeenFetched = true;
      model.hadFetchError = false;
    });
    events.on(ERROR, function () {
      model.hadFetchError = true;
    });
  });


  // execute the callback directly if the model is fetch
  // initiate a fetch with this callback as the success option if not fetched
  // or plug into the current fetch if in progress
  Backbone.Model.prototype.whenFetched = Backbone.Collection.whenFetched = function(success, error) {
    var model = this;
    function successWrapper() {
      success(model);
    }
    if (this.hasBeenFetched) {
      return success(this);
    }
    // find current fetch call (if any)
    var _fetch = _.find(this[xhrLoadingAttribute], function(req) {
      return req.method === 'read';
    });
    if (_fetch) {
      _fetch.on('success', successWrapper);
      if (error) {
        _fetch.on('error', error);
      }
    } else {
      this.fetch({ success: successWrapper, error: error });
    }
  }

  // forward all or some XHR events from the source object to the dest object
  Backbone.forwardXhrEvents = function (source, dest, typeOrCallback) {
    var handler = handleForwardedEvents(!_.isFunction(typeOrCallback) && typeOrCallback);
    if (_.isFunction(typeOrCallback)) {
      // forward the events *only* while the function is executing wile keeping "this" as the context
      try {
        source.on(xhrEventName, handler, dest);
        typeOrCallback.call(this);
      } finally {
        source.off(xhrEventName, handler, dest);
      }
    } else {
      var eventName = typeOrCallback ? (xhrEventName + ':') + typeOrCallback : xhrEventName;
      source.on(eventName, handler, dest);
    }
  }

  Backbone.stopXhrForwarding = function (source, dest, type) {
    var handler = handleForwardedEvents(type),
      eventName = type ? (xhrEventName + ':') + type : xhrEventName;
    source.off(xhrEventName, handler, dest);
  }

  var _eventForwarders = {};

  function handleForwardedEvents(type) {
    type = type || '_all';
    var func = _eventForwarders[type];
    if (!func) {
      // cache it so we can unbind when we need to
      func = function (eventName, events) {
        if (type !== '_all') {
          // if the event is already scoped, the event type will not be provided as the first parameter
          options = events;
          events = eventName;
          eventName = type;
        }
        // these events will be called because we are using the same options object as the source call
        initializeXHRLoading(events.method, this, events.model, events.options);
      }
      _eventForwarders[type] = func;
    }
    return func;
  }

  // set up the XHR eventing behavior
  // "model" is to trigger events on and "sourceModel" is the model to provide to the success/error callbacks
  // these are the same unless there is event forwarding in which case the "sourceModel" is the model that actually
  // triggered the events and "model" is just forwarding those events
  function initializeXHRLoading(method, model, sourceModel, options) {
    var loads = model[xhrLoadingAttribute] = model[xhrLoadingAttribute] || [],
      eventName = options && options.event || method,
      context = new Context(method, sourceModel, options);

    var scopedEventName = xhrEventName + ':' + eventName;
    model.trigger(xhrEventName, eventName, context);
    model.trigger(scopedEventName, context);
    if (model === sourceModel) {
      // don't call global events if this is XHR forwarding
      globalXhrBus.trigger(xhrEventName, eventName, model, context);
      globalXhrBus.trigger(scopedEventName, model, context);
    }

    // allow for 1 last override
    var _beforeSend = options.beforeSend;
    options.beforeSend = function(xhr, settings) {
      context.xhr = xhr;
      context.settings = settings;

      if (_beforeSend) {
        var rtn = _beforeSend.call(this, xhr, settings);
        if (rtn === false) {
          return rtn;
        }
      }
      context.trigger('before-send', xhr, settings, context);
      if (context.preventDefault) {
        return false;
      }
      loads.push(context);
    };


    function onComplete(type) {
      var _type = options[type];
      // success: (data, status, xhr);  error: (xhr, type, error)
      options[type] = function (p1, p2, p3) {
        if (type === SUCCESS && !context.preventDefault) {
          // trigger the "data" event which allows manipulation of the response before any other events or callbacks are fired
          context.trigger('after-send', p1, p2, p3, type, context);
          p1 = context.data || p1;
          // if context.preventDefault is true, it is assumed that the option success or callback will be manually called
          if (context.preventDefault) {
            return;
          }
        }

        // options callback
        var _args = arguments;
        if (_type) {
          _type.call(this, p1, p2, p3);
        }

        // remove the load entry
        var index = loads.indexOf(context);
        if (index >= 0) {
          loads.splice(index, 1);
        }

        // if there are no more cuncurrent XHRs, model[xhrLoadingAttribute] should always be undefind
        if (loads.length === 0) {
          model[xhrLoadingAttribute] = undefined;
          model.trigger(xhrCompleteEventName, context);
        }

        // trigger the success/error event
        var args = (type === SUCCESS) ? [type, context] : [type, p1, p2, p3, context];
        context.trigger.apply(context, args);

        // trigger the complete event
        args.splice(0, 0, 'complete');
        context.trigger.apply(context, args);
      };
    }
    onComplete(SUCCESS);
    onComplete(ERROR);

    return context;
  }

/*******************
 * end of backbone-xhr-events
********************/
})();


(function() {
/*******************
 * react-mixin-manager
 * https://github.com/jhudson8/react-mixin-manager
********************/

  /**
   * return the normalized mixin list
   * @param values {Array} list of mixin entries
   * @param index {Object} hash which contains a truthy value for all named mixins that have been added
   * @param initiatedOnce {Object} hash which collects mixins and their parameters that should be initiated once
   * @param rtn {Array} the normalized return array
   */
  function get(values, index, initiatedOnce, rtn) {

    /**
     * add the named mixin and all un-added dependencies to the return array
     * @param the mixin name
     */
    function addTo(name) {
      var indexName = name,
          match = name.match(/^([^\(]*)\s*\(([^\)]*)\)\s*/),
          params = match && match[2];
      name = match && match[1] || name;

      if (!index[indexName]) {
        if (params) {
          // there can be no function calls here because of the regex match
          params = eval('[' + params + ']');
        }
        var mixin = React.mixins._mixins[name],
            checkAgain = false,
            skip = false;

        if (mixin) {
          if (typeof mixin === 'function') {
            if (React.mixins._initiatedOnce[name]){
              initiatedOnce[name] = (initiatedOnce[name] || []);
              initiatedOnce[name].push(params);
              skip = true;
            } else {
              mixin = mixin.apply(this, params || []);
              checkAgain = true;
            }
          } else if (params) {
            throw new Error('the mixin "' + name + '" does not support parameters');
          }
          get(React.mixins._dependsOn[name], index, initiatedOnce, rtn);
          get(React.mixins._dependsInjected[name], index, initiatedOnce, rtn);

          index[indexName] = true;
          if (checkAgain) {
            get([mixin], index, initiatedOnce, rtn);
          } else if (!skip) {
            rtn.push(mixin);
          }

        } else {
          throw new Error('invalid mixin "' + name + '"');
        }
      }
    }

    function handleMixin(mixin) {
      if (mixin) {
        if (Array.isArray(mixin)) {
          // flatten it out
          get(mixin, index, initiatedOnce, rtn);
        } else if (typeof mixin === 'string') {
          // add the named mixin and all of it's dependencies
          addTo(mixin);
        } else {
          // just add the mixin normally
          rtn.push(mixin);
        }
      }
    }

    if (Array.isArray(values)) {
      for (var i=0; i<values.length; i++) {
        handleMixin(values[i]);
      }
    } else {
      handleMixin(values);
    }
  }

  /**
   * add the mixins that should be once initiated to the normalized mixin list
   * @param mixins {Object} hash of mixins keys and list of its parameters
   * @param rtn {Array} the normalized return array
   */
  function getInitiatedOnce(mixins, rtn) {

    /**
      * added once initiated mixins to return array
      */
    function addInitiatedOnce(mixin, params){
      mixin = mixin.apply(this, params || []);
        rtn.push(mixin);
      }

      for (var m in mixins){
        if (mixins.hasOwnProperty(m)){
          addInitiatedOnce(React.mixins._mixins[m], mixins[m]);
        }
      }
  }

  // allow for registered mixins to be extract just by using the standard React.createClass
  var _createClass = React.createClass;
  React.createClass = function(spec) {
    if (spec.mixins) {
      spec.mixins = React.mixins.get(spec.mixins);
    }
    return _createClass.apply(React, arguments);
  };

  function addMixin(name, mixin, depends, override, initiatedOnce) {
    var mixins = React.mixins;
    if (!override && mixins._mixins[name]) {
      return;
    }
    mixins._dependsOn[name] = depends.length && depends;
    mixins._mixins[name] = mixin;

    if (initiatedOnce){
      mixins._initiatedOnce[name] = true;
    }
  }

  function GROUP() {
    // empty function which is used only as a placeholder to list dependencies
  }

  function mixinParams(args, override) {
    var name,
        options = args[0],
        initiatedOnce = false;

    if (typeof(options) === 'object'){
      name = options.name;
      initiatedOnce = options.initiatedOnce;
    } else {
      name = options;
    }

    if (!name || !name.length){
        throw new Error('the mixin name hasn\'t been specified');
    }

    if (Array.isArray(args[1])) {
      return [name, args[1][0], Array.prototype.slice.call(args[1], 1), override, initiatedOnce];
    } else {
      return [name, args[1], Array.prototype.slice.call(args, 2), override, initiatedOnce]
    }
  }

  React.mixins = {
    /**
     * return the normalized mixins.  there can be N arguments with each argument being
     * - an array: will be flattened out to the parent list of mixins
     * - a string: will match against any registered mixins and append the correct mixin
     * - an object: will be treated as a standard mixin and returned in the list of mixins
     * any string arguments that are provided will cause any dependent mixins to be included
     * in the return list as well
     */
    get: function() {
      var rtn = [],
          index = {},
          initiatedOnce = {};

      get(Array.prototype.slice.call(arguments), index, initiatedOnce, rtn);
      getInitiatedOnce(initiatedOnce, rtn);
      return rtn;
    },

    /**
     * Inject dependencies that were not originally defined when a mixin was registered
     * @param name {string} the main mixin name
     * @param (any additional) {string} dependencies that should be registered against the mixin
     */
    inject: function(name) {
      var l = this._dependsInjected[name];
      if (!l) {
        l = this._dependsInjected[name] = [];
      }
      l.push(Array.prototype.slice.call(arguments, 1));
    },

    alias: function(name) {
      addMixin(name, GROUP, Array.prototype.slice.call(arguments, 1), false);
    },

    add: function(options, mixin) {
      addMixin.apply(this, mixinParams(arguments, false));
    },

    replace: function(options, mixin) {
      addMixin.apply(this, mixinParams(arguments, true));
    },

    exists: function(name) {
      return this._mixins[name] || false;
    },

    _dependsOn: {},
    _dependsInjected: {},
    _mixins: {},
    _initiatedOnce: {}
  };

  /**
   * mixin that exposes a "deferUpdate" method which will call forceUpdate after a setTimeout(0) to defer the update.
   * This allows the forceUpdate method to be called multiple times while only executing a render 1 time.  This will
   * also ensure the component is mounted before calling forceUpdate.
   *
   * It is added to mixin manager directly because it serves a purpose that benefits when multiple plugins use it
   */
  React.mixins.add('deferUpdate', {
    getInitialState: function() {
      // ensure that the state exists because we don't want to call setState (which will cause a render)
      return {};
    },
    deferUpdate: function() {
      var state = this.state;
      if (!state._deferUpdate) {
        state._deferUpdate = true;
        var self = this;
        setTimeout(function() {
          delete state._deferUpdate;
          if (self.isMounted()) {
            self.forceUpdate();
          }
        }, 0);
      }
    }
  });

  /**
   * very simple mixin that ensures that the component state is an object.  This is useful if you
   * know a component will be using state but won't be initialized with a state to prevent a null check on render
   */
  React.mixins.add('state', {
    getInitialState: function() {
      return {};
    }
  });

/*******************
 * end of react-mixin-manager
********************/
})();



(function() {
/*******************
 * react-events
 * https://github.com/jhudson8/react-events
********************/

  var handlers = {},
      patternHandlers = [],
      splitter = /^([^:]+):?(.*)/,
      specialWrapper = /^\*([^\(]+)\(([^)]*)\):(.*)/,
      noArgMethods = ['forceUpdate'];

  // wrapper for event implementations - includes on/off methods
  function createHandler(event, callback, context, dontWrapCallback) {
    if (!dontWrapCallback) {
      var _callback = callback,
          noArg;
      if (typeof callback === 'object') {
        // use the "callback" attribute to get the callback function.  useful if you need to reference the component as "this"
        _callback = callback.callback.call(this);
      }
      if (typeof callback === 'string') {
        noArg = (noArgMethods.indexOf(callback) >= 0);
        _callback = context[callback];
      }
      if (!_callback) {
        throw 'no callback function exists for "' + callback + '"';
      }
      callback = function() {
        return _callback.apply(context, noArg ? [] : arguments);
      };
    }

    // check for special wrapper function
    var match = event.match(specialWrapper);
    if (match) {
      var specialMethodName = match[1],
          args = match[2].split(/\s*,\s*/),
          rest = match[3],
          specialHandler = React.events.specials[specialMethodName];
      if (specialHandler) {
        if (args.length === 1 && args[0] === '') {
          args = [];
        }
        callback = specialHandler.call(context, callback, args);
        return createHandler(rest, callback, context, true);
      } else {
        throw new Error('invalid special event handler "' + specialMethodName + "'");
      }
    }

    var parts = event.match(splitter),
        handlerName = parts[1];
        path = parts[2],
        handler = handlers[handlerName];

    // check pattern handlers if no match
    for (var i=0; !handler && i<patternHandlers.length; i++) {
      if (handlerName.match(patternHandlers[i].pattern)) {
        handler = patternHandlers[i].handler;
      }
    }
    if (!handler) {
      throw 'no handler registered for "' + event + '"';
    }

    return handler.call(context, {key: handlerName, path: path}, callback);
  }

  // predefined templates of common handler types for simpler custom handling
  var handlerTemplates = {

    /**
     * Return a handler which will use a standard format of on(eventName, handlerFunction) and off(eventName, handlerFunction)
     * @param data {object} handler options
     *   - target {object or function()}: the target to bind to or function(name, event) which returns this target ("this" is the React component)
     *   - onKey {string}: the function attribute used to add the event binding (default is "on")
     *   - offKey {string}: the function attribute used to add the event binding (default is "off")
     */
    standard: function(data) {
      var accessors = {
            on: data.onKey || 'on',
            off: data.offKey || 'off'
          },
          target = data.target;
      return function(options, callback) {
        var path = options.path;
        function checkTarget(type, context) {
          return function() {
            var _target = (typeof target === 'function') ? target.call(context, path) : target;
            if (_target) {
              // register the handler
              _target[accessors[type]](path, callback);
            }
          };
        }

        return {
          on: checkTarget('on', this),
          off: checkTarget('off', this),
          initialize: data.initialize
        };
      };
    }
  };

  var eventManager = React.events = {
    // placeholder for special methods
    specials: {},

    /**
     * Register an event handler
     * @param identifier {string} the event type (first part of event definition)
     * @param handlerOrOptions {function(options, callback) *OR* options object}
     *
     * handlerOrOptions as function(options, callback) a function which returns the object used as the event handler.
     *      @param options {object}: will contain a *path* attribute - the event key (without the handler key prefix).
     *           if the custom handler was registered as "foo" and events hash was { "foo:abc": "..." }, the path is "abc"
     *      @param callback {function}: the callback function to be bound to the event
     *
     * handlerOrOptions as options: will use a predefined "standard" handler;  this assumes the event format of "{handler identifier}:{target identifier}:{event name}"
     *      @param target {object or function(targetIdentifier, eventName)} the target to bind/unbind from or the functions which retuns this target
     *      @param onKey {string} the attribute which identifies the event binding function on the target (default is "on")
     *      @param offKey {string} the attribute which identifies the event un-binding function on the target (default is "off")
     */
    handle: function(identifier, optionsOrHandler) {
      if (typeof optionsOrHandler !== 'function') {
        // it's options
        optionsOrHandler = handlerTemplates[optionsOrHandler.type || 'standard'](optionsOrHandler);
      }
      if (identifier instanceof RegExp) {
        patternHandlers.push({pattern: identifier, handler: optionsOrHandler});
      } else {
        handlers[identifier] = optionsOrHandler;
      }
    }
  };


  //// REGISTER THE DEFAULT EVENT HANDLERS
  if (typeof window != 'undefined') {
    /**
     * Bind to window events
     * format: "window:{event name}"
     * example: events: { 'window:scroll': 'onScroll' }
     */
    eventManager.handle('window', {
      target: window,
      onKey: 'addEventListener',
      offKey: 'removeEventListener'
    });
  }

  /**
   * Bind to events on components that are given a [ref](http://facebook.github.io/react/docs/more-about-refs.html)
   * format: "ref:{ref name}:{event name}"
   * example: "ref:myComponent:something-happened": "onSomethingHappened"
   */
  eventManager.handle('ref', function(options, callback) {
    var parts = options.path.match(splitter),
        refKey = parts[1],
        event = parts[2],
        bound, componentState;
    return {
      on: function() {
        var target = this.refs[refKey];
        if (target) {
          componentState = target.state || target;
          target.on(event, callback);
          bound = target;
        }
      },
      off: function() {
        if (bound) {
          bound.off(event, callback);
          bound = undefined;
          componentState = undefined;
        }
      },
      isStale: function() {
        if (bound) {
          var target = this.refs[refKey];
          if (!target || (target.state || target) !== componentState) {
            // if the target doesn't exist now and we were bound before or the target state has changed we are stale
            return true;
          }
        } else {
          // if we weren't bound before but the component exists now, we are stale
          return !!this.refs[refKey];
        }
      }
    };
  });

  /**
   * Bind to DOM element events (recommended solution is to use React "on..." attributes)
   * format: "dom:{event names separated with space}:{element selector}"
   * example: events: { 'dom:click:a': 'onAClick' }
   */
  eventManager.handle('dom', function(options, callback) {
    var parts = options.path.match(splitter);
    return {
      on: function() {
        $(this.getDOMNode()).on(parts[1], parts[2], callback);
      },
      off: function() {
        $(this.getDOMNode()).off(parts[1], parts[2], callback);
      }
    };
  });


  /**
   * Allow binding to setInterval events
   * format: "repeat:{milis}"
   * example: events: { 'repeat:3000': 'onRepeat3Sec' }
   */
  eventManager.handle('repeat', function(options, callback) {
    var delay = parseInt(options.path, 10), id;
    return {
      on: function() {
        id = setInterval(callback, delay);
      },
      off: function() {
        id = !!clearInterval(id);
      }
    };
  });


  /**
   * Like setInterval events *but* will only fire when the user is actively viewing the web page
   * format: "!repeat:{milis}"
   * example: events: { '!repeat:3000': 'onRepeat3Sec' }
   */
  eventManager.handle('!repeat', function(options, callback) {
    var delay = parseInt(options.path, 10), keepGoing;
    function doInterval(suppressCallback) {
      if (suppressCallback !== true) {
        callback();
      }
      setTimeout(function() {
        if (keepGoing) {
          requestAnimationFrame(doInterval);
        }
      }, delay);
    }
    return {
      on: function() {
        keepGoing = true;
        doInterval(true);
      },
      off: function() {
        keepGoing = false;
      }
    };
  });

  //// REGISTER THE REACT MIXIN
  React.mixins.add('events', function() {
    var rtn = [{
      /**
       * Return a callback fundtion that will trigger an event on "this" when executed with the provided parameters
       */
      triggerWith: function(eventName) {
        var args = Array.prototype.slice.call(arguments),
            self = this;
        return function() {
          self.trigger.apply(this, args);
        };
      },

      getInitialState: function() {
        var handlers = this._eventHandlers = [];
        if (this.events) {
          var handler;
          for (var event in this.events) {
            handler = createHandler(event, this.events[event], this);
            if (handler.initialize) {
              handler.initialize.call(this);
            }
            handlers.push(handler);
          }
        }
        return null;
      },

      componentDidUpdate: function() {
        var handlers = this._eventHandlers, handler;
        for (var i=0; i<handlers.length; i++) {
          handler = handlers[i];
          if (handler.isStale && handler.isStale.call(this)) {
            handler.off.call(this);
            handler.on.call(this);
          }
        }
      },

      componentDidMount: function() {
        var handlers = this._eventHandlers;
        for (var i=0; i<handlers.length; i++) {
          handlers[i].on.call(this);
        }
      },

      componentWillUnmount: function() {
        var handlers = this._eventHandlers;
        for (var i=0; i<handlers.length; i++) {
          handlers[i].off.call(this);
        }
      }
    }];

    function bind(func, context) {
      return function() {
        func.apply(context, arguments);
      };
    }
    if (eventManager.mixin) {
      var eventHandlerMixin = {},
          state = {};
      for (var name in eventManager.mixin) {
        eventHandlerMixin[name] = bind(eventManager.mixin[name], state);
      }
      eventHandlerMixin.getInitialState = function() {
        return {
          __events: state
        };
      };
      rtn.push(eventHandlerMixin);
    }
    // React.eventHandler.mixin should contain impl for "on" "off" and "trigger"
    return rtn;
  });

/*******************
 * end of react-events
********************/
})();


(function() {
/*******************
 * react-backbone
 * https://github.com/jhudson8/react-backbone
********************/

  var xhrEventName = Backbone.xhrEventName;
  var xhrCompleteEventName = Backbone.xhrCompleteEventName;
  var xhrModelLoadingAttribute = Backbone.xhrModelLoadingAttribute;

  function getModelByPropkey(key, context, useGetModel) {
    var model;
    if (key) {
      model = context.props[key];
      if (!model) {
        throw new Error('No model found for "' + key + '"');
      }
    } else if (useGetModel) {
      model = context.getModel();
    }
    return model;
  }

  function setState(state, context) {
    if (context.isMounted()) {
      context.setState(state);
    } else if (context.state)  {
      _.extend(context.state, state);
    } else {
      // if we aren't mounted, we will get an exception if we try to set the state
      // so keep a placeholder state until we're mounted
      // this is mainly useful if setModel is called on getInitialState
      context.__react_backbone_state = _.extend(context.__react_backbone_state || {}, state);
    }
  }

  function getState(key, context) {
    var state = context.state,
        initState = context.__react_backbone_state;
    return (state && state[key]) || (initState && initState[key]);
  }

  function eventParser(src) {
    if (!src) {
      return;
    }
    if (_.isArray(src)) {
      return src;
    }
    return [src];
  }

  function getKey(context) {
    return context.key || context.ref || context.props.key || context.props.ref;
  }

  function modelEventHandler(identifier, context, eventFormat, callback) {
    var keys = Array.isArray(identifier) ? identifier : eventParser(context.props[identifier]),
        key, eventName;
    if (keys) {
      // register the event handlers to watch for these events
      for (var i=0; i<keys.length; i++) {
        key = keys[i];
        eventName = eventFormat.replace('{key}', key);
        context.modelOn(eventName, _.bind(callback, context), this);
      }
      return keys;
    }
  }


  /**
   * Internal model event binding handler
   * (type(on|once|off), {event, callback, context, model})
   */
  function onEvent(type, data) {
    var eventsParent = this;
    data = _.extend({type: type}, data);
    var modelEvents = getState('__modelEvents', this);
    if (!modelEvents) {
      modelEvents = [];
      setState({__modelEvents: modelEvents}, this);
    }
    data.context = data.context || this;
    modelEvents.push(data);

    // bind now if we are already mounted (as the mount function won't be called)
    if (this.isMounted()) {
      var model = data.model || this.getModel();
      if (model) {
        model[data.type](data.event, data.callback, data.context);
      }
    }
  }


  /**
   * Simple overrideable mixin to get/set models.  Model can
   * be set on props or by calling setModel
   */
  React.mixins.add('modelAware', {
    componentWillMount: function() {
      // not directly related to this mixin but all of these mixins have this as a dependency
      // if setState was called before the component was mounted, the actual component state was
      // not set because it might not exist.  Convert the pretend state to the real thing
      // (but don't trigger a render)
      var _state = this.__react_backbone_state;
      if (_state) {
        this.state = _.extend(this.state || {}, _state);
        delete this.__react_backbone_state;
      }
    },

    getModel: function() {
      return getState('model', this) || getState('collection', this)
          || this.props.model || this.props.collection;
    },

    setModel: function(model) {
      if (this._modelUnbindAll) {
        this._modelUnbindAll(true);
      }
      setState({model: model}, this);
      if (this._modelBindAll && this.isMounted()) {
        // bind all events if using modelEventAware
        this._modelBindAll();
      }
    }
  });


  /**
   * Simple overrideable mixin to get/set model values.  While this is trivial to do
   * it allows 3rd party to work with stubs which this can override.  This is basically
   * an interface which allows the "modelPopulator" mixin to retrieve values from components
   * that should be set on a model.
   *
   * This allows model value oriented components to work with models without setting the updated
   * values directly on the models until the user performs some specific action (like clicking a save button).
   */
  React.mixins.add('modelValueAware', function(key) {
    return {
      getModelValue: function() {
        var _key = key || getKey(this);
        var model = this.getModel();
        if (model && _key) {
          return model.get(_key);
        }
      },

      setModelValue: function(value, options) {
        var _key = key || getKey(this);
        var model = this.getModel();
            model = this.getModel();
        if (model && _key) {
          return model.set(_key, value, options);
        }
      }
    }
  }, 'modelAware');


  /**
   * Iterate through the provided list of components (or use this.refs if components were not provided) and
   * return a set of attributes.  If a callback is provided as the 2nd parameter and this component includes
   * the "modelAware" mixin, set the attributes on the model and execute the callback if there is no validation error.
   */
  React.mixins.add('modelPopulate', {
    modelPopulate: function(components, callback, options) {
      if (_.isFunction(components)) {
        // allow callback to be provided as first function if using refs
        options = callback;
        callback = components;
        components = undefined;
      }
      var attributes = {};
      if (!components) {
        // if not components were provided, use "refs" (http://facebook.github.io/react/docs/more-about-refs.html)
        components = _.map(this.refs, function(value) {return value;});
      }
      _.each(components, function(component) {
        // the component *must* implement getValue
        if (component.getUIModelValue) {
          var key = getKey(component),
              value = component.getUIModelValue();
          attributes[key] = value;
        }
      });
      if (callback && this.getModel) {
        var model = this.getModel();
        if (model) {
          if (model.set(attributes, options || {validate: true})) {
            callback.call(this, model);
          }
        }
      }
      return attributes;
    }
  }, 'modelAware');


  /**
   * Expose a "modelValidate(attributes, options)" method which will run the backbone model validation
   * against the provided attributes.  If invalid, a truthy value will be returned containing the
   * validation errors.
   */
  React.mixins.add('modelValidator', {
    modelValidate: function(attributes, options) {
      var model = this.getModel();
      if (model && model.validate) {
        return this.modelIndexErrors(model.validate(attributes, options)) || false;
      }
    }
  }, 'modelAware', 'modelIndexErrors');


  /**
   * Exposes model binding registration functions that will
   * be cleaned up when the component is unmounted and not actually registered
   * until the component is mounted.  The context will be "this" if not provided.
   */
  React.mixins.add('modelEventAware', {
    getInitialState: function() {
      return {};
    },

    // model.on
    // ({event, model, callback, context}) or event, callback
    modelOn: function (event, callback) {
      var data = callback ? {event: event, callback: callback} : event;
      onEvent.call(this, 'on', data);
    },

    // model.once
    modelOnce: function (event, callback) {
      var data = callback ? {event: event, callback: callback} : event;
      onEvent.call(this, 'once', data);
    },

    modelOff: function (event, callback) {
      var data = callback ? {event: event, callback: callback} : event,
          modelEvents = this.state.__modelEvents;
      if (modelEvents) {
        // find the existing binding
        var _event;
        for (var i=0; i<modelEvents.length; i++) {
          _event = modelEvents[i];
          if (_event.event === data.event && _event.model === data.model && _event.callback === data.callback) {
            var model = data.model || this.getModel();
            if (model) {
              model.off(data.event, data.callback, data.context || this);
            }
            modelEvents.splice(i, 1);
          }
        }
      }
    },

    // bind all registered events to the model
    _modelBindAll: function() {
      var modelEvents = getState('__modelEvents', this);
      if (modelEvents) {
        var thisModel = this.getModel();
        _.each(modelEvents, function(data) {
          var model = data.model || thisModel;
          if (model) {
            model[data.type](data.event, data.callback, data.context);
          }
        });
      }
    },

    // unbind all registered events from the model
    _modelUnbindAll: function(keepRegisteredEvents) {
      var modelEvents = getState('__modelEvents', this);
      if (modelEvents) {
        var thisModel = this.getModel();
        _.each(modelEvents, function(data) {
          var model = data.model || thisModel;
          if (model) {
            model.off(data.event, data.callback, data.context);
          }
        });
        if (!keepRegisteredEvents) {
          setState({__modelEvents: []}, this);
        }
      }
    },

    componentDidMount: function() {
      // sanity check to prevent duplicate binding
      this._modelUnbindAll(true);
      this._modelBindAll(true);
    },

    componentWillUnmount: function() {
      this._modelUnbindAll(true);
    }
  }, 'modelAware');


  /**
   * Mixin used to force render any time the model has changed
   */
  React.mixins.add('modelChangeAware', {
    getInitialState: function() {
      _.each(['change', 'reset', 'add', 'remove', 'sort'], function(type) {
        this.modelOn(type, function() { this.deferUpdate(); });
      }, this);
      return null;
    }
  }, 'modelEventAware', 'deferUpdate');


  // THE FOLLING MIXINS ASSUME THE INCLUSION OF [backbone-xhr-events](https://github.com/jhudson8/backbone-xhr-events)

  /**
   * If the model executes *any* XHR activity, the internal state "loading" attribute
   * will be set to true and, if an error occurs with loading, the "error" state attribute
   * will be set with the error contents
   */
  React.mixins.add('modelXHRAware', {
    getInitialState: function() {
      this.modelOn(xhrEventName, function(eventName, events) {
        setState({loading: true}, this);

        var model = this.getModel();
        events.on('success', function() {
          setState({loading: model[xhrModelLoadingAttribute]}, this);
        }, this);
        events.on('error', function(error) {
          setState({loading: model[xhrModelLoadingAttribute], error: error}, this);
        }, this);
      });

      var model = this.getModel();
      return {loading: model && model[xhrModelLoadingAttribute]};
    },

    componentDidMount: function() {
      // make sure the model didn't get into a non-loading state before mounting
      var state = this.state,
          model = this.getModel();
      if (model) {
        var loading = model[xhrModelLoadingAttribute];
        if (loading) {
          // we're still loading yet but we haven't yet bound to this event
          this.modelOnce(xhrCompleteEventName, function() {
            setState({loading: false}, this);
          });
          if (!state.loading) {
            setState({loading: true}, this);
          }
        } else if (state.loading) {
          setState({loading: false}, this);
        }
      }
    }
  }, 'modelEventAware');


  /**
   * Using the "key" property, bind to the model and look for invalid events.  If an invalid event
   * is found, set the "error" state to the field error message.  Use the "modelIndexErrors" mixin
   * to return the expected error format: { field1Key: errorMessage, field2Key: errorMessage, ... }
   */
  React.mixins.add('modelInvalidAware', {
    getInitialState: function() {
      var key = getKey(this);
      if (key) {
        this.modelOn('invalid', function(model, errors) {
          var _errors = this.modelIndexErrors(errors) || {};
          var message = _errors && _errors[key];
          if (message) {
            setState({invalid: message}, this);
          }
        });
      }
      return {};
    }
  }, 'modelIndexErrors', 'modelEventAware');


  /**
   * Expose an indexModelErrors method which returns model validation errors in a standard format.
   * expected return is { field1Key: errorMessage, field2Key: errorMessage, ... }
   *
   * This implementation will look for [{field1Key: message}, {field2Key: message}, ...]
   */
  React.mixins.add('modelIndexErrors', {
    modelIndexErrors: function(errors) {
      if (Array.isArray(errors)) {
        var rtn = {};
        _.each(errors, function(data) {
          var key, message;
          for (var name in data) {
            rtn[name] = data[name];
          }
        });
        return rtn;
      } else {
        return errors;
      }
    }
  });


  /**
   * Gives any comonent the ability to mark the "loading" attribute in the state as true
   * when any async event of the given type (defined by the "key" property) occurs.
   */
  React.mixins.add('modelLoadOn', function() {
    var keys = arguments.length > 0 ? Array.prototype.slice.call(arguments, 0) : undefined;
    return {
      getInitialState: function() {
        keys = modelEventHandler(keys || 'loadOn', this, xhrEventName + ':{key}', function(events) {
          var model = this.getModel();
          setState({loading: model[xhrModelLoadingAttribute]}, this);
          events.on('complete', function() {
            setState({loading: false}, this);
          }, this);
        });

        // see if we are currently loading something
        var model = this.getModel();
        if (model) {
          var currentLoads = model.loading,
              key;
          if (currentLoads) {
            var clearLoading = function() {
              setState({loading: false}, this);
            }
            for (var i=0; i<currentLoads.length; i++) {
              var keyIndex = keys.indexOf(currentLoads[i].method);
              if (keyIndex >= 0) {
                // there is currently an async event for this key
                key = keys[keyIndex];
                currentLoads[i].on('complete', clearLoading, this);
                return {loading: model[xhrModelLoadingAttribute]};
              }
            }
          }
        }
        return {};
      },

      /**
       * Intercept (and return) the options which will set the loading state (state.loading = true) when this is called and undo
       * the state once the callback has completed
       */
      loadWhile: function(options) {
        options = options || {};
        var self = this;
        function wrap(type) {
          var _callback = options[type];
          options[type] = function() {
            setState({loading: false}, self);
            if (_callback) {
              _callback.apply(this, arguments);
            }
          }
        }
        wrap('error');
        wrap('success');
        setState({loading: true}, this);
        return options;
      }
    }
  }, 'modelEventAware');


  /**
   * Gives any comonent the ability to force an update when an event is fired
   */
  React.mixins.add('modelUpdateOn', function() {
    var keys = arguments.length > 0 ? Array.prototype.slice.call(arguments, 0) : undefined;
    return {
      getInitialState: function() {
        modelEventHandler(keys || 'updateOn', this, '{key}', function() {
          this.deferUpdate();
        });
      }
    };
  }, 'modelEventAware', 'deferUpdate');


  // if [react-events](https://github.com/jhudson8/react-events) is included, provide some nice integration
  if (React.events) {
    // set Backbone.Events as the default Events mixin
    React.events.mixin = React.events.mixin || Backbone.Events;

    /**
     * Support the "model:{event name}" event, for example:
     * events {
     *   'model:something-happened': 'onSomethingHappened'
     * }
     * ...
     * onSomethingHappened: function() { ... }
     *
     * When using these model events, you *must* include the "modelEventAware" mixin
     */
    var _modelPattern = /^model(\[.+\])?$/;
    React.events.handle(_modelPattern, function(options, callback) {
      var match = options.key.match(_modelPattern),
          modelKey = match[1] && match[1].substring(1, match[1].length-1),
          model = modelKey && (this.props[modelKey] || this.refs[modelKey]);
      if (!model && modelKey) {
        throw new Error('no model found with "' + modelKey + '"');
      }
      var data = {
        model: model,
        event: options.path,
        callback: callback
      };
      return {
        on: function() {
          this.modelOn(data);
        },
        off: function() { /* NOP, modelOn will clean up */ }
      };
    });

    var specials = React.events.specials;
    if (specials) {
      // add underscore wrapped special event handlers
      function parseArgs(args) {
        var arg;
        for (var i=0; i<args.length; i++) {
          arg = args[i];
          if (arg === 'true') {
            arg = true;
          } else if (arg === 'false') {
            arg = false;
          } else if (arg.match(/^[0-9]+$/)) {
            arg = parseInt(arg);
          } else if (arg.match(/^[0-9]+\.[0-9]+/)) {
            arg = parseFloat(arg);
          }
          args[i] = arg;
        }
        return args;
      }
      var reactEventSpecials = ['memoize', 'delay', 'defer','throttle', 'debounce', 'once'];
      _.each(reactEventSpecials, function(name) {
        specials[name] = specials[name] || function(callback, args) {
          args = parseArgs(args);
          args.splice(0, 0, callback);
          return _[name].apply(_, args);
        };
      });
    }
  }

  // Standard input components that implement react-backbone model awareness
  var _inputClass = function(type, attributes, isCheckable, classAttributes) {
    return React.createClass(_.extend({
        mixins: ['modelValueAware'],
        render: function() {
          var props = {};
          var defaultValue = this.getModelValue();
          if (isCheckable) {
            props.defaultChecked = defaultValue;
          } else {
            props.defaultValue = defaultValue;
          }
          return React.DOM[type](_.extend(props, attributes, this.props), this.props.children);
        },
        getUIModelValue: function() {
          if (this.isMounted()) {
            if (isCheckable) {
              var el = this.getDOMNode();
              if (el.checked) {
                return el.value || true;
              }
            } else {
              return $(this.getDOMNode()).val();
            }
          }
        }
      }, classAttributes));
  };

  Backbone.input = Backbone.input || {};
  _.defaults(Backbone.input, {
    Text: _inputClass('input', {type: 'text'}),
    TextArea: _inputClass('textarea'),
    Select: _inputClass('select', undefined, undefined),
    CheckBox: _inputClass('input', {type: 'checkbox'}, true),
    RadioGroup: React.createClass({
      mixins: ['modelValueAware'],
      render: function() {
        var props = this.props;
        return React.DOM[props.tag || 'span'](props, props.children);
      },
      componentDidMount: function() {
        // select the appropriate radio button
        var value = this.getModelValue();
        if (value) {
          var selector = 'input[value="' + value.replace('"', '\\"') + '"]';
          var el = $(this.getDOMNode()).find(selector);
          el.attr('checked', 'checked');
        }
      },
      getUIModelValue: function() {
        if (this.isMounted()) {
          var selector = 'input[type="radio"]';
          var els = $(this.getDOMNode()).find(selector);
          for (var i=0; i<els.length; i++) {
            if (els[i].checked) {
              return els[i].value;
            }
          }
        }
      }
    })
  });

/*******************
 * end of react-backbone
********************/
})();

});
