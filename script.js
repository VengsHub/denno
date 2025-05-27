const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const hpValueElement = document.getElementById('hp-value');
const scoreValueElement = document.getElementById('score-value');

// Game settings
let CANVAS_WIDTH = window.innerWidth;
let CANVAS_HEIGHT = window.innerHeight;
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;
window.addEventListener('resize', () => {
  CANVAS_WIDTH = window.innerWidth;
  CANVAS_HEIGHT = window.innerHeight;
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
})

let playerScore = 0;
const PLAYER_START_HP = 3;
const PLAYER_SPEED = 4;
const PLAYER_DASH_SPEED = 20;
const PLAYER_DASH_DURATION = 150; // milliseconds
const PLAYER_DASH_COOLDOWN = 600; // milliseconds
const PLAYER_RADIUS = 15;
const PLAYER_SHIELD_DURATION = 1000; // 1 second
const PLAYER_SHOOT_COOLDOWN = 300; // milliseconds
const PLAYER_LASER_DURATION = 100; // How long the laser visual stays
const PLAYER_LASER_RANGE = CANVAS_WIDTH; // Max range of laser

const ENEMY_SPAWN_INTERVAL = 2500; // milliseconds

let player = {
  x: 70,
  y: CANVAS_HEIGHT / 2,
  dx: 0,
  dy: 0,
  radius: PLAYER_RADIUS,
  hp: PLAYER_START_HP,
  isDashing: false,
  dashEndTime: 0,
  canDash: true,
  dashCooldownEndTime: 0,
  isShielding: false,
  shieldEndTime: 0,
  isShooting: false, // For visual representation of laser
  shootEndTime: 0,
  canShoot: true,
  shootCooldownEndTime: 0,
};

let enemies = [];
let projectiles = []; // Though we're focusing on lasers, this could be for enemy projectiles later
let keys = {}; // To store pressed keys
let gameRunning = true;

// --- Helper: Distance Check ---
function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

// --- Player Drawing ---
function drawPlayer() {
  // Shield Visual
  if (player.isShielding) {
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius + 8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(173, 216, 230, 0.5)'; // Light blue, semi-transparent
    ctx.fill();
    ctx.closePath();
  }

  // Player Body
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
  ctx.fillStyle = player.isDashing ? 'cyan' : 'blue';
  ctx.fill();
  ctx.closePath();

  // Simple sperm tail
  ctx.beginPath();
  const tailLength = player.radius * 1.5;
  const tailWave = Math.sin(Date.now() * 0.02) * 5; // Simple wiggle
  ctx.moveTo(player.x - player.radius, player.y);
  ctx.lineTo(player.x - player.radius - tailLength * 0.7, player.y - 5 + tailWave);
  ctx.lineTo(player.x - player.radius - tailLength, player.y + tailWave / 2);
  ctx.lineTo(player.x - player.radius - tailLength * 0.7, player.y + 5 + tailWave);
  ctx.closePath();
  ctx.fillStyle = player.isDashing ? 'cyan' : 'blue';
  ctx.fill();

  // Laser Visual
  if (player.isShooting) {
    ctx.beginPath();
    ctx.moveTo(player.x + player.radius, player.y); // Start from front of player
    ctx.lineTo(player.x + PLAYER_LASER_RANGE, player.y); // Shoots right
    ctx.strokeStyle = 'yellow';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.closePath();
  }
}

