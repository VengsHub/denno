const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const hpValueElement = document.getElementById('hp-value');

// Game settings
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

let playerHP = 3;
const PLAYER_SPEED = 5;
const PLAYER_DASH_SPEED = 15;
const PLAYER_DASH_DURATION = 150; // milliseconds
const PLAYER_DASH_COOLDOWN = 500; // milliseconds
const PLAYER_RADIUS = 15;

const ENEMY_RADIUS = 20;
const ENEMY_SPEED = 3;
const ENEMY_SPAWN_INTERVAL = 2000; // milliseconds
const ENEMY_DASH_CHANCE = 0.01; // Chance per frame for an enemy to dash
const ENEMY_DASH_SPEED_MULTIPLIER = 3;
const ENEMY_DASH_DURATION = 100; // milliseconds

let player = {
  x: 50,
  y: CANVAS_HEIGHT / 2,
  dx: 0,
  dy: 0,
  isDashing: false,
  dashEndTime: 0,
  canDash: true,
  dashCooldownEndTime: 0,
  hp: playerHP
};

let enemies = [];
let keys = {}; // To store pressed keys

// --- Player Drawing ---
function drawPlayer() {
  ctx.beginPath();
  ctx.arc(player.x, player.y, PLAYER_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = player.isDashing ? 'lightblue' : 'blue'; // Change color when dashing
  ctx.fill();
  ctx.closePath();

  // Simple sperm tail (can be improved)
  ctx.beginPath();
  ctx.moveTo(player.x - PLAYER_RADIUS, player.y);
  ctx.lineTo(player.x - PLAYER_RADIUS - 20, player.y - 10);
  ctx.lineTo(player.x - PLAYER_RADIUS - 20, player.y + 10);
  ctx.closePath();
  ctx.fillStyle = player.isDashing ? 'lightblue' : 'blue';
  ctx.fill();
}

// --- Enemy Class ---
class Enemy {
  constructor(x, y, speed, radius, type = 'whiteBloodCell') {
    this.x = x;
    this.y = y;
    this.speed = speed;
    this.radius = radius;
    this.type = type;
    this.isDashing = false;
    this.dashEndTime = 0;
    this.originalSpeed = speed;
  }

  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'red';
    ctx.fill();
    ctx.strokeStyle = 'darkred';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.closePath();

    // Inner circle for white blood cell appearance
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = 'pink';
    ctx.fill();
    ctx.closePath();
  }

  update() {
    // Movement from right to left
    if (this.isDashing) {
      this.x -= this.speed * ENEMY_DASH_SPEED_MULTIPLIER;
      if (Date.now() >= this.dashEndTime) {
        this.isDashing = false;
        this.speed = this.originalSpeed; // Reset speed
      }
    } else {
      this.x -= this.speed;
      // Basic dash behavior for white blood cells
      if (this.type === 'whiteBloodCell' && !this.isDashing && Math.random() < ENEMY_DASH_CHANCE) {
        this.isDashing = true;
        this.dashEndTime = Date.now() + ENEMY_DASH_DURATION;
      }
    }


    // Remove enemy if it goes off screen
    if (this.x + this.radius < 0) {
      return true; // Mark for removal
    }
    return false; // Keep enemy
  }

  // Example of a conditional attack (can be expanded)
  performAttack() {
    if (this.type === 'someOtherEnemyType') {
      // Condition for this enemy type to attack
      if (Math.random() < 0.005) { // Low chance per frame
        console.log(`${this.type} at (${this.x}, ${this.y}) is attacking!`);
        // Implement attack logic (e.g., shoot a projectile, lunge)
      }
    }
  }
}

// --- Enemy Management ---
function spawnEnemy() {
  const y = Math.random() * (CANVAS_HEIGHT - ENEMY_RADIUS * 2) + ENEMY_RADIUS;
  enemies.push(new Enemy(CANVAS_WIDTH + ENEMY_RADIUS, y, ENEMY_SPEED, ENEMY_RADIUS, 'whiteBloodCell'));
}

function updateEnemies() {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    if (enemy.update()) {
      enemies.splice(i, 1); // Remove enemy if update returns true
    } else {
      enemy.performAttack(); // Check if enemy should perform an attack
      enemy.draw();
    }
  }
}

