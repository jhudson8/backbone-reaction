/* global, describe, it */

var chai = require('chai'),
    sinon = require('sinon'),
    sinonChai = require('sinon-chai'),
    expect = chai.expect,
    React = require('react'),
    Backbone = require('backbone'),
    _ = require('underscore'),
    $ = {
        options: [],
        ajax: function(options) {
          this.options.push(options);
        },
        success: function(data) {
          var options = this.options.pop();
          options.success && options.success(data);
        },
        error: function(error) {
          var options = this.options.pop();
          options.error && options.error(error);
        }
      };
chai.use(sinonChai);
Backbone.$ = $;

// add react-backbone mixins
require('../index')(React, Backbone);

function newComponent(attributes, mixins) {

  if (mixins) {
    mixins = React.mixins.get(mixins);
  } else {
    mixins = [];
  }

  var obj = {
    setState: sinon.spy(),
    setProps: function(props) {
      this.props = this.props || {};
      _.extend(this.props, props);
    },
    mount: function() {
      this._mounted = true;
      this.trigger('componentWillMount');
      this.trigger('componentDidMount');
    },
    unmount: function() {
      this._mounted = false;
      this.trigger('componentWillUnmount');
      this.trigger('componentDidUnmount');
    },

    isMounted: function() { return this._mounted; },
    trigger: function(method) {
      var rtn = [];
      for (var i=0; i<mixins.length; i++) {
        var func = mixins[i][method];
        if (func) {
          rtn.push(func.apply(this, Array.prototype.slice.call(arguments, 1)));
        }
      }
      return rtn;
    }
  };
  if (attributes) {
    for (var name in attributes) {
      obj[name] = attributes[name];
    }
  }

  var state, aggregateState;

  for (var i=0; i<mixins.length; i++) {
    var mixin = mixins[i];
    _.defaults(obj, mixin);
    state = mixin.getInitialState && mixin.getInitialState.call(obj);
    if (state) {
      if (!aggregateState) {
        aggregateState = {};
      }
      _.defaults(aggregateState, state);
    }
  }
  obj.state = aggregateState;
  return obj;
}

var Model = Backbone.Model.extend({
  url: 'foo'
});

describe('modelAware', function() {

  it('should get and set the model', function() {
    var model = new Backbone.Model(),
        obj = newComponent({props: {model: model}}, ['modelAware']);
    expect(obj.getModel()).to.eql(model);

    var model2 = new Backbone.Model();
    obj.setModel(model2);
    expect(obj.getModel()).to.eql(model2);    
  });
});

describe('modelPopulate', function() {

  it('should iterate components and call getModelValue to set attributes', function() {
    var obj = newComponent({}, ['modelPopulate']);
    var components = [
      {
        props: {
          ref: 'foo'
        },
        getModelValue: function() {
          return 'bar';
        }
      }
    ];
    var attributes = obj.modelPopulate(components);
    expect(attributes).to.eql({foo: 'bar'});
  });

  it('should iterate components and call getModelValue to set attributes using refs', function() {
    var obj = newComponent({}, ['modelPopulate']);
    var component = {
      props: {
        ref: 'foo'
      },
      getModelValue: function() {
        return 'bar';
      }
    };
    obj.refs = {
      foo: component
    };
    var attributes = obj.modelPopulate();
    expect(attributes).to.eql({foo: 'bar'});
  });

  it('should set values on model if a callback is provided', function() {
    var model = new Backbone.Model(),
        obj = newComponent({props: {model: model}}, ['modelAware', 'modelPopulate']);
    var component = {
      props: {
        ref: 'foo'
      },
      getModelValue: function() {
        return 'bar';
      }
    };
    obj.refs = {
      foo: component
    };
    var spy = sinon.spy(),
        attributes = obj.modelPopulate(spy);
    expect(spy).to.have.been.called;
    expect(attributes).to.eql({foo: 'bar'});
  });

  it('should not execute the callback if the validation fails', function() {
    var Model = Backbone.Model.extend({
      validate: sinon.spy(function() {
        // just return something so it looks like validation failed
        return 'fail';
      })
    })
    var model = new Model(),
        obj = newComponent({props: {model: model}}, ['modelAware', 'modelPopulate']);
    var component = {
      props: {
        ref: 'foo'
      },
      getModelValue: function() {
        return 'bar';
      }
    };
    obj.refs = {
      foo: component
    };
    var spy = sinon.spy(),
        attributes = obj.modelPopulate(spy);
    expect(spy).to.not.have.been.called;
    expect(attributes).to.eql({foo: 'bar'});
    expect(Model.prototype.validate).to.have.been.calledWith({foo: 'bar'});
  });
});

