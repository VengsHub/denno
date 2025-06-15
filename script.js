// --- DOM Element References ---
const gameContainer = document.getElementById('game-container');
const playerElement = document.getElementById('player');
const hpValueElement = document.getElementById('hp-value');
const scoreValueElement = document.getElementById('score-value');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreElement = document.getElementById('final-score');
const restartButton = document.getElementById('restart-button');
const background1 = document.getElementById('background-img-1');
const background2 = document.getElementById('background-img-2');

// --- Game Settings ---
const GAME_WIDTH = 1800;
const GAME_HEIGHT = 600;

// Player Settings (adjusted to pixels per second)
const PLAYER_START_HP = 3;
const PLAYER_SPEED = 4.5 * 60; // Was 4.5 pixels/frame, now approx 270 pixels/sec
const PLAYER_DASH_SPEED = 22 * 60; // Was 22 pixels/frame, now approx 1320 pixels/sec
const PLAYER_DASH_DURATION = 150;
const PLAYER_DASH_COOLDOWN = 600;
const PLAYER_SHIELD_DURATION = 1000;
const PLAYER_SHOOT_COOLDOWN = 300;
const PLAYER_LASER_SPEED = 15 * 60; // Was 15 pixels/frame, now approx 900 pixels/sec

// Enemy Settings
const ENEMY_SPAWN_INTERVAL = 2200;
const ENEMY_IMAGE_SRC = 'assets/bloodcell.gif'; // ASSUMING you have an enemy video file

const BACKGROUND_SCROLL_SPEED = 30; // Adjust this value to control background speed

// --- Game State ---
let keys = {};
let gameRunning = true;
let lastFrameTime = 0; // To calculate delta time
const MIN_UPDATE_INTERVAL = 50; // Minimum time in ms between game state updates (0.1 seconds)

let bg1X = 0;
let bg2X = GAME_WIDTH;

let player = {
  element: playerElement,
  x: 70,
  y: GAME_HEIGHT / 2,
  dx: 0,
  dy: 0,
  width: 50,
  height: 50,
  radius: 25, // For circular collision
  hp: PLAYER_START_HP,
  isDashing: false,
  dashEndTime: 0,
  canDash: true,
  dashCooldownEndTime: 0,
  isShielding: false,
  shieldEndTime: 0,
  canShoot: true,
  shootCooldownEndTime: 0,
};

let enemies = [];
let lasers = [];
let playerScore = 0;
let lastEnemySpawnTime = 0;

// --- Helper Functions ---
function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

// --- Enemy Class ---
class Enemy {
  constructor(playerRef) {
    this.player = playerRef;
    this.x = GAME_WIDTH + 50;
    this.y = Math.random() * (GAME_HEIGHT - 60) + 30;
    this.width = 55;
    this.height = 55;
    this.radius = 27.5;
    this.hp = 1;
    this.baseSpeed = (1.0 + Math.random() * 0.5) * 60; // Adjusted to pixels per second
    this.scoreValue = 15;

    this.isDashing = false;
    this.dashEndTime = 0;
    this.dashSpeed = 7 * 60; // Adjusted to pixels per second
    this.dashXDirection = 0;
    this.dashYDirection = 0;

    this.lastActionCheck = 0;
    this.actionCooldown = 3000;
    this.proximityTriggerDist = 280;

    this.element = document.createElement('img');
    this.element.src = ENEMY_IMAGE_SRC;
    this.element.className = 'game-object enemy';
    gameContainer.appendChild(this.element);
  }