// --- Base Enemy Class ---
class Enemy {
  constructor(config, playerRef) {
    this.x = config.x || CANVAS_WIDTH + (config.radius || 20);
    this.y = config.y || Math.random() * (CANVAS_HEIGHT - (config.radius || 20) * 2) + (config.radius || 20);
    this.radius = config.radius || 20;
    this.hp = config.hp || 1;
    this.baseSpeed = config.baseSpeed || 2;
    this.speedX = -this.baseSpeed; // Default move left
    this.speedY = 0;
    this.color = config.color || 'gray';
    this.player = playerRef; // Reference to the player object
    this.type = config.type || 'generic';
    this.scoreValue = config.scoreValue || 10;

    this.actions = config.actions || [];
    this.lastActionTimes = {}; // { actionName: timestamp }
    this.activeActionEndTime = 0; // If an action is ongoing (dash, shield)
    this.isActionActive = false; // Generic flag if any action is active that might override movement/behavior

    this.isShielding = false;
    this.shieldEndTime = 0;

    this.isDashing = false;
    this.dashEndTime = 0;
    this.dashTargetX = 0;
    this.dashTargetY = 0;
    this.originalSpeed = this.baseSpeed;

    this.idleMovementState = {
      angle: Math.random() * Math.PI * 2, // For circular/wave patterns
      amplitude: config.idleAmplitude || 50, // For wave patterns
      frequency: config.idleFrequency || 0.05, // For wave patterns
    };
  }

  draw() {
    // Shield Visual
    if (this.isShielding) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 165, 0, 0.4)'; // Orange, semi-transparent
      ctx.fill();
      ctx.closePath();
    }

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.isDashing ? 'dark' + this.color : this.color;
    ctx.fill();
    if (this.type === 'whiteBloodCell') { // Specific WBC look
      ctx.strokeStyle = 'darkred';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = 'pink';
      ctx.fill();
    }
    ctx.closePath();
  }

  update(currentTime) {
    if (this.isDashing) {
      this.performDashMovement(currentTime);
    } else if (this.isShielding && currentTime >= this.shieldEndTime) {
      this.isShielding = false;
      this.isActionActive = false;
    } else if (!this.isActionActive) { // Only perform idle movement or new actions if not busy
      this.idleMove(currentTime);
      this.evaluateActions(currentTime);
    }

    this.x += this.speedX;
    this.y += this.speedY;

    // Remove if off-screen to the left
    return this.x + this.radius < 0;
  }

  idleMove(currentTime) {
    // Overridden by specific enemy types
    this.speedX = -this.baseSpeed; // Default: move left
    this.speedY = 0;
  }

  evaluateActions(currentTime) {
    if (this.isActionActive && currentTime < this.activeActionEndTime) {
      return; // Busy with an action
    }
    this.isActionActive = false; // Reset if previous action ended

    for (const action of this.actions) {
      const lastTime = this.lastActionTimes[action.name] || 0;
      if (currentTime - lastTime < action.cooldown) {
        continue; // Action on cooldown
      }

      let triggered = false;
      if (action.trigger.type === 'proximity') {
        if (distance(this.x, this.y, this.player.x, this.player.y) < action.trigger.distance) {
          triggered = true;
        }
      } else if (action.trigger.type === 'interval') {
        if (currentTime - lastTime > action.trigger.interval) { // Should be interval + cooldown
          triggered = true;
        }
      } else if (action.trigger.type === 'healthThreshold') {
        if (this.hp <= this.maxHp * action.trigger.percentage) { // (Need maxHp)
          triggered = true;
        }
      }


      if (triggered) {
        this.lastActionTimes[action.name] = currentTime;
        if (typeof this[action.method] === 'function') {
          this[action.method](currentTime, action); // Pass currentTime and action config
          this.isActionActive = true;
          this.activeActionEndTime = currentTime + (action.duration || 0);
          break; // Perform one action per frame check
        }
      }
    }
  }

  // --- Standard Action Implementations (can be overridden) ---
  initiateDash(currentTime, actionConfig) {
    if (this.isDashing || this.isShielding) return; // Don't dash if already dashing or shielding

    this.isDashing = true;
    this.dashEndTime = currentTime + actionConfig.duration;
    this.originalSpeed = this.baseSpeed; // Save current speed

    // Dash towards player's current position
    const angleToPlayer = Math.atan2(this.player.y - this.y, this.player.x - this.x);
    this.dashTargetX = this.player.x; // Not strictly needed if dashing by angle
    this.dashTargetY = this.player.y; // Not strictly needed
    this.speedX = Math.cos(angleToPlayer) * (actionConfig.speed || this.baseSpeed * 3);
    this.speedY = Math.sin(angleToPlayer) * (actionConfig.speed || this.baseSpeed * 3);
    console.log(`${this.type} dashing towards player!`);
  }

  performDashMovement(currentTime) {
    if (currentTime >= this.dashEndTime) {
      this.isDashing = false;
      this.isActionActive = false;
      this.speedX = -this.originalSpeed; // Resume normal speed left
      this.speedY = 0;
    }
    // Movement is handled by this.speedX, this.speedY set in initiateDash
  }

  activateShield(currentTime, actionConfig) {
    if (this.isDashing || this.isShielding) return;
    this.isShielding = true;
    this.shieldEndTime = currentTime + actionConfig.duration;
    console.log(`${this.type} activated shield!`);
    // Movement might stop or slow down during shield
    this.speedX = 0; // Example: stop moving when shielding
    this.speedY = 0;
  }

  shootLaser(currentTime, actionConfig) {
    if (this.isDashing || this.isShielding) return; // Can't shoot while doing other major actions
    console.log(`${this.type} shooting laser!`);
    // For enemies, laser visual and collision could be simpler
    // e.g., a quick line and check collision along it
    // For now, just a log. Implement collision similar to player's laser if needed.
    // Add a visual effect if desired (like a temporary line from enemy)
    const laserVisualDuration = 200; // How long the enemy laser is visible
    const enemyLaser = {
      x1: this.x - this.radius, // Shoots left
      y1: this.y,
      x2: 0, // Extends to the left edge of canvas
      y2: this.y,
      endTime: currentTime + laserVisualDuration,
      type: 'enemyLaserVisual' // For drawing
    };
    projectiles.push(enemyLaser); // Use projectiles array for visuals for now

    // Check collision for this laser INSTANTANEOUSLY
    if (player.y > this.y - player.radius && player.y < this.y + player.radius && player.x < this.x) {
      if (!player.isShielding && !player.isDashing) { // Player can be hit if not shielding or dashing
        console.log("Player hit by enemy laser!");
        takePlayerDamage(1);
      } else {
        console.log("Enemy laser blocked by player shield/dash!");
      }
    }
  }


  takeDamage(amount) {
    if (this.isShielding) {
      console.log(`${this.type} blocked damage with shield!`);
      return false; // No damage taken
    }
    this.hp -= amount;
    console.log(`${this.type} took ${amount} damage, HP: ${this.hp}`);
    return this.hp <= 0; // Return true if destroyed
  }
}