describe('modelValueAware', function() {

  it('should get and set the model value using "key"', function() {
    var model = new Backbone.Model({foo: 'bar'}),
        obj = newComponent({props: {model: model, key: 'foo'}}, ['modelValueAware']);
    expect(obj.getModelValue()).to.eql('bar');
    obj.setModelValue('baz');
    expect(model.get('foo')).to.eql('baz');
  });

  it('should get and set the model value using "ref"', function() {
    var model = new Backbone.Model({foo: 'bar'}),
        obj = newComponent({props: {model: model, ref: 'foo'}}, ['modelValueAware']);
    expect(obj.getModelValue()).to.eql('bar');
    obj.setModelValue('baz');
    expect(model.get('foo')).to.eql('baz');
  });
});

describe('modelValidator', function() {
  var Model = Backbone.Model.extend({
    validate: function(attributes, options) {
      return options && options.rtn;
    }
  })

  it('should return undefined if no model exists or the model does not implement "validate"', function() {
    var model = new Backbone.Model(),
        obj = newComponent({props: {model: model}}, ['modelValidator']);
    expect(obj.modelValidate()).to.eql(undefined);
  });
  it('should return false if "validate" returns a falsy value', function() {
    var model = new Model(),
        obj = newComponent({props: {model: model}}, ['modelValidator']);
    expect(obj.modelValidate()).to.eql(false);
  });
  it('should return the same value if "validate" returns a truthy value', function() {
    var model = new Model(),
        obj = newComponent({props: {model: model}}, ['modelValidator']);
    expect(obj.modelValidate(undefined, {rtn: 'foo'})).to.eql('foo');
  });
});

describe('modelEventAware', function() {

  it('should not do event binding until node is mounted', function() {
    var model = new Backbone.Model(),
        obj = newComponent({props: {model: model}}, ['modelEventAware']),
        spy = sinon.spy();
    obj.modelOn('foo', spy);
    model.trigger('foo');
    // we shouldn't bind yet because we aren't mounted
    expect(spy.callCount).to.eql(0);

    obj.mount();
    model.trigger('foo');
    expect(spy.callCount).to.eql(1);

    // we shouldn't bind now because we will be unmounted
    obj.unmount();
    model.trigger('foo');
    expect(spy.callCount).to.eql(1);

    // mount again and ensure that we rebind
    obj.mount();
    model.trigger('foo');
    expect(spy.callCount).to.eql(2);
    obj.unmount();
    model.trigger('foo');
    expect(spy.callCount).to.eql(2);
  });

  it('should bind if model does not exist when registered', function() {
    var model = new Backbone.Model(),
        obj = newComponent({props: {model: model}}, ['modelEventAware']),
        spy = sinon.spy();

    // setting model before mounting
    obj.modelOn('foo', spy);
    obj.setModel(model);
    // we shouldn't bind yet because we are not mounted
    model.trigger('foo');
    expect(spy.callCount).to.eql(0);

    obj.mount();
    model.trigger('foo');
    expect(spy.callCount).to.eql(1);
  });

  it('should bind if component has already been mounted when setting model', function() {
    var model = new Backbone.Model(),
        obj = newComponent({props: {model: model}}, ['modelEventAware']),
        spy = sinon.spy();

    obj.modelOn('foo', spy);
    obj.mount();
    obj.setModel(model);
    model.trigger('foo');
    expect(spy.callCount).to.eql(1);
  });

  it('should unbind a previous model and rebind to a new model', function() {
    var model1 = new Backbone.Model(),
        model2 = new Backbone.Model(),
        obj = newComponent({props: {model: model1}}, ['modelEventAware']),
        spy = sinon.spy();

    obj.modelOn('foo', spy);
    obj.mount();
    model1.trigger('foo');
    expect(spy.callCount).to.eql(1);

    // set another model and ensure the first was unbound
    obj.setModel(model2);
    model1.trigger('foo');
    expect(spy.callCount).to.eql(1); // ensure the previous trigger *did not* call the handler
    model2.trigger('foo');
    expect(spy.callCount).to.eql(2);
  });
});

describe('modelChangeAware', function() {
  var clock;
  beforeEach(function() {
    clock = sinon.useFakeTimers();
  });
  afterEach(function() {
    clock.restore();
  });

  it('should listen to all events and force an update', function() {
    var model = new Backbone.Model(),
        obj = newComponent({props: {model: model}}, ['modelChangeAware']),
        spy = sinon.spy();
    obj.forceUpdate = spy;
    
    obj.mount();
    expect(spy.callCount).to.eql(0);
    model.trigger('change');
    clock.tick(1);
    expect(spy.callCount).to.eql(1);
    model.trigger('reset');
    clock.tick(1);
    expect(spy.callCount).to.eql(2);
    model.trigger('add');
    clock.tick(1);
    expect(spy.callCount).to.eql(3);
    model.trigger('remove');
    clock.tick(1);
    expect(spy.callCount).to.eql(4);
    model.trigger('sort');
    clock.tick(1);
    expect(spy.callCount).to.eql(5);
  });
});