  update(deltaTime) { // Accept deltaTime
    // Movement is now scaled by deltaTime (seconds)
    const dt = deltaTime / 1000; // Convert deltaTime from milliseconds to seconds

    // --- Movement ---
    if (this.isDashing) {
      // Continuously re-calculate direction towards player for homing behavior
      const dx = this.player.x - this.x;
      const dy = this.player.y - this.y;
      const magnitude = Math.hypot(dx, dy);

      // Apply a small threshold to avoid division by near-zero magnitude
      // and prevent "snail speed" or erratic movement when very close.
      const MIN_MAGNITUDE_THRESHOLD = 0.1;
      if (magnitude < MIN_MAGNITUDE_THRESHOLD) {
        this.dashXDirection = -1; // Default to moving left
        this.dashYDirection = 0;
      } else {
        this.dashXDirection = dx / magnitude;
        this.dashYDirection = dy / magnitude;
      }

      this.x += this.dashXDirection * this.dashSpeed * dt;
      this.y += this.dashYDirection * this.dashSpeed * dt;

      if (Date.now() >= this.dashEndTime) { // Using Date.now() for time checks
        this.isDashing = false;
      }
    } else {
      // Standard right-to-left movement
      this.x -= this.baseSpeed * dt;

      // Check for dash action
      if (Date.now() > this.lastActionCheck + this.actionCooldown) { // Using Date.now() for time checks
        this.lastActionCheck = Date.now();
        if (distance(this.x, this.y, this.player.x, this.player.y)
          < this.proximityTriggerDist) {
          this.initiateDash(Date.now());
        }
      }
    }

    // --- Keep in bounds vertically ---
    if (this.y - this.radius < 0) {
      this.y = this.radius;
    }
    if (this.y + this.radius > GAME_HEIGHT) {
      this.y = GAME_HEIGHT - this.radius;
    }

    // --- Off-screen check ---
    if (this.x < -this.width) {
      this.destroy();
      return true;
    }
    return false;
  }

  initiateDash(currentTime) {
    if (this.isDashing) {
      return;
    }
    this.isDashing = true;
    this.dashEndTime = currentTime + 800; // Dash duration
  }

  takeDamage(amount) {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.destroy();
      return true;
    }
    return false;
  }

  destroy() {
    if (this.element && this.element.parentNode) {
      this.element.style.opacity = '0'; // Start fading out
      setTimeout(() => {
        if (this.element && this.element.parentNode) {
          this.element.parentNode.removeChild(this.element);
        }
      }, 500); // Remove after 1 second
    }
  }
}

class Laser {
  constructor(startX, startY) {
    this.x = startX;
    this.y = startY;
    this.width = 40;
    this.height = 4;

    this.element = document.createElement('div');
    this.element.className = 'game-object laser';
    gameContainer.appendChild(this.element);
  }

  update(deltaTime) { // Accept deltaTime
    const dt = deltaTime / 1000; // Convert deltaTime to seconds
    this.x += PLAYER_LASER_SPEED * dt;
    if (this.x > GAME_WIDTH) {
      this.destroy();
      return true;
    }
    return false;
  }

  destroy() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}

// --- Update and Render Functions ---
function update(deltaTime) { // Now accepts deltaTime
  if (!gameRunning) {
    return;
  }

  const backgroundScrollAmount = BACKGROUND_SCROLL_SPEED * (deltaTime / 1000);
  bg1X -= backgroundScrollAmount;
  bg2X -= backgroundScrollAmount;

  // Loop background images
  if (bg1X <= -GAME_WIDTH) {
    bg1X += GAME_WIDTH * 2; // Move to the right of bg2
  }
  if (bg2X <= -GAME_WIDTH) {
    bg2X += GAME_WIDTH * 2; // Move to the right of bg1
  }

  updatePlayer(deltaTime);

  if (Date.now() - lastEnemySpawnTime > ENEMY_SPAWN_INTERVAL) {
    enemies.push(new Enemy(player));
    lastEnemySpawnTime = Date.now();
  }
  // Pass deltaTime to enemy updates
  enemies = enemies.filter(enemy => !enemy.update(deltaTime));

  // Pass deltaTime to laser updates
  lasers = lasers.filter(laser => !laser.update(deltaTime));

  checkCollisions(); // No deltaTime needed for collision checks
}

function render() {
  if (!gameRunning) {
    return;
  }

  background1.style.transform = `translateX(${bg1X}px)`;
  background2.style.transform = `translateX(${bg2X}px)`;

  player.element.style.transform = `translate(${player.x - player.width
  / 2}px, ${player.y - player.height / 2}px)`;

  enemies.forEach(enemy => {
    enemy.element.style.transform = `translate(${enemy.x - enemy.width
    / 2}px, ${enemy.y - enemy.height / 2}px)`;
  });

  lasers.forEach(laser => {
    laser.element.style.transform = `translate(${laser.x - laser.width
    / 2}px, ${laser.y - laser.height / 2}px)`;
  });
}

