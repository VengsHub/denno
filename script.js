// --- DOM Element References ---
const gameContainer = document.getElementById('game-container');
const playerElement = document.getElementById('player');
const hpValueElement = document.getElementById('hp-value');
const scoreValueElement = document.getElementById('score-value');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreElement = document.getElementById('final-score');
const restartButton = document.getElementById('restart-button');

// --- Game Settings ---
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

// Player Settings
const PLAYER_START_HP = 3;
const PLAYER_SPEED = 4.5;
const PLAYER_DASH_SPEED = 22;
const PLAYER_DASH_DURATION = 150;
const PLAYER_DASH_COOLDOWN = 600;
const PLAYER_SHIELD_DURATION = 1000;
const PLAYER_SHOOT_COOLDOWN = 300;
const PLAYER_LASER_SPEED = 15;

// Enemy Settings
const ENEMY_SPAWN_INTERVAL = 2200;
const ENEMY_VIDEO_SRC = 'assets/bloodcell.webm'; // ASSUMING you have an enemy video file

// --- Game State ---
let keys = {};
let gameRunning = true;

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
    this.baseSpeed = 1.0 + Math.random() * 0.5;
    this.scoreValue = 15;

    this.isDashing = false;
    this.dashEndTime = 0;
    this.dashSpeed = 7;
    this.dashXDirection = 0;
    this.dashYDirection = 0;

    this.lastActionCheck = 0;
    this.actionCooldown = 3000;
    this.proximityTriggerDist = 280;

    this.element = document.createElement('video');
    this.element.src = ENEMY_VIDEO_SRC;
    this.element.className = 'game-object enemy';
    this.element.autoplay = this.element.loop = this.element.muted = this.element.playsinline = true;
    gameContainer.appendChild(this.element);
  }

  update(currentTime) {
    // --- Movement ---
    if (this.isDashing) {
      // Continuously re-calculate direction towards player for homing behavior
      const dx = this.player.x - this.x;
      const dy = this.player.y - this.y;
      const magnitude = Math.hypot(dx, dy);

      if (magnitude > 0) {
        this.dashXDirection = dx / magnitude;
        this.dashYDirection = dy / magnitude;
      } else {
        // If enemy is on top of player, default to moving straight left
        this.dashXDirection = -1;
        this.dashYDirection = 0;
      }

      this.x += this.dashXDirection * this.dashSpeed;
      this.y += this.dashYDirection * this.dashSpeed;

      if (currentTime >= this.dashEndTime) {
        this.isDashing = false;
      }
    } else {
      // Standard right-to-left movement
      this.x -= this.baseSpeed;

      // Check for dash action
      if (currentTime > this.lastActionCheck + this.actionCooldown) {
        this.lastActionCheck = currentTime;
        if (distance(this.x, this.y, this.player.x, this.player.y) < this.proximityTriggerDist) {
          this.initiateDash(currentTime);
        }
      }
    }

    // --- Keep in bounds vertically ---
    if (this.y - this.radius < 0) this.y = this.radius;
    if (this.y + this.radius > GAME_HEIGHT) this.y = GAME_HEIGHT - this.radius;

    // --- Off-screen check ---
    if (this.x < -this.width) {
      this.destroy();
      return true; // Mark for removal from array
    }
    return false;
  }

  initiateDash(currentTime) {
    if (this.isDashing) return;
    this.isDashing = true;
    this.dashEndTime = currentTime + 800; // Dash duration
    // Direction calculation will now happen continuously in the update loop
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
      this.element.parentNode.removeChild(this.element);
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

  update() {
    this.x += PLAYER_LASER_SPEED;
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
function update(currentTime) {
  if (!gameRunning) return;

  // Update player based on input and state
  updatePlayer(currentTime);

  // Spawn, update, and remove enemies
  if (currentTime - lastEnemySpawnTime > ENEMY_SPAWN_INTERVAL) {
    enemies.push(new Enemy(player));
    lastEnemySpawnTime = currentTime;
  }
  enemies = enemies.filter(enemy => !enemy.update(currentTime));

  // Update and remove lasers
  lasers = lasers.filter(laser => !laser.update());

  // Check for all collisions
  checkCollisions(currentTime);
}

function render() {
  if (!gameRunning) return;

  // Apply player position
  player.element.style.transform = `translate(${player.x - player.width / 2}px, ${player.y - player.height / 2}px)`;

  // Apply enemy positions
  enemies.forEach(enemy => {
    enemy.element.style.transform = `translate(${enemy.x - enemy.width / 2}px, ${enemy.y - enemy.height / 2}px)`;
  });

  // Apply laser positions
  lasers.forEach(laser => {
    laser.element.style.transform = `translate(${laser.x - laser.width / 2}px, ${laser.y - laser.height / 2}px)`;
  });
}

// --- Main Game Loop ---
function gameLoop() {
  update(Date.now());
  render();
  requestAnimationFrame(gameLoop);
}

// --- Player Logic ---
function updatePlayer(currentTime) {
  // State timers
  if (player.isDashing && currentTime >= player.dashEndTime) player.isDashing = false;
  if (!player.canDash && currentTime >= player.dashCooldownEndTime) player.canDash = true;
  if (player.isShielding && currentTime >= player.shieldEndTime) {
    player.isShielding = false;
    player.element.classList.remove('shielding');
  }
  if (!player.canShoot && currentTime >= player.shootCooldownEndTime) player.canShoot = true;

  // Movement
  let targetDx = 0;
  let targetDy = 0;
  if (keys['w'] || keys['ArrowUp']) targetDy = -PLAYER_SPEED;
  if (keys['s'] || keys['ArrowDown']) targetDy = PLAYER_SPEED;
  if (keys['a'] || keys['ArrowLeft']) targetDx = -PLAYER_SPEED;
  if (keys['d'] || keys['ArrowRight']) targetDx = PLAYER_SPEED;

  if (player.isDashing) {
    // dx/dy are set once by the dash action
  } else {
    player.dx = targetDx;
    player.dy = targetDy;
  }

  player.x += player.dx;
  player.y += player.dy;

  // Boundary checks
  if (player.x - player.radius < 0) player.x = player.radius;
  if (player.x + player.radius > GAME_WIDTH) player.x = GAME_WIDTH - player.radius;
  if (player.y - player.radius < 0) player.y = player.radius;
  if (player.y + player.radius > GAME_HEIGHT) player.y = GAME_HEIGHT - player.radius;
}

// --- Player Actions ---
function playerAttemptDash(currentTime) {
  if (!player.isDashing && player.canDash && !player.isShielding) {
    player.isDashing = true;
    player.dashEndTime = currentTime + PLAYER_DASH_DURATION;
    player.canDash = false;
    player.dashCooldownEndTime = currentTime + PLAYER_DASH_COOLDOWN;

    let angle = 0;
    if ((keys['w'] || keys['ArrowUp']) || (keys['s'] || keys['ArrowDown']) || (keys['a'] || keys['ArrowLeft']) || (keys['d'] || keys['ArrowRight'])) {
      angle = Math.atan2(player.dy, player.dx);
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
function checkCollisions(currentTime) {
  // Lasers vs Enemies
  for (let i = lasers.length - 1; i >= 0; i--) {
    for (let j = enemies.length - 1; j >= 0; j--) {
      if (distance(lasers[i].x, lasers[i].y, enemies[j].x, enemies[j].y) < enemies[j].radius) {
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
  if (!player.isShielding) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (distance(player.x, player.y, enemies[i].x, enemies[i].y) < player.radius + enemies[i].radius) {
        if (player.isDashing) {
          if (enemies[i].takeDamage(100)) { // Dash destroys enemy
            updateScore(enemies[i].scoreValue);
            enemies.splice(i, 1);
          }
        } else {
          takePlayerDamage(1);
          if (enemies[i].takeDamage(1)) { // Player also damages enemy on collision
            updateScore(enemies[i].scoreValue);
            enemies.splice(i, 1);
          }
        }
      }
    }
  }
}

// --- Game State & UI ---
function takePlayerDamage(amount) {
  player.hp -= amount;
  hpValueElement.textContent = Math.max(0, player.hp);
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
    console.log('shift?');
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
requestAnimationFrame(gameLoop);