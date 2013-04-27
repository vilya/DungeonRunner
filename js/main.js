var dungeon = function () { // start of the dungeon namespace

  //
  // Global variables
  //

  var gRenderer;
  var gRenderStats;
  var gPhysicsStats;

  var game = {
    'world': null,    // The top-level Scene object for the world.
    'camera': null,   // The current camera.
    'controls': null, // The current camera controls, if any.

    // Information about the dungeon.
    'dungeon': {
      'shape': null,  // The 3D object for the dungeon.
    },

    // Information about the player.
    'player': {
      // Configuration - this generally won't change during the game.
      'shape': null,          // The 3D shape for the player.
      'moveSpeed': 20.0,      // The movement speed of the player, in metres/second.
      'turnSpeed': 5.0,      // How quickly the player turns, in radians/second(?).
      'jumpSpeed': 1000.0,    // The starting speed for a jump, in metres/second.
      'jumpDuration': 0.8,    // How long before the player can jump again, in seconds.

      // State - this keeps track of what's happening during the game.
      'jumpT': 0.0,           // When did the player last start a jump (in seconds since the start of the level).
    },
  };


  //
  // Setup functions
  //

  function makeWorld()
  {
    game.world = new Physijs.Scene({ fixedTimeStep: 1 / 60.0 });
    game.world.setGravity(new THREE.Vector3(0, -20, 0));
    game.world.addEventListener('update', function() {
        ludum.update();
        game.world.simulate(undefined, 2);
        gPhysicsStats.update();
    });
  }


  function makeDungeon()
  {
    var geo = new THREE.CubeGeometry(100, 1, 100);
    var material = Physijs.createMaterial(
      new THREE.MeshLambertMaterial({
        color: 0xAAAAAA,
        map: THREE.ImageUtils.loadTexture('img/rock.png')
      }),
      0.8,  // high friction
      0.4   // low restitution
    );
    var mass = 0.0;

    material.map.wrapS = THREE.RepeatWrapping;
    material.map.wrapT = THREE.RepeatWrapping;
    material.map.repeat.set(20, 20);

    game.dungeon.shape = new Physijs.BoxMesh(geo, material, mass);
    game.dungeon.shape.castShadow = true;
    game.dungeon.shape.receiveShadow = true;
    game.dungeon.shape.translateOnAxis(new THREE.Vector3(0, -1, 0), 0.5);
    game.world.add(game.dungeon.shape);

    var light = _makeDirectionalLight(new THREE.Vector3(60, 60, 0), game.dungeon.shape.position);
    game.dungeon.shape.add(light);
  }


  function _makeDirectionalLight(position, target)
  {
    var light = new THREE.DirectionalLight(0xFFFFFF);
    light.position.copy(position);
    light.lookAt(target);
    light.castShadow = true;
    light.shadowCameraLeft = -60;
    light.shadowCameraTop = -60;
    light.shadowCameraRight = 60;
    light.shadowCameraBottom = 60;
    light.shadowCameraNear = 10;
    light.shadowCameraFar = 150;
    light.shadowBias = -0.01;
    light.shadowMapWidth = light.shadowMapHeight = 2048;
    light.shadowDarkness = 0.7;
    return light;
  }


  function makePlayer()
  {
    var geo = new THREE.CubeGeometry(0.8, 2.0, 0.8);
    var material = new THREE.MeshLambertMaterial({ color: 0x880000 });
    var mass = 80.0;

    game.player.shape = new Physijs.BoxMesh(geo, material, mass);
    game.player.shape.castShadow = true;
    game.player.shape.receiveShadow = true;
    game.player.shape.addEventListener('collision',
      function (collidedWith, linearVelocity, angularVelocity) {
      }
    );
    game.player.shape.translateOnAxis(new THREE.Vector3(0, 1, 0), 1.0 + 10.0);
    //game.player.shape.setAngularFactor(new THREE.Vector3(0, 1, 0));
    game.world.add(game.player.shape);
  }


  function makeCamera()
  {
    var width = gRenderer.domElement.width;
    var height = gRenderer.domElement.height;
    var fieldOfView = 35; // in degrees.
    var aspectRatio = (width - 0.0) / height;
    var nearClip = 1.0;
    var farClip = 1000.0;

    game.camera = new THREE.PerspectiveCamera(fieldOfView, aspectRatio, nearClip, farClip);
    game.camera.position.set(0, 10, 20);
    game.camera.lookAt(game.dungeon.shape.position);
    game.world.add(game.camera);

    game.controls = new THREE.TrackballControls(game.camera, gRenderer.domElement);
  }


  //
  // Functions for the 'playing' state.
  //

  function playingDraw()
  {
    gRenderer.render(game.world, game.camera);
    if (game.controls)
      game.controls.update();
    gRenderStats.update();
  }


  function playingUpdate()
  {
    var turn = new THREE.Vector3(0.0, 0.0, 0.0);
    var move = new THREE.Vector3(0.0, 0.0, 0.0);
    var jump = new THREE.Vector3(0.0, game.player.jumpSpeed, 0.0);

    if (ludum.isKeyPressed(ludum.keycodes.LEFT))
      turn.y += game.player.turnSpeed;
    if (ludum.isKeyPressed(ludum.keycodes.RIGHT))
      turn.y -= game.player.turnSpeed;

    if (ludum.isKeyPressed(ludum.keycodes.UP))
      move.z -= game.player.moveSpeed;
    if (ludum.isKeyPressed(ludum.keycodes.DOWN))
      move.z += game.player.moveSpeed;

    var timeSinceLastJump = ludum.globals.stateT - game.player.jumpT;
    var canJump = timeSinceLastJump > game.player.jumpDuration;
    var jumping = canJump && ludum.isKeyPressed(' ');
    if (jumping) {
      move.y = game.player.jumpSpeed;
      game.player.jumpT = ludum.globals.stateT;
    }

    move.applyMatrix4(new THREE.Matrix4().extractRotation(game.player.shape.matrix));

    game.player.shape.setAngularVelocity(turn);
    game.player.shape.applyCentralImpulse(move);
  }


  // Call this to start the game.
  function run()
  {
    var width = window.innerWidth;
    var height = window.innerHeight;
    var fieldOfView = 35; // degrees
    var aspectRatio = width / height;
    var nearClip = 1.0;
    var farClip = 1000.0;

    // Set up the three.js renderer.
    var caps = ludum.browserCapabilities();
    if (caps.webgl) {
      gRenderer = new THREE.WebGLRenderer({ antialias: true });
      gRenderer.shadowMapEnabled = true;
      gRenderer.shadowMapSoft = true;
    }
    else if (caps.canvas) {
      ludum.showWarning("<strong>Your browser doesn't appear to support WebGL.</strong> You may get lower frame rates and/or poorer image quality as a result. Sorry!");
      gRenderer = new THREE.CanvasRenderer();
    }
    else {
      ludum.showError("<strong>Your browser doesn't appear to support WebGL <em>or</em> Canvas.</strong> Unable to continue. Sorry!");
      return;
    }
    gRenderer.setSize(width, height);
    document.getElementById('viewport').appendChild(gRenderer.domElement);

    // Set up for physi.js
    Physijs.scripts.worker = "js/physijs_worker.js";
    Physijs.scripts.ammo = 'ammo.js';

    // Set up the performance graphs (remember to turn these off for the final game!)
		gRenderStats = new Stats();
		gRenderStats.domElement.style.position = 'absolute';
		gRenderStats.domElement.style.top = '0px';
		gRenderStats.domElement.style.zIndex = 100;
		document.getElementById( 'viewport' ).appendChild( gRenderStats.domElement );
		
		gPhysicsStats = new Stats();
		gPhysicsStats.domElement.style.position = 'absolute';
		gPhysicsStats.domElement.style.top = '50px';
		gPhysicsStats.domElement.style.zIndex = 100;
		document.getElementById( 'viewport' ).appendChild( gPhysicsStats.domElement );

    // Configure ludum.js
    ludum.useKeyboard();        // Install's ludum.js' keyboard event handlers.
    ludum.useExternalUpdates(); // We'll be using Physi.js to drive the updates.

    // Set up the game states.
    ludum.addState('playing', { 'draw': playingDraw, 'update': playingUpdate });

    // Create the world, camera, etc.
    makeWorld();
    makeDungeon();
    makeCamera();
    makePlayer();

    // Kick off the physics engine.
    game.world.simulate(undefined, 2);

    // Launch into LudumEngine's main loop
    ludum.start('playing');
  }


  return {
    'run': run
  };

}(); // end of the dungeon namespace