// --- Collision Detection ---
function checkCollisions() {
  enemies.forEach((enemy, index) => {
    const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);

    if (dist - enemy.radius - PLAYER_RADIUS < 1) {
      if (player.isDashing) {
        // Player dashed through enemy
        console.log("Dashed through enemy!");
        enemies.splice(index, 1); // Destroy enemy
      } else {
        // Player collided with enemy
        console.log("Collision!");
        playerHP--;
        hpValueElement.textContent = playerHP;
        enemies.splice(index, 1); // Remove enemy after collision

        if (playerHP <= 0) {
          gameOver();
        }
      }
    }
  });
}

// --- Player Movement and Actions ---
function updatePlayer() {
  // Handle dashing state
  if (player.isDashing) {
    if (Date.now() >= player.dashEndTime) {
      player.isDashing = false;
      player.dx = 0; // Stop dash movement if no other keys are pressed
      player.dy = 0;
    }
  } else {
    // Reset movement deltas
    player.dx = 0;
    player.dy = 0;

    // Movement based on pressed keys
    if (keys['w'] || keys['ArrowUp']) {
      player.dy = -PLAYER_SPEED;
    }
    if (keys['s'] || keys['ArrowDown']) {
      player.dy = PLAYER_SPEED;
    }
    if (keys['a'] || keys['ArrowLeft']) {
      player.dx = -PLAYER_SPEED;
    }
    if (keys['d'] || keys['ArrowRight']) {
      player.dx = PLAYER_SPEED;
    }
  }

  // Apply movement
  player.x += player.dx;
  player.y += player.dy;

  // Keep player within canvas bounds
  if (player.x - PLAYER_RADIUS < 0) player.x = PLAYER_RADIUS;
  if (player.x + PLAYER_RADIUS > CANVAS_WIDTH) player.x = CANVAS_WIDTH - PLAYER_RADIUS;
  if (player.y - PLAYER_RADIUS < 0) player.y = PLAYER_RADIUS;
  if (player.y + PLAYER_RADIUS > CANVAS_HEIGHT) player.y = CANVAS_HEIGHT - PLAYER_RADIUS;

  // Handle dash cooldown
  if (!player.canDash && Date.now() >= player.dashCooldownEndTime) {
    player.canDash = true;
  }
}

function attemptDash() {
  if (!player.isDashing && player.canDash) {
    player.isDashing = true;
    player.dashEndTime = Date.now() + PLAYER_DASH_DURATION;
    player.canDash = false;
    player.dashCooldownEndTime = Date.now() + PLAYER_DASH_COOLDOWN;

    // Determine dash direction based on current movement or default to right
    let dashAngle = 0; // Default to right if no movement keys are pressed

    if (keys['w'] || keys['ArrowUp']) {
      dashAngle = Math.PI * 1.5; // Up
    } else if (keys['s'] || keys['ArrowDown']) {
      dashAngle = Math.PI * 0.5; // Down
    } else if (keys['a'] || keys['ArrowLeft']) {
      dashAngle = Math.PI; // Left
    } else if (keys['d'] || keys['ArrowRight']) {
      dashAngle = 0; // Right
    }
    // If no movement keys, it will dash right by default as per your left-to-right game flow

    player.dx = Math.cos(dashAngle) * PLAYER_DASH_SPEED;
    player.dy = Math.sin(dashAngle) * PLAYER_DASH_SPEED;
  }
}

// --- Game Loop ---
let lastEnemySpawnTime = 0;
function gameLoop(timestamp) {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT); // Clear canvas

  updatePlayer();
  drawPlayer();

  // Spawn enemies periodically
  if (timestamp - lastEnemySpawnTime > ENEMY_SPAWN_INTERVAL) {
    spawnEnemy();
    lastEnemySpawnTime = timestamp;
  }

  updateEnemies();
  checkCollisions();

  if (playerHP > 0) {
    requestAnimationFrame(gameLoop);
  }
}

// --- Event Listeners ---
document.addEventListener('keydown', (event) => {
  keys[event.key.toLowerCase()] = true;
  if (event.key === ' ') { // Spacebar
    event.preventDefault(); // Prevent page scrolling
    attemptDash();
  }
});

document.addEventListener('keyup', (event) => {
  keys[event.key.toLowerCase()] = false;
});

// --- Game Over ---
function gameOver() {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.font = '48px Arial';
  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
  ctx.font = '24px Arial';
  ctx.fillText('Press F5 to Restart', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 50);
  // Optionally, stop enemy spawning or other game activities
}

// --- Start Game ---
hpValueElement.textContent = playerHP;
requestAnimationFrame(gameLoop);