const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const finalScoreEl = document.getElementById('final-score');
const highScoreEl = document.getElementById('high-score');
const gameOverHighScoreEl = document.getElementById('game-over-high-score');

let gameState = 'start';
let gameLoopId;
let lastTime = 0;
let score = 0;
let lives = 5;
let gameOverTimeout = null;
let shotTimer = 0;
let audioCtx = null;
let currentNoteIndex = 0;
let noteTimer = 0;

const musicSequence = [
    { f: 261, d: 200 }, { f: 329, d: 200 }, { f: 392, d: 200 }, { f: 523, d: 400 },
    { f: 392, d: 200 }, { f: 329, d: 200 }, { f: 261, d: 400 },
    { f: 293, d: 200 }, { f: 349, d: 200 }, { f: 440, d: 200 }, { f: 587, d: 400 },
    { f: 440, d: 200 }, { f: 349, d: 200 }, { f: 293, d: 400 }
];

function playNote(freq, dur) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square'; // Classic retro beeper sound
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur/1000);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + dur/1000);
}

let highScore = parseInt(localStorage.getItem('hummus_highscore')) || 0;
let newHighScoreTriggered = false;
let highScoreTextTimer = 0;
let currentHighScoreJoke = "";
const highScoreJokes = [
    "A TRUE HUMMUS HERO!",
    "FALAFEL-TASTIC!",
    "PURE GOLDEN TAHINI!",
    "PITA PERFECTION!",
    "SWEET CHICKPEA GLORY!",
    "THE SULTAN OF DIP!"
];

if (highScoreEl) highScoreEl.innerText = highScore;
if (gameOverHighScoreEl) gameOverHighScoreEl.innerText = highScore;

let layout = { waterTop: 0, waterHeight: 0, waterBottom: 0, launcherY: 0 };

// Prevent layout jumping
function resizeCanvas() {
    const container = document.getElementById('game-container');
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    
    layout.waterHeight = Math.min(600, canvas.height - 100);
    layout.waterTop = (canvas.height - layout.waterHeight) / 2;
    layout.waterBottom = layout.waterTop + layout.waterHeight;
    layout.launcherY = layout.waterBottom + 40;
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
        this.y = layout.waterTop + 20 + Math.random() * (layout.waterHeight - 60);
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
        this.sinking = false;
        this.sinkRotation = 0;
        this.vy = 0;
    }
    
    update(dt) {
        if (this.sinking) {
            this.sinkRotation += (dt / 100) * this.direction;
            this.vy += (dt / 1000) * 400; // Gravity
            this.x += this.speed * (dt / 1000);
            this.y += this.vy * (dt / 1000);
            
            // emit some smoke/fire
            if (Math.random() > 0.5) particles.push(new Particle(this.x + this.w/2, this.y + this.h/2, (Math.random()-0.5)*50, -Math.random()*50, '#888', 4, 0.8));
            
            if (this.y > canvas.height + 100) {
                this.markedForDeletion = true;
            }
            return;
        }

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
        ctx.save();
        if (this.sinking) {
            ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
            ctx.rotate(this.sinkRotation);
            ctx.translate(-(this.x + this.w / 2), -(this.y + this.h / 2));
        }

        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.w, this.h);
        
        // Darken hull bottom
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(this.x, this.y + this.h * 0.7, this.w, this.h * 0.3);

        ctx.fillStyle = '#666';
        ctx.fillRect(this.x + this.w * 0.4, this.y - this.h * 0.6, this.w * 0.2, this.h * 0.6);

        // HP bar if damaged
        if(!this.sinking && this.hp < this.maxHp) {
            ctx.fillStyle = '#f00';
            ctx.fillRect(this.x, this.y + this.h - Math.max(3, this.h * 0.25), this.w, Math.max(3, this.h * 0.25));
            ctx.fillStyle = '#0f0';
            ctx.fillRect(this.x, this.y + this.h - Math.max(3, this.h * 0.25), this.w * (this.hp / this.maxHp), Math.max(3, this.h * 0.25));
        }
        
        ctx.restore();
        
        // Draw Betrayal text NOT rotated
        if (this.sinking) {
            ctx.fillStyle = '#ff0000';
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(this.betrayalMessage || "WHY?!", this.x + this.w / 2, this.y - 20);
        }
    }

    friendlyFireSink() {
        if (this.sinking) return;
        this.sinking = true;
        this.speed = this.speed * 0.5; 
        this.vy = -150; // Bounce up
        
        const betrayalTexts = ["MY PITA!", "HUMMUS DOWN!", "FRIED!", "WHY, CHEF?!", "SOGGY FALAFEL!", "TAHINI TEARS!"];
        this.betrayalMessage = betrayalTexts[Math.floor(Math.random() * betrayalTexts.length)];
        
        lives -= 1;
        updateUI();
        if (lives <= 0) gameOverTimeout = setTimeout(() => { if (gameState === 'playing') gameOver() }, 1500);
    }
}

