var dungeon = function () { // start of the dungeon namespace

  //
  // Constants
  //

  var MAP_ROWS = 10;        // no. of tiles
  var MAP_COLS = 10;        // no. of tiles.

  var TILE_SIZE = 10;       // metres.
  var WALL_HEIGHT = 4;      // metres.
  var WALL_THICKNESS = 0.1; // metres.
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
    'loot': [],       // The list of available loot items.

    'debug': false,

    // Information about the dungeon.
    'dungeonCfg': {
      'tiles': [
          [ 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, ],
          [ 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, ],
          [ 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, ],
          [ 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, ],
          [ 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, ],
          [ 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, ],
          [ 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, ],
          [ 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, ],
          [ 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, ],
          [ 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, ],
      ],
      'startTile': 8,
      'endTile': 94,
    },

    // Information about the tiles used to build the dungeon.
    'tileCfg': {
      'floorGeo': new THREE.CubeGeometry(TILE_SIZE, 1, TILE_SIZE),
      'xWallGeo': new THREE.CubeGeometry(TILE_SIZE, WALL_HEIGHT, WALL_THICKNESS),
      'zWallGeo': new THREE.CubeGeometry(WALL_THICKNESS, WALL_HEIGHT, TILE_SIZE),
      'material': null, // gets initialised in makeDungeon
    },

    // Information about the player.
    'playerCfg': {
      'autorun':  false,  // Whether the player automatically runs.
      'runSpeed': 20.0,   // The movement speed of the player, in metres/second.
      'jogSpeed': 10.0,    // The movement speed of the player, in metres/second.
      'walkSpeed': 5.0,   // The movement speed of the player, in metres/second.
      'turnSpeed': 5.0,   // How quickly the player turns, in radians/second(?).
    },

    // Information about the camera.
    'cameraCfg': {
      'offset': new THREE.Vector3(0, (WALL_HEIGHT - 1) * 0.8, 10), // Position of the camera relative to the player.
    },

    'lootCfg': {
      'frequency': 0.05,
      'geo': new THREE.CylinderGeometry(0.25, 0.25, 0.1, 20, 1, false),
      'material': null, // gets initialised in makeDungeon.
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

    var light = new THREE.AmbientLight(0x101010);
    game.dungeon.add(light);

    game.tileCfg.material = new THREE.MeshLambertMaterial({
      'color': 0xAAAAAA,
      'map': THREE.ImageUtils.loadTexture('img/rock.png')
    });
    game.tileCfg.material.map.wrapS = THREE.RepeatWrapping;
    game.tileCfg.material.map.wrapT = THREE.RepeatWrapping;
    game.tileCfg.material.map.repeat.set(2, 2);

    game.lootCfg.material = new THREE.MeshLambertMaterial({
        'color': 0xEEEE00,
        'emissive': 0x1E1E00,
    });

    // Make the floor tiles
    for (var r = 0, endR = MAP_ROWS; r < endR; r++) {
      for (var c = 0, endC = MAP_COLS; c < endC; c++) {
        if (game.dungeonCfg.tiles[r][c] != 0)
          _makeTile(r, c);
      }
    }

    // Make the +z walls
    for (var r = 0, endR = MAP_ROWS; r < endR; r++) {
      var wasInTile = false;
      for (var c = 0, endC = MAP_COLS; c < endC; c++) {
        var inTile = (game.dungeonCfg.tiles[r][c] != 0);
        if (inTile != wasInTile)
          _makeZWall(r, c);
        wasInTile = inTile;
      }
      if (wasInTile)
        _makeZWall(r, MAP_COLS);
    }

    // Make the +x walls
    for (var c = 0, endC = MAP_COLS; c < endC; c++) {
      var wasInTile = false;
      for (var r = 0, endR = MAP_ROWS; r < endR; r++) {
        var inTile = (game.dungeonCfg.tiles[r][c] != 0);
        if (inTile != wasInTile)
          _makeXWall(r, c);
        wasInTile = inTile;
      }
      if (wasInTile)
        _makeXWall(MAP_ROWS, c);
    }

    // Count the number of valid tiles.
    var numTiles = 0;
    for (var r = 0, endR = MAP_ROWS; r < endR; r++) {
      for (var c = 0, endC = MAP_COLS; c < endC; c++) {
        if (game.dungeonCfg.tiles[r][c] != 0)
          ++numTiles;
      }
    }

    // Distribute the loot evenly among the valid tiles.
    var numTreasures = Math.ceil(MAP_ROWS * MAP_COLS * game.lootCfg.frequency);
    var tileNum = 0;
    var n = Math.floor(numTiles / numTreasures);
    for (var r = 0, endR = MAP_ROWS; r < endR; r++) {
      for (var c = 0, endC = MAP_COLS; c < endC; c++) {
        if (game.dungeonCfg.tiles[r][c] == 0)
          continue;
        if (tileNum % n == 0 && numTreasures > 0) {
          _makeLoot(r, c);
          --numTreasures;
        }
        ++tileNum;
      }
    }
  }


  function _makeTile(row, col)
  {
    var tile = new THREE.Object3D();

    // Create the floor
    var floor = new THREE.Mesh(game.tileCfg.floorGeo, game.tileCfg.material);
    floor.translateOnAxis(new THREE.Vector3(0, -0.5, 0), 1);
    floor.receiveShadow = true;
    tile.add(floor);

    // Create the roof
    if (!game.debug) {
      var roof = new THREE.Mesh(game.tileCfg.floorGeo, game.tileCfg.material);
      roof.translateOnAxis(new THREE.Vector3(0, WALL_HEIGHT + 0.5, 0), 1);
      roof.receiveShadow = true;
      tile.add(roof);
    }

    // Move the tile into it's final resting place.
    var x = (col + 0.5) * TILE_SIZE;
    var z = (row + 0.5) * TILE_SIZE;
    tile.translateOnAxis(new THREE.Vector3(x, 0, z), 1);

    game.dungeon.add(tile);
  }


  function _makeXWall(row, col)
  {
    // Create the wall
    var wall = new THREE.Mesh(game.tileCfg.xWallGeo, game.tileCfg.material);
    wall.translateOnAxis(new THREE.Vector3(0, WALL_HEIGHT / 2.0, 0), 1);
    //wall.castShadow = true;
    wall.receiveShadow = true;

    // Move the wall into its final resting place
    var x = (col + 0.5) * TILE_SIZE;
    var z = row * TILE_SIZE;
    wall.translateOnAxis(new THREE.Vector3(x, 0, z), 1);

    game.dungeon.add(wall);
  }


  function _makeZWall(row, col)
  {
    // Create the wall
    var wall = new THREE.Mesh(game.tileCfg.zWallGeo, game.tileCfg.material);
    wall.translateOnAxis(new THREE.Vector3(0, WALL_HEIGHT / 2.0, 0), 1);
    //wall.castShadow = true;
    wall.receiveShadow = true;

    // Move the wall into its final resting place
    var x = col * TILE_SIZE;
    var z = (row + 0.5) * TILE_SIZE;
    wall.translateOnAxis(new THREE.Vector3(x, 0, z), 1);

    game.dungeon.add(wall);
  }


  function _makeLoot(row, col)
  {
    var loot = new THREE.Mesh(game.lootCfg.geo, game.lootCfg.material);
    loot.translateOnAxis(new THREE.Vector3(0, 0, 1.25), 1);
    loot.castShadow = true;
    loot.receiveShadow = true;

    // Move the loot to its final resting place.
    var x = (col + 0.5) * TILE_SIZE;
    var z = (row + 0.5) * TILE_SIZE;
    loot.translateOnAxis(new THREE.Vector3(x, 0, z), 1);

    game.dungeon.add(loot);
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

    var torch = new THREE.SpotLight(0xFFFFFF, 1.0, 30.0, true);
    torch.position.set(-4, 0, 2);
    torch.target = game.player;
    torch.castShadow = true;
    torch.shadowCameraNear = 0.5;
    torch.shadowCameraFar = 40.0;
    torch.shadowMapWidth = 1024;
    torch.shadowMapHeight = 1024;
    torch.shadowDarkness = 0.7;
    if (game.debug)
      torch.shadowCameraVisible = true;
    game.camera.add(torch);
  }


  function makeDebugGrid()
  {
    var grid = new THREE.Mesh(
        new THREE.PlaneGeometry(MAP_WIDTH, MAP_DEPTH, MAP_COLS, MAP_ROWS),
        new THREE.MeshBasicMaterial({
          'color': 0x8888CC,
          'wireframe': true,
          'wireframeLinewidth': 2
        })
    );
    grid.applyMatrix(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    grid.translateOnAxis(new THREE.Vector3(MAP_WIDTH / 2.0, MAP_DEPTH / 2.0, 0.0), 1);
    //grid.lookAt(new THREE.Vector3(0, 1, 0));
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
    if (fromCol != toCol || fromRow != toRow)
      return game.dungeonCfg.tiles[toRow][toCol] == 0;

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
    ludum.useKeyboard(); // Install's ludum.js' keyboard event handlers.

    // Set up the game states.
    ludum.addState('playing', { 'draw': playingDraw, 'update': playingUpdate });

    // Create the world, camera, etc.
    makeWorld();
    makeDungeon();
    makePlayer();
    makeCamera();

    if (game.debug) {
      makeDebugGrid();
      game.controls = new THREE.TrackballControls(game.camera, gRenderer.domElement);
      game.world.fog = null; // Switch off fog when we're using the trackball controls.
    }

    // Launch into LudumEngine's main loop
    ludum.start('playing');
  }


  return {
    'run': run
  };

}(); // end of the dungeon namespace
