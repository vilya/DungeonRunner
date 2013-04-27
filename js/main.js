var dungeon = function () { // start of the dungeon namespace

  //
  // Global variables
  //

  var gRenderer;
  var gRenderStats;
  var gPhysicsStats;

  var gWorld;
  var gCamera;
  var gDungeon;
  var gPlayer;


  //
  // Setup functions
  //

  function makeWorld()
  {
    var world = new Physijs.Scene({ fixedTimeStep: 1 / 60.0 });
    world.setGravity(new THREE.Vector3(0, -20, 0));
    world.addEventListener('update', function() {
        ludum.update();
        gWorld.simulate(undefined, 2);
        gPhysicsStats.update();
    });
    return world;
  }


  function makeDungeon()
  {
    var material = Physijs.createMaterial(
      new THREE.MeshLambertMaterial({ color: 0xAAAAAA }),
      0.8,  // high friction
      0.4   // low restitution
    );
    
    var geometry = new THREE.CubeGeometry(100, 1, 100);

    var shape = new Physijs.BoxMesh(geometry, material, 0);
    shape.castShadow = true;
    shape.receiveShadow = true;
    shape.translateOnAxis(new THREE.Vector3(0, -1, 0), 0.5);

    var light = _makeDirectionalLight(new THREE.Vector3(60, 60, 0), shape.position);
    shape.add(light);

    return shape;
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
    var playerGeo = new THREE.CubeGeometry(0.8, 2.0, 0.8);
    var playerMaterial = new THREE.MeshLambertMaterial({ color: 0x880000 });
    var playerMass = 80.0;
    var player = new Physijs.BoxMesh(playerGeo, playerMaterial, playerMass);
    player.castShadow = true;
    player.receiveShadow = true;
    player.addEventListener('collision',
      function (collidedWith, linearVelocity, angularVelocity) {
      }
    );
    player.translateOnAxis(new THREE.Vector3(0, 1, 0), 1.0);
    return player;
  }


  function makeCamera()
  {
    var width = gRenderer.domElement.width;
    var height = gRenderer.domElement.height;
    var fieldOfView = 35; // in degrees.
    var aspectRatio = (width - 0.0) / height;
    var nearClip = 1.0;
    var farClip = 1000.0;

    var camera = new THREE.PerspectiveCamera(
      fieldOfView,
      aspectRatio,
      nearClip,
      farClip);

    return camera;
  }


  //
  // Functions for the 'playing' state.
  //

  function playingDraw()
  {
    gRenderer.render(gWorld, gCamera);
    gRenderStats.update();
  }


  function playingUpdate()
  {
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
    gWorld = makeWorld();
    gDungeon = makeDungeon();
    gCamera = makeCamera();
    gPlayer = makePlayer();

    gWorld.add(gDungeon);
    gWorld.add(gCamera);
    gWorld.add(gPlayer);

    gCamera.position.set(60, 60, 60);
    gCamera.lookAt(gPlayer.position);

    // Launch into LudumEngine's main loop
    ludum.start('playing');
  }


  return {
    'run': run
  };

}(); // end of the dungeon namespace