// --- Specific Enemy Type: WhiteBloodCell ---
class WhiteBloodCell extends Enemy {
  constructor(playerRef) {
    const config = {
      type: 'whiteBloodCell',
      hp: 1,
      radius: 22,
      baseSpeed: 1.5, // Base horizontal speed
      color: 'red',
      scoreValue: 15,
      idleAmplitude: 30, // Controls the "height" of the sine wave
      idleFrequency: 0.03, // Controls the "speed" of the sine wave
      actions: [
        {
          name: 'dashAtPlayer',
          method: 'initiateDash', // Uses the base Enemy dash logic
          cooldown: 4000, // milliseconds
          duration: 700, // milliseconds for the dash
          speed: 6, // Dash speed
          trigger: {
            type: 'proximity',
            distance: 250, // Dash if player is this close
          }
        },
        // Example: Add a periodic shield action if desired
        // {
        //     name: 'periodicShield',
        //     method: 'activateShield',
        //     cooldown: 8000,
        //     duration: 1500,
        //     trigger: {
        //         type: 'interval',
        //         interval: 7000, // Activates shield roughly every 7s if off cooldown
        //     }
        // }
      ]
    };
    super(config, playerRef);
    this.initialY = this.y; // Anchor for sine wave movement
  }

  performDashMovement(currentTime) {
    if (currentTime >= this.dashEndTime) {
      this.isDashing = false;
      this.isActionActive = false;
      this.speedX = -this.originalSpeed; // Resume normal speed left
      this.speedY = 0;
      this.initialY = this.y;
    }
    // Movement is handled by this.speedX, this.speedY set in initiateDash
  }