// --- Main Game Loop ---
function gameLoop(currentTime) { // requestAnimationFrame provides timestamp
  requestAnimationFrame(gameLoop); // Request next frame immediately for smooth rendering

  const deltaTime = currentTime - lastFrameTime; // Calculate delta time in milliseconds

  // Only update game logic if enough time has passed
  if (deltaTime < MIN_UPDATE_INTERVAL) {
    return;
  }

  // Cap deltaTime to avoid huge jumps if there's a very long pause (e.g., tab switch)
  const cappedDeltaTime = Math.min(deltaTime, 1000 / 10); // Cap at 10 updates per second effectively

  update(cappedDeltaTime);
  render();

  lastFrameTime = currentTime; // Update lastFrameTime only after a successful update
}

// --- Player Logic ---
function updatePlayer(deltaTime) { // Now accepts deltaTime
  const dt = deltaTime / 1000; // Convert deltaTime to seconds

  // State timers
  if (player.isDashing && Date.now()
    >= player.dashEndTime) {
    player.isDashing = false;
  }
  if (!player.canDash && Date.now()
    >= player.dashCooldownEndTime) {
    player.canDash = true;
  }
  if (player.isShielding && Date.now() >= player.shieldEndTime) {
    player.isShielding = false;
    player.element.classList.remove('shielding');
  }
  if (!player.canShoot && Date.now()
    >= player.shootCooldownEndTime) {
    player.canShoot = true;
  }

  // Movement
  let targetDx = 0;
  let targetDy = 0;
  if (keys['w'] || keys['ArrowUp']) {
    targetDy = -PLAYER_SPEED;
  }
  if (keys['s'] || keys['ArrowDown']) {
    targetDy = PLAYER_SPEED;
  }
  if (keys['a'] || keys['ArrowLeft']) {
    targetDx = -PLAYER_SPEED;
  }
  if (keys['d'] || keys['ArrowRight']) {
    targetDx = PLAYER_SPEED;
  }

  if (player.isDashing) {
    // dx/dy are set once by the dash action, will be scaled below
  } else {
    player.dx = targetDx;
    player.dy = targetDy;
  }

  // Apply movement scaled by delta time
  player.x += player.dx * dt;
  player.y += player.dy * dt;

  // Boundary checks
  if (player.x - player.radius < 0) {
    player.x = player.radius;
  }
  if (player.x + player.radius > GAME_WIDTH) {
    player.x = GAME_WIDTH
      - player.radius;
  }
  if (player.y - player.radius < 0) {
    player.y = player.radius;
  }
  if (player.y + player.radius > GAME_HEIGHT) {
    player.y = GAME_HEIGHT
      - player.radius;
  }
}

// --- Player Actions ---
function playerAttemptDash(currentTime) {
  if (!player.isDashing && player.canDash && !player.isShielding) {
    player.isDashing = true;
    player.dashEndTime = currentTime + PLAYER_DASH_DURATION;
    player.canDash = false;
    player.dashCooldownEndTime = currentTime + PLAYER_DASH_COOLDOWN;

    let angle = 0;
    // Determine dash direction based on current movement keys
    if (keys['w'] || keys['ArrowUp'] || keys['s'] || keys['ArrowDown']
      || keys['a'] || keys['ArrowLeft'] || keys['d'] || keys['ArrowRight']) {
      // Calculate angle from current player.dx, player.dy to determine dash direction
      // If player is not moving, default to dashing right (or a consistent direction)
      const currentDx = keys['d'] || keys['ArrowRight'] ? 1 : (keys['a']
      || keys['ArrowLeft'] ? -1 : 0);
      const currentDy = keys['s'] || keys['ArrowDown'] ? 1 : (keys['w']
      || keys['ArrowUp'] ? -1 : 0);

      if (currentDx === 0 && currentDy === 0) {
        // If no movement keys are pressed, dash right by default
        angle = 0;
      } else {
        angle = Math.atan2(currentDy, currentDx);
      }
    } else {
      // If no keys are pressed at all, default dash to right
      angle = 0;
    }

    player.dx = Math.cos(angle) * PLAYER_DASH_SPEED;
    player.dy = Math.sin(angle) * PLAYER_DASH_SPEED;
  }
}