class Missile {
    constructor() {
        this.x = Math.random() * canvas.width;
        this.y = -20;
        this.targetX = Math.random() * canvas.width;
        this.targetY = layout.waterBottom; 
        
        // Starts at 60, gains 5 speed for every ship saved/point threshold
        this.speed = 60 + (score * 0.5); 
        
        const angle = Math.atan2(this.targetY - this.y, this.targetX - this.x);
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;
        this.markedForDeletion = false;
    }
    
    update(dt) {
        this.x += this.vx * (dt / 1000);
        this.y += this.vy * (dt / 1000);
        
        particles.push(new Particle(this.x, this.y, 0, -20, '#ff4400', 2, 0.4));
        
        if (this.y > layout.waterBottom + 20) {
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
        this.vy += 300 * (dt / 1000); // Gravity for everything!
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
    
    if (score > highScore) {
        if (highScore > 0 && !newHighScoreTriggered) {
            newHighScoreTriggered = true;
            highScoreTextTimer = 4.0;
            currentHighScoreJoke = highScoreJokes[Math.floor(Math.random() * highScoreJokes.length)];
            // Confetti time!
            for (let i = 0; i < 150; i++) {
                particles.push(new Particle(
                    canvas.width / 2,
                    canvas.height,
                    (Math.random() - 0.5) * 800,
                    -400 - Math.random() * 600,
                    `hsl(${Math.random() * 360}, 100%, 50%)`,
                    Math.random() * 6 + 4,
                    3.0
                ));
            }
        }
        highScore = score;
        localStorage.setItem('hummus_highscore', highScore);
        if (highScoreEl) highScoreEl.innerText = highScore;
    }
}

function initGame() {
    score = 0;
    lives = 5;
    newHighScoreTriggered = false;
    highScoreTextTimer = 0;
    if (gameOverTimeout) clearTimeout(gameOverTimeout);
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
    explosions.forEach(e => {
        ships.forEach(s => {
            if (e.markedForDeletion || s.markedForDeletion || s.sinking) return;
            const closestX = Math.max(s.x, Math.min(e.x, s.x + s.w));
            const closestY = Math.max(s.y, Math.min(e.y, s.y + s.h));
            const distanceX = e.x - closestX;
            const distanceY = e.y - closestY;
            const distanceSquared = (distanceX * distanceX) + (distanceY * distanceY);
            if (distanceSquared < (e.radius * e.radius)) {
                s.friendlyFireSink();
            }
        });
    });

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
            if (m.markedForDeletion || s.markedForDeletion || s.sinking) return;
            if (m.x > s.x && m.x < s.x + s.w && m.y > s.y && m.y < s.y + s.h) {
                m.markedForDeletion = true;
                s.hp -= 1;
                
                for(let i=0; i<10; i++) particles.push(new Particle(m.x, m.y, (Math.random()-0.5)*100, (Math.random()-0.5)*100, '#f00', 3, 0.8));
                
                if (s.hp <= 0) {
                    s.markedForDeletion = true;
                    lives -= 1;
                    updateUI();
                    for(let i=0; i<30; i++) particles.push(new Particle(s.x + s.w/2, s.y + s.h/2, (Math.random()-0.5)*200, -Math.random()*150, '#ffa500', Math.random()*5+2, 1.2));
                    
                    if (lives <= 0) gameOverTimeout = setTimeout(() => { if (gameState === 'playing') gameOver() }, 1500);
                }
            }
        });
    });
}