  // Override idleMove for specific WBC behavior
  idleMove(currentTime) {
    // Moves left with a slow sine wave pattern vertically
    this.speedX = -this.baseSpeed;
    this.idleMovementState.angle += this.idleMovementState.frequency;
    // This makes it move around its initial spawn Y.
    // If you want it to drift down/up the screen, adjust this.initialY over time or use a different logic.
    this.y = this.initialY + Math.sin(this.idleMovementState.angle) * this.idleMovementState.amplitude;

    // Keep within vertical bounds
    if (this.y - this.radius < 0) {
      this.y = this.radius;
      this.initialY = this.radius - Math.sin(this.idleMovementState.angle) * this.idleMovementState.amplitude; // Adjust anchor
    }
    if (this.y + this.radius > CANVAS_HEIGHT) {
      this.y = CANVAS_HEIGHT - this.radius;
      this.initialY = CANVAS_HEIGHT - this.radius - Math.sin(this.idleMovementState.angle) * this.idleMovementState.amplitude; // Adjust anchor
    }
  }
}

// --- Enemy Management ---
function spawnEnemy() {
  // For now, only spawn WhiteBloodCells
  enemies.push(new WhiteBloodCell(player));

  // Example: Spawning another type
  // if (Math.random() < 0.3) {
  // enemies.push(new OtherEnemyType(player));
  // }
}

function updateEnemies(currentTime) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    if (enemy.update(currentTime)) { // update returns true if enemy is off-screen
      enemies.splice(i, 1);
    } else {
      enemy.draw();
    }
  }
}

// --- Projectile/Visuals Drawing (for enemy lasers etc.) ---
function updateAndDrawProjectiles(currentTime) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    if (p.type === 'enemyLaserVisual') {
      if (currentTime < p.endTime) {
        ctx.beginPath();
        ctx.moveTo(p.x1, p.y1);
        ctx.lineTo(p.x2, p.y2);
        ctx.strokeStyle = 'orange';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        projectiles.splice(i, 1); // Remove expired visual
      }
    }
    // Add other projectile types here
  }
}


// --- Collision Detection ---
function checkCollisions(currentTime) {
  // Player laser vs Enemies
  if (player.isShooting && currentTime < player.shootEndTime) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const enemy = enemies[i];
      if (enemy.isShielding) continue; // Enemy is shielded

      // Simple line-circle intersection for player's rightward laser
      // Check if enemy's y is within laser's y-range (it's a horizontal line)
      // and if enemy's x is to the right of player and within laser range.
      const laserY = player.y;
      if (Math.abs(enemy.y - laserY) < enemy.radius && // Vertical check
        enemy.x > player.x && // Enemy is to the right of player
        enemy.x < player.x + PLAYER_LASER_RANGE) { // Enemy is within laser's x-reach

        console.log("Laser hit enemy!");
        if (enemy.takeDamage(1)) { // takeDamage returns true if enemy destroyed
          playerScore += enemy.scoreValue;
          scoreValueElement.textContent = playerScore;
          enemies.splice(i, 1);
        }
        // Laser hits one enemy and stops or pierces? For now, let's say it can hit multiple along its path per frame.
        // To make it stop after one hit, you'd set player.isShooting = false or add a flag.
      }
    }
  }


  // Player vs Enemies
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    const distPlayerEnemy = distance(player.x, player.y, enemy.x, enemy.y);

    if (distPlayerEnemy < player.radius + enemy.radius) {
      if (player.isDashing) {
        console.log("Player dashed through enemy!");
        if (enemy.takeDamage(100)) { // Dash might do more damage or insta-kill
          playerScore += enemy.scoreValue;
          scoreValueElement.textContent = playerScore;
          enemies.splice(i, 1);
        }
      } else if (!player.isShielding && !enemy.isDashing) { // Standard collision, no player shield, no enemy dash
        console.log("Player collided with enemy!");
        takePlayerDamage(1); // Player takes 1 damage
        // Enemy might also take damage or be destroyed
        if (enemy.takeDamage(1)) {
          playerScore += enemy.scoreValue;
          scoreValueElement.textContent = playerScore;
          enemies.splice(i, 1);
        }
      } else if (enemy.isDashing && !player.isShielding) { // Enemy dashing into player
        console.log("Enemy dashed into player!");
        takePlayerDamage(1); // Player takes damage from enemy dash
      }
      // If player.isShielding, nothing happens to player.
      // If enemy is dashing and player is dashing, they might pass through or both get destroyed. Current logic favors player dash.
    }
  }
}

