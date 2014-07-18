Reactive-backbone
=================
Reactive-backbone contains both enhancements to [React](http://facebook.github.io/react/), [Backbone](http://backbonejs.org/), and additional mixins to allow [React](http://facebook.github.io/react/) to work seamelessly with [Backbone](http://backbonejs.org/).

While others projects might consider complete [Backbone](http://backbonejs.org/) integration with [React](http://facebook.github.io/react/) to be a mixin which will refresh the [React](http://facebook.github.io/react/) component when the model changes, there are many other ways that [React](http://facebook.github.io/react/) can be more integrated with [Backbone](http://backbonejs.org/) and, in addition, more familiar with [Backbone](http://backbonejs.org/) developers.

We expose several isolated backbone-specific mixins which can be individually included to meet the needs of the specific [React](http://facebook.github.io/react/) component.  This includes things like

* automatically set the ```loading``` state when a component is fetching or performing any other ajax operations
* refresh the component when the associated model contents change
* refresh the component when a specific event is triggered on the model
* set an invalid state on the component when the model triggers the invalid event for a specific field
* and others...

Since all of these mixins are registered using [react-mixin-manager](https://github.com/jhudson8/react-mixin-manager), they can easily be added to your components simply by using their mixin alias.  For example:

```
React.createClass({
  mixins: ['events']
})
```

Bundled Projects
---------------------
* [mixin manager](https://github.com/jhudson8/react-mixin-manager) to allow mixins to be defined with dependencies
* [declaritive events](https://github.com/jhudson8/react-events) similar to what you get with [Backbone](http://backbonejs.org/).View
* [flexible model async activity binding](https://github.com/jhudson8/backbone-async-event)
* [many backbone-aware React mixins](https://github.com/jhudson8/react-backbone)


Installation
------------

* Browser: include *reactive-backbone[.min].js* after [React](http://facebook.github.io/react/) and [Backbone](http://backbonejs.org/)
* CommonJS: ```require('reactive-backbone')(require('react'), require('backbone'));```