// THE FOLLING TESTS ASSUME THE INCLUSION OF [backbone-async-event](https://github.com/jhudson8/backbone-async-event)

describe('modelLoadOn', function() {

  it('should set loading state when an async event is triggered (success condition)', function() {
    var model = new Backbone.Model(),
        obj = newComponent({props: {model: model, loadOn: 'foo'}}, ['modelLoadOn']),
        spy = sinon.spy();
    obj.setState = spy;
    obj.mount();

    Backbone.sync('foo', model, {url: 'foo'});
    expect(spy).to.have.been.calledWith({loading: true});
    $.success();
    expect(spy).to.have.been.calledWith({loading: false});
    expect(spy.callCount).to.eql(2);
  });

  it('should set loading state when an async event is triggered (error condition)', function() {
    var model = new Backbone.Model(),
        obj = newComponent({props: {model: model, loadOn: 'foo'}}, ['modelLoadOn']),
        spy = sinon.spy();
    obj.setState = spy;
    obj.mount();

    obj.mount();

    Backbone.sync('foo', model, {url: 'foo'});
    expect(spy).to.have.been.calledWith({loading: true});
    $.error();
    expect(spy).to.have.been.calledWith({loading: false});
    expect(spy.callCount).to.eql(2);
  });

  it('should not error if no "loadOn" property is defined', function() {
    newComponent({props: {model: new Backbone.Model()}}, ['modelLoadOn']);
    // we are just looking for an error thrown in getInitialState
  });
});

describe('modelAsyncAware', function() {

  it('moch (success condition)', function() {
    var model = new Backbone.Model(),
        obj = newComponent({props: {model: model}}, ['modelAsyncAware']),
        spy = sinon.spy();
    obj.setState = spy;
    obj.mount();

    expect(spy.callCount).to.eql(0);
    Backbone.sync('foo', model, {url: 'foo'});
    expect(spy.callCount).to.eql(1);
    expect(spy.getCall(0).args).to.eql([{loading: true}]);
    $.success();
    expect(spy.callCount).to.eql(2);
    expect(spy.getCall(1).args).to.eql([{loading: false}]);
    expect(spy.callCount).to.eql(2);

    Backbone.sync('bar', model, {url: 'foo'});
    $.success();
    expect(spy.callCount).to.eql(4);
    expect(spy.getCall(2).args).to.eql([{loading: true}]);
    expect(spy.getCall(3).args).to.eql([{loading: false}]);
  });

  it('should set loading state if the model is loading when set on the component', function() {
    var model = new Model();
    model.fetch();
    var obj = newComponent({props: {model: model}}, ['modelAsyncAware']),
        spy = sinon.spy();
    obj.setState = spy;
    obj.mount();
    expect(obj.state.loading).to.eql(true);
    expect(spy.callCount).to.eql(0);
    $.success();
    expect(spy.getCall(0).args).to.eql([{loading: false}]);
  });

  it('should set loading state if the model is loading after being set but before mounting', function() {
    var model = new Model(),
        obj = newComponent({props: {model: model}}, ['modelAsyncAware']),
        spy = sinon.spy();
    obj.setState = spy;
    model.fetch();
    expect(spy.callCount).to.eql(0);
    obj.mount();
    expect(spy.callCount).to.eql(1);
    expect(spy.getCall(0).args).to.eql([{loading: true}]);
    $.success();
    expect(spy.callCount).to.eql(2);
    expect(spy.getCall(1).args).to.eql([{loading: false}]);
  });
});

describe('react-events integration', function() {
  it('should include events mixin *and* Backbone.Events for on/off/trigger mixin', function() {
    var mixins = React.mixins.get('events');
    expect(mixins.length).to.eql(2);
  });
  it('set React.events.mixin to Backbone.Events', function() {
    expect(React.events.mixin).to.eql(Backbone.Events);
    var obj = newComponent({}, ['events', 'modelEventAware']);
    expect(!!obj.on).to.eql(true);
    expect(!!obj.off).to.eql(true);
  });
  it('should do model binding', function() {
    var model = new Model(),
        spy = sinon.spy(),
        obj = newComponent({
          props: {model: model},
          events: {
            'model:change': 'onChange'
          },
          onChange: spy
        }, ['events', 'modelEventAware']);
    obj.mount();
    model.set({foo: 'bar'});
    expect(spy.callCount).to.eql(1);
  });
  it('should do ref/prop model binding', function() {
    var model = new Model(),
        spy = sinon.spy(),
        obj = newComponent({
          props: {foo: model},
          refs: {},
          events: {
            'model[foo]:change': 'onChange'
          },
          onChange: spy
        }, ['events', 'modelEventAware']);
    obj.mount();
    model.set({foo: 'bar'});
    expect(spy.callCount).to.eql(1);
  });
});
