const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const finalScoreEl = document.getElementById('final-score');

let gameState = 'start';
let gameLoopId;
let lastTime = 0;
let score = 0;
let lives = 5;

// Prevent layout jumping
function resizeCanvas() {
    const container = document.getElementById('game-container');
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

let ships = [];
let missiles = [];
let chickpeas = [];
let explosions = [];
let particles = [];
let spawnTimers = { ship: 0, missile: 0 };

class Ship {
    constructor() {
        this.y = canvas.height * 0.15 + 20 + Math.random() * (canvas.height * 0.7 - 60);
        this.direction = Math.random() > 0.5 ? 1 : -1;
        this.size = Math.random() > 0.7 ? 2 : Math.random() > 0.4 ? 1 : 0; 
        
        let sizes = [
            { w: 30, h: 12, hp: 1, color: '#999', speed: 45, pts: 10 },
            { w: 50, h: 16, hp: 2, color: '#ccc', speed: 30, pts: 20 },
            { w: 75, h: 22, hp: 3, color: '#fff', speed: 20, pts: 30 }
        ];
        
        let props = sizes[this.size];
        this.w = props.w;
        this.h = props.h;
        this.hp = props.hp;
        this.maxHp = props.hp;
        this.color = props.color;
        this.speed = props.speed * this.direction;
        this.pts = props.pts;
        
        this.x = this.direction === 1 ? -this.w : canvas.width + this.w;
        this.markedForDeletion = false;
    }
    
    update(dt) {
        this.x += this.speed * (dt / 1000);
        if (this.direction === 1 && this.x > canvas.width) {
            score += this.pts * 2;
            updateUI();
            this.markedForDeletion = true;
        } else if (this.direction === -1 && this.x < -this.w) {
            score += this.pts * 2;
            updateUI();
            this.markedForDeletion = true;
        }
    }
    
    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.w, this.h);
        
        // Darken hull bottom
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(this.x, this.y + this.h * 0.7, this.w, this.h * 0.3);

        ctx.fillStyle = '#666';
        ctx.fillRect(this.x + this.w * 0.4, this.y - this.h * 0.6, this.w * 0.2, this.h * 0.6);

        // HP bar if damaged
        if(this.hp < this.maxHp) {
            ctx.fillStyle = '#f00';
            ctx.fillRect(this.x, this.y - 5, this.w, 3);
            ctx.fillStyle = '#0f0';
            ctx.fillRect(this.x, this.y - 5, this.w * (this.hp / this.maxHp), 3);
        }
    }
}

class Missile {
    constructor() {
        this.x = Math.random() * canvas.width;
        this.y = -20;
        this.targetX = Math.random() * canvas.width;
        this.targetY = canvas.height * 0.85; 
        
        this.speed = 50 + Math.min(score / 15, 120);
        
        const angle = Math.atan2(this.targetY - this.y, this.targetX - this.x);
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;
        this.markedForDeletion = false;
    }
    
    update(dt) {
        this.x += this.vx * (dt / 1000);
        this.y += this.vy * (dt / 1000);
        
        particles.push(new Particle(this.x, this.y, 0, -20, '#ff4400', 2, 0.4));
        
        if (this.y > canvas.height) {
            this.markedForDeletion = true;
        }
    }
    
    draw(ctx) {
        ctx.fillStyle = '#ff3300';
        ctx.beginPath();
        ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(this.x, this.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
    }
}

class Chickpea {
    constructor(startX, startY, targetX, targetY) {
        this.x = startX;
        this.y = startY;
        this.targetX = targetX;
        this.targetY = targetY;
        this.speed = 400;
        const angle = Math.atan2(targetY - startY, targetX - startX);
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;
        this.markedForDeletion = false;
    }
    
    update(dt) {
        this.x += this.vx * (dt / 1000);
        this.y += this.vy * (dt / 1000);
        
        const dist = Math.hypot(this.targetX - this.x, this.targetY - this.y);
        if (dist < 15 || this.y < this.targetY + 5) {
            this.explode();
        }
    }
    
    explode() {
        this.markedForDeletion = true;
        explosions.push(new Explosion(this.x, this.y));
        for (let i=0; i<12; i++) {
            particles.push(new Particle(this.x, this.y, (Math.random()-0.5)*150, (Math.random()-0.5)*150, '#e6c280', 3, 0.8));
            if(Math.random()>0.5) particles.push(new Particle(this.x, this.y, (Math.random()-0.5)*100, (Math.random()-0.5)*100, '#c7a35c', 4, 1.0));
        }
    }
    
    draw(ctx) {
        ctx.fillStyle = '#e6c280'; 
        ctx.beginPath();
        ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f5dfaf'; 
        ctx.beginPath();
        ctx.arc(this.x - 1, this.y - 1, 1.5, 0, Math.PI * 2);
        ctx.fill();
    }
}

class Explosion {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 0;
        this.maxRadius = 45;
        this.life = 1.0; 
        this.markedForDeletion = false;
    }
    
    update(dt) {
        this.life -= dt / 1000 * 1.5; 
        if (this.life > 0.5) {
            this.radius = this.maxRadius * (1 - (this.life - 0.5) * 2); 
        } else {
            this.radius = this.maxRadius; 
        }
        
        if (this.life <= 0) this.markedForDeletion = true;
    }
    
    draw(ctx) {
        ctx.fillStyle = `rgba(230, 194, 128, ${this.life})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = `rgba(199, 163, 92, ${this.life * 0.8})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.8, 0, Math.PI * 2);
        ctx.fill();
    }
}