function update(dt) {
    if (gameState !== 'playing') return;
    
    spawnTimers.ship -= dt;
    spawnTimers.missile -= dt;
    if (shotTimer > 0) shotTimer -= dt;
    
    if (spawnTimers.ship <= 0) {
        ships.push(new Ship());
        spawnTimers.ship = 1500 + Math.random() * 2500;
    }
    
    if (spawnTimers.missile <= 0) {
        missiles.push(new Missile());
        spawnTimers.missile = 1000; // One missile per second
    }
    
    if (highScoreTextTimer > 0) {
        highScoreTextTimer -= dt / 1000;
    }
    
    // Play comedy Beeper music
    noteTimer -= dt;
    if (noteTimer <= 0) {
        const note = musicSequence[currentNoteIndex];
        playNote(note.f, note.d);
        noteTimer = note.d + 50; 
        currentNoteIndex = (currentNoteIndex + 1) % musicSequence.length;
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
    ctx.fillRect(0, 0, canvas.width, layout.waterTop);
    ctx.fillStyle = '#5c2e0b';
    ctx.fillRect(0, layout.waterTop - Math.min(10, layout.waterTop), canvas.width, Math.min(10, layout.waterTop));
    
    ctx.fillStyle = '#005588';
    ctx.fillRect(0, layout.waterTop, canvas.width, layout.waterHeight);
    ctx.fillStyle = '#0066aa';
    for(let i=0; i<6; i++) {
        ctx.fillRect(0, layout.waterTop + (i/6)*layout.waterHeight + 10, canvas.width, 2);
    }

    ctx.fillStyle = '#8B4513';
    ctx.fillRect(0, layout.waterBottom, canvas.width, canvas.height - layout.waterBottom);
    ctx.fillStyle = '#5c2e0b';
    ctx.fillRect(0, layout.waterBottom, canvas.width, 10);
    
    ctx.fillStyle = '#444';
    ctx.beginPath();
    ctx.arc(canvas.width / 2, layout.launcherY, 25, Math.PI, 0); 
    ctx.fill();
    ctx.fillStyle = '#777';
    ctx.beginPath();
    ctx.arc(canvas.width / 2, layout.launcherY, 15, Math.PI, 0); 
    ctx.fill();

    if (gameState === 'playing') {
        [...ships, ...explosions, ...particles, ...missiles, ...chickpeas].forEach(e => e.draw(ctx));
    }
    
    // Draw funny high score popup
    if (highScoreTextTimer > 0) {
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 3);
        
        const bounce = Math.abs(Math.sin(highScoreTextTimer * 10)) * 20;
        const rot = Math.sin(highScoreTextTimer * 5) * 0.2;
        ctx.translate(0, -bounce);
        ctx.rotate(rot);
        
        const size = 30 + Math.abs(Math.sin(highScoreTextTimer * 8)) * 10;
        ctx.font = `bold ${size}px 'Press Start 2P', sans-serif`;
        ctx.textAlign = 'center';
        
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 6;
        ctx.strokeText("NEW HIGH SCORE!", 0, 0);
        ctx.fillStyle = `hsl(${highScoreTextTimer * 360}, 100%, 50%)`;
        ctx.fillText("NEW HIGH SCORE!", 0, 0);
        
        ctx.font = "bold 20px 'Press Start 2P', sans-serif";
        ctx.strokeText(currentHighScoreJoke, 0, 50);
        ctx.fillStyle = '#fff';
        ctx.fillText(currentHighScoreJoke, 0, 50);
        
        ctx.restore();
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
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } else if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
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
    if (gameOverHighScoreEl) gameOverHighScoreEl.innerText = highScore;
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
    const startY = layout.launcherY;
    
    if (y > layout.waterBottom || shotTimer > 0) return;
    
    shotTimer = 1000; // Limit to one shot per second
    chickpeas.push(new Chickpea(startX, startY, x, y));
}

draw();
