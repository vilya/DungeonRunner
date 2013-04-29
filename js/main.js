// The scene graph is structured like this:
//
//  world
//    ambient light
//    dungeon
//      floors
//        ...floor tiles...
//      roofs
//        ...roof tiles...
//      walls
//        ...z walls...
//        ...x walls...
//    mobs
//      ...individual mobs...
//    loots
//      ...individual loot items...
//    player
//    camera
//      torch (spotlight)
//    debugCamera
//    debugGrid (only when in debug mode)

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

  var renderer;
  var renderstats;
  var hud;

  // The game configuration settings. These will be used for setting up the
  // game and generally won't change during the game.
  var config = {
    'debug': false,     // Whether to run in debug mode.

    'cameraOffset': new THREE.Vector3(0, (WALL_HEIGHT - 1) * 0.8, 10), // Position of the camera relative to the player.

    'autorun':  false,  // Whether the player automatically runs.
    'runSpeed': 20.0,   // The movement speed of the player, in metres/second.
    'jogSpeed': 10.0,   // The movement speed of the player, in metres/second.
    'walkSpeed': 5.0,   // The movement speed of the player, in metres/second.
    'turnSpeed': 5.0,   // How quickly the player turns, in radians/second.
    'maxHealth': 100,   // Maximum value for the players health.

    'lootsPerTile': 0.05, // i.e. 5% of the tiles will contain loot.
    'maxActiveMobs': 5,   // Number of mobs alive at any one time.
    'mobSpawnDelay': 5.0, // in seconds.
    'mobMoveSpeed': 12.0, // in metres/second.
    'mobDamage': 10,      // in percentage points per second.

    // Name and url for each of our sound effects.
    'sounds': {
      'beat': "sfx/Beat.ogg",
      'ting': "sfx/Ting.ogg",
    },
  };

  // Resource collections.
  var colors = {
    'ambientLight': 0x100800,
    'floor': 0xAAAAAA,
    'wall': 0xAAAAAA,
    'loot': 0xEEEE00,
    'lootEmissive': 0x1E1E00,
    'mob': 0x005500,
    'player': 0x880000,
    'debugGrid': 0x8888CC,
    'debugAxisLabel': 0xCC0000,
  };
  var textures = {
    'floor': null,
    'wall': null,
  };
  var materials = {
    'floor': null,
    'wall': null,
    'loot': null,
    'mob': null,
    'player': null,
    'debugGrid': null,
  };
  var geometry = {
    'floor': null,
    'xWall': null,
    'zWall': null,
    'loot': null,
    'mob': null,
    'player': null,
    'debugGrid': null,
  };
  var axes = { // so we don't have to keep reallocating them...
    'x': new THREE.Vector3(1, 0, 0),
    'y': new THREE.Vector3(0, 1, 0),
    'z': new THREE.Vector3(0, 0, 1),
  };

  // Description for each of the levels.
  var levels = [
    {
      'name': "Level 1",
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
      'startTile': { 'row': 0, 'col': 8 },
      'endTile': { 'row': 9, 'col': 4 },
      'width': 100.0,   // in metres, = cols * TILE_SIZE
      'depth': 100.0,  // in metres, = cols * TILE_SIZE
    },
  ];

  // Run-time state for the game.
  var game = {
    // three.js objects
    'world': null,          // The top-level Scene object for the world.
    'dungeon': null,        // The root 3D object for the dungeon.
    'mobs': null,           // The root 3D object for all mobs.
    'loots': null,          // The root 3D object for all lootable items.
    'player': null,         // The 3D object for the player.
    'camera': null,         // The 3D object for the camera.
    'torch': null,          // The torch held by the player, represented as a spotlight.
    'debugCamera': null,    // The camera we use in debug mode.
    'occluders': [],        // The list of objects which we've hidden because they're in between the player and the camera.
    
    'debugControls': null,  // The current camera controls, if any.

    // General game state
    'level': levels[0], // The current level.

    // Player state
    'score': 0,
    'life': config.maxHealth,

    // Mob state
    'lastSpawnT': 0.0,
  };


  //
  // The HUD class.
  //

  function HUD(x, y, w)
  {
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
      var mins = Math.floor(timeInSecs / 60);
      var secs = Math.floor(timeInSecs % 60);
      var secsStr = (secs < 10) ? "0" + secs : "" + secs;
      var str = mins + ":" + secsStr + " secs";
      stopwatchText.textContent = str;
    }

    return this;
  }


  //
  // Setup functions
  //

  function init()
  {
    setupHUD();
    setupSounds();
    setupTextures();
    setupGeometry();
    setupMaterials();
    setupSceneGraph();
    setupDebugControls();
  }


  function setupHUD()
  {
    game.hud = new HUD(0, 0, 100);
    document.getElementById('viewport').appendChild(game.hud.domElement);
  }


  function setupSounds()
  {
    for (var key in config.sounds)
      ludum.addSound(key, [ config.sounds[key] ]);
  }


  function setupTextures()
  {
    textures.floor = THREE.ImageUtils.loadTexture('img/rock.png');
    textures.wall = THREE.ImageUtils.loadTexture('img/rock.png');
  }


  function setupGeometry()
  {
    geometry.floor = new THREE.CubeGeometry(TILE_SIZE, 1, TILE_SIZE);
    geometry.xWall = new THREE.CubeGeometry(TILE_SIZE, WALL_HEIGHT, WALL_THICKNESS);
    geometry.zWall = new THREE.CubeGeometry(WALL_THICKNESS, WALL_HEIGHT, TILE_SIZE);
    geometry.loot = new THREE.CylinderGeometry(0.25, 0.25, 0.1, 20, 1, false);
    geometry.mob = new THREE.CylinderGeometry(0.80, 0.7, 2.0, 8, 2, false);
    geometry.player = new THREE.CubeGeometry(0.8, 2.0, 0.8, 2, 3, 2);
    geometry.debugGrid = new THREE.PlaneGeometry(levels[0].width, levels[0].depth, levels[0].cols, levels[0].rows);
    geometry.debugOriginLabel = new THREE.TextGeometry("origin", { 'size': 1.0, 'height': 0.2 });
    geometry.debugXAxisLabel = new THREE.TextGeometry("+x", { 'size': 1.0, 'height': 0.2 });
    geometry.debugZAxisLabel = new THREE.TextGeometry("+z", { 'size': 1.0, 'height': 0.2 });

    for (var key in geometry)
      geometry[key].computeBoundingBox();
  }


  function setupMaterials()
  {
    materials.floor = new THREE.MeshLambertMaterial({ 'color': colors.floor, 'map': textures.floor });
    materials.floor.map.wrapS = THREE.RepeatWrapping;
    materials.floor.map.wrapT = THREE.RepeatWrapping;
    materials.floor.map.repeat.set(2, 2);

    materials.wall = new THREE.MeshLambertMaterial({ 'color': colors.wall, 'map': textures.wall });
    materials.wall.map.wrapS = THREE.RepeatWrapping;
    materials.wall.map.wrapT = THREE.RepeatWrapping;
    materials.wall.map.repeat.set(2, 2);

    materials.loot = new THREE.MeshLambertMaterial({ 'color': colors.loot, 'emissive': colors.lootEmissive });
    materials.mob = new THREE.MeshLambertMaterial({ 'color': colors.mob });
    materials.player = new THREE.MeshLambertMaterial({ 'color': colors.player });

    materials.debugGrid = new THREE.MeshBasicMaterial({ 'color': colors.debugGrid, 'wireframe': true, 'wireframeLinewidth': 3 });
    materials.debugAxisLabel = new THREE.MeshBasicMaterial({ 'color': colors.debugAxisLabel });
  }


  function setupSceneGraph()
  {
    game.world = new THREE.Scene();
    game.world.name = "world";
    game.world.fog = new THREE.Fog(0x000000, 10, 60);

    game.dungeon = _setupDungeon(game.level);
    game.dungeon.name = "dungeon";
    game.world.add(game.dungeon);

    game.mobs = _setupMobs(game.level);
    game.mobs.name = "mobs";
    game.world.add(game.mobs);

    game.loots = _setupLoots(game.level);
    game.loots.name = "loots";
    game.world.add(game.loots);

    game.player = _setupPlayer(game.level);
    game.player.name = "player";
    game.world.add(game.player);

    game.camera = _setupCamera();
    game.camera.name = "camera";
    game.world.add(game.camera);

    game.torch = _setupTorch();
    game.torch.name = "torch";
    game.camera.add(game.torch);

    game.debugCamera = _setupDebugCamera();
    game.debugCamera.name = "debugCamera";
    game.world.add(game.debugCamera);

    game.debugGrid = _setupDebugGrid();
    game.debugGrid.name = "debugGrid";
  }


  function setupDebugControls()
  {
    game.debugControls = new THREE.TrackballControls(game.debugCamera, renderer.domElement);
  }


  function _setupDungeon(level)
  {
    var dungeon = new THREE.Object3D();

    // Make the ambient light.
    var ambientLight = new THREE.AmbientLight(colors.ambientLight);
    ambientLight.name = "ambientLight"
    dungeon.add(ambientLight);

    // Make the floor tiles
    var floors = new THREE.Object3D();
    floors.name = "floors";
    dungeon.add(floors);
    for (var r = 0, endR = level.rows; r < endR; r++) {
      for (var c = 0, endC = level.cols; c < endC; c++) {
        if (level.tiles[r][c] != 0)
          floors.add(_makeFloor(r, c));
      }
    }

    // Make the roof tiles
    var roofs = new THREE.Object3D();
    roofs.name = "roofs";
    dungeon.add(roofs);
    for (var r = 0, endR = level.rows; r < endR; r++) {
      for (var c = 0, endC = level.cols; c < endC; c++) {
        if (level.tiles[r][c] != 0)
          roofs.add(_makeRoof(r, c));
      }
    }

    var walls = new THREE.Object3D();
    walls.name = "walls";
    dungeon.add(walls);

    // Make the +z walls
    for (var r = 0, endR = level.rows; r < endR; r++) {
      var wasInTile = false;
      for (var c = 0, endC = level.cols; c < endC; c++) {
        var inTile = (level.tiles[r][c] != 0);
        if (inTile != wasInTile)
          walls.add(_makeZWall(r, c));
        wasInTile = inTile;
      }
      if (wasInTile)
        walls.add(_makeZWall(r, level.cols));
    }

    // Make the +x walls
    for (var c = 0, endC = level.cols; c < endC; c++) {
      var wasInTile = false;
      for (var r = 0, endR = level.rows; r < endR; r++) {
        var inTile = (level.tiles[r][c] != 0);
        if (inTile != wasInTile)
          walls.add(_makeXWall(r, c));
        wasInTile = inTile;
      }
      if (wasInTile)
        walls.add(_makeXWall(level.rows, c));
    }

    return dungeon;
  }


  function _setupMobs(level)
  {
    var mobs = new THREE.Object3D();
    return mobs;
  }


  function _setupLoots(level)
  {
    var loots = new THREE.Object3D();

    // Distribute the loot evenly among the active tiles.
    var numTiles = countActiveTiles(level);
    var numLoots = Math.ceil(level.rows * level.cols * config.lootsPerTile);
    var n = Math.floor(numTiles / (numLoots + 1));
    for (var i = n; i < numTiles; i += n) {
      var tile = nthActiveTile(level, i);
      loots.add(_makeLoot(tile.row, tile.col));
    }

    return loots;
  }


  function _setupPlayer(level)
  {
    var startPos = tileCenter(level.startTile.row, level.startTile.col);
    startPos.y += 1;

    var player = new THREE.Mesh(geometry.player, materials.player);
    player.castShadow = true;
    player.receiveShadow = true;
    player.translateOnAxis(startPos, 1.0);
    player.rotateOnAxis(new THREE.Vector3(0, 1, 0), Math.PI);

    return player;
  }


  function _setupCamera()
  {
    var width = renderer.domElement.width;
    var height = renderer.domElement.height;

    var fieldOfView = 35; // in degrees.
    var aspectRatio = (width - 0.0) / height;
    var nearClip = 1.0;
    var farClip = 1000.0;

    var camera = new THREE.PerspectiveCamera(fieldOfView, aspectRatio, nearClip, farClip);
    camera.position.copy(game.player.position);
    camera.translateOnAxis(config.cameraOffset, 1.0);
    camera.lookAt(game.player.position);

    return camera;
  }


  function _setupTorch()
  {
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

    return torch;
  }


  function _setupDebugCamera()
  {
    return _setupCamera();
  }


  function _setupDebugGrid()
  {
    var debugGrid = new THREE.Object3D();

    var grid = new THREE.Mesh(geometry.debugGrid, materials.debugGrid);
    grid.applyMatrix(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    grid.translateOnAxis(new THREE.Vector3(geometry.debugGrid.width / 2.0, geometry.debugGrid.height / 2.0, 0.0), 1);
    debugGrid.add(grid);

    var originLabel = new THREE.Mesh(geometry.debugOriginLabel, materials.debugAxisLabel);
    debugGrid.add(originLabel);

    var xLabel = new THREE.Mesh(geometry.debugXAxisLabel, materials.debugAxisLabel);
    xLabel.translateOnAxis(new THREE.Vector3(1, 0, 0), 100);
    debugGrid.add(xLabel);

    var zLabel = new THREE.Mesh(geometry.debugZAxisLabel, materials.debugAxisLabel);
    zLabel.translateOnAxis(new THREE.Vector3(0, 0, 1), 100);
    debugGrid.add(zLabel);

    return debugGrid;
  }


  function _makeFloor(row, col)
  {
    // Create the floor
    var floor = new THREE.Mesh(geometry.floor, materials.floor);
    floor.translateOnAxis(new THREE.Vector3(0, -0.5, 0), 1);
    floor.receiveShadow = true;

    // Move the floor into it's final resting place.
    var x = (col + 0.5) * TILE_SIZE;
    var z = (row + 0.5) * TILE_SIZE;
    floor.translateOnAxis(new THREE.Vector3(x, 0, z), 1);

    return floor;
  }


  function _makeRoof(row, col)
  {
    // Create the roof
    var roof = new THREE.Mesh(geometry.floor, materials.floor);
    roof.translateOnAxis(new THREE.Vector3(0, WALL_HEIGHT + 0.5, 0), 1);
    roof.receiveShadow = true;

    // Move the tile into it's final resting place.
    var x = (col + 0.5) * TILE_SIZE;
    var z = (row + 0.5) * TILE_SIZE;
    roof.translateOnAxis(new THREE.Vector3(x, 0, z), 1);

    return roof;
  }


  function _makeXWall(row, col)
  {
    // Create the wall
    var wall = new THREE.Mesh(geometry.xWall, materials.wall.clone());
    wall.translateOnAxis(new THREE.Vector3(0, WALL_HEIGHT / 2.0, 0), 1);
    //wall.castShadow = true;
    wall.receiveShadow = true;

    // Move the wall into its final resting place
    var x = (col + 0.5) * TILE_SIZE;
    var z = row * TILE_SIZE;
    wall.translateOnAxis(new THREE.Vector3(x, 0, z), 1);

    return wall;
  }


  function _makeZWall(row, col)
  {
    // Create the wall
    var wall = new THREE.Mesh(geometry.zWall, materials.wall.clone());
    wall.translateOnAxis(new THREE.Vector3(0, WALL_HEIGHT / 2.0, 0), 1);
    //wall.castShadow = true;
    wall.receiveShadow = true;

    // Move the wall into its final resting place
    var x = col * TILE_SIZE;
    var z = (row + 0.5) * TILE_SIZE;
    wall.translateOnAxis(new THREE.Vector3(x, 0, z), 1);

    return wall;
  }


  function _makeLoot(row, col)
  {
    var loot = new THREE.Mesh(geometry.loot, materials.loot);
    loot.translateOnAxis(new THREE.Vector3(0, 0, 1.25), 1);
    loot.castShadow = true;
    loot.receiveShadow = true;

    // Move the loot to its final resting place.
    var x = (col + 0.5) * TILE_SIZE;
    var z = (row + 0.5) * TILE_SIZE;
    loot.translateOnAxis(new THREE.Vector3(x, 0, z), 1);

    return loot;
  }


  function _makeMob()
  {
    var mob = new THREE.Mesh(geometry.mob, materials.mob);
    mob.castShadow = true;
    mob.receiveShadow = true;
    mob.translateOnAxis(new THREE.Vector3(0, 1, 0), 1);
    return mob;
  }


  //
  // Map Functions
  //

  function tileCenter(row, col)
  {
    var x = (col + 0.5) * TILE_SIZE;
    var z = (row + 0.5) * TILE_SIZE;
    return new THREE.Vector3(x, 0, z);
  }


  function countActiveTiles(level)
  {
    var num = 0;
    for (var r = 0, endR = level.rows; r < endR; r++) {
      for (var c = 0, endC = level.cols; c < endC; c++) {
        if (level.tiles[r][c] != 0)
          num++;
      }
    }
    return num;
  }


  function nthActiveTile(level, n)
  {
    var num = 0;
    for (var r = 0, endR = level.rows; r < endR; r++) {
      for (var c = 0, endC = level.cols; c < endC; c++) {
        if (level.tiles[r][c] != 0) {
          if (num == n)
            return { 'row': r, 'col': c };
          num++;
        }
      }
    }
    return undefined;
  }


  function randomTile(level)
  {
    var max = countActiveTiles(level);
    var i = Math.floor(Math.random() * max) % max;
    return nthActiveTile(level, i);
  }


  function willHitWall(level, object3D, objectSpaceDelta)
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
    if (toCol < 0 || toCol >= level.cols || toRow < 0 || toRow >= level.rows)
      return true;

    // Otherwise, if you're trying to move to an empty tile you'll hit a wall.
    if (fromCol != toCol || fromRow != toRow)
      return level.tiles[toRow][toCol] == 0;

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
  function overlapping(objA, objB, minGap)
  {
    var cA = centroid(objA);
    var cB = centroid(objB);
    objA.localToWorld(cA);
    objB.localToWorld(cB);

    var rA = objRadius(objA);
    var rB = objRadius(objB);
    
    var distance = new THREE.Vector3().subVectors(cA, cB).length();
    if (minGap !== undefined)
      distance -= minGap;
    var result = distance < (rA + rB);
    return result;
  }


  function findOccluders(srcObj, targetObj)
  {
    var src = new THREE.Vector3(0, 0, 0);
    srcObj.localToWorld(src);

    var dest = new THREE.Vector3(0, 0, 0);
    targetObj.localToWorld(dest);

    var dir = new THREE.Vector3().subVectors(dest, src);

    var raycaster = new THREE.Raycaster(src, dir, 0, dir.length());
    var intersections = raycaster.intersectObject(game.dungeon.getObjectByName("walls"), true);
    return intersections;
  }


  function hideOccluders()
  {
    var intersections = findOccluders(game.camera, game.player);
    /*
    var src = new THREE.Vector3(0, 0, 0);
    game.player.localToWorld(src);

    var dest = new THREE.Vector3(0, 0, 0);
    game.camera.localToWorld(dest);

    var dir = new THREE.Vector3().subVectors(dest, src);

    var raycaster = new THREE.Raycaster(src, dir, 0, dir.length());
    var intersections = raycaster.intersectObject(game.dungeon.getObjectByName("walls"), true);
    */
    for (var i = 0, end = intersections.length; i < end; i++) {
      var occluder = intersections[i].object;
      occluder.visible = false;
      game.occluders.push(occluder);
    }
  }


  function unhideOccluders()
  {
    for (var i = 0, end = game.occluders.length; i < end; i++)
      game.occluders[i].visible = true;
    game.occluders = [];
  }


  function spawnMobs()
  {
    var now = ludum.globals.stateT;
    var canSpawn = (now - game.lastSpawnT) >= config.mobSpawnDelay;
    if (game.mobs.children.length < config.maxActiveMobs) {
      var tile = randomTile(game.level);
      var x = (tile.col + 0.5) * TILE_SIZE;
      var z = (tile.row + 0.5) * TILE_SIZE;

      var mob = _makeMob();
      mob.translateOnAxis(new THREE.Vector3(x, 0, z), 1);
      game.mobs.add(mob);
      game.lastSpawnT = game.stateT;
    }
  }


  //
  // Functions for the 'playing' state.
  //

  function playingDraw()
  {
    unhideOccluders();  // Unhide the old set of occluding walls.
    hideOccluders();    // Find the new set of occluding walls.

    renderer.render(game.world, game.camera);
    renderstats.update();
  }


  function playingUpdate(dt)
  {
    collectLoot();
    takeDamage(dt);
    moveMobs(dt);
    movePlayer(dt);
    updateCamera(dt);
    refreshHUD();
    spawnMobs();
  }


  function collectLoot()
  {
    for (var i = game.loots.children.length - 1; i >= 0; i--) {
      if (overlapping(game.player, game.loots.children[i])) {
        game.loots.remove(game.loots.children[i]);
        game.score += 1;
        ludum.playSound('ting');
      }
    }
  }


  function takeDamage(dt)
  {
    var dest = new THREE.Vector3(0, 0, 0);
    game.player.localToWorld(dest);

    for (var i = 0, end = game.mobs.children.length; i < end; i++) {
      var mob = game.mobs.children[i];
      if (!overlapping(game.player, mob))
        continue;

      var damage = Math.min(config.mobDamage * dt / 1000.0, game.life);
      game.life -= damage;
    }
  }


  function moveMobs(dt)
  {
    var dest = new THREE.Vector3(0, 0, 0);
    game.player.localToWorld(dest);

    for (var i = 0, end = game.mobs.children.length; i < end; i++) {
      var mob = game.mobs.children[i];

      // Can the mob see the player?
      var occluders = findOccluders(mob, game.player);
      if (occluders.length != 0)
        continue;

      var src = new THREE.Vector3(0, 0, 0);
      mob.localToWorld(src);

      var dest = new THREE.Vector3(0, 0, 0);
      game.player.localToWorld(dest);

      var dir = new THREE.Vector3().subVectors(dest, src);
      var distance = dir.length();
      dir.normalize();

      var speed = Math.min(config.mobMoveSpeed * dt / 1000, distance);
      dir.multiplyScalar(speed);

      dir.add(src);
      mob.worldToLocal(dir);
      mob.translateOnAxis(dir, 1.0);
    }
  }


  function movePlayer(dt)
  {
    var turn = new THREE.Vector3(0.0, 0.0, 0.0);
    var move = new THREE.Vector3(0.0, 0.0, -1.0);
    var speed;

    if (ludum.isKeyPressed(ludum.keycodes.LEFT))
      turn.y += 1.0;
    if (ludum.isKeyPressed(ludum.keycodes.RIGHT))
      turn.y -= 1.0;

    if (config.autorun) {
      if (ludum.isKeyPressed(ludum.keycodes.UP))
        speed = config.runSpeed;
      else if (ludum.isKeyPressed(ludum.keycodes.DOWN))
        speed = config.walkSpeed;
      else
        speed = config.jogSpeed;
    }
    else {
      if (ludum.isKeyPressed(ludum.keycodes.UP))
        speed = config.runSpeed;
      else if (ludum.isKeyPressed(ludum.keycodes.DOWN))
        speed = -config.walkSpeed;
      else
        speed = 0;
    }

    var turnAmount = config.turnSpeed * dt / 1000.0;
    var moveAmount = speed * dt / 1000.0;
    move.multiplyScalar(moveAmount);

    if (turn.y != 0.0)
      game.player.rotateOnAxis(turn, turnAmount);
    
    //if (willHitMob(game.player, move)) {
    //  ludum.playSound('beat');
    //}
    //else
    if (willHitWall(game.level, game.player, move)) {
      if (speed > 0)
        ludum.playSound('beat');
    }
    else {
      game.player.translateOnAxis(move, 1.0);
    }
  }


  function updateCamera(dt)
  {
    // Update the main camera.
    game.camera.position.copy(game.player.position);
    game.camera.rotation.copy(game.player.rotation);
    game.camera.translateOnAxis(config.cameraOffset, 1.0);
    game.camera.lookAt(game.player.position);
  }


  function refreshHUD()
  {
    game.hud.setScore(game.score);
    game.hud.setLife(game.life);
    game.hud.setStopwatch(ludum.globals.stateT);
  }


  //
  // Functions for the debugging state
  //

  function debuggingDraw()
  {
    renderer.render(game.world, game.debugCamera);
    renderstats.update();
  }


  function debuggingUpdate(dt)
  {
    playingUpdate(dt);
    game.debugControls.update();
  }


  function debuggingEnter()
  {
    game.world.add(game.debugGrid);
    game.world.fog.far = 1000.0;
    game.dungeon.getObjectByName('roofs').traverse(function (obj) { obj.visible = false; });
  }


  function debuggingLeave()
  {
    game.world.remove(game.debugGrid);
    game.world.fog.far = 60.0;
    game.dungeon.getObjectByName('roofs').traverse(function (obj) { obj.visible = true; });
  }


  //
  // Main functions
  //

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
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.shadowMapEnabled = true;
      renderer.shadowMapSoft = true;
    }
    else if (caps.canvas) {
      ludum.showWarning("<strong>Your browser doesn't appear to support " +
                        "WebGL.</strong> You may get lower frame rates and/or " +
                        "poorer image quality as a result. Sorry!");
      renderer = new THREE.CanvasRenderer();
    }
    else {
      ludum.showError("<strong>Your browser doesn't appear to support WebGL " +
                      "<em>or</em> Canvas.</strong> Unable to continue. Sorry!");
      return;
    }
    renderer.setSize(width, height);
    document.getElementById('viewport').appendChild(renderer.domElement);

    // Set up the performance graph (remember to turn this off for the final game!)
		renderstats = new Stats();
		renderstats.domElement.style.position = 'absolute';
		renderstats.domElement.style.top = '0px';
		renderstats.domElement.style.zIndex = 100;
		document.getElementById( 'viewport' ).appendChild( renderstats.domElement );
		
    // Configure ludum.js
    ludum.useKeyboard(); // Installs ludum.js' keyboard event handlers.

    // Set up the game states.
    ludum.addState('playing', { 'draw': playingDraw, 'update': playingUpdate });
    ludum.addState('debugging', { 'draw': debuggingDraw, 'update': debuggingUpdate, 'enter': debuggingEnter, 'leave': debuggingLeave });

    ludum.addChangeStateOnKeyPressEvent('playing', ludum.keycodes.ESCAPE, 'debugging');
    ludum.addChangeStateOnKeyPressEvent('debugging', ludum.keycodes.ESCAPE, 'playing');

    // Create the world, camera, player, everything!
    init();

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

    game.debugCamera.aspect = width / height;
    game.debugCamera.updateProjectionMatrix();

    renderer.setSize(width, height);
  }


  return {
    'run': run,
    'resize': resize
  };

}(); // end of the dungeon namespace
