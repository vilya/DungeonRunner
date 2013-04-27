var dungeon = function () { // start of the dungeon namespace

  //
  // Global variables
  //

  var gRenderer;
  var gRenderStats;

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
      'shape': null,          // The 3D shape for the player.
      'runSpeed': 15.0,       // The movement speed of the player, in metres/second.
      'jogSpeed': 7.5,        // The movement speed of the player, in metres/second.
      'walkSpeed': 3.0,       // The movement speed of the player, in metres/second.
      'turnSpeed': 5.0,       // How quickly the player turns, in radians/second(?).
    },
  };


  //
  // Setup functions
  //

  function makeWorld()
  {
    game.world = new THREE.Scene();
    game.world.fog = new THREE.Fog(0x000000, 10, 100);
  }


  function makeDungeon()
  {
    var geo = new THREE.CubeGeometry(100, 1, 100);
    var material = new THREE.MeshLambertMaterial({
        color: 0xAAAAAA,
        map: THREE.ImageUtils.loadTexture('img/rock.png')
    });

    material.map.wrapS = THREE.RepeatWrapping;
    material.map.wrapT = THREE.RepeatWrapping;
    material.map.repeat.set(20, 20);

    game.dungeon.shape = new THREE.Mesh(geo, material);
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

    game.player.shape = new THREE.Mesh(geo, material);
    game.player.shape.castShadow = true;
    game.player.shape.receiveShadow = true;
    game.player.shape.translateOnAxis(new THREE.Vector3(0, 1, 0), 1.0);
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


  function playingUpdate(dt)
  {
    var turn = new THREE.Vector3(0.0, 0.0, 0.0);
    var move = new THREE.Vector3(0.0, 0.0, -1.0);
    var speed = game.player.jogSpeed;

    if (ludum.isKeyPressed(ludum.keycodes.LEFT))
      turn.y += 1.0;
    if (ludum.isKeyPressed(ludum.keycodes.RIGHT))
      turn.y -= 1.0;

    if (ludum.isKeyPressed(ludum.keycodes.UP))
      speed = game.player.runSpeed;
    else if (ludum.isKeyPressed(ludum.keycodes.DOWN))
      speed = game.player.walkSpeed;

    if (turn.y != 0.0)
      game.player.shape.rotateOnAxis(turn, game.player.turnSpeed * dt / 1000.0);
    game.player.shape.translateOnAxis(move, speed * dt / 1000.0);
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

    // Set up the performance graph (remember to turn this off for the final game!)
		gRenderStats = new Stats();
		gRenderStats.domElement.style.position = 'absolute';
		gRenderStats.domElement.style.top = '0px';
		gRenderStats.domElement.style.zIndex = 100;
		document.getElementById( 'viewport' ).appendChild( gRenderStats.domElement );
		
    // Configure ludum.js
    ludum.useKeyboard();        // Install's ludum.js' keyboard event handlers.

    // Set up the game states.
    ludum.addState('playing', { 'draw': playingDraw, 'update': playingUpdate });

    // Create the world, camera, etc.
    makeWorld();
    makeDungeon();
    makeCamera();
    makePlayer();

    // Launch into LudumEngine's main loop
    ludum.start('playing');
  }


  return {
    'run': run
  };

}(); // end of the dungeon namespace