function playerAttemptShield(currentTime) {
  if (!player.isShielding && !player.isDashing) {
    player.isShielding = true;
    player.shieldEndTime = currentTime + PLAYER_SHIELD_DURATION;
    player.element.classList.add('shielding');
  }
}

function playerAttemptShoot() {
  if (player.canShoot && !player.isDashing && !player.isShielding) {
    player.canShoot = false;
    player.shootCooldownEndTime = Date.now() + PLAYER_SHOOT_COOLDOWN;
    lasers.push(new Laser(player.x + player.width / 2, player.y));
  }
}

// --- Collision Logic ---
function checkCollisions() { // No currentTime needed for collision checks
  // Lasers vs Enemies
  for (let i = lasers.length - 1; i >= 0; i--) {
    for (let j = enemies.length - 1; j >= 0; j--) {
      if (distance(lasers[i].x, lasers[i].y, enemies[j].x, enemies[j].y)
        < enemies[j].radius) {
        if (enemies[j].takeDamage(1)) {
          updateScore(enemies[j].scoreValue);
          enemies.splice(j, 1);
        }
        lasers[i].destroy();
        lasers.splice(i, 1);
        break;
      }
    }
  }

  // Player vs Enemies
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (distance(player.x, player.y, enemies[i].x, enemies[i].y) < player.radius + enemies[i].radius) {
      if (player.isDashing || player.isShielding) {
        if (enemies[i].takeDamage(100)) { // Dash destroys enemy
          updateScore(enemies[i].scoreValue);
          enemies.splice(i, 1);
        }
      } else {
        takePlayerDamage(1);
        if (enemies[i].takeDamage(1)) { // Player also damages enemy on collision
          // updateScore(enemies[i].scoreValue);
          enemies.splice(i, 1);
        }
      }
    }
  }
}

// --- Game State & UI ---
function takePlayerDamage(amount) {
  player.hp -= amount;
  hpValueElement.textContent = Math.max(0, player.hp);
  player.element.classList.add('flash-red');
  setTimeout(() => {
    player.element.classList.remove('flash-red');
  }, 500);
  if (player.hp <= 0) {
    endGame();
  }
}

function updateScore(amount) {
  playerScore += amount;
  scoreValueElement.textContent = playerScore;
}

function endGame() {
  gameRunning = false;
  finalScoreElement.textContent = playerScore;
  gameOverScreen.classList.remove('hidden');
}

function initGame() {
  // Reset player state
  player.hp = PLAYER_START_HP;
  playerScore = 0;
  player.x = 70;
  player.y = GAME_HEIGHT / 2;
  player.dx = 0;
  player.dy = 0;
  player.isDashing = false;
  player.isShielding = false;
  player.canDash = true;
  player.canShoot = true;
  player.element.classList.remove('shielding');

  // Clear dynamic elements
  enemies.forEach(enemy => enemy.destroy());
  enemies = [];
  lasers.forEach(laser => laser.destroy());
  lasers = [];

  // Reset UI
  hpValueElement.textContent = player.hp;
  scoreValueElement.textContent = playerScore;
  gameOverScreen.classList.add('hidden');

  // Start game
  gameRunning = true;
}

// --- Event Listeners ---
window.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  if (e.key === ' ') {
    e.preventDefault();
    playerAttemptDash(Date.now());
  } else if (e.key.toLowerCase() === 'e') {
    e.preventDefault();
    playerAttemptShoot();
  } else if (e.key === 'Shift') {
    e.preventDefault();
    playerAttemptShield(Date.now());
  }
});
window.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
  if (e.key === 'Shift') {
    if (player.isShielding) {
      player.isShielding = false;
      player.element.classList.remove('shielding');
    }
  }
});
restartButton.addEventListener('click', () => {
  initGame();
});

// --- Start Game ---
initGame();
// Initial call to gameLoop for requestAnimationFrame
requestAnimationFrame(gameLoop);