var dungeon = function () { // start of the dungeon namespace

  //
  // Global variables
  //

  var gRenderer;
  var gRenderStats;

  var game = {
    // three.js objects
    'world': null,    // The top-level Scene object for the world.
    'dungeon': null,  // The 3D object for the dungeon.
    'player': null,   // The 3D object for the player.
    'camera': null,   // The 3D object for the camera.
    'controls': null, // The current camera controls, if any.

    // Information about the player.
    'playerCfg': {
      'runSpeed': 15.0, // The movement speed of the player, in metres/second.
      'jogSpeed': 7.5,  // The movement speed of the player, in metres/second.
      'walkSpeed': 3.0, // The movement speed of the player, in metres/second.
      'turnSpeed': 5.0, // How quickly the player turns, in radians/second(?).
    },

    // Information about the camera.
    'cameraCfg': {
      'offset': new THREE.Vector3(0, 10, 20), // Position of the camera relative to the player.
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

    game.dungeon = new THREE.Mesh(geo, material);
    game.dungeon.castShadow = true;
    game.dungeon.receiveShadow = true;
    game.dungeon.translateOnAxis(new THREE.Vector3(0, -1, 0), 0.5);
    game.world.add(game.dungeon);

    var light = _makeDirectionalLight(new THREE.Vector3(60, 60, 0), game.dungeon.position);
    game.dungeon.add(light);
  }


  function _makeDirectionalLight(position, target)
  {
    var light = new THREE.DirectionalLight(0xFFFFFF);
    light.position.copy(position);
    light.lookAt(target);
    light.castShadow = true;
    light.shadowCameraLeft = -20;
    light.shadowCameraTop = -20;
    light.shadowCameraRight = 20;
    light.shadowCameraBottom = 20;
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

    game.player = new THREE.Mesh(geo, material);
    game.player.castShadow = true;
    game.player.receiveShadow = true;
    game.player.translateOnAxis(new THREE.Vector3(0, 1, 0), 1.0);
    game.world.add(game.player);
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
    game.camera.position.copy(game.player.position);
    game.camera.translateOnAxis(game.cameraCfg.offset, 1.0);
    game.camera.lookAt(game.player.position);
    game.world.add(game.camera);

    //game.controls = new THREE.TrackballControls(game.camera, gRenderer.domElement);
  }


  //
  // Functions
  //

  function willHitWall(object3D, objectSpaceDelta)
  {
    var worldSpaceDelta = new THREE.Vector3().copy(objectSpaceDelta);
    object3D.localToWorld(worldSpaceDelta);

    var endPos = new THREE.Vector3().addVectors(object3D.position, worldSpaceDelta);
    return (Math.abs(endPos.x) > 100.0 || Math.abs(endPos.y) > 100.0 || Math.abs(endPos.z) > 100.0);
  }


  //
  // Functions for the 'playing' state.
  //

  function playingDraw()
  {
    gRenderer.render(game.world, game.camera);
    gRenderStats.update();
  }


  function playingUpdate(dt)
  {
    var turn = new THREE.Vector3(0.0, 0.0, 0.0);
    var move = new THREE.Vector3(0.0, 0.0, -1.0);
    var speed = game.playerCfg.jogSpeed;

    if (ludum.isKeyPressed(ludum.keycodes.LEFT))
      turn.y += 1.0;
    if (ludum.isKeyPressed(ludum.keycodes.RIGHT))
      turn.y -= 1.0;

    if (ludum.isKeyPressed(ludum.keycodes.UP))
      speed = game.playerCfg.runSpeed;
    else if (ludum.isKeyPressed(ludum.keycodes.DOWN))
      speed = game.playerCfg.walkSpeed;

    var turnAmount = game.playerCfg.turnSpeed * dt / 1000.0;
    var moveAmount = speed * dt / 1000.0;

    if (turn.y != 0.0)
      game.player.rotateOnAxis(turn, turnAmount);
    
    if (!willHitWall(game.player, move))
      game.player.translateOnAxis(move, moveAmount);

    if (game.controls) {
      game.controls.update();
    }
    else {
      game.camera.position.copy(game.player.position);
      game.camera.rotation.copy(game.player.rotation);
      game.camera.translateOnAxis(game.cameraCfg.offset, 1.0);
      game.camera.lookAt(game.player.position);
    }
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
      ludum.showWarning("<strong>Your browser doesn't appear to support " +
                        "WebGL.</strong> You may get lower frame rates and/or " +
                        "poorer image quality as a result. Sorry!");
      gRenderer = new THREE.CanvasRenderer();
    }
    else {
      ludum.showError("<strong>Your browser doesn't appear to support WebGL " +
                      "<em>or</em> Canvas.</strong> Unable to continue. Sorry!");
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
    makePlayer();
    makeCamera();

    // Launch into LudumEngine's main loop
    ludum.start('playing');
  }


  return {
    'run': run
  };

}(); // end of the dungeon namespace