function takePlayerDamage(amount) {
  if (player.isShielding || player.isDashing) { // Invulnerable while dashing too
    console.log("Player damage avoided due to shield/dash!");
    return;
  }
  player.hp -= amount;
  hpValueElement.textContent = player.hp;
  if (player.hp <= 0) {
    gameOver();
  }
}

function updatePlayer() { // currentTime here is the rAF timestamp, not used for Date.now() comparisons
  const now = Date.now(); // Use a consistent "now" for all checks in this function call

  // Handle Dashing State
  if (player.isDashing) {
    if (now >= player.dashEndTime) { // Use now (Date.now())
      player.isDashing = false;
      player.dx = 0;
      player.dy = 0;
      if (keys['w'] || keys['ArrowUp']) player.dy = -PLAYER_SPEED;
      if (keys['s'] || keys['ArrowDown']) player.dy = PLAYER_SPEED;
      if (keys['a'] || keys['ArrowLeft']) player.dx = -PLAYER_SPEED;
      if (keys['d'] || keys['ArrowRight']) player.dx = PLAYER_SPEED;
    }
    // If still player.isDashing (and dash hasn't ended yet), player.dx/dy (from PLAYER_DASH_SPEED) are used.
    // No need to re-assign player.dx/dy here if dash is ongoing.
  } else { // Not in a dashing state
    player.dx = 0;
    player.dy = 0;
    if (keys['w'] || keys['ArrowUp']) player.dy = -PLAYER_SPEED;
    if (keys['s'] || keys['ArrowDown']) player.dy = PLAYER_SPEED;
    if (keys['a'] || keys['ArrowLeft']) player.dx = -PLAYER_SPEED;
    if (keys['d'] || keys['ArrowRight']) player.dx = PLAYER_SPEED;
  }

  // Apply movement
  player.x += player.dx;
  player.y += player.dy;

  // Keep player within bounds
  player.x = Math.max(player.radius, Math.min(player.x, CANVAS_WIDTH - player.radius));
  player.y = Math.max(player.radius, Math.min(player.y, CANVAS_HEIGHT - player.radius));

  // Dash Cooldown
  if (!player.canDash && now >= player.dashCooldownEndTime) { // Use now (Date.now())
    player.canDash = true;
  }

  // Shielding
  if (keys['shift']) { // Holding Shift
    if (!player.isShielding && !player.isDashing) {
      player.isShielding = true;
      player.shieldEndTime = now + PLAYER_SHIELD_DURATION; // Use now (Date.now()) to set end time
    }
  }
  if (player.isShielding && now >= player.shieldEndTime) { // Use now (Date.now())
    player.isShielding = false;
  }

  // Shooting Cooldown & State
  if (!player.canShoot && now >= player.shootCooldownEndTime) { // Use now (Date.now())
    player.canShoot = true;
  }
  if (player.isShooting && now >= player.shootEndTime) { // Use now (Date.now())
    player.isShooting = false; // Laser visual ends
  }
}

