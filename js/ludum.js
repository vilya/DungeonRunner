// Done: state-machine
// - Each state has enter, draw, update and leave functions.
// - Each state can have any number of pre-scripted events
// - Events have a trigger predicate and enter, draw, update, leave functions.
// - Set up default states: titles, level1, win, lose.
// - Can have the check for victory conditions as a trigger predicate for an event?

// Done: Input tracking
// - keyboard
// - mouse
// Can enable and disable input devices independently.

// Drawing library
// - Support for webgl, canvas.
// - Consistent api regardless of which back-end is being used.
// - Option to fallback gracefully from WebGL to Canvas.
// - Function to add a drawing area to the page, given a parent.
// - Text rendering

// Sound library
// - Support for loops (i.e. background music) and one-off sounds (e.g. sfx).
// - Function to add an audio tag to the page, given a parent.

// Sprites
// - Static or animated.
// - Sprite-to-sprite collision detection
// - Sprite-to-environment collision detection
// - Placeholder graphics for when textures haven't loaded yet

var ludum = function () {  // start of the ludum namespace

  //
  // Constants
  //

  var keycodes = {
    'ESCAPE': 27,
    'LEFT': 37,
    'RIGHT': 39,
    'UP': 38,
    'DOWN': 40,
  };

  var buttons = {
    'LEFT': 0,
    'MIDDLE': 1,
    'RIGHT': 2,
  };


  //
  // Variables
  //

  // Holds game configuration data - stuff that shouldn't change once set up.
  var config = {
    'states': {},
  };

  // Holds the current state of the game while running.
  var globals = {
    'lastT': 0,           // The current game time (in ms since datum).
    'lastStateT': 0,      // The time we last changed states at (in ms since datum).
    'stateT': 0,          // The amount of time we've been in the current state for, in seconds.
    'nextStateName': null,// The state we should change into at the end of this update cycle.
    'currentState': null, // The current game state.
    'prevStateName': null,// The previous state we were in, useful for coming back from e.g. a pause screen.
    'activeEvents': [],   // The currently active events for the current state.
    'pendingEvents': [],  // The events still waiting to be activated for the current state.

    'keysDown': {},       // Map of which keys are currently held down.
    'mouse': {
      'x': 0,             // Last known mouse x location.
      'y': 0,             // Last known mouse y location.
      'buttonsDown': {},  // Map of which mouse buttons are currently held down.
    },
  };


  //
  // Setup and configuration
  //

  function addState(name, stateObj)
  {
    // Set up properties for internal use.
    stateObj.name = name;
    stateObj.events = [];
    stateObj.initialised = false;

    // Set up default implementations for any missing lifecycle methods.
    if (!stateObj.init)
      stateObj.init = _noop;
    if (!stateObj.enter)
      stateObj.enter = _noop;
    if (!stateObj.draw)
      stateObj.draw = _noop;
    if (!stateObj.update)
      stateObj.update = _noop;
    if (!stateObj.leave)
      stateObj.leave = _noop;

    // Add the state object to the interal config.
    config.states[name] = stateObj;
  }


  function _noop()
  {
    // Do nothing - that's the *point* of this function.
  }


  function addEvent(stateName, trigger, expire, eventMethods)
  {
    var newEvent = _makeEvent(trigger, expire, eventMethods);
    config.states[stateName] = newEvent;
  }


  function addAlwaysOnEvent(stateName, eventMethods)
  {
    var newEvent = _makeEvent(alwaysTrigger, null, eventMethods);
    config.states[stateName] = newEvent;
  }


  function addTimeEvent(stateName, t, duration, eventMethods)
  {
    var trigger = timeTrigger;
    var expire = null;
    if (duration > 0.0)
      expire = timeExpire;

    var newEvent = _makeEvent(trigger, expire, eventMethods);
    // Extra properties.
    newEvent.t = t;
    if (duration > 0.0)
      newEvent.duration = duration;

    config.states[stateName].push(newEvent);
  }


  function addChangeStateAtTimeEvent(stateName, t, targetState, eventMethods)
  {
    var newEvent = _makeEvent(timeTrigger, null, eventMethods);
    // Extra properties
    newEvent.t = t;
    newEvent.wrappedEnter = newEvent.enter;
    newEvent.enter = function () {
      if (this.wrappedEnter)
        this.wrappedEnter();
      changeState(this.targetState);
    }
    newEvent.targetState = targetState;

    _addEvent(stateName, newEvent);
  }


  function addKeyPressEvent(stateName, key, duration, eventMethods)
  {
    var trigger = keyTrigger;
    var expire = null;
    if (duration > 0.0)
      expire = timeExpire;

    var newEvent = _makeEvent(trigger, expire, eventMethods);
    // Extra properties.
    newEvent.key = key;
    if (duration > 0.0) {
      newEvent.wrappedEnter = newEvent.enter;
      newEvent.enter = function () {
        this.t = game.lastT;
        if (this.wrappedEnter)
          this.wrappedEnter();
      }
      newEvent.duration = duration;
    }

    _addEvent(stateName, newEvent);
  }


  function addChangeStateOnKeyPressEvent(stateName, key, targetState, eventMethods)
  {
    var trigger = keyTrigger;
    var expire = null;

    var newEvent = _makeEvent(trigger, null, eventMethods);
    // Extra properties
    newEvent.key = key;
    newEvent.wrappedEnter = newEvent.enter;
    newEvent.enter = function () {
      if (this.wrappedEnter)
        this.wrappedEnter();
      changeState(this.targetState);
    }
    newEvent.targetState = targetState;

    _addEvent(stateName, newEvent);
  }


  function addGameConditionEvent(stateName, victoryPred, targetState, eventMethods)
  {
    var newEvent = _makeEvent(victoryPred, null, eventMethods);
    // Extra properties
    newEvent.wrappedEnter = newEvent.enter;
    newEvent.enter = function () {
      if (this.wrappedEnter)
        this.wrappedEnter();
      changeState(this.targetState);
    }
    newEvent.targetState = targetState;

    _addEvent(stateName, newEvent);
  }


  function _makeEvent(trigger, expire, eventMethods)
  {
    var newEvent = {
      // Standard properties.
      'trigger': trigger,
      'expire': null,
      'enter': null,
      'leave': null,
      'update': null,
      'draw': null,
    };

    if (expire)
      newEvent.expire = expire;

    if (eventMethods) {
      if (eventMethods.enter)
        newEvent.enter = eventMethods.enter;
      if (eventMethods.leave)
        newEvent.leave = eventMethods.leave;
      if (eventMethods.update)
        newEvent.update = eventMethods.update;
      if (eventMethods.draw)
        newEvent.draw = eventMethods.draw;
    }

    return newEvent;
  }


  function _addEvent(stateName, newEvent)
  {
    config.states[stateName].events.push(newEvent);
  }


  //
  // Standard event trigger and expire methods
  //

  function alwaysTrigger()
  {
    return true;
  }


  function neverExpire()
  {
    return false;
  }


  function timeTrigger()
  {
    return (globals.stateT >= this.t);
  }


  function timeExpire()
  {
    return globals.stateT >= (this.t + this.duration);
  }


  function keyTrigger()
  {
    if (!this.key)
      return anyKeyPressed();
    else
      return globals.keysDown[this.key];
  }


  //
  // Main game logic.
  //

  function start(initialStateName)
  {
    window.requestAnimFrame = (function() {
      return window.requestAnimationFrame ||
             window.webkitRequestAnimationFrame ||
             window.mozRequestAnimationFrame ||
             window.oRequestAnimationFrame ||
             window.msRequestAnimationFrame ||
             function(/* function FrameRequestCallback */ callback, /* DOMElement Element */ element) {
               window.setTimeout(callback, 1000/60);
             };
    })();

    // Set the initial state for the game.
    changeState(initialStateName);

    _mainLoop();
  }


  function _mainLoop()
  {
    requestAnimFrame(_mainLoop);
    _draw();
    _update();
  }


  function _draw()
  {
    _drawState();
    _drawEvents();
  }


  function _drawState()
  {
    if (globals.currentState && globals.currentState.draw)
      globals.currentState.draw();
  }


  function _drawEvents()
  {
    for (var i = 0; i < globals.activeEvents.length; i++) {
      var ev = globals.activeEvents[i];
      if (ev.draw)
        ev.draw();
    }
  }


  function _update()
  {
    var dt = _updateGameTime();
    _updateState(dt);
    _expireEvents();
    _updateEvents(dt);
    _triggerEvents();
    _changeState();
  }


  function _updateGameTime()
  {
    var t = Date.now();
    var dt = t - globals.lastT;
    globals.lastT = t;
    globals.stateT = (t - globals.lastStateT) / 1000.0;
    return dt;
  }


  function _updateState(dt)
  {
    if (globals.currentState && globals.currentState.update)
      globals.currentState.update(dt);
  }


  function _expireEvents()
  {
    var newEvents = [];
    for (var i = 0; i < globals.activeEvents.length; i++) {
      var ev = globals.activeEvents[i];
      if (!ev.expire()) {
        newEvents.push(ev);
        continue;
      }

      if (ev.leave)
        ev.leave();
    }
    globals.activeEvents = newEvents;
  }


  function _updateEvents(dt)
  {
    for (var i = 0; i < globals.activeEvents.length; i++) {
      var ev = globals.activeEvents[i];
      if (ev.update)
        ev.update(dt);
    }
  }


  function _triggerEvents()
  {
    var newEvents = [];
    for (var i = 0; i < globals.pendingEvents.length; i++) {
      var ev = globals.pendingEvents[i];
      if (!ev.trigger()) {
        newEvents.push(ev);
        continue;
      }

      if (ev.enter)
        ev.enter();

      if (ev.expire)
        globals.activeEvents.push(ev);
      else if (ev.leave)
        ev.leave();
    }
    globals.pendingEvents = newEvents;
  }


  function changeState(newStateName)
  {
    globals.nextStateName = newStateName;
  }


  function changeToPrevState()
  {
    changeState(globals.prevStateName);
  }


  function _changeState()
  {
    if (!globals.nextStateName)
      return;

    globals.lastT = Date.now();
    clearKeyboard();

    // Clear out the current event lists.
    globals.activeEvents = [];
    globals.pendingEvents = [];

    // Change the state.
    if (globals.currentState) {
      globals.currentState.leave();
      globals.prevStateName = globals.currentState.name;
    }
    globals.currentState = config.states[globals.nextStateName];
    globals.nextStateName = null;
    if (!globals.currentState.initialised) {
      globals.currentState.init();
      globals.currentState.initialised = true;
    }
    globals.currentState.enter();
  
    // Populate the pending event list from the new state.
    for (var i = 0; i < globals.currentState.events.length; i++)
      globals.pendingEvents.push(globals.currentState.events[i]);

    // Record the timestamp of the change.
    globals.lastStateT = globals.lastT;
    globals.stateT = 0.0;
  }


  //
  // Input handling
  //

  function useKeyboard()
  {
    document.onkeydown = _keyDown;
    document.onkeyup = _keyUp;
  }


  function clearKeyboard()
  {
    // Clear the keyboard state.
    for (key in globals.keysDown)
      globals.keysDown[key] = false;
  }
  
  
  function anyKeyPressed()
  {
    for (key in game.keysDown) {
      if (globals.keysDown[key])
        return true;
    }
    return false;
  }


  function isKeyPressed(key)
  {
    return globals.keysDown[key];
  }
  
  
  function _keyDown(event)
  {
    globals.keysDown[event.keyCode] = true;
    globals.keysDown[String.fromCharCode(event.keyCode)] = true;
  }
  
  
  function _keyUp(event)
  {
    globals.keysDown[event.keyCode] = false;
    globals.keysDown[String.fromCharCode(event.keyCode)] = false;
  }


  function useMouse()
  {
    if (globals.canvas)
      globals.canvas.onmousedown = _mouseDown;
    else
      document.onmousedown = _mouseDown;
    document.onmouseup = _mouseUp;
    document.onmousemove = _mouseMove;
  }


  function anyButtonPressed()
  {
    for (btn in game.mouse.buttonsDown) {
      if (globals.mouse.buttonsDown[btn])
        return true;
    }
    return false;
  }


  function isButtonPressed(btn)
  {
    return globals.mouse.buttonsDown[btn];
  }


  function _mouseDown(event)
  {
    var btn = event.button;
    globals.mouse.buttonsDown[btn] = true;
    globals.mouse.x = event.x;
    globals.mouse.y = event.y;
  }


  function _mouseUp(event)
  {
    var btn = event.button;
    globals.mouse.buttonsDown[btn] = false;
    globals.mouse.x = event.x;
    globals.mouse.y = event.y;
  }


  function _mouseMove(event)
  {
    globals.mouse.x = event.x;
    globals.mouse.y = event.y;
  }


  //
  // Browser-related methods
  //

  // Borrowed from three.js, examples/js/Detector.js - authored by mr doob & AlteredQualia
  function browserCapabilities()
  {
    return { 
      'canvas': !! window.CanvasRenderingContext2D,
	    'webgl': ( function () { try { return !! window.WebGLRenderingContext && !! document.createElement( 'canvas' ).getContext( 'experimental-webgl' ); } catch( e ) { return false; } } )(),
	    'workers': !! window.Worker,
	    'fileapi': window.File && window.FileReader && window.FileList && window.Blob
    };
  }


  function showWarning(msgHTML, parentElem)
  {
    _showMessage(msgHTML, parentElem, '#ff8', '#000');
 }


  function showError(msgHTML, parentElem)
  {
    _showMessage(msgHTML, parentElem, '#fbb', '#700');
  }


  function _showMessage(msgHTML, parentElem, background, color, icon)
  {
    var parentNode = document.body;
    if (parentElem)
      parentNode = parentElem;

    // TODO: add an icon and a close button to this div
		var element = document.createElement( 'div' );
		element.id = 'webgl-error-message';
    element.style.fontFamily = 'sans-serif';
		element.style.fontSize = '13px';
		element.style.fontWeight = 'normal';
		element.style.textAlign = 'left';
		element.style.background = background;
		element.style.color = color;
		element.style.padding = '1.5em';
		element.style.width = parentNode.innerWidth;
		element.style.margin = '5em auto 0';
    element.innerHTML = msgHTML;

    parentNode.appendChild(element);
  }


  //
  // Export public symbols.
  //

  return {
    // Constant bundles
    'keycodes': keycodes,
    'buttons': buttons,
    // Game variables
    'config': config,
    'globals': globals,
    'mouse': globals.mouse,
    // Setup and configuration
    'addState': addState,
    'addEvent': addEvent,
    'addAlwaysOnEvent': addAlwaysOnEvent,
    'addTimeEvent': addTimeEvent,
    'addKeyPressEvent': addKeyPressEvent,
    'addChangeStateOnKeyPressEvent': addChangeStateOnKeyPressEvent,
    'addGameConditionEvent': addGameConditionEvent,
    // Standard event trigger and expire methods
    'alwaysTrigger': alwaysTrigger,
    'neverExpire': neverExpire,
    'timeTrigger': timeTrigger,
    'timeExpire': timeExpire,
    // Main game loop
    'start': start,
    'changeState': changeState,
    'changeToPrevState': changeToPrevState,
    // Input handling
    'useKeyboard': useKeyboard,
    'clearKeyboard': clearKeyboard,
    'anyKeyPressed': anyKeyPressed,
    'isKeyPressed': isKeyPressed,
    'useMouse': useMouse,
    'anyButtonPressed': anyButtonPressed,
    'isButtonPressed': isButtonPressed,
    // Browser functions
    'browserCapabilities': browserCapabilities,
    'showWarning': showWarning,
    'showError': showError
  };

}(); // end of the ludum namespace.