class Particle {
    constructor(x, y, vx, vy, color, size, life) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.size = size;
        this.life = life;
        this.maxLife = life;
        this.markedForDeletion = false;
    }
    
    update(dt) {
        this.x += this.vx * (dt / 1000);
        this.y += this.vy * (dt / 1000);
        this.life -= dt / 1000;
        if (this.life <= 0) this.markedForDeletion = true;
    }
    
    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
        ctx.fillRect(this.x, this.y, this.size, this.size);
        ctx.globalAlpha = 1.0;
    }
}

function updateUI() {
    scoreEl.innerText = score;
    livesEl.innerText = lives;
}

function initGame() {
    score = 0;
    lives = 5;
    updateUI();
    ships = [];
    missiles = [];
    chickpeas = [];
    explosions = [];
    particles = [];
    spawnTimers.ship = 0;
    spawnTimers.missile = 2000;
}

function checkCollisions() {
    missiles.forEach(m => {
        explosions.forEach(e => {
            if (m.markedForDeletion || e.markedForDeletion) return;
            const dist = Math.hypot(m.x - e.x, m.y - e.y);
            if (dist < e.radius + 3) {
                m.markedForDeletion = true;
                score += 15;
                updateUI();
                for(let i=0; i<8; i++) particles.push(new Particle(m.x, m.y, (Math.random()-0.5)*80, (Math.random()-0.5)*80, '#ffaa00', 3, 0.6));
            }
        });
    });
    
    missiles.forEach(m => {
        ships.forEach(s => {
            if (m.markedForDeletion || s.markedForDeletion) return;
            if (m.x > s.x && m.x < s.x + s.w && m.y > s.y && m.y < s.y + s.h) {
                m.markedForDeletion = true;
                s.hp -= 1;
                
                for(let i=0; i<10; i++) particles.push(new Particle(m.x, m.y, (Math.random()-0.5)*100, (Math.random()-0.5)*100, '#f00', 3, 0.8));
                
                if (s.hp <= 0) {
                    s.markedForDeletion = true;
                    lives -= 1;
                    updateUI();
                    for(let i=0; i<30; i++) particles.push(new Particle(s.x + s.w/2, s.y + s.h/2, (Math.random()-0.5)*200, -Math.random()*150, '#ffa500', Math.random()*5+2, 1.2));
                    
                    if (lives <= 0) gameOver();
                }
            }
        });
    });
}

function update(dt) {
    if (gameState !== 'playing') return;
    
    spawnTimers.ship -= dt;
    spawnTimers.missile -= dt;
    
    if (spawnTimers.ship <= 0) {
        ships.push(new Ship());
        spawnTimers.ship = 1500 + Math.random() * 2500;
    }
    
    if (spawnTimers.missile <= 0) {
        missiles.push(new Missile());
        spawnTimers.missile = Math.max(400, 1500 - score * 1.5); 
    }
    
    [...ships, ...missiles, ...chickpeas, ...explosions, ...particles].forEach(e => e.update(dt));
    
    checkCollisions();
    
    ships = ships.filter(e => !e.markedForDeletion);
    missiles = missiles.filter(e => !e.markedForDeletion);
    chickpeas = chickpeas.filter(e => !e.markedForDeletion);
    explosions = explosions.filter(e => !e.markedForDeletion);
    particles = particles.filter(e => !e.markedForDeletion);
}

function draw() {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#8B4513'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height * 0.15);
    ctx.fillStyle = '#5c2e0b';
    ctx.fillRect(0, canvas.height * 0.12, canvas.width, canvas.height * 0.03);
    
    ctx.fillStyle = '#005588';
    ctx.fillRect(0, canvas.height * 0.15, canvas.width, canvas.height * 0.7);
    ctx.fillStyle = '#0066aa';
    for(let i=0; i<6; i++) {
        ctx.fillRect(0, canvas.height * 0.2 + i * (canvas.height*0.11), canvas.width, 2);
    }

    ctx.fillStyle = '#8B4513';
    ctx.fillRect(0, canvas.height * 0.85, canvas.width, canvas.height * 0.15);
    ctx.fillStyle = '#5c2e0b';
    ctx.fillRect(0, canvas.height * 0.85, canvas.width, canvas.height * 0.03);
    
    ctx.fillStyle = '#444';
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height * 0.9, 25, Math.PI, 0); 
    ctx.fill();
    ctx.fillStyle = '#777';
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height * 0.9, 15, Math.PI, 0); 
    ctx.fill();

    if (gameState === 'playing') {
        [...ships, ...explosions, ...particles, ...missiles, ...chickpeas].forEach(e => e.draw(ctx));
    }
}

function gameLoop(timestamp) {
    let dt = timestamp - lastTime;
    lastTime = timestamp;
    if (dt > 100) dt = 16; 
    update(dt);
    draw();
    gameLoopId = requestAnimationFrame(gameLoop);
}

function startGame() {
    initGame();
    gameState = 'playing';
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    lastTime = performance.now();
    cancelAnimationFrame(gameLoopId);
    gameLoopId = requestAnimationFrame(gameLoop);
}

function gameOver() {
    gameState = 'gameover';
    finalScoreEl.innerText = score;
    gameOverScreen.classList.remove('hidden');
}

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);

canvas.addEventListener('mousedown', (e) => handleInput(e.clientX, e.clientY));
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if(e.touches.length > 0) handleInput(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });

function handleInput(clientX, clientY) {
    if (gameState !== 'playing') return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;   
    const scaleY = canvas.height / rect.height;  
    
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    
    const startX = canvas.width / 2;
    const startY = canvas.height * 0.9;
    
    if (y > canvas.height * 0.8) return;
    
    chickpeas.push(new Chickpea(startX, startY, x, y));
}

draw();
