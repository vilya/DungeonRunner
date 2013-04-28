var dungeon = function () { // start of the dungeon namespace

  //
  // Constants
  //

  var TILE_SIZE = 10;       // metres.
  var WALL_HEIGHT = 4;      // metres.
  var WALL_THICKNESS = 0.1; // metres.


  //
  // Global variables
  //

  var gRenderer;
  var gRenderStats;

  var game = {
    // three.js objects
    'world': null,      // The top-level Scene object for the world.
    'dungeon': null,    // The 3D object for the dungeon.
    'player': null,     // The 3D object for the player.
    'camera': null,     // The 3D object for the camera.
    'controls': null,   // The current camera controls, if any.
    'loot': [],         // The list of available loot items.
    'occluders': [],    // A list of objects which are in between the camera and the player.

    'hud':  null,       // The HUD, displays player's score, life remaining, etc.

    'debug': false,

    // Information about the dungeon.
    'dungeonData': {
      'rows': 10,
      'cols': 10,
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
    'tileData': {
      'floorGeo': new THREE.CubeGeometry(TILE_SIZE, 1, TILE_SIZE),
      'xWallGeo': new THREE.CubeGeometry(TILE_SIZE, WALL_HEIGHT, WALL_THICKNESS),
      'zWallGeo': new THREE.CubeGeometry(WALL_THICKNESS, WALL_HEIGHT, TILE_SIZE),
      'material': null, // gets initialised in makeDungeon
    },

    // Information about the player.
    'playerData': {
      'autorun':  false,  // Whether the player automatically runs.
      'runSpeed': 20.0,   // The movement speed of the player, in metres/second.
      'jogSpeed': 10.0,    // The movement speed of the player, in metres/second.
      'walkSpeed': 5.0,   // The movement speed of the player, in metres/second.
      'turnSpeed': 5.0,   // How quickly the player turns, in radians/second(?).
      'score': 0,
      'life': 100,
    },

    // Information about the camera.
    'cameraData': {
      'offset': new THREE.Vector3(0, (WALL_HEIGHT - 1) * 0.8, 10), // Position of the camera relative to the player.
    },

    'lootData': {
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
    game.world.fog = new THREE.Fog(0x000000, 10, 60);
  }


  function makeDungeon()
  {
    game.dungeonData.width = game.dungeonData.cols * TILE_SIZE; // metres
    game.dungeonData.depth = game.dungeonData.cols * TILE_SIZE; // metres

    game.tileData.material = new THREE.MeshLambertMaterial({
      'color': 0xAAAAAA,
      'map': THREE.ImageUtils.loadTexture('img/rock.png')
    });
    game.tileData.material.map.wrapS = THREE.RepeatWrapping;
    game.tileData.material.map.wrapT = THREE.RepeatWrapping;
    game.tileData.material.map.repeat.set(2, 2);

    game.lootData.material = new THREE.MeshLambertMaterial({
        'color': 0xEEEE00,
        'emissive': 0x1E1E00,
    });
    game.lootData.geo.computeBoundingBox();

    game.dungeon = new THREE.Object3D();
    game.world.add(game.dungeon);

    var light = new THREE.AmbientLight(0x101010);
    game.dungeon.add(light);

    // Make the floor tiles
    for (var r = 0, endR = game.dungeonData.rows; r < endR; r++) {
      for (var c = 0, endC = game.dungeonData.cols; c < endC; c++) {
        if (game.dungeonData.tiles[r][c] != 0)
          _makeTile(r, c);
      }
    }

    // Make the +z walls
    for (var r = 0, endR = game.dungeonData.rows; r < endR; r++) {
      var wasInTile = false;
      for (var c = 0, endC = game.dungeonData.cols; c < endC; c++) {
        var inTile = (game.dungeonData.tiles[r][c] != 0);
        if (inTile != wasInTile)
          _makeZWall(r, c);
        wasInTile = inTile;
      }
      if (wasInTile)
        _makeZWall(r, game.dungeonData.cols);
    }

    // Make the +x walls
    for (var c = 0, endC = game.dungeonData.cols; c < endC; c++) {
      var wasInTile = false;
      for (var r = 0, endR = game.dungeonData.rows; r < endR; r++) {
        var inTile = (game.dungeonData.tiles[r][c] != 0);
        if (inTile != wasInTile)
          _makeXWall(r, c);
        wasInTile = inTile;
      }
      if (wasInTile)
        _makeXWall(game.dungeonData.rows, c);
    }

    // Count the number of valid tiles.
    var numTiles = 0;
    for (var r = 0, endR = game.dungeonData.rows; r < endR; r++) {
      for (var c = 0, endC = game.dungeonData.cols; c < endC; c++) {
        if (game.dungeonData.tiles[r][c] != 0)
          ++numTiles;
      }
    }

    // Distribute the loot evenly among the valid tiles.
    var numTreasures = Math.ceil(game.dungeonData.rows * game.dungeonData.cols * game.lootData.frequency);
    var tileNum = 0;
    var n = Math.floor(numTiles / numTreasures);
    for (var r = 0, endR = game.dungeonData.rows; r < endR; r++) {
      for (var c = 0, endC = game.dungeonData.cols; c < endC; c++) {
        if (game.dungeonData.tiles[r][c] == 0)
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
    var floor = new THREE.Mesh(game.tileData.floorGeo, game.tileData.material);
    floor.translateOnAxis(new THREE.Vector3(0, -0.5, 0), 1);
    floor.receiveShadow = true;
    tile.add(floor);

    // Create the roof
    if (!game.debug) {
      var roof = new THREE.Mesh(game.tileData.floorGeo, game.tileData.material);
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
    var material = new THREE.MeshLambertMaterial({
      'color': 0xAAAAAA,
      'map': THREE.ImageUtils.loadTexture('img/rock.png')
    });
    // Create the wall
    var wall = new THREE.Mesh(game.tileData.xWallGeo, material);
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
    var material = new THREE.MeshLambertMaterial({
      'color': 0xAAAAAA,
      'map': THREE.ImageUtils.loadTexture('img/rock.png')
    });
    // Create the wall
    var wall = new THREE.Mesh(game.tileData.zWallGeo, material);
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
    var loot = new THREE.Mesh(game.lootData.geo, game.lootData.material);
    loot.translateOnAxis(new THREE.Vector3(0, 0, 1.25), 1);
    loot.castShadow = true;
    loot.receiveShadow = true;

    // Move the loot to its final resting place.
    var x = (col + 0.5) * TILE_SIZE;
    var z = (row + 0.5) * TILE_SIZE;
    loot.translateOnAxis(new THREE.Vector3(x, 0, z), 1);

    game.loot.push(loot);
    game.dungeon.add(loot);
  }


  function makePlayer()
  {
    var geo = new THREE.CubeGeometry(0.8, 2.0, 0.8);
    var material = new THREE.MeshLambertMaterial({ color: 0x880000 });

    geo.computeBoundingBox();

    var startRow = game.dungeonData.startTile / game.dungeonData.cols;
    var startCol = game.dungeonData.startTile % game.dungeonData.cols;
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
    game.camera.translateOnAxis(game.cameraData.offset, 1.0);
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
        new THREE.PlaneGeometry(game.dungeonData.width, game.dungeonData.depth, game.dungeonData.cols, game.dungeonData.rows),
        new THREE.MeshBasicMaterial({
          'color': 0x8888CC,
          'wireframe': true,
          'wireframeLinewidth': 2
        })
    );
    grid.applyMatrix(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    grid.translateOnAxis(new THREE.Vector3(game.dungeonData.width / 2.0, game.dungeonData.depth / 2.0, 0.0), 1);
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
    if (toCol < 0 || toCol >= game.dungeonData.cols || toRow < 0 || toRow >= game.dungeonData.rows)
      return true;

    // Otherwise, if you're trying to move to an empty tile you'll hit a wall.
    if (fromCol != toCol || fromRow != toRow)
      return game.dungeonData.tiles[toRow][toCol] == 0;

    // If neither of those apply, you're good.
    return false;
  }


  function centroid(obj)
  {
    var c = new THREE.Vector3();
    c.addVectors(obj.geometry.boundingBox.min, obj.geometry.boundingBox.max);
    c.divideScalar(2.0);
    return c;
  }


  function objRadius(obj)
  {
    var dim = new THREE.Vector3();
    dim.subVectors(obj.geometry.boundingBox.max, obj.geometry.boundingBox.min);
  
    var r = (dim.x + dim.z) / 2.0;
    return r;
  }


  // Checks whether two objects overlap in the horizontal plane.
  function overlapping(objA, objB)
  {
    var cA = centroid(objA);
    var cB = centroid(objB);
    objA.localToWorld(cA);
    objB.localToWorld(cB);

    var rA = objRadius(objA);
    var rB = objRadius(objB);
    
    var distance = new THREE.Vector3().subVectors(cA, cB).length();
    var result = distance < (rA + rB);
    return result;
  }


  function clearOccludingWalls()
  {
    for (var i = 0, end = game.occluders.length; i < end; i++)
      game.occluders[i].material.wireframe = false;
    game.occluders = [];
  }


  function hideOccludingWalls()
  {
    var src = new THREE.Vector3(0, 0, 0);
    game.player.localToWorld(src);

    var dest = new THREE.Vector3(0, 0, 0);
    game.camera.localToWorld(dest);

    var dir = new THREE.Vector3().subVectors(dest, src);

    var raycaster = new THREE.Raycaster(src, dir, 0, dir.length());
    var intersections = raycaster.intersectObject(game.dungeon, true);
    for (var i = 0, end = intersections.length; i < end; i++) {
      var occluder = intersections[i].object;
      game.occluders.push(occluder);
      occluder.material.wireframe = true;
    }
  }


  //
  // Functions for the 'playing' state.
  //

  function playingDraw()
  {
    clearOccludingWalls();
    hideOccludingWalls();
    gRenderer.render(game.world, game.camera);
    gRenderStats.update();
  }


  function playingUpdate(dt)
  {
    // Collect loot
    for (var i = game.loot.length - 1; i >= 0; i--) {
      if (overlapping(game.player, game.loot[i])) {
        game.dungeon.remove(game.loot[i]);
        game.loot.splice(i, 1);
        game.playerData.score += 1;
      }
    }

    // Movement
    var turn = new THREE.Vector3(0.0, 0.0, 0.0);
    var move = new THREE.Vector3(0.0, 0.0, -1.0);
    var speed;

    if (ludum.isKeyPressed(ludum.keycodes.LEFT))
      turn.y += 1.0;
    if (ludum.isKeyPressed(ludum.keycodes.RIGHT))
      turn.y -= 1.0;

    if (game.playerData.autorun) {
      if (ludum.isKeyPressed(ludum.keycodes.UP))
        speed = game.playerData.runSpeed;
      else if (ludum.isKeyPressed(ludum.keycodes.DOWN))
        speed = game.playerData.walkSpeed;
      else
        speed = game.playerData.jogSpeed;
    }
    else {
      if (ludum.isKeyPressed(ludum.keycodes.UP))
        speed = game.playerData.runSpeed;
      else if (ludum.isKeyPressed(ludum.keycodes.DOWN))
        speed = -game.playerData.walkSpeed;
      else
        speed = 0;
    }

    var turnAmount = game.playerData.turnSpeed * dt / 1000.0;
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
      game.camera.translateOnAxis(game.cameraData.offset, 1.0);
      game.camera.lookAt(game.player.position);
    }

    refreshHUD();
  }


  // HUD class.
  function HUD()
  {
    var x = 0;
    var y = 0;
    var w = 100;

    this.domElement = document.createElement("div");
    this.domElement.id = "hud";
    this.domElement.style.width = w + "px";
    this.domElement.style.position = 'absolute';
    this.domElement.style.bottom = y + "px";
    this.domElement.style.left = x + "px";
    this.domElement.style.zIndex = 100;
    this.domElement.style.background = "#222";
    this.domElement.style.fontFamily = "Helvetica,Arial,sans-serif";
    this.domElement.style.fontSize = "12px";
    //this.domElement.style.fontWeight = "bold";
    this.domElement.style.opacity = 0.8;

    var scoreElem = document.createElement("div");
    scoreElem.id = "score";
    scoreElem.style.cssText = "padding:0 0 3px 3px; text-align: left;";
    this.domElement.appendChild(scoreElem);

    var scoreText = document.createElement("div");
    scoreText.id = 'scoreText';
    scoreText.innerHTML = "Gold";
    scoreText.style.color = "yellow";
    scoreElem.appendChild(scoreText);

    var lifeElem = document.createElement("div");
    lifeElem.id = 'life';
    lifeElem.style.cssText = "padding:0 0 3px 3px; text-align: left;";
    this.domElement.appendChild(lifeElem);

    var lifeText = document.createElement("div");
    lifeText.id = 'lifeText';
    lifeText.innerHTML = "Life";
    lifeText.style.color = "red";
    lifeElem.appendChild(lifeText);

    var stopwatchElem = document.createElement("div");
    stopwatchElem.id = 'stopwatch';
    stopwatchElem.style.cssText = "padding:0 0 3px 3px; text-align: left;";
    this.domElement.appendChild(stopwatchElem);

    var stopwatchText = document.createElement("div");
    stopwatchText.id = 'stopwatchText';
    stopwatchText.innerHTML = "taken";
    stopwatchText.style.color = "#BBB";
    stopwatchElem.appendChild(stopwatchText);

    this.setScore = function (score) {
      scoreText.textContent = score + " gold";
    }

    this.setLife = function (life) {
      lifeText.textContent = life + "% health";
    }

    this.setStopwatch = function (timeInSecs) {
      //var timeStr = new Date(ludum.globals.stateT).toTimeString().replace(/.*\d{2}:(\d{2}:\d{2}).*/, "$1");
      var mins = Math.floor(timeInSecs / 60);
      var secs = Math.floor(timeInSecs % 60);
      var secsStr = (secs < 10) ? "0" + secs : "" + secs;
      var str = mins + ":" + secsStr + " secs";
      stopwatchText.textContent = str;
    }

    return this;
  }


  function makeHUD()
  {
    game.hud = new HUD();
    document.getElementById('viewport').appendChild(game.hud.domElement);
  }



  function refreshHUD()
  {
    game.hud.setScore(game.playerData.score);
    game.hud.setLife(game.playerData.life);
    game.hud.setStopwatch(ludum.globals.stateT);
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
    ludum.useKeyboard(); // Installs ludum.js' keyboard event handlers.

    // Set up the game states.
    ludum.addState('playing', { 'draw': playingDraw, 'update': playingUpdate });

    // Create the world, camera, etc.
    makeWorld();
    makeHUD();
    makeDungeon();
    makePlayer();
    makeCamera();

    if (game.debug) {
      makeDebugGrid();
      game.controls = new THREE.TrackballControls(game.camera, gRenderer.domElement);
      game.world.fog = null; // Switch off fog when we're using the trackball controls.
    }

    window.addEventListener('resize', resize, false);

    // Launch into LudumEngine's main loop
    ludum.start('playing');
  }


  function resize()
  {
    var width = window.innerWidth;
    var height = window.innerHeight;
    var textSize = height * 0.05;
    var x = width - (4 * textSize) - 10.0;

    game.camera.aspect = width / height;
    game.camera.updateProjectionMatrix();

    refreshHUD();

    gRenderer.setSize(width, height);
  }


  return {
    'run': run,
    'resize': resize
  };

}(); // end of the dungeon namespace
