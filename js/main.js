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
    'debug': false,       // Whether to run in debug mode.
    'invincible': false,  // Whether you're currently invincible (intended for debugging, but hey, go nuts).

    'cameraOffset': new THREE.Vector3(0, (WALL_HEIGHT - 1) * 0.8, 10), // Position of the camera relative to the player.

    'autorun':  false,    // Whether the player automatically runs.
    'runSpeed': 20.0,     // The movement speed of the player, in metres/second.
    'jogSpeed': 10.0,     // The movement speed of the player, in metres/second.
    'walkSpeed': 5.0,     // The movement speed of the player, in metres/second.
    'turnSpeed': 5.0,     // How quickly the player turns, in radians/second.
    'maxHealth': 100,     // Maximum value for the players health.

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
    'goal': 0x4466FF,
    'goalEmissive': 0x000022,
    'debugGrid': 0x8888CC,
    'debugAxisLabel': 0xCC0000,
    'deadText': 0x990000,
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
    'goal': null,
    'debugGrid': null,
    'deadText': null,
  };
  var geometry = {
    'floor': null,
    'xWall': null,
    'zWall': null,
    'loot': null,
    'mob': null,
    'player': null,
    'goal': null,
    'debugGrid': null,
    'deadText': null,
  };
  var meshes = {
    'deadText': null,
  };

  // Some common vectors, so we don't have to keep reallocating them. Treat these as read only!
  var zeroVector = new THREE.Vector3(0, 0, 0);
  var xAxis = new THREE.Vector3(1, 0, 0);
  var yAxis = new THREE.Vector3(0, 1, 0);
  var zAxis = new THREE.Vector3(0, 0, 1);

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
    'debugCamera': null,    // The camera we use in debug mode.
    'debugGrid': null,      // The grid we show in debug mode.
    'deadText': null,       // The text we show when your health falls to zero.
    'occluders': [],        // The list of objects which we've hidden because they're in between the player and the camera.
    
    'debugControls': null,  // The current camera controls, if any.

    // General game state
    'level': null,          // The current level.
    'levelTime': 0.0,       // The amount of time spent in the current level so far.

    // Player state
    'score': 0,
    'life': config.maxHealth,

    // Mob state
    'lastSpawnT': 0.0,

    // UI elements
    'hud': null,
    'resultsWin': null
  };


  //
  // The HUD class.
  //

  function HUD(x, y, w)
  {
    var labelWidth = w * 0.4;

    this.domElement = createWindowDiv("hud", x, y, w);
    addLabelledField(this.domElement, 'score', "Gold", "yellow", labelWidth);
    addLabelledField(this.domElement, 'life', "Health", "red", labelWidth);
    addLabelledField(this.domElement, 'stopwatch', "Time", "#BBB", labelWidth);

    this.setScore = function (score) {
      setFieldValue(this.domElement, 'score', score);
    }

    this.setLife = function (life) {
      setFieldValue(this.domElement, 'life', Math.ceil(life) + "%");
    }

    this.setStopwatch = function (timeInSecs) {
      var mins = Math.floor(timeInSecs / 60);
      var secs = Math.floor(timeInSecs % 60);
      var secsStr = (secs < 10) ? "0" + secs : "" + secs;
      var str = mins + ":" + secsStr + " secs";
      setFieldValue(this.domElement, 'stopwatch', str);
    }

    this.show = function () {
      this.domElement.style.display = 'block';
    }

    this.hide = function () {
      this.domElement.style.display = 'none';
    }

    return this;
  }


  //
  // ResultsWindow class
  //

  function ResultsWindow(w)
  {
    var labelWidth = w * 0.5;

    this.domElement = createWindowDiv("results", 0, 0, w);
    addHeading(this.domElement, "Press space to continue...", "#BBB");
    addLabelledField(this.domElement, 'score', "Gold", "yellow", labelWidth);
    addLabelledField(this.domElement, 'life', "Health", "red", labelWidth);
    addLabelledField(this.domElement, 'stopwatch', "Time", "#BBB", labelWidth);

    this.setScore = function (score) {
      setFieldValue(this.domElement, 'score', score);
    }

    this.setLife = function (life) {
      setFieldValue(this.domElement, 'life', Math.ceil(life) + "%");
    }

    this.setStopwatch = function (timeInSecs) {
      var mins = Math.floor(timeInSecs / 60);
      var secs = Math.floor(timeInSecs % 60);
      var secsStr = (secs < 10) ? "0" + secs : "" + secs;
      var str = mins + ":" + secsStr + " secs";
      setFieldValue(this.domElement, 'stopwatch', str);
    }

    this.show = function () {
      this.domElement.style.display = 'block';
    }

    this.hide = function () {
      this.domElement.style.display = 'none';
    }

    return this;
  }


  //
  // HTML helper functions
  //

  function createWindowDiv(divID, x, y, w, h)
  {
    var div = document.createElement("div");
    div.id = divID;
    if (w !== undefined)
      div.style.width = w + "px";
    if (h !== undefined)
      div.style.height = h + "px";
    div.style.position = 'absolute';
    if (y !== undefined)
      div.style.bottom = y + "px";
    if (x !== undefined)
      div.style.left = x + "px";
    div.style.zIndex = 100;
    div.style.background = "#222";
    div.style.fontFamily = "Helvetica,Arial,sans-serif";
    div.style.fontSize = "12px";
    div.style.opacity = 0.8;
    div.style.display = 'none'; // initially hidden.
    return div;
  }


  function addHeading(container, headingText, color)
  {
    var headingElem = document.createElement("div");
    headingElem.style.cssText = "padding:0 0 3px 3px; text-align: center;";
    headingElem.textContent = headingText;
    if (color !== undefined)
      headingElem.style.color = color;
    container.appendChild(headingElem);
  }


  function addLabelledField(container, fieldID, labelText, color, labelWidth)
  {
    var fullFieldID = container.id + "_" + fieldID;

    var fieldElem = document.createElement("div");
    fieldElem.id = fullFieldID;
    fieldElem.style.cssText = "padding:0 0 3px 3px; text-align: left;";
    container.appendChild(fieldElem);

    var fieldLabel = document.createElement("div");
    fieldLabel.id = fullFieldID + '_label';
    fieldLabel.textContent = labelText + ": ";
    fieldLabel.style.display = 'inline-block';
    if (labelWidth !== undefined)
      fieldLabel.style.width = labelWidth + "px";
    if (color !== undefined)
      fieldLabel.style.color = color;
    fieldElem.appendChild(fieldLabel);

    var fieldValue = document.createElement("span");
    fieldValue.id = fullFieldID + '_value';
    if (color !== undefined)
      fieldValue.style.color = color;
    fieldElem.appendChild(fieldValue);
  }


  function setFieldValue(container, fieldID, newValue)
  {
    var fullFieldID = container.id + "_" + fieldID + "_value";
    var field = document.getElementById(fullFieldID);
    field.textContent = newValue;
  }


  //
  // Creation functions
  //

  function create()
  {
    createUI();
    createSounds();
    createTextures();
    createGeometry();
    createMaterials();
    createMeshes();
    for (var i = 0, end = levels.length; i < end; i++)
      createSceneGraph(levels[i]);
  }


  function createUI()
  {
    game.hud = new HUD(0, 0, 180);
    document.getElementById('viewport').appendChild(game.hud.domElement);

    game.resultsWin = new ResultsWindow(180);
    document.getElementById('viewport').appendChild(game.resultsWin.domElement);
  }


  function createSounds()
  {
    for (var key in config.sounds)
      ludum.addSound(key, [ config.sounds[key] ]);
  }


  function createTextures()
  {
    textures.floor = THREE.ImageUtils.loadTexture('img/rock.png');
    textures.wall = THREE.ImageUtils.loadTexture('img/rock.png');
  }


  function createGeometry()
  {
    geometry.floor = new THREE.CubeGeometry(TILE_SIZE, 1, TILE_SIZE);
    geometry.xWall = new THREE.CubeGeometry(TILE_SIZE, WALL_HEIGHT, WALL_THICKNESS);
    geometry.zWall = new THREE.CubeGeometry(WALL_THICKNESS, WALL_HEIGHT, TILE_SIZE);
    geometry.loot = new THREE.CylinderGeometry(0.25, 0.25, 0.1, 20, 1, false);
    geometry.mob = new THREE.CylinderGeometry(0.80, 0.7, 2.1, 8, 2, false);
    geometry.player = new THREE.CubeGeometry(0.8, 1.8, 0.8, 2, 3, 2);
    geometry.goal = new THREE.SphereGeometry(0.4, 20.0, 20.0);
    geometry.debugGrid = new THREE.PlaneGeometry(levels[0].width, levels[0].depth, levels[0].cols, levels[0].rows);
    geometry.debugOriginLabel = new THREE.TextGeometry("origin", { 'size': 1.0, 'height': 0.2 });
    geometry.debugXAxisLabel = new THREE.TextGeometry("+x", { 'size': 1.0, 'height': 0.2 });
    geometry.debugZAxisLabel = new THREE.TextGeometry("+z", { 'size': 1.0, 'height': 0.2 });
    geometry.deadText = new THREE.TextGeometry("Dead", { 'size': 1.0, 'height': 0.2 });

    for (var key in geometry)
      geometry[key].computeBoundingBox();
  }


  function createMaterials()
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
    materials.goal = new THREE.MeshLambertMaterial({ 'color': colors.goal, 'emissive': colors.goalEmissive });

    materials.debugGrid = new THREE.MeshBasicMaterial({ 'color': colors.debugGrid, 'wireframe': true, 'wireframeLinewidth': 3 });
    materials.debugAxisLabel = new THREE.MeshBasicMaterial({ 'color': colors.debugAxisLabel });

    materials.deadText = new THREE.MeshLambertMaterial({ 'color': colors.deadText });
  }


  function createMeshes()
  {
    meshes.deadText = _createDeadText();
    meshes.deadText.name = "deadText";
  }


  function createSceneGraph(level)
  {
    var world = new THREE.Scene();
    world.name = "world";
    world.fog = new THREE.Fog(0x000000, 10, 60);

    var dungeon = _createDungeon(level);
    dungeon.name = "dungeon";
    world.add(dungeon);

    var mobs = _createMobs(level);
    mobs.name = "mobs";
    world.add(mobs);

    var loots = _createLoots(level);
    loots.name = "loots";
    world.add(loots);

    var player = _createPlayer(level);
    player.name = "player";
    world.add(player);

    var camera = _createCamera();
    camera.name = "camera";
    world.add(camera);

    var torch = _createTorch(player);
    torch.name = "torch";
    camera.add(torch);

    var goal = _createGoal(level);
    goal.name = "goal";
    world.add(goal);

    var debugCamera = _createDebugCamera(dungeon);
    debugCamera.name = "debugCamera";
    world.add(debugCamera);

    var debugGrid = _createDebugGrid();
    debugGrid.name = "debugGrid";

    level.world = world;

    level.debugControls = new THREE.TrackballControls(debugCamera, renderer.domElement);
    level.debugControls.enabled = false;
  }


  function _createDungeon(level)
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


  function _createMobs(level)
  {
    var mobs = new THREE.Object3D();
    return mobs;
  }


  function _createLoots(level)
  {
    var loots = new THREE.Object3D();
    return loots;
  }


  function _createPlayer(level)
  {
    var player = new THREE.Mesh(geometry.player, materials.player);
    player.castShadow = true;
    player.receiveShadow = true;
    return player;
  }


  function _createCamera()
  {
    var width = renderer.domElement.width;
    var height = renderer.domElement.height;

    var fieldOfView = 35; // in degrees.
    var aspectRatio = (width - 0.0) / height;
    var nearClip = 1.0;
    var farClip = 1000.0;

    var camera = new THREE.PerspectiveCamera(fieldOfView, aspectRatio, nearClip, farClip);
    return camera;
  }


  function _createTorch(target)
  {
    var torch = new THREE.SpotLight(0xFFFFFF, 1.0, 30.0, true);
    torch.position.set(-4, 0, 2);
    torch.target = target;
    torch.castShadow = true;
    torch.shadowCameraNear = 0.5;
    torch.shadowCameraFar = 40.0;
    torch.shadowMapWidth = 1024;
    torch.shadowMapHeight = 1024;
    torch.shadowDarkness = 0.7;

    return torch;
  }


  function _createGoal(level)
  {
    var goalPos = tileCenter(level.endTile.row, level.endTile.col);
    goalPos.y += 1.2;

    var goal = new THREE.Mesh(geometry.goal, materials.goal);
    goal.receiveShadow = true;
    goal.translateOnAxis(goalPos, 1.0);
    
    return goal;
  }


  function _createDebugCamera(target)
  {
    var width = renderer.domElement.width;
    var height = renderer.domElement.height;

    var fieldOfView = 35; // in degrees.
    var aspectRatio = (width - 0.0) / height;
    var nearClip = 1.0;
    var farClip = 1000.0;

    var camera = new THREE.PerspectiveCamera(fieldOfView, aspectRatio, nearClip, farClip);
    camera.position.set(70, 70, 70); // TODO: smarter positioning relative to the size of the dungeon.
    camera.lookAt(target.position);

    return camera;
  }


  function _createDebugGrid()
  {
    var debugGrid = new THREE.Object3D();

    var grid = new THREE.Mesh(geometry.debugGrid, materials.debugGrid);
    grid.applyMatrix(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    grid.translateOnAxis(new THREE.Vector3(geometry.debugGrid.width / 2.0, geometry.debugGrid.height / 2.0, 0.0), 1);
    debugGrid.add(grid);

    var originLabel = new THREE.Mesh(geometry.debugOriginLabel, materials.debugAxisLabel);
    debugGrid.add(originLabel);

    var xLabel = new THREE.Mesh(geometry.debugXAxisLabel, materials.debugAxisLabel);
    xLabel.translateOnAxis(xAxis, 100);
    debugGrid.add(xLabel);

    var zLabel = new THREE.Mesh(geometry.debugZAxisLabel, materials.debugAxisLabel);
    zLabel.translateOnAxis(zAxis, 100);
    debugGrid.add(zLabel);

    return debugGrid;
  }


  function _createDeadText()
  {
    var deadText = new THREE.Mesh(geometry.deadText, materials.deadText);
    deadText.translateOnAxis(yAxis, geometry.player.height * 0.6);
    deadText.translateOnAxis(zAxis, geometry.player.depth * 0.5);
    return deadText;
  }


  function _makeFloor(row, col)
  {
    // Create the floor
    var floor = new THREE.Mesh(geometry.floor, materials.floor);
    floor.translateOnAxis(yAxis, -geometry.floor.height / 2.0);
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
    roof.translateOnAxis(yAxis, WALL_HEIGHT + 0.5);
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
    wall.translateOnAxis(yAxis, WALL_HEIGHT / 2.0);
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
    wall.translateOnAxis(yAxis, WALL_HEIGHT / 2.0);
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
    loot.translateOnAxis(yAxis, geometry.loot.height / 2.0);
    loot.castShadow = true;
    loot.receiveShadow = true;

    // Move the loot to its final resting place.
    var range = TILE_SIZE - 2.0 * geometry.loot.radiusBottom;
    var dx = (Math.random() - 0.5) * range;
    var dy = (Math.random() - 0.5) * range;

    var x = (col + 0.5) * TILE_SIZE + dx;
    var z = (row + 0.5) * TILE_SIZE + dy;
    loot.translateOnAxis(new THREE.Vector3(x, 0, z), 1);

    return loot;
  }


  function _makeMob()
  {
    var mob = new THREE.Mesh(geometry.mob, materials.mob);
    mob.castShadow = true;
    mob.receiveShadow = true;
    mob.translateOnAxis(yAxis, geometry.mob.height / 2.0);
    return mob;
  }


  //
  // Initialisation functions
  //

  function init(level, world)
  {
    _initMobs(level, world);
    _initLoots(level, world);
    _initPlayer(level, world);
    _initCamera(level, world);
  }


  function _initMobs(level, world)
  {
    var mobs = world.getObjectByName("mobs");

    // Remove any existing mobs.
    for (var i = mobs.children.length - 1, end = 0; i >= end; i--)
      mobs.remove(mobs.children[i]);
  }


  function _initLoots(level, world)
  {
    var loots = world.getObjectByName("loots");

    // Remove any existing loot.
    for (var i = loots.children.length - 1, end = 0; i >= end; i--)
      loots.remove(loots.children[i]);

    // Distribute the loot evenly among the active tiles.
    var numTiles = countActiveTiles(level);
    var numLoots = Math.ceil(level.rows * level.cols * config.lootsPerTile);
    var n = Math.floor(numTiles / (numLoots + 1));
    for (var i = n; i < numTiles; i += n) {
      var tile = nthActiveTile(level, i);
      loots.add(_makeLoot(tile.row, tile.col));
    }
  }


  function _initPlayer(level, world)
  {
    var player = world.getObjectByName("player");
    var startPos = tileCenter(level.startTile.row, level.startTile.col);
    var startDist = startPos.length();
    startPos.normalize();

    // Reset the players position and orientation.
    player.position.set(0, geometry.player.height / 2.0, 0);
    player.rotation.set(0, 0, 0);
    player.updateMatrix();

    player.translateOnAxis(startPos, startDist);
    player.rotateOnAxis(yAxis, Math.PI);
  }


  function _initCamera(level, world)
  {
    var camera = world.getObjectByName("camera");
    var player = world.getObjectByName("player");

    camera.position.copy(player.position);
    camera.translateOnAxis(config.cameraOffset, 1.0);
    camera.lookAt(player.position);
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
    if (!geometry.mob)
      return;

    var now = ludum.globals.stateT;
    var canSpawn = (now - game.lastSpawnT) >= config.mobSpawnDelay;
    if (game.mobs.children.length < config.maxActiveMobs) {
      var tile = randomTile(game.level);
      var x = (tile.col + 0.5) * TILE_SIZE;
      var z = (tile.row + 0.5) * TILE_SIZE;
      var startPos = new THREE.Vector3().set(x, 0, z);
      var startDist = startPos.length();
      startPos.normalize();

      var mob = _makeMob();
      mob.translateOnAxis(startPos, startDist);
      game.mobs.add(mob);
      game.lastSpawnT = game.stateT;
    }
  }


  //
  // Functions for the 'playing' state.
  //

  var playingStateFuncs = {
    draw: function ()
    {
      unhideOccluders();  // Unhide the old set of occluding walls.
      hideOccluders();    // Find the new set of occluding walls.

      renderer.render(game.world, game.camera);
      renderstats.update();
    },


    update: function (dt)
    {
      game.levelTime = ludum.globals.stateT;

      collectLoot();
      takeDamage(dt);
      moveMobs(dt);
      movePlayer(dt);
      updateCamera(dt);
      refreshHUD();
      spawnMobs();
    },


    enter: function ()
    {
      game.hud.show();
      startLevel(levels[0]);
    },


    leave: function ()
    {
      game.hud.hide();
    }
  };


  function startLevel(level) {
    if (game.level !== level) {
      unhideOccluders();
      game.level = level;
      game.world = level.world;
      game.dungeon = level.world.getObjectByName("dungeon");
      game.mobs = level.world.getObjectByName("mobs");
      game.loots = level.world.getObjectByName("loots");
      game.player = level.world.getObjectByName("player");
      game.camera = level.world.getObjectByName("camera");
      game.debugCamera = level.world.getObjectByName("debugCamera");
      game.debugGrid = level.world.getObjectByName("debugGrid");
      game.deadText = level.world.getObjectByName("deadText");
      game.debugControls = level.debugControls;
    }

    // Reset the game state.
    game.score = 0;
    game.life = config.maxHealth;
    game.lastSpawnT = 0;

    // Reset everything in the scene graph
    init(level, level.world);
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
    if (config.invincible)
      return;

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

    var playerRadius = objRadius(game.player) * 0.8;

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
      dest.y = src.y;

      var dir = new THREE.Vector3().subVectors(dest, src);
      var distance = dir.length() - playerRadius;
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

  var debuggingStateFuncs = {
    draw: function ()
    {
      unhideOccluders();
      renderer.render(game.world, game.debugCamera);
      renderstats.update();
    },


    update: function (dt)
    {
      playingStateFuncs.update(dt);
      game.debugControls.update();
    },


    enter: function()
    {
      game.world.add(game.debugGrid);
      game.world.fog.far = 1000.0;
      game.dungeon.getObjectByName('roofs').traverse(function (obj) { obj.visible = false; });

      var torch = game.camera.getObjectByName("torch");
      torch.shadowCameraVisible = true;

      game.level.debugControls.enabled = true;
    },


    leave: function()
    {
      game.world.remove(game.debugGrid);
      game.world.fog.far = 60.0;
      game.dungeon.getObjectByName('roofs').traverse(function (obj) { obj.visible = true; });

      var torch = game.camera.getObjectByName("torch");
      torch.shadowCameraVisible = false;

      game.level.debugControls.enabled = false;
    },
  };


  function toggleInvincibility()
  {
    config.invincible = !config.invincible;
  }


  //
  // Functions for the dead state
  //

  var deadStateFuncs = {
    draw: function ()
    {
      playingStateFuncs.draw();
    },


    enter: function ()
    {
      game.player.add(meshes.deadText);

      game.resultsWin.setScore(game.score);
      game.resultsWin.setLife(game.life);
      game.resultsWin.setStopwatch(game.levelTime);
      game.resultsWin.show();
    },


    leave: function()
    {
      game.player.remove(meshes.deadText);
      game.resultsWin.hide();
    },
  };


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
    ludum.addState('playing', playingStateFuncs);
    ludum.addState('debugging', debuggingStateFuncs);
    ludum.addState('dead', deadStateFuncs);

    // Set up events for the 'playing' state.
    ludum.addChangeStateOnKeyPressEvent('playing', "Q", 'debugging');
    ludum.addGameConditionEvent('playing', function () { return game.life <= 0.0; }, 'dead');

    // Set up events for the 'debugging' state.
    ludum.addChangeStateOnKeyPressEvent('debugging', "Q", 'playing');
    ludum.addKeyPressEvent('debugging', "W", 0.5, { 'leave': toggleInvincibility });

    // Set up events for the 'dead' state.
    ludum.addChangeStateOnKeyPressEvent('dead', " ", 'playing');

    // Create the world, camera, player, everything!
    create();

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
