var dungeon = function () { // start of the dungeon namespace

  //
  // Constants
  //

  var MAP_ROWS = 10;  // no. of tiles
  var MAP_COLS = 10;  // no. of tiles.

  var TILE_SIZE = 10; // metres.

  var MAP_WIDTH = MAP_COLS * TILE_SIZE; // metres
  var MAP_DEPTH = MAP_COLS * TILE_SIZE; // metres


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

    // Information about the dungeon.
    'dungeonCfg': {
      'tiles': new Int32Array([
          0, 0, 0, 0, 0, 0, 0, 0, 1, 1,
          0, 0, 0, 0, 0, 0, 1, 1, 1, 1,
          0, 0, 1, 1, 0, 1, 1, 1, 1, 0,
          0, 1, 1, 1, 1, 1, 0, 0, 0, 0,
          0, 1, 0, 0, 0, 1, 0, 0, 0, 0,
          0, 1, 0, 0, 1, 1, 0, 0, 0, 0,
          0, 1, 1, 1, 1, 0, 0, 0, 0, 0,
          0, 0, 0, 1, 1, 1, 0, 0, 0, 0,
          0, 0, 0, 0, 1, 1, 0, 0, 0, 0,
          0, 0, 0, 0, 1, 1, 0, 0, 0, 0,
      ]),
      'startTile': 8,
      'endTile': 94
    },

    // Information about the player.
    'playerCfg': {
      'autorun':  false,  // Whether the player automatically runs.
      'runSpeed': 15.0,   // The movement speed of the player, in metres/second.
      'jogSpeed': 7.5,    // The movement speed of the player, in metres/second.
      'walkSpeed': 3.0,   // The movement speed of the player, in metres/second.
      'turnSpeed': 5.0,   // How quickly the player turns, in radians/second(?).
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
    game.dungeon = new THREE.Object3D();
    game.world.add(game.dungeon);

    var geo = new THREE.CubeGeometry(TILE_SIZE, 1, TILE_SIZE);
    var material = new THREE.MeshLambertMaterial({
        color: 0xAAAAAA,
        map: THREE.ImageUtils.loadTexture('img/rock.png')
    });
    material.map.wrapS = THREE.RepeatWrapping;
    material.map.wrapT = THREE.RepeatWrapping;
    material.map.repeat.set(2, 2);

    for (var r = 0, endR = MAP_ROWS; r < endR; r++) {
      for (var c = 0, endC = MAP_COLS; c < endC; c++) {
        var i = r * MAP_COLS + c;
        _makeTile(r, c, game.dungeonCfg.tiles[i], geo, material);
      }
    }

    var light = _makeDirectionalLight(new THREE.Vector3(60, 60, 0), game.dungeon.position);
    game.dungeon.add(light);
  }


  function _makeTile(row, col, tileType, geo, material)
  {
    if (tileType == 0)
      return;

    var x = TILE_SIZE * col;
    var z = TILE_SIZE * row;

    var tile = new THREE.Mesh(geo, material);
    // Move the tile so that it's bottom left corner is at the origin.
    tile.translateOnAxis(new THREE.Vector3(TILE_SIZE / 2.0, -0.5, TILE_SIZE / 2.0), 1);
    // Move the tile into it's final resting place.
    tile.translateOnAxis(new THREE.Vector3(x, 0, z), 1);

    tile.receiveShadow = true;
    game.dungeon.add(tile);
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

    var startRow = game.dungeonCfg.startTile / MAP_COLS;
    var startCol = game.dungeonCfg.startTile % MAP_COLS;
    var startPos = tileCenter(startRow, startCol);
    startPos.y += 1;

    game.player = new THREE.Mesh(geo, material);
    game.player.castShadow = true;
    game.player.receiveShadow = true;
    game.player.translateOnAxis(startPos, 1.0);
    game.player.rotateOnAxis(new THREE.Vector3(0, 1, 0), Math.PI);
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
    //game.world.fog = null; // Switch off fog when we're using the trackball controls.
  }


  function makeDebugGrid()
  {
    var grid = new THREE.Mesh(
        new THREE.PlaneGeometry(MAP_WIDTH * 2, MAP_DEPTH * 2, MAP_COLS * 2, MAP_ROWS * 2),
        new THREE.MeshBasicMaterial({
          'color': 0x8888CC,
          'wireframe': true,
          'wireframeLinewidth': 2
        })
    );
    grid.lookAt(new THREE.Vector3(0, 1, 0));
    game.world.add(grid);

    var textMaterial = new THREE.MeshBasicMaterial({ 'color': 0xCC0000 });

    var originLabelGeo = new THREE.TextGeometry("origin", { 'size': 1.0, 'height': 0.2 });
    var originLabel = new THREE.Mesh(originLabelGeo, textMaterial);
    game.world.add(originLabel);

    var xLabelGeo = new THREE.TextGeometry("+x", { 'size': 1.0, 'height': 0.2 });
    var xLabel = new THREE.Mesh(xLabelGeo, textMaterial);
    xLabel.translateOnAxis(new THREE.Vector3(1, 0, 0), 100);
    game.world.add(xLabel);

    var zLabelGeo = new THREE.TextGeometry("+z", { 'size': 1.0, 'height': 0.2 });
    var zLabel = new THREE.Mesh(zLabelGeo, textMaterial);
    zLabel.translateOnAxis(new THREE.Vector3(0, 0, 1), 100);
    game.world.add(zLabel);
  }


  //
  // Functions
  //

  function tileCenter(row, col) {
    var x = (col + 0.5) * TILE_SIZE;
    var z = (row + 0.5) * TILE_SIZE;
    return new THREE.Vector3(x, 0, z);
  }


  function willHitWall(object3D, objectSpaceDelta)
  {
    var toWorldMatrix = new THREE.Matrix4().extractRotation(object3D.matrixWorld);
    var worldSpaceDelta = new THREE.Vector3().copy(objectSpaceDelta).applyMatrix4(toWorldMatrix);
    var endPos = new THREE.Vector3().addVectors(object3D.position, worldSpaceDelta);

    // Figure out which tile you're currently in.
    var fromCol = Math.floor(object3D.position.x / TILE_SIZE);
    var fromRow = Math.floor(object3D.position.z / TILE_SIZE);

    // Figure out which tile you're moving to.
    var toCol = Math.floor(endPos.x / TILE_SIZE);
    var toRow = Math.floor(endPos.z / TILE_SIZE);

    // If you're moving off the map, you'll hit a wall.
    if (toCol < 0 || toCol >= MAP_COLS || toRow < 0 || toRow >= MAP_ROWS)
      return true;

    // Otherwise, if you're trying to move to an empty tile you'll hit a wall.
    if (fromCol != toCol || fromRow != toRow) {
      var toI = toRow * MAP_COLS + toCol;
      return game.dungeonCfg.tiles[toI] == 0;
    }

    // If neither of those apply, you're good.
    return false;
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
    var speed;

    if (ludum.isKeyPressed(ludum.keycodes.LEFT))
      turn.y += 1.0;
    if (ludum.isKeyPressed(ludum.keycodes.RIGHT))
      turn.y -= 1.0;

    if (game.playerCfg.autorun) {
      if (ludum.isKeyPressed(ludum.keycodes.UP))
        speed = game.playerCfg.runSpeed;
      else if (ludum.isKeyPressed(ludum.keycodes.DOWN))
        speed = game.playerCfg.walkSpeed;
      else
        speed = game.playerCfg.jogSpeed;
    }
    else {
      if (ludum.isKeyPressed(ludum.keycodes.UP))
        speed = game.playerCfg.runSpeed;
      else if (ludum.isKeyPressed(ludum.keycodes.DOWN))
        speed = -game.playerCfg.walkSpeed;
      else
        speed = 0;
    }

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

    makeDebugGrid();

    // Launch into LudumEngine's main loop
    ludum.start('playing');
  }


  return {
    'run': run
  };

}(); // end of the dungeon namespace
