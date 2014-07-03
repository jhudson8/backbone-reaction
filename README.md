reactive-backbone
=================

Reactive-backbone contains both enhancements to React, Backbone, and additional mixins to allow React to work seamelessly with Backbone.

This includes:

* [mixin manager](https://github.com/jhudson8/react-mixin-manager) to allow mixins to be defined with dependencies
* [declaritive events](https://github.com/jhudson8/react-events) similar to what you get with Backbone.View
* [flexible model async activity binding](https://github.com/jhudson8/backbone-async-event)
* [many Backbone-aware React mixins](https://github.com/jhudson8/react-backbone)

Why Reactive-backbone?
----------------------

While others might consider complete Backbone integration with React to be a mixin which will refresh the React component when the model changes, there are many other ways that React can be more integrated with Backbone and, in addition, more familiar with Backbone developers.

We expose several isolated backbone-specific mixins which can be individually included to meet the needs of the specific React component.  This includes things like
* automatically set the ```loading``` state when a component is fetching or performing any other ajax operations
* refresh the component when the associated model contents change
* refresh the component when a specific event is triggered on the model
* set an invalid state on the component when the model triggers the invalid event for a specific field
* and others...

Since all of these mixins are registered using [react-mixin-manager](https://github.com/jhudson8/react-mixin-manager), any mixins can be grouped and referenced by a single alias for easy component integration.

```
// groou 
```
