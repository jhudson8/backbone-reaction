backbone-reaction
=================
backbone-reaction contains both enhancements to [React](http://facebook.github.io/react/), [Backbone](http://backbonejs.org/), and additional mixins to allow React to work seamelessly with Backbone.

***[View backbone-reaction fancydocs](http://jhudson8.github.io/fancydocs/index.html#project/jhudson8/backbone-reaction)***

While others projects might consider complete Backbone integration with React to be a mixin which will refresh the React component when the model changes, there are many other ways that React can be more integrated with Backbone and, in addition, more familiar with Backbone developers.

We expose several isolated backbone-specific mixins which can be individually included to meet the needs of the specific React component.  This includes things like

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
* [jhudson8/react-mixin-manager](https://github.com/jhudson8/react-mixin-manager) to allow mixins to be defined with dependencies
* [jhudson8/react-events](https://github.com/jhudson8/react-events) declarative component events similar to what you get with Backbone.View
* [jhudson8/react-backbone](https://github.com/jhudson8/react-backbone) tight integration of React and Backbone using a suite of mixins
* [jhudson8/backbone-async-event](https://github.com/jhudson8/backbone-async-event) add ajax activity events to your Backbone models and collections


Installation
------------

* Browser: include *backbone-reaction[.min].js* after React and Backbone
* CommonJS: ```require('backbone-reaction')(require('react'), require('backbone'));```
