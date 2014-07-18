/*!
 * reactive-backbone v0.6.0
 * https://github.com/jhudson8/reactive-backbone
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
  https://github.com/jhudson8/react-mixin-manager
  https://github.com/jhudson8/react-events
  https://github.com/jhudson8/backbone-async-event
  https://github.com/jhudson8/react-backbone
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

//// BACKBONE-ASYNC-EVENT
(function() {
  // allow backbone to send async events on models
  var _sync = Backbone.sync;
  Backbone.async = _.extend({}, Backbone.Events);
  Backbone.sync = function(method, model, options) {
    options = options || {};
    // Ensure that we have a URL.
    if (!options.url) {
      options.url = _.result(model, 'url');
    }

    var loads = model._pendingAsyncEvents = model._pendingAsyncEvents || [],
        eventName = options && options.event || method,
        lifecycleEvents = _.extend({}, Backbone.Events);
    loads.push(lifecycleEvents);
    lifecycleEvents.method = method;
    lifecycleEvents.options = options;
    lifecycleEvents.model = model;

    model.trigger('async', eventName, lifecycleEvents, options);
    model.trigger('async:' + eventName, lifecycleEvents, options);

    _.each([Backbone.async, Backbone.asyncHandler], function(handler) {
      if (handler) {
        handler.trigger('async', eventName, model, lifecycleEvents, options);
        handler.trigger('async:' + eventName, model, lifecycleEvents, options);
      }
    });

    function onComplete(type) {
      var _type = options[type];
      options[type] = function() {
        // options callback
        var _args = arguments;
        if (_type) {
          _type.apply(this, _args);
        }

        // remove the load entry
        var index = loads.indexOf(lifecycleEvents);
        if (index >= 0) {
          loads.splice(index, 1);
        }

        // trigger the success/error event (args for error: xhr, type, error)
        var args = (type === 'success') ? [type, model, options] : [type, model, _args[1], _args[2], options];
        lifecycleEvents.trigger.apply(lifecycleEvents, args);

        // trigger the complete event
        args.splice(0, 0, 'complete');
        lifecycleEvents.trigger.apply(lifecycleEvents, args);

        if (loads.length === 0) {
          model.trigger('async:load-complete');
        }
      };
    }
    onComplete('success');
    onComplete('error');

    var intercept = options.intercept;
    if (intercept) {
      if (typeof intercept === 'function') {
        return intercept(options);
      } else {
        throw "intercept must be function(options)";
      }
    }
    _sync.call(this, method, model, options);
  };

  _.each([Backbone.Model, Backbone.Collection], function(clazz) {
    clazz.prototype.isLoading = function() {
      if (this._pendingAsyncEvents && this._pendingAsyncEvents.length > 0) {
        // if we are loading, return the array of pending events as the truthy
        return this._pendingAsyncEvents;
      }
      return false;
    };
  });
  Backbone.async.on('async:read', function(model, events) {
    events.on('success', function() {
      model.hasBeenFetched = true;
      model.hadFetchError = false;
    });
    events.on('error', function() {
      model.hadFetchError = true;
    });
  });
})();
//// END OF BACKBONE-ASYNC-EVENT

//// REACT-MIXIN-MANAGER
(function() {
  /**
   * return the normalized mixin list
   * @param values {Array} list of mixin entries
   * @param index {Object} hash which contains a truthy value for all named mixins that have been added
   * @param rtn {Array} the normalized return array
   */
  function get(values, index, rtn) {

    /**
     * add the named mixin and all un-added dependencies to the return array
     * @param the mixin name
     */
    function addTo(name) {
      if (!index[name]) {
        var mixin = React.mixins._mixins[name],
            checkAgain = false;
        if (mixin) {
          if (typeof mixin === 'function') {
            mixin = mixin();
            checkAgain = true;
          }
          get(React.mixins._dependsOn[name], index, rtn);
          get(React.mixins._dependsInjected[name], index, rtn);

          index[name] = true;
          if (checkAgain) {
            get([mixin], index, rtn);
          } else {
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
          get(mixin, index, rtn);
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

  // allow for registered mixins to be extract just by using the standard React.createClass
  var _createClass = React.createClass;
  React.createClass = function(spec) {
    if (spec.mixins) {
      spec.mixins = React.mixins.get(spec.mixins);
    }
    return _createClass.apply(React, arguments);
  };

  function addMixin(name, mixin, depends, override) {
    var mixins = React.mixins;
    if (!override && mixins._mixins[name]) {
      return;
    }
    mixins._dependsOn[name] = depends.length && depends;
    mixins._mixins[name] = mixin;
  }

  function GROUP() {
    // empty function which is used only as a placeholder to list dependencies
  }

  function mixinParams(args, override) {
    if (Array.isArray(args[1])) {
      return [args[0], args[1][0], Array.prototype.slice.call(args[1], 1), override];
    } else {
      return [args[0], args[1], Array.prototype.slice.call(args, 2), override]
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
          index = {};
      get(Array.prototype.slice.call(arguments), index, rtn);
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

    add: function(name, mixin) {
      addMixin.apply(this, mixinParams(arguments, false));
    },

    replace: function(name, mixin) {
      addMixin.apply(this, mixinParams(arguments, true));
    },

    exists: function(name) {
      return this._mixins[name] || false;
    },

    _dependsOn: {},
    _dependsInjected: {},
    _mixins: {}
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
})();
// END OF REACT-MIXIN-MANAGER

//// REACT-EVENTS
(function() {
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
        event = parts[2];
    return {
      on: function() {
        var target = this.refs[refKey];
        if (target) {
          target.on(event, callback);
        }
      },
      off: function() {
        var target = this.refs[refKey];
        if (target) {
          target.off(event, callback);
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

  React.mixins.add('triggerWith', {
    /**
     * Return a callback fundtion that will trigger an event on "this" when executed with the provided parameters
     */
    triggerWith: function(eventName) {
      var args = Array.prototype.slice.call(arguments),
          self = this;
      return function() {
        self.trigger.apply(this, args);
      };
    }
  });
})();
//// END OF REACT-EVENTS

//// REACT-BACKBONE
(function() {
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
    return context.props.key || context.props.ref;
  }

  function modelEventHandler(identifier, context, eventFormat, callback) {
    var keys = eventParser(context.props[identifier]),
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
    var eventsParent = this,
        modelEvents;
    data = _.extend({type: type}, data);
    if (this.state) {
      modelEvents = this.state.__modelEvents;
      eventsParent = this.state;
    } else {
      modelEvents = this.__modelEvents;
    }
    if (!modelEvents) {
      // don't call setState because this should not trigger a render
      modelEvents = eventsParent.__modelEvents = [];
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
    getModel: function() {
      return this.props.model;
    },

    setModel: function(model) {
      if (this._modelUnbindAll) {
        this._modelUnbindAll(true);
      }
      this.setProps({model: model});
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
  React.mixins.add('modelValueAware', {
    getModelValue: function() {
      var key = getKey(this),
          model = this.getModel();
      if (model && key) {
        return model.get(key);
      }
    },

    setModelValue: function(value, options) {
      var key = getKey(this),
          model = this.getModel();
      if (model && key) {
        return model.set(key, value, options);
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
        // the component *must* implement getUIValue
        if (component.getUIValue) {
          var key = getKey(component),
              value = component.getUIValue();
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
  });


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
      var modelEvents = this.__modelEvents;
      if (modelEvents) {
        // if events were registered before this time, move the cache to state
        delete this.__modelEvents;
        // don't use setState because there is no need to trigger a render
        this.state.__modelEvents = modelEvents;
      }

      modelEvents = this.state.__modelEvents;
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
      var modelEvents = this.state.__modelEvents,
          thisModel = this.getModel();
      if (modelEvents) {
        _.each(modelEvents, function(data) {
          var model = data.model || thisModel;
          if (model) {
            model.off(data.event, data.callback, data.context);
          }
        });
        if (!keepRegisteredEvents) {
          this.state.__modelEvents = [];
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


  // THE FOLLING MIXINS ASSUME THE INCLUSION OF [backbone-async-event](https://github.com/jhudson8/backbone-async-event)

  /**
   * If the model executes *any* asynchronous activity, the internal state "loading" attribute
   * will be set to true and, if an error occurs with loading, the "error" state attribute
   * will be set with the error contents
   */
  React.mixins.add('modelAsyncAware', {
    getInitialState: function() {
      this.modelOn('async', function(eventName, events) {
        this.setState({loading: true});

        var model = this.getModel();
        events.on('success', function() {
          if (this.isMounted()) {
            this.setState({loading: !!model.isLoading()});
          }
        }, this);
        events.on('error', function(error) {
          if (this.isMounted()) {
            this.setState({loading: !!model.isLoading(), error: error});
          }
        }, this);
      });

      var model = this.getModel();
      if (model && model.isLoading()) {
        return {loading: true};
      }
      return {};
    },

    componentDidMount: function() {
      // make sure the model didn't get into a non-loading state before mounting
      var state = this.state,
          model = this.getModel();
      if (model) {
        if (model.isLoading()) {
          // we're still loading yet but we haven't yet bound to this event
          this.modelOnce('async:load-complete', function() {
            this.setState({loading: false});
          });
          if (!state.loading) {
            this.setState({loading: true});
          }
        } else if (state.loading) {
          this.setState({loading: false});
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
          errors = this.modelIndexErrors(errors) || {};
          var message = errors[key];
          if (message) {
            this.setState({
              error: message
            });
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
  React.mixins.add('modelLoadOn', {
    getInitialState: function() {
      var keys = modelEventHandler('loadOn', this, 'async:{key}', function(events) {
        this.setState({loading: true});
        events.on('complete', function() {
          if (this.isMounted()) {
            this.setState({loading: false});
          }
        }, this);
      });

      // see if we are currently loading something
      var model = this.getModel();
      if (model) {
        var currentLoads = model.isLoading(),
            key;
        if (currentLoads) {
          var clearLoading = function() {
            if (this.isMounted()) {
              this.setState({loading: false});
            }
          }
          for (var i=0; i<currentLoads.length; i++) {
            var keyIndex = keys.indexOf(currentLoads[i].method);
            if (keyIndex >= 0) {
              // there is currently an async event for this key
              key = keys[keyIndex];
              currentLoads[i].on('complete', clearLoading, this);
              return {loading: true};
            }
          }
        }
      }
      return {};
    }
  }, 'modelEventAware');


  /**
   * Gives any comonent the ability to force an update when an event is fired
   */
  React.mixins.add('modelUpdateOn', {
    getInitialState: function() {
      var keys = modelEventHandler('updateOn', this, '{key}', function() {
        this.deferUpdate();
      });
    },

    updateOnModelEvent: function(/* events */) {
      function doUpdate() {
        this.deferUpdate();
      }
      _.each(arguments, function(event) {
        this.modelOn(event, doUpdate);
      }, this);
    }
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
})();
//// END OF REACT-BACKBONE

});