function playerAttemptDash() {
  if (!player.isDashing && player.canDash && !player.isShielding) {
    player.isDashing = true;
    const now = Date.now();
    player.dashEndTime = now + PLAYER_DASH_DURATION;
    player.canDash = false;
    player.dashCooldownEndTime = now + PLAYER_DASH_COOLDOWN;

    let dashAngle = 0;
    let tempDx = 0;
    let tempDy = 0;

    if (keys['w'] || keys['ArrowUp']) tempDy -= 1;
    if (keys['s'] || keys['ArrowDown']) tempDy += 1;
    if (keys['a'] || keys['ArrowLeft']) tempDx -= 1;
    if (keys['d'] || keys['ArrowRight']) tempDx += 1;

    if (tempDx !== 0 || tempDy !== 0) {
      dashAngle = Math.atan2(tempDy, tempDx);
    } else {
      dashAngle = 0; // Default dash right if no keys pressed
    }

    player.dx = Math.cos(dashAngle) * PLAYER_DASH_SPEED;
    player.dy = Math.sin(dashAngle) * PLAYER_DASH_SPEED;
  }
}

function playerAttemptShoot() { // Removed currentTime parameter, will use Date.now() internally
  const now = Date.now();
  if (player.canShoot && !player.isDashing && !player.isShielding) {
    player.isShooting = true; // For visual
    player.shootEndTime = now + PLAYER_LASER_DURATION; // Use now (Date.now())
    player.canShoot = false;
    player.shootCooldownEndTime = now + PLAYER_SHOOT_COOLDOWN; // Use now (Date.now())
    // console.log("Player Shoots Laser!");
  }
}

// --- Game Loop ---
let lastEnemySpawnTime = 0;
function gameLoop(currentTime) {
  if (!gameRunning) return;

  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  updatePlayer(currentTime);
  drawPlayer();

  if (currentTime - lastEnemySpawnTime > ENEMY_SPAWN_INTERVAL) {
    spawnEnemy();
    lastEnemySpawnTime = currentTime;
  }

  updateEnemies(currentTime);
  updateAndDrawProjectiles(currentTime); // For enemy laser visuals etc.
  checkCollisions(currentTime);

  requestAnimationFrame(gameLoop);
}

// --- Event Listeners ---
document.addEventListener('keydown', (event) => {
  keys[event.key.toLowerCase()] = true;
  if (event.key === ' ') { // Spacebar for Dash
    event.preventDefault();
    playerAttemptDash();
  }
  if (event.key.toLowerCase() === 'e') { // E for Shoot
    event.preventDefault();
    playerAttemptShoot(); // Pass current time
  }
  // Shift for shield is handled directly in updatePlayer by checking keys['Shift']
});

document.addEventListener('keyup', (event) => {
  keys[event.key.toLowerCase()] = false;
  if (event.key === 'Shift' && player.isShielding) { // Turn off shield if shift is released early
    player.isShielding = false;
    console.log("Player shield OFF (key released)");
  }
});

// --- Game Over ---
function gameOver() {
  gameRunning = false;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.font = '48px Arial';
  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 30);
  ctx.font = '30px Arial';
  ctx.fillText(`Final Score: ${playerScore}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);
  ctx.font = '20px Arial';
  ctx.fillText('Press F5 to Restart', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 60);
}

// --- Start Game ---
function initGame() {
  player.hp = PLAYER_START_HP;
  playerScore = 0;
  hpValueElement.textContent = player.hp;
  scoreValueElement.textContent = playerScore;
  enemies = [];
  projectiles = [];
  player.x = 70;
  player.y = CANVAS_HEIGHT / 2;
  player.isDashing = false;
  player.isShielding = false;
  player.isShooting = false;
  player.canDash = true;
  player.canShoot = true;
  keys = {};
  gameRunning = true;
  lastEnemySpawnTime = 0; // Reset spawn timer
  requestAnimationFrame(gameLoop);
}

initGame(); // Start the game