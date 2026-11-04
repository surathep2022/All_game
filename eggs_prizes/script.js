const firebaseConfig = {
    apiKey: "AIzaSyADzVirlflWjw7ux1i8fRNFUNSBT139-6I",
    authDomain: "slot-machine-ff297.firebaseapp.com",
    databaseURL: "https://slot-machine-ff297-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "slot-machine-ff297",
    storageBucket: "slot-machine-ff297.firebasestorage.app",
    messagingSenderId: "196859530049",
    appId: "1:196859530049:web:09ba13fa577fd5fbe1efc0"
};

if (firebase && firebase.apps && firebase.apps.length === 0) {
    firebase.initializeApp(firebaseConfig);
}

const db = firebase.database();
let dbQueue = [];
let dbStock = {};
let dbTotalSpins = 0;
let resolveFirebaseStateReady;
let firebaseStateLoadError = null;
let prizeOrdersLoadError = null;
const firebaseStateReady = new Promise((resolve) => {
    resolveFirebaseStateReady = resolve;
});
let prizes = [];
let prizeOrders = {};
let sponsors = [];
let stockList = [];

function normalizeQueue(queueData) {
    if (Array.isArray(queueData)) {
        return queueData
            .map((item) => (typeof item === 'object' && item !== null && item.name ? item.name : String(item || '')))
            .filter(Boolean);
    }

    if (queueData && typeof queueData === 'object') {
        return Object.keys(queueData)
            .map((key) => {
                const item = queueData[key];
                return typeof item === 'object' && item !== null && item.name ? item.name : String(item || '');
            })
            .filter(Boolean);
    }

    return [];
}

function getCurrentPlayerName() {
    const uniqueQueue = [...new Set(dbQueue)];
    return uniqueQueue[0] || 'ลงทะเบียนลุ้นรางวัล'; // Return the first unique name or a default message
}

function removeCurrentPlayerFromQueue() {
    if (!dbQueue.length) return;

    const nextQueue = [...new Set(dbQueue.slice(1))];
    const queueObject = {};
    nextQueue.forEach((name, index) => {
        queueObject[index] = {
            name,
            status: 'waiting',
            timestamp: Date.now(),
        };
    });

    db.ref('customerQueue').set(queueObject).catch((error) => {
        console.error('ไม่สามารถอัปเดตคิวผู้เล่นได้:', error);
    });
}

function updateCurrentPlayerBadge() {
    const badge = document.getElementById('player-name-display');
    if (!badge) return;

    // ดึงชื่อผู้เล่น แล้วนำมาผ่านฟังก์ชัน formatDisplayName ก่อนแสดงผล
    const rawName = getCurrentPlayerName();
    badge.textContent = formatDisplayName(rawName);
}

function formatDisplayName(fullName) {
    // 1. เช็กค่าว่าง หรือไม่ใช่ string
    if (!fullName || typeof fullName !== 'string') return "ไม่ระบุชื่อ";

    // 2. ตัดช่องว่างหน้า-หลัง และใช้ regex Split ด้วย \s+ เพื่อป้องกันช่องว่างติดกันหลายตัว
    const cleanName = fullName.trim();
    if (!cleanName) return "ไม่ระบุชื่อ";

    let firstName = cleanName.split(/\s+/)[0];

    // 3. ถ้ายาวเกิน 10 ตัวอักษร ให้ตัดเหลือ 10 แล้วต่อด้วย xxxxxx
    if (firstName.length > 10) {
        firstName = firstName.substring(0, 10) + "xxxxxx";
    }

    return firstName;
}

// ฟังก์ชันสำหรับดึงข้อมูลรางวัลจากฐานข้อมูล
async function loadPrizesFromDatabase() {
    try {
        const response = await fetch('/api/prizes');
        if (!response.ok) {
            throw new Error(`โหลดรายการรางวัลไม่สำเร็จ (${response.status})`);
        }
        const result = await response.json();

        if (result.success && result.data) {
            // กรองเอาเฉพาะรายการที่ status เป็น 'on' มาเก็บไว้
            let availablePrizesList = result.data
                .filter(item => item.status === 'on')
                .map(item => ({
                    ...item,
                    name: item.product_name,
                    image: item.image_path,
                }));
            prizes = availablePrizesList;
            //console.log("โหลดและกรองรายการรางวัลสำเร็จ:", prizes);                
        } else {
            console.error('ไม่สามารถโหลดข้อมูลรางวัลได้', result);
        }
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการเชื่อมต่อ API:', error);
    }
}

const prizesReady = loadPrizesFromDatabase();

async function loadprize_orders() {
    try {
        const response = await fetch('/api/prize-orders');
        if (!response.ok) {
            throw new Error(`โหลดลำดับรางวัลไม่สำเร็จ (${response.status})`);
        }

        const result = await response.json();

        if (!result.success || !result.data || typeof result.data !== 'object') {
            throw new Error(result.message || 'รูปแบบข้อมูลลำดับรางวัลไม่ถูกต้อง');
        }

        prizeOrders = result.data;
        prizeOrdersLoadError = null;
        return prizeOrders;
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการเชื่อมต่อ API:', error);
        prizeOrdersLoadError = error;
        prizeOrders = {};
        return prizeOrders;
    }

}

// const prizeOrdersReady = loadprize_orders();
// prizeOrdersReady.then(() => console.log(prizeOrders))

async function loadsponsorsFromDatabase() {
    try {
        const response = await fetch('/api/sponsors/inactive');
        const result = await response.json();

        //console.log("ข้อมูลที่ได้จาก API:", result);

        // เช็คว่าสำเร็จและมีข้อมูลส่งมาไหม
        if (result.success && result.data) {
            let availableSponsorsList = result.data.map(item => ({
                id: item.id,
                sponsor_code: item.sponsor_code,
                sponsor_name: item.sponsor_name,
                image_path: item.image_path,
                status: item.status
            }));

            //console.log("รายการผู้สนับสนุนที่แปลงแล้ว:", availableSponsorsList);

            // นำตัวแปร availableSponsorsList ไปใช้งานต่อ เช่น แสดงผลบนหน้าจอ
            return availableSponsorsList;
        } else {
            console.error('ไม่พบข้อมูลผู้สนับสนุน');
            return [];
        }
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการดึงข้อมูล:', error);
        return [];
    }
}

async function sponsors_stock() {
    try {
        const response = await fetch('/api/sponsor-ratios');
        const result = await response.json();

        if (result.success && Array.isArray(result.data)) {
            return result.data.map(item => ({
                code: item.sponsor_code,
                quantity: Number(item.quantity)
            }));

        } else {
            throw new Error(result.message || 'ไม่สามารถโหลดข้อมูลสัดส่วนผู้สนับสนุนได้');
        }

    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการเชื่อมต่อ:', error);
        return [];
    }
}

const sponsorDataReady = Promise.all([
    loadsponsorsFromDatabase(),
    sponsors_stock(),
]).then(([loadedSponsors, loadedStock]) => {
    sponsors = loadedSponsors;
    stockList = loadedStock;
});

async function drawSpecialSponsor() {
    const template = stockList
        .filter(({ code, quantity }) =>
            sponsors.some(item => item.sponsor_code === code) &&
            Number.isInteger(quantity) &&
            quantity > 0
        )
        .sort((a, b) => a.code.localeCompare(b.code));
    const totalQuantity = template.reduce((total, item) => total + item.quantity, 0);

    if (totalQuantity !== 100) {
        console.error(`สัดส่วนผู้สนับสนุนต้องรวมเป็น 100 (ปัจจุบัน ${totalQuantity})`);
        return null;
    }

    const completedSpins = Number(dbTotalSpins) || 0;
    const cycle = Math.floor(completedSpins / 100);
    const drawIndex = completedSpins % 100;
    const signature = JSON.stringify(template);
    const initialPool = template.flatMap(({ code, quantity }) => Array(quantity).fill(code));
    const cycleRef = db.ref(`sponsorDrawCycles/${cycle}`);

    try {
        const transaction = await cycleRef.transaction(current => {
            let picks = current?.signature === signature && Array.isArray(current.picks)
                ? [...current.picks]
                : [];
            let remainingPool = [...initialPool];

            for (const code of picks) {
                const poolIndex = remainingPool.indexOf(code);
                if (poolIndex === -1) {
                    picks = [];
                    remainingPool = [...initialPool];
                    break;
                }
                remainingPool.splice(poolIndex, 1);
            }

            while (picks.length <= drawIndex) {
                const randomIndex = Math.floor(Math.random() * remainingPool.length);
                picks.push(remainingPool.splice(randomIndex, 1)[0]);
            }

            return { signature, picks };
        });

        if (!transaction.committed) {
            throw new Error('ไม่สามารถบันทึกลำดับการสุ่มผู้สนับสนุนได้');
        }

        const sponsorCode = transaction.snapshot.val()?.picks?.[drawIndex];
        return sponsors.find(item => item.sponsor_code === sponsorCode) || null;
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการสุ่มผู้สนับสนุน:', error);
        return null;
    }
}

function getOrderedPrizeForTurn() {
    const slotKey = String((Number(dbTotalSpins) % 100) + 1);
    const orderedPrize = prizeOrders[slotKey];
    if (!orderedPrize?.product_name || !orderedPrize?.image_path) {
        return {
            created_at: "2026-10-22T03:14:34.000Z",
            id: 4,
            image: "/img/prize-G8OO9V.png",
            image_path: "/img/prize-G8OO9V.png",
            name: "กระเป๋าช้อปปิ้ง",
            product_code: "G8OO9V",
            product_name: "กระเป๋าช้อปปิ้ง",
            status: "on",
        };
    }

    return {
        ...orderedPrize,
        name: orderedPrize.product_name,
        image: orderedPrize.image_path,
    };
}

    (() => {
        "use strict";

        /* ============ ตั้งค่าเกม (แก้ไขได้) ============ */
        const GAME_SECONDS = 15; // เวลาเล่น (วินาที)
        const GUEST_NAME = ""; // ชื่อผู้เล่นที่เชิญ ปล่อยว่างไว้จะแสดงเป็นเส้นประให้เขียนชื่อเอง
        const PRIZES = [
            // รายการของรางวัล weight = โอกาสที่จะได้ (ยิ่งมากยิ่งออกบ่อย)
            {
                name: "บัตรกำนัล 500 บาท",
                icon: "ticket",
                color: "#f7c948",
                weight: 3,
            },
            {
                name: "กล่องของขวัญพิเศษ",
                icon: "gift",
                color: "#e2574c",
                weight: 3,
            },
            {
                name: "ถ้วยรางวัลชนะเลิศ",
                icon: "trophy",
                color: "#f7c948",
                weight: 1,
            },
            { name: "เหรียญทองนำโชค", icon: "coin", color: "#f7c948", weight: 2 },
        ];

        /* ============ ค่าคงที่ ============ */
        const W = 1080,
            H = 1920;
        const TC = { x: 540, y: 1030 }; // จุดกลางของถัง
        const R_RIM = 470,
            R_WATER = 420;
        const HOME_Y = 1700,
            PEAK_Y = 1010; // ตำแหน่งวงตักตอนพัก / ตอนยื่นสุด
        const RING_R = 100,
            CATCH_R = 80;
        const X_MIN = 170,
            X_MAX = 910;
        const EC = { x: 540, y: 880 }; // จุดกลางฉากเปิดไข่
        const EGG_RX = 150,
            EGG_RY = 200;
        const SH0 = 0.5,
            BURST = 3.4; // เวลาเริ่มสั่น / ไข่แตก (วินาที)
        const FONT_D = "'Kanit','Noto Sans Thai',Tahoma,sans-serif";
        const FONT_B = "'Sarabun','Noto Sans Thai',Tahoma,sans-serif";
        const REDUCED =
            window.matchMedia &&
            matchMedia("(prefers-reduced-motion: reduce)").matches;

        const cv = document.getElementById("game");
        const ctx = cv.getContext("2d");
        cv.width = W;
        cv.height = H;

        /* ============ ตัวช่วย ============ */
        const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
        const lerp = (a, b, t) => a + (b - a) * t;
        const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
        const easeInCubic = (t) => t * t * t;
        const easeInOutCubic = (t) =>
            t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        const easeOutBack = (t) => {
            const c1 = 1.70158,
                c3 = c1 + 1;
            return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
        };
        const smooth = (t) => t * t * (3 - 2 * t);

        function rr(c, x, y, w, h, r) {
            c.beginPath();
            c.moveTo(x + r, y);
            c.arcTo(x + w, y, x + w, y + h, r);
            c.arcTo(x + w, y + h, x, y + h, r);
            c.arcTo(x, y + h, x, y, r);
            c.arcTo(x, y, x + w, y, r);
            c.closePath();
        }

        // รูปทรงไข่ (ปลายแหลมอยู่ด้านบน ป้านด้านล่าง) วาดรอบจุด 0,0
        function eggPath(c, rx, ry) {
            c.beginPath();
            c.moveTo(0, -ry);
            c.bezierCurveTo(rx * 0.62, -ry, rx, -ry * 0.25, rx, ry * 0.3);
            c.bezierCurveTo(rx, ry * 0.78, rx * 0.55, ry, 0, ry);
            c.bezierCurveTo(-rx * 0.55, ry, -rx, ry * 0.78, -rx, ry * 0.3);
            c.bezierCurveTo(-rx, -ry * 0.25, -rx * 0.62, -ry, 0, -ry);
            c.closePath();
        }

        function eggFill(c, rx, ry, skin) {
            if (skin.rainbow) {
                const rg = c.createLinearGradient(-rx, -ry, rx, ry);
                [
                    "#ff4d6d",
                    "#ff9f1c",
                    "#ffe14d",
                    "#3ddc84",
                    "#35b6ff",
                    "#8b5cf6",
                    "#ff4d6d",
                ].forEach((col, i, arr) =>
                    rg.addColorStop(i / (arr.length - 1), col),
                );
                c.fillStyle = rg;
                return;
            }
            const g = c.createRadialGradient(
                -rx * 0.35,
                -ry * 0.4,
                rx * 0.1,
                0,
                0,
                ry * 1.15,
            );
            g.addColorStop(0, skin.a);
            g.addColorStop(0.6, skin.b);
            g.addColorStop(1, skin.c);
            c.fillStyle = g;
        }

        function goldGrad(c, y0, y1) {
            const g = c.createLinearGradient(0, y0, 0, y1);
            g.addColorStop(0, "#fff2b0");
            g.addColorStop(0.5, "#f7c948");
            g.addColorStop(1, "#c88a1c");
            return g;
        }

        function text(s, x, y, size, weight, fill, o = {}) {
            const {
                family = FONT_D,
                align = "center",
                stroke = null,
                sw = 8,
                alpha = 1,
                base = "middle",
            } = o;
            ctx.save();
            ctx.globalAlpha *= alpha;
            ctx.font = `${weight} ${size}px ${family}`;
            ctx.textAlign = align;
            ctx.textBaseline = base;
            if (stroke) {
                ctx.lineJoin = "round";
                ctx.lineWidth = sw;
                ctx.strokeStyle = stroke;
                ctx.strokeText(s, x, y);
            }
            ctx.fillStyle = fill;
            ctx.fillText(s, x, y);
            ctx.restore();
        }

        function fitSize(s, maxW, start, min, weight, family) {
            let size = start;
            ctx.font = `${weight} ${size}px ${family}`;
            while (ctx.measureText(s).width > maxW && size > min) {
                size -= 4;
                ctx.font = `${weight} ${size}px ${family}`;
            }
            return size;
        }

        /* ============ เสียง ============ */
        let AC = null,
            muted = false;
        function ac() {
            try {
                if (!AC)
                    AC = new (window.AudioContext || window.webkitAudioContext)();
                if (AC && AC.state === "suspended") AC.resume();
            } catch (e) {
                AC = null;
            }
            return AC;
        }
        function tone(
            f,
            d = 0.12,
            type = "sine",
            v = 0.1,
            slide = 0,
            delay = 0,
        ) {
            if (muted) return;
            try {
                const a = ac();
                if (!a) return;
                const t0 = a.currentTime + delay;
                const o = a.createOscillator(),
                    g = a.createGain();
                o.type = type;
                o.frequency.setValueAtTime(f, t0);
                if (slide)
                    o.frequency.exponentialRampToValueAtTime(
                        Math.max(30, f + slide),
                        t0 + d,
                    );
                g.gain.setValueAtTime(v, t0);
                g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
                o.connect(g);
                g.connect(a.destination);
                o.start(t0);
                o.stop(t0 + d + 0.02);
            } catch (e) {
                /* ignore */
            }
        }
        function noise(d = 0.12, v = 0.12, delay = 0) {
            if (muted) return;
            try {
                const a = ac();
                if (!a) return;
                const n = Math.floor(a.sampleRate * d);
                const buf = a.createBuffer(1, n, a.sampleRate);
                const data = buf.getChannelData(0);
                for (let i = 0; i < n; i++)
                    data[i] = (Math.random() * 2 - 1) * (1 - i / n);
                const src = a.createBufferSource(),
                    g = a.createGain();
                src.buffer = buf;
                g.gain.value = v;
                src.connect(g);
                g.connect(a.destination);
                src.start(a.currentTime + delay);
            } catch (e) {
                /* ignore */
            }
        }
        const sfx = {
            start() {
                tone(523, 0.12, "triangle", 0.1);
                tone(784, 0.18, "triangle", 0.1, 0, 0.1);
            },
            out() {
                tone(220, 0.3, "triangle", 0.08, 420);
            },
            miss() {
                tone(200, 0.25, "sawtooth", 0.06, -90);
            },
            catch() {
                tone(587, 0.12, "triangle", 0.11);
                tone(740, 0.12, "triangle", 0.11, 0, 0.1);
                tone(988, 0.2, "triangle", 0.11, 0, 0.2);
            },
            tick(last) {
                tone(last ? 1100 : 820, 0.08, "square", 0.05);
            },
            timeout() {
                tone(392, 0.25, "triangle", 0.1, -60);
                tone(294, 0.45, "triangle", 0.1, -80, 0.22);
            },
            shake() {
                tone(140, 0.06, "square", 0.05);
            },
            crack() {
                noise(0.09, 0.2);
                tone(900, 0.05, "square", 0.04);
            },
            burst() {
                noise(0.35, 0.22);
                [523, 659, 784, 1047, 1319].forEach((f, i) =>
                    tone(f, 0.35, "triangle", 0.11, 0, i * 0.09),
                );
            },
        };

        /* ============ สถานะเกม ============ */
        let state = "idle"; // idle | play | timeout | transition | reveal
        let time = 0; // เวลารวมของแอนิเมชัน
        let timeLeft = GAME_SECONDS;
        let lastSec = -1;
        let toT = 0; // เวลาที่อยู่ในหน้าหมดเวลา
        let autoDone = false; // ตักอัตโนมัติตอนหมดเวลาไปแล้วหรือยัง
        let eggs = [];
        let ripples = [];
        let msgs = [];
        let tr = null; // ข้อมูลฉากเปลี่ยน
        let rv = null; // ข้อมูลฉากเปิดไข่
        let pointerX = null;
        let startingGame = false;
        let roundPlayerName = "";
        let gameStatus = "";
        const keys = { left: false, right: false };

        const L = {
            x: 540,
            vx: 0,
            y: HOME_Y,
            phase: "rest",
            pt: 0,
            caught: null,
        };

        // ไข่ลอยเป็น 3 วง วงละหลายฟอง
        const LANES = [
            { r: 120, v: 70, dir: 1, n: 3 },
            { r: 235, v: 90, dir: -1, n: 4 },
            { r: 350, v: 105, dir: 1, n: 5 },
        ];
        // สีไข่: ทอง เงิน เขียวมรกต รุ้ง แดง ชมพู ส้ม ม่วง น้ำเงิน ฟ้า เนื้อ
        const SKINS = [
            { name: "ทอง", a: "#fff3b0", b: "#f2c230", c: "#a8740f" },
            { name: "เงิน", a: "#ffffff", b: "#cfd6de", c: "#7d8794" },
            { name: "เขียวมรกต", a: "#9af5c2", b: "#1fbf7a", c: "#0b6b45" },
            {
                name: "รุ้ง",
                rainbow: true,
                a: "#ffd0e0",
                b: "#c9e8ff",
                c: "#7a63d9",
            },
            { name: "แดง", a: "#ff9a9a", b: "#e02d3a", c: "#8f1020" },
            { name: "ชมพู", a: "#ffd0e6", b: "#ff7fb5", c: "#c93d82" },
            { name: "ส้ม", a: "#ffd09a", b: "#ff9024", c: "#c25a08" },
            { name: "ม่วง", a: "#e0c2ff", b: "#9b5de5", c: "#5a2a9c" },
            { name: "น้ำเงิน", a: "#a9b8ff", b: "#2f4fd8", c: "#14247a" },
            { name: "ฟ้า", a: "#d4f3ff", b: "#58c4f2", c: "#1b83b8" },
            { name: "เนื้อ", a: "#ffe6d2", b: "#f0b996", c: "#b57a58" },
        ];

        function makeEggs() {
            eggs = [];
            const total = LANES.reduce((s, ln) => s + ln.n, 0);
            // ใช้ครบทุกสี แล้วสุ่มสีเพิ่มให้ครบจำนวนไข่ จากนั้นสลับตำแหน่ง
            const pool = SKINS.slice();
            while (pool.length < total)
                pool.push(SKINS[Math.floor(Math.random() * SKINS.length)]);
            for (let i = pool.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [pool[i], pool[j]] = [pool[j], pool[i]];
            }
            let n = 0;
            LANES.forEach((ln, li) => {
                for (let i = 0; i < ln.n; i++) {
                    eggs.push({
                        lane: li,
                        th: (i / ln.n) * Math.PI * 2 + li * 0.7 + Math.random() * 0.3,
                        ph: Math.random() * 6.28,
                        skin: pool[n++],
                        x: TC.x,
                        y: TC.y,
                        rot: 0,
                    });
                }
            });
            updateEggs(0);
        }

        function updateEggs(dt) {
            for (const e of eggs) {
                const ln = LANES[e.lane];
                e.th += ln.dir * (ln.v / ln.r) * dt;
                const r = ln.r + 10 * Math.sin(time * 0.8 + e.ph);
                e.x = TC.x + r * Math.cos(e.th);
                e.y = TC.y + r * Math.sin(e.th);
                e.rot =
                    e.th +
                    (ln.dir < 0 ? Math.PI : 0) +
                    0.12 * Math.sin(time * 1.3 + e.ph);
            }
        }

        function resetLadle() {
            L.x = 540;
            L.vx = 0;
            L.y = HOME_Y;
            L.phase = "rest";
            L.pt = 0;
            L.caught = null;
        }

        function hasActivePlayer() {
            return [...new Set(dbQueue)].length > 0;
        }

        db.ref().on("value", (snapshot) => {
            const data = snapshot.val() || {};
            dbQueue = normalizeQueue(data.customerQueue || {});
            dbStock = data.currentStock || {};
            dbTotalSpins = data.totalSpins || 0;
            firebaseStateLoadError = null;
            updateCurrentPlayerBadge();
            if (state === "idle" && !startingGame) {
                gameStatus = "";
            }
            resolveFirebaseStateReady();
        }, (error) => {
            firebaseStateLoadError = error;
            gameStatus = "เชื่อมต่อฐานข้อมูลไม่สำเร็จ";
            console.error("ไม่สามารถโหลดสถานะเกมจาก Firebase ได้:", error);
            resolveFirebaseStateReady();
        });

        async function startGame() {
            if (state !== "idle" || startingGame) return;

            startingGame = true;
            gameStatus = "กำลังโหลดข้อมูลเกม...";
            try {
                await Promise.all([prizesReady, sponsorDataReady, firebaseStateReady]);
                if (firebaseStateLoadError) throw firebaseStateLoadError;
                await loadprize_orders();
                if (prizeOrdersLoadError) throw prizeOrdersLoadError;
                if (!prizes.length) {
                    throw new Error("ไม่พบรายการรางวัลที่เปิดใช้งาน");
                }
                if (!hasActivePlayer()) {
                    return;
                }

                roundPlayerName = getCurrentPlayerName();
                gameStatus = "";
                makeEggs();
                resetLadle();
                ripples = [];
                msgs = [];
                timeLeft = GAME_SECONDS;
                lastSec = GAME_SECONDS + 1;
                autoDone = false;
                state = "play";
                sfx.start();
            } catch (error) {
                console.error("ไม่สามารถเตรียมเกมได้:", error);
                gameStatus = "โหลดข้อมูลเกมไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ";
            } finally {
                startingGame = false;
            }
        }

        async function recordGameResult(reveal) {
            try {
                reveal.specialSponsor = await drawSpecialSponsor();
            } catch (error) {
                reveal.saveError = true;
                console.error("ไม่สามารถสุ่มรางวัลผู้สนับสนุนได้:", error);
            }

            try {
                if (reveal.prize.product_code) {
                    const stockResult = await db
                        .ref(`currentStock/${reveal.prize.name}`)
                        .transaction((current) => (current || 0) - 1);
                    if (!stockResult.committed) {
                        throw new Error("ไม่สามารถตัดสต็อกรางวัลได้");
                    }
                }

                const spinsResult = await db
                    .ref("totalSpins")
                    .transaction((count) => (count || 0) + 1);
                if (!spinsResult.committed) {
                    throw new Error("ไม่สามารถบันทึกจำนวนรอบได้");
                }
            } catch (error) {
                reveal.saveError = true;
                console.error("ไม่สามารถอัปเดตสต็อกหรือจำนวนรอบใน Firebase ได้:", error);
            }

            try {
                const now = new Date();
                const timestamp = now.toLocaleString("th-TH", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: false,
                });
                const response = await fetch("/api/game-history", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        orderNo: reveal.orderNo,
                        playerName: reveal.playerName,
                        prize: reveal.prize.name,
                        specialPrize: reveal.specialSponsor?.sponsor_name || "-",
                        datetime: timestamp,
                    }),
                });
                const result = await response.json();
                if (!response.ok || !result.success) {
                    throw new Error(result.message || `บันทึกประวัติไม่สำเร็จ (${response.status})`);
                }
            } catch (error) {
                reveal.saveError = true;
                console.error("เกิดข้อผิดพลาดในการบันทึกประวัติการเล่น:", error);
            } finally {
                reveal.resultReady = true;
            }
        }

        function goIdle() {
            if (state === "reveal" && rv?.playerName) {
                removeCurrentPlayerFromQueue();
            }
            makeEggs();
            resetLadle();
            ripples = [];
            msgs = [];
            timeLeft = GAME_SECONDS;
            tr = null;
            rv = null;
            state = "idle";
        }

        function startScoop() {
            L.phase = "out";
            L.pt = 0;
            sfx.out();
        }

        function pickPrize() {
            const availablePrizes = prizes.map((prize) => ({
                ...prize,
                name: prize.product_name,
                image: prize.image_path,
                weight: Number(prize.weight) > 0 ? Number(prize.weight) : 1,
            }));
            const pool = availablePrizes.length ? availablePrizes : PRIZES;
            const total = pool.reduce((s, p) => s + p.weight, 0);
            let r = Math.random() * total;
            for (const p of pool) {
                r -= p.weight;
                if (r <= 0) return p;
            }
            return pool[0];
        }

        function tryCatch() {
            let best = null,
                bd = 1e9;
            for (const e of eggs) {
                const d = Math.hypot(e.x - L.x, e.y - PEAK_Y);
                if (d < bd) {
                    best = e;
                    bd = d;
                } // ตักไข่ฟองที่ใกล้ที่สุดเสมอ ไม่มีพลาด
            }
            return best;
        }

        function startTransition() {
            state = "transition";
            tr = { t: 0, fromX: L.x, fromY: L.y, skin: L.caught.skin };
            sfx.catch();
        }

        function startReveal() {
            state = "reveal";
            rv = {
                t: 0,
                prize: getOrderedPrizeForTurn() || pickPrize(),
                playerName: roundPlayerName || getCurrentPlayerName(),
                orderNo: (Number(dbTotalSpins) || 0) + 1,
                skin: tr.skin,
                cracks: makeCracks(),
                crackSeen: 0,
                burst: false,
                wave2: false,
                confetti: [],
                prevSign: 1,
                resultReady: false,
                saveError: false,
                specialSponsor: null,
            };
            recordGameResult(rv).catch((error) => {
                rv.saveError = true;
                rv.resultReady = true;
                console.error("ไม่สามารถบันทึกผลเกมได้:", error);
            });
        }

        function makeCracks() {
            const arr = [];
            for (let i = 0; i < 8; i++) {
                const ang = (i / 8) * Math.PI * 2 + Math.random() * 0.5;
                let x = Math.cos(ang) * Math.random() * 40;
                let y = -30 + Math.sin(ang) * Math.random() * 70;
                const pts = [[x, y]];
                let a = ang + (Math.random() - 0.5);
                const n = 5 + Math.floor(Math.random() * 3);
                for (let k = 0; k < n; k++) {
                    a += (Math.random() - 0.5) * 1.3;
                    const l = 28 + Math.random() * 34;
                    x += Math.cos(a) * l;
                    y += Math.sin(a) * l;
                    pts.push([x, y]);
                }
                arr.push(pts);
            }
            return arr;
        }

        /* ============ อัปเดต ============ */
        function updateLadle(dt) {
            if (L.phase === "rest") {
                const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
                if (dir !== 0) {
                    pointerX = null;
                    L.vx += (dir * 820 - L.vx) * Math.min(1, dt * 10);
                } else if (pointerX != null) {
                    const d = clamp(pointerX, X_MIN, X_MAX) - L.x;
                    L.vx = clamp(d * 12, -1600, 1600);
                } else {
                    L.vx += (0 - L.vx) * Math.min(1, dt * 12);
                }
                L.x = clamp(L.x + L.vx * dt, X_MIN, X_MAX);
                L.y = HOME_Y;
                return;
            }

            L.vx = 0;
            L.pt += dt;
            if (L.phase === "out") {
                const p = clamp(L.pt / 0.38, 0, 1);
                L.y = lerp(HOME_Y, PEAK_Y, easeOutCubic(p));
                if (p >= 1) {
                    L.phase = "hold";
                    L.pt = 0;
                    ripples.push({ x: L.x, y: PEAK_Y, t: 0 });
                    const egg = tryCatch();
                    if (egg) {
                        eggs.splice(eggs.indexOf(egg), 1);
                        L.caught = {
                            skin: egg.skin,
                            fx: egg.x,
                            fy: egg.y,
                            frot: egg.rot,
                        };
                        msgs.push({
                            s: "ได้แล้ว!",
                            x: L.x,
                            y: PEAK_Y - 150,
                            t: 0,
                            c: "#ffe27a",
                        });
                        sfx.catch();
                    }
                }
            } else if (L.phase === "hold") {
                if (L.pt >= (L.caught ? 0.35 : 0.16)) {
                    L.phase = "back";
                    L.pt = 0;
                }
            } else if (L.phase === "back") {
                const dur = L.caught ? 0.75 : 0.5;
                const p = clamp(L.pt / dur, 0, 1);
                L.y = lerp(PEAK_Y, HOME_Y, easeInOutCubic(p));
                if (p >= 1) {
                    L.phase = "rest";
                    L.y = HOME_Y;
                    if (L.caught) startTransition();
                }
            }
        }

        function update(dt) {
            time += dt;
            updateEggs(dt);
            for (const r of ripples) r.t += dt;
            ripples = ripples.filter((r) => r.t < 1.3);
            for (const m of msgs) m.t += dt;
            msgs = msgs.filter((m) => m.t < 1.1);

            if (state === "idle") updateLadle(dt);

            if (state === "play") {
                if (!L.caught && timeLeft > 0) {
                    timeLeft -= dt;
                    const sec = Math.ceil(Math.max(0, timeLeft));
                    if (sec !== lastSec) {
                        lastSec = sec;
                        if (sec <= 5 && sec > 0) sfx.tick(sec === 1);
                    }
                }
                updateLadle(dt);
                if (
                    state === "play" &&
                    timeLeft <= 0 &&
                    L.phase === "rest" &&
                    !L.caught
                ) {
                    timeLeft = 0;
                    if (!autoDone) {
                        // หมดเวลา: ตักให้อัตโนมัติ ณ ตำแหน่งที่ไม้อยู่ตอนนั้น
                        autoDone = true;
                        msgs.push({
                            s: "หมดเวลา! ตักให้อัตโนมัติ",
                            x: 540,
                            y: 700,
                            t: 0,
                            c: "#ffd98a",
                        });
                        sfx.timeout();
                        startScoop();
                    } else {
                        state = "timeout";
                        toT = 0;
                    }
                }
            } else if (state === "timeout") {
                toT += dt;
            } else if (state === "transition") {
                tr.t += dt;
                if (tr.t >= 1.25) startReveal();
            } else if (state === "reveal") {
                updateReveal(dt);
            }
        }

        function updateReveal(dt) {
            rv.t += dt;
            const t = rv.t;

            // เสียงรอยร้าว
            const crackStarts = rv.cracks.map((_, i) => SH0 + 0.3 + i * 0.28);
            while (
                rv.crackSeen < crackStarts.length &&
                t >= crackStarts[rv.crackSeen]
            ) {
                sfx.crack();
                rv.crackSeen++;
            }

            // เสียงสั่น
            if (t > SH0 && t < BURST) {
                const p = clamp((t - SH0) / (BURST - SH0), 0, 1);
                const s = Math.sign(Math.sin(t * (12 + 20 * p)));
                if (s !== rv.prevSign) {
                    rv.prevSign = s;
                    if (s > 0) sfx.shake();
                }
            }

            if (!rv.burst && t >= BURST) {
                rv.burst = true;
                sfx.burst();
                for (let i = 0; i < 150; i++) {
                    const a = Math.random() * Math.PI * 2,
                        sp = 300 + Math.random() * 800;
                    rv.confetti.push(
                        newConfetti(
                            EC.x,
                            EC.y,
                            Math.cos(a) * sp,
                            Math.sin(a) * sp - 350,
                        ),
                    );
                }
            }
            if (!rv.wave2 && t >= BURST + 0.6) {
                rv.wave2 = true;
                for (let i = 0; i < 100; i++) {
                    rv.confetti.push(
                        newConfetti(
                            Math.random() * W,
                            -30 - Math.random() * 200,
                            (Math.random() - 0.5) * 120,
                            120 + Math.random() * 200,
                        ),
                    );
                }
            }
            for (const p of rv.confetti) {
                p.vy += 900 * dt;
                p.vx *= 1 - 0.6 * dt;
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.rot += p.vr * dt;
                p.t += dt;
            }
            rv.confetti = rv.confetti.filter((p) => p.y < H + 60 && p.t < 6);
            if (rv.resultReady && t > 30) {
                goIdle();
            }
        }

        const CONFETTI_COLORS = [
            "#ffd54a",
            "#ff6b5b",
            "#59d6c8",
            "#fff3c4",
            "#b58cff",
            "#ff9ed2",
        ];
        function newConfetti(x, y, vx, vy) {
            return {
                x,
                y,
                vx,
                vy,
                rot: Math.random() * 6.28,
                vr: (Math.random() - 0.5) * 14,
                w: 10 + Math.random() * 12,
                h: 6 + Math.random() * 6,
                t: 0,
                c: CONFETTI_COLORS[
                    Math.floor(Math.random() * CONFETTI_COLORS.length)
                ],
            };
        }

        /* ============ วาด: ฉากหลัง ============ */
        const bokeh = Array.from({ length: 26 }, (_, i) => ({
            x: Math.random() * W,
            y: Math.random() * H,
            r: 30 + Math.random() * 90,
            a: 0.04 + Math.random() * 0.07,
            ph: Math.random() * 6.28,
            warm: i % 3 !== 0,
        }));

        const clothPattern = (() => {
            const c = document.createElement("canvas");
            c.width = c.height = 180;
            const g = c.getContext("2d");
            g.fillStyle = "rgba(226,61,45,.10)";
            g.fillRect(0, 0, 90, 90);
            g.fillRect(90, 90, 90, 90);
            g.fillStyle = "rgba(255,255,255,.035)";
            g.fillRect(90, 0, 90, 90);
            g.fillRect(0, 90, 90, 90);
            return ctx.createPattern(c, "repeat");
        })();

        function drawBackground(t) {
            const g = ctx.createLinearGradient(0, 0, 0, H);
            g.addColorStop(0, "#1b1038");
            g.addColorStop(0.55, "#2a1448");
            g.addColorStop(1, "#120a22");
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = clothPattern;
            ctx.fillRect(0, 0, W, H);
            for (const b of bokeh) {
                const a = b.a * (0.7 + 0.3 * Math.sin(t * 0.6 + b.ph));
                const rg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
                rg.addColorStop(
                    0,
                    b.warm ? `rgba(255,190,90,${a})` : `rgba(120,200,255,${a * 0.7})`,
                );
                rg.addColorStop(1, "rgba(0,0,0,0)");
                ctx.fillStyle = rg;
                ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
            }
            const v = ctx.createRadialGradient(
                W / 2,
                H / 2,
                500,
                W / 2,
                H / 2,
                1250,
            );
            v.addColorStop(0, "rgba(0,0,0,0)");
            v.addColorStop(1, "rgba(0,0,0,.55)");
            ctx.fillStyle = v;
            ctx.fillRect(0, 0, W, H);
        }

        function drawLanterns(t) {
            const xs = [90, 315, 540, 765, 990];
            ctx.save();
            ctx.strokeStyle = "#47306e";
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(-20, 20);
            ctx.lineTo(xs[0], 24);
            for (let i = 0; i < xs.length - 1; i++) {
                ctx.quadraticCurveTo((xs[i] + xs[i + 1]) / 2, 58, xs[i + 1], 24);
            }
            ctx.lineTo(W + 20, 20);
            ctx.stroke();
            ctx.restore();

            xs.forEach((x, i) => {
                const lt = 30 + (i % 2) * 24;
                const cy = lt + 14 + 48;
                const ang = REDUCED ? 0 : Math.sin(t * 0.9 + i * 1.3) * 0.06;
                ctx.save();
                ctx.translate(x, 24);
                ctx.rotate(ang);
                ctx.translate(-x, -24);
                const glow = ctx.createRadialGradient(x, cy, 10, x, cy, 140);
                glow.addColorStop(0, "rgba(255,120,60,.38)");
                glow.addColorStop(1, "rgba(255,120,60,0)");
                ctx.fillStyle = glow;
                ctx.fillRect(x - 150, cy - 150, 300, 300);
                ctx.strokeStyle = "#47306e";
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(x, 24);
                ctx.lineTo(x, lt);
                ctx.stroke();
                ctx.fillStyle = "#d9a441";
                rr(ctx, x - 18, lt, 36, 14, 4);
                ctx.fill();
                const bg = ctx.createLinearGradient(x - 40, 0, x + 40, 0);
                bg.addColorStop(0, "#9c1f17");
                bg.addColorStop(0.5, "#f0503a");
                bg.addColorStop(1, "#9c1f17");
                ctx.fillStyle = bg;
                ctx.beginPath();
                ctx.ellipse(x, cy, 40, 48, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = "rgba(90,10,10,.5)";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.ellipse(x, cy, 22, 48, 0, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(x, cy - 48);
                ctx.lineTo(x, cy + 48);
                ctx.stroke();
                ctx.fillStyle = "#d9a441";
                rr(ctx, x - 18, cy + 44, 36, 14, 4);
                ctx.fill();
                ctx.strokeStyle = "#f0c25a";
                ctx.lineWidth = 5;
                ctx.lineCap = "round";
                ctx.beginPath();
                ctx.moveTo(x, cy + 58);
                ctx.lineTo(x, cy + 84);
                ctx.stroke();
                ctx.restore();
            });
        }

        function drawTitle() {
            text(
                "ตักไข่ลุ้นรางวัล",
                540,
                250,
                76,
                800,
                goldGrad(ctx, 212, 288),
                { stroke: "#1a0d33", sw: 12 },
            );
            drawInvite();
        }

        // บรรทัด "เชิญคุณ ........" ใต้ชื่อเกม
        function drawInvite() {
            const y = 330,
                label = "เชิญคุณ";
            const queuedName = hasActivePlayer()
                ? formatDisplayName(getCurrentPlayerName())
                : "ลงทะเบียนก่อนเริ่มเกม";
            const displayName = GUEST_NAME || queuedName;
            const invite = `${label} ${displayName}`;
            const size = fitSize(invite, 900, 48, 32, 700, FONT_D);
            text(invite, 540, y, size, 700, "#fff3c4", {
                stroke: "#1a0d33",
                sw: 8,
            });
        }

        function drawTimer() {
            const cx = 540,
                cy = 462,
                r = 86;
            const tl = state === "idle" ? GAME_SECONDS : Math.max(0, timeLeft);
            const frac = tl / GAME_SECONDS;
            const urgent = tl <= 5 && tl > 0 && state === "play";
            ctx.save();
            ctx.fillStyle = "rgba(10,6,24,.62)";
            ctx.beginPath();
            ctx.arc(cx, cy, r - 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.lineCap = "round";
            ctx.lineWidth = 18;
            ctx.strokeStyle = "rgba(255,255,255,.14)";
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
            if (frac > 0.001) {
                ctx.strokeStyle = urgent ? "#ff5a4a" : "#ffc94a";
                ctx.beginPath();
                ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
                ctx.stroke();
            }
            ctx.restore();
            const sec = Math.ceil(tl);
            const pulse = urgent ? 1 + 0.12 * Math.max(0, 1 - (tl % 1) * 3) : 1;
            ctx.save();
            ctx.translate(cx, cy - 8);
            ctx.scale(pulse, pulse);
            text(String(sec), 0, 0, 96, 800, urgent ? "#ff8a7a" : "#fff3c4");
            ctx.restore();
            text("วินาที", cx, cy + 50, 26, 700, "#b9a8d9", { family: FONT_B });
        }

        function drawTub(t) {
            ctx.save();
            ctx.shadowColor = "rgba(0,0,0,.55)";
            ctx.shadowBlur = 60;
            ctx.shadowOffsetY = 30;
            ctx.fillStyle = "#7a4a1d";
            ctx.beginPath();
            ctx.arc(TC.x, TC.y, R_RIM, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            const rim = ctx.createLinearGradient(
                TC.x - R_RIM,
                TC.y - R_RIM,
                TC.x + R_RIM,
                TC.y + R_RIM,
            );
            rim.addColorStop(0, "#e6b659");
            rim.addColorStop(0.45, "#9a6226");
            rim.addColorStop(1, "#c98f36");
            ctx.fillStyle = rim;
            ctx.beginPath();
            ctx.arc(TC.x, TC.y, R_RIM, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "rgba(255,240,200,.35)";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(TC.x, TC.y, R_RIM - 3, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = "#3d220d";
            ctx.beginPath();
            ctx.arc(TC.x, TC.y, R_WATER + 16, 0, Math.PI * 2);
            ctx.fill();

            const wg = ctx.createRadialGradient(
                TC.x - 70,
                TC.y - 90,
                40,
                TC.x,
                TC.y,
                R_WATER,
            );
            wg.addColorStop(0, "#3fc9c3");
            wg.addColorStop(0.55, "#1f9a9c");
            wg.addColorStop(1, "#126372");
            ctx.fillStyle = wg;
            ctx.beginPath();
            ctx.arc(TC.x, TC.y, R_WATER, 0, Math.PI * 2);
            ctx.fill();

            ctx.save();
            ctx.beginPath();
            ctx.arc(TC.x, TC.y, R_WATER, 0, Math.PI * 2);
            ctx.clip();
            ctx.lineWidth = 3;
            for (let k = 0; k < 10; k++) {
                ctx.strokeStyle = `rgba(255,255,255,${0.04 + (k % 3) * 0.018})`;
                ctx.beginPath();
                ctx.arc(
                    TC.x + Math.sin(t * 0.3 + k) * 60,
                    TC.y + Math.cos(t * 0.27 + k * 1.7) * 60,
                    70 + k * 38,
                    0,
                    Math.PI * 2,
                );
                ctx.stroke();
            }
            ctx.strokeStyle = "rgba(0,35,48,.4)";
            ctx.lineWidth = 34;
            ctx.beginPath();
            ctx.arc(TC.x, TC.y, R_WATER - 6, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        function drawEggs(t) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(TC.x, TC.y, R_WATER, 0, Math.PI * 2);
            ctx.clip();
            for (const e of eggs) {
                ctx.save();
                ctx.translate(e.x + 6, e.y + 10);
                ctx.rotate(e.rot);
                ctx.fillStyle = "rgba(0,35,45,.35)";
                eggPath(ctx, 40, 54);
                ctx.fill();
                ctx.restore();
            }
            for (const e of eggs) {
                const s = 1 + 0.025 * Math.sin(t * 2 + e.ph);
                ctx.save();
                ctx.translate(e.x, e.y);
                ctx.rotate(e.rot);
                ctx.scale(s, s);
                eggPath(ctx, 40, 54);
                eggFill(ctx, 40, 54, e.skin);
                ctx.fill();
                ctx.strokeStyle = "rgba(60,40,20,.25)";
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.fillStyle = "rgba(255,255,255,.55)";
                ctx.beginPath();
                ctx.ellipse(-14, -20, 8, 14, -0.4, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
            ctx.restore();
        }

        function drawRipples() {
            ctx.save();
            ctx.beginPath();
            ctx.arc(TC.x, TC.y, R_WATER, 0, Math.PI * 2);
            ctx.clip();
            for (const r of ripples) {
                const k = r.t / 1.3;
                ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - k)})`;
                ctx.lineWidth = 6 * (1 - k) + 1;
                ctx.beginPath();
                ctx.arc(r.x, r.y, 50 + k * 300, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
        }

        function drawLadle() {
            const x = L.x,
                y = L.y;
            const overWater = y < TC.y + R_WATER;
            if (overWater) {
                ctx.save();
                ctx.beginPath();
                ctx.arc(TC.x, TC.y, R_WATER, 0, Math.PI * 2);
                ctx.clip();
                ctx.strokeStyle = "rgba(0,35,45,.28)";
                ctx.lineWidth = 14;
                ctx.beginPath();
                ctx.arc(x + 14, y + 20, RING_R, 0, Math.PI * 2);
                ctx.stroke();
                ctx.fillStyle = "rgba(0,35,45,.2)";
                ctx.fillRect(x + 14 - 14, y + 20 + RING_R, 28, H);
                ctx.restore();
            }

            // ไม้จับ
            const hw = 30;
            const hg = ctx.createLinearGradient(x - hw / 2, 0, x + hw / 2, 0);
            hg.addColorStop(0, "#6b3f1a");
            hg.addColorStop(0.5, "#d19a5a");
            hg.addColorStop(1, "#7a4a21");
            ctx.fillStyle = hg;
            rr(ctx, x - hw / 2, y + RING_R - 6, hw, H - (y + RING_R) + 40, 10);
            ctx.fill();
            ctx.fillStyle = goldGrad(ctx, y + RING_R - 14, y + RING_R + 24);
            rr(ctx, x - 22, y + RING_R - 12, 44, 36, 8);
            ctx.fill();

            // ไข่ที่ตักได้ (อยู่ในวง)
            if (L.caught) {
                // ไข่ฟองที่ใกล้ที่สุดลอยเข้ามาอยู่ในวงตอนยื่นสุด
                const m =
                    L.phase === "out"
                        ? 0
                        : L.phase === "hold"
                            ? smooth(clamp(L.pt / 0.3, 0, 1))
                            : 1;
                const wob =
                    (L.phase === "back" ? 0.25 : 0.08) * Math.sin(time * 14) * m;
                ctx.save();
                ctx.translate(lerp(L.caught.fx, x, m), lerp(L.caught.fy, y, m));
                ctx.rotate(lerp(L.caught.frot, 0, m) + wob);
                ctx.fillStyle = "rgba(0,35,45,.3)";
                ctx.save();
                ctx.translate(4, 8);
                eggPath(ctx, 40, 54);
                ctx.fill();
                ctx.restore();
                eggPath(ctx, 40, 54);
                eggFill(ctx, 40, 54, L.caught.skin);
                ctx.fill();
                ctx.strokeStyle = "rgba(60,40,20,.25)";
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.fillStyle = "rgba(255,255,255,.55)";
                ctx.beginPath();
                ctx.ellipse(-14, -20, 8, 14, -0.4, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            // ตาข่าย
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, RING_R - 7, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255,255,255,.07)";
            ctx.fill();
            ctx.clip();
            ctx.strokeStyle = "rgba(255,230,160,.42)";
            ctx.lineWidth = 2;
            for (let i = -5; i <= 5; i++) {
                ctx.beginPath();
                ctx.moveTo(x + i * 20, y - RING_R);
                ctx.lineTo(x + i * 20, y + RING_R);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(x - RING_R, y + i * 20);
                ctx.lineTo(x + RING_R, y + i * 20);
                ctx.stroke();
            }
            ctx.restore();

            // ขอบวงทองเหลือง
            const rg = ctx.createLinearGradient(
                x - RING_R,
                y - RING_R,
                x + RING_R,
                y + RING_R,
            );
            rg.addColorStop(0, "#fff0b0");
            rg.addColorStop(0.5, "#d9a441");
            rg.addColorStop(1, "#8f5f1a");
            ctx.strokeStyle = rg;
            ctx.lineWidth = 14;
            ctx.beginPath();
            ctx.arc(x, y, RING_R, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = "rgba(255,255,255,.5)";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(x, y, RING_R - 3, Math.PI * 1.1, Math.PI * 1.55);
            ctx.stroke();
        }

        function drawMsgs() {
            for (const m of msgs) {
                const k = m.t / 1.1;
                text(m.s, m.x, m.y - k * 60, 72, 800, m.c, {
                    stroke: "#1a0d33",
                    sw: 12,
                    alpha: 1 - k * k,
                });
            }
        }

        function drawHint() {
            if (state === "idle" && !startingGame && !gameStatus && !hasActivePlayer()) {
                return;
            }

            ctx.fillStyle = "rgba(10,6,24,.72)";
            rr(ctx, 130, 1812, 820, 70, 35);
            ctx.fill();
            const hint = state === "idle"
                ? startingGame
                    ? "กำลังเตรียมเกม..."
                    : gameStatus || ""
                : "← →  เลื่อนไม้  กดปุ่มเพื่อยื่นไม้ตักไข่";
            text(
                hint,
                540,
                1848,
                fitSize(hint, 760, 32, 24, 700, FONT_B),
                700,
                "#e9dcc6",
                { family: FONT_B },
            );
        }

        function drawPlayScene() {
            drawBackground(time);
            drawLanterns(time);
            drawTitle();
            drawTimer();
            drawTub(time);
            drawEggs(time);
            drawRipples();
            drawLadle();
            drawMsgs();
            drawHint();
        }

        /* ============ วาด: หมดเวลา ============ */
        function cta(label, y, t) {
            const s = 1 + 0.035 * Math.sin(t * 5);
            ctx.save();
            ctx.translate(540, y);
            ctx.scale(s, s);
            ctx.fillStyle = goldGrad(ctx, -45, 45);
            rr(ctx, -380, -45, 760, 90, 45);
            ctx.fill();
            text(label, 0, 3, 44, 700, "#3a1d00");
            ctx.restore();
        }

        function drawTimeout() {
            ctx.fillStyle = "rgba(10,6,24,.68)";
            ctx.fillRect(0, 0, W, H);
            const k = easeOutBack(clamp(toT / 0.5, 0, 1));
            ctx.save();
            ctx.translate(540, 880);
            ctx.scale(k, k);
            text("หมดเวลา!", 0, 0, 190, 800, "#ff7a59", {
                stroke: "#1a0d33",
                sw: 16,
            });
            ctx.restore();
            text("ยังตักไข่ไม่ได้สักฟอง", 540, 1010, 54, 500, "#f6e7c8", {
                alpha: clamp((toT - 0.3) / 0.4, 0, 1),
            });
            if (toT > 0.8) cta("กด SPACEBAR เพื่อลองอีกครั้ง", 1150, time);
        }

        /* ============ วาด: ฉากเปลี่ยน และฉากเปิดไข่ ============ */
        function revealBg(t) {
            const g = ctx.createRadialGradient(EC.x, EC.y, 40, EC.x, EC.y, 1300);
            g.addColorStop(0, "#4b2680");
            g.addColorStop(0.45, "#251047");
            g.addColorStop(1, "#0a0616");
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);
            const k = t == null ? 0 : clamp((t - BURST) / 0.8, 0, 1);
            ctx.save();
            ctx.translate(EC.x, EC.y);
            ctx.rotate((t || 0) * 0.25);
            ctx.fillStyle = `rgba(255,214,110,${0.05 + 0.11 * k})`;
            for (let i = 0; i < 10; i++) {
                ctx.rotate((Math.PI * 2) / 10);
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(-140, -1600);
                ctx.lineTo(140, -1600);
                ctx.closePath();
                ctx.fill();
            }
            ctx.restore();
            ctx.fillStyle = "rgba(0,0,0,.4)";
            ctx.beginPath();
            ctx.ellipse(EC.x, EC.y + EGG_RY + 70, 230, 40, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        function drawTransition() {
            drawPlayScene();
            const p = clamp(tr.t / 1.25, 0, 1);
            ctx.fillStyle = `rgba(0,0,0,${0.35 * p})`;
            ctx.fillRect(0, 0, W, H);

            const rad = easeInOutCubic(p) * 2400;
            if (rad > 2) {
                ctx.save();
                ctx.beginPath();
                ctx.arc(tr.fromX, tr.fromY, rad, 0, Math.PI * 2);
                ctx.clip();
                revealBg(0);
                ctx.restore();
                ctx.save();
                ctx.shadowColor = "rgba(255,214,110,.9)";
                ctx.shadowBlur = 50;
                ctx.strokeStyle = "rgba(255,224,130,.9)";
                ctx.lineWidth = 22;
                ctx.beginPath();
                ctx.arc(tr.fromX, tr.fromY, rad, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }

            // ไข่เลื่อนจากวงตักไปกลางจอและขยายใหญ่ขึ้น
            const m = smooth(clamp((tr.t - 0.1) / 1.0, 0, 1));
            const x = lerp(tr.fromX, EC.x, m),
                y = lerp(tr.fromY, EC.y, m);
            const rx = lerp(40, EGG_RX, m),
                ry = lerp(54, EGG_RY, m);
            const wob = (REDUCED ? 0.03 : 0.12) * Math.sin(tr.t * 30) * (1 - m);
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(wob);
            eggPath(ctx, rx, ry);
            eggFill(ctx, rx, ry, tr.skin);
            ctx.fill();
            ctx.strokeStyle = "rgba(60,40,20,.25)";
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.fillStyle = "rgba(255,255,255,.5)";
            ctx.beginPath();
            ctx.ellipse(
                -rx * 0.35,
                -ry * 0.4,
                rx * 0.2,
                ry * 0.27,
                -0.4,
                0,
                Math.PI * 2,
            );
            ctx.fill();
            ctx.restore();
        }

        function zigPts(rx, y0) {
            const xs = [
                -rx - 30,
                -rx * 0.7,
                -rx * 0.4,
                -rx * 0.1,
                rx * 0.2,
                rx * 0.5,
                rx * 0.8,
                rx + 30,
            ];
            const ys = [0, -30, 20, -28, 24, -22, 26, 0];
            return xs.map((x, i) => [x, y0 + ys[i]]);
        }

        function drawHalf(top, rv) {
            const rx = EGG_RX,
                ry = EGG_RY,
                y0 = -ry * 0.05;
            const z = zigPts(rx, y0);
            ctx.save();
            eggPath(ctx, rx, ry);
            ctx.clip();
            ctx.beginPath();
            if (top) {
                ctx.moveTo(-rx - 40, -ry - 40);
                ctx.lineTo(rx + 40, -ry - 40);
                for (let i = z.length - 1; i >= 0; i--)
                    ctx.lineTo(z[i][0], z[i][1]);
            } else {
                ctx.moveTo(-rx - 40, ry + 40);
                ctx.lineTo(rx + 40, ry + 40);
                for (let i = z.length - 1; i >= 0; i--)
                    ctx.lineTo(z[i][0], z[i][1]);
            }
            ctx.closePath();
            ctx.clip();
            eggFill(ctx, rx, ry, rv.skin);
            ctx.fillRect(-rx - 5, -ry - 5, rx * 2 + 10, ry * 2 + 10);
            ctx.strokeStyle = "#fff6df";
            ctx.lineWidth = 10;
            ctx.lineJoin = "round";
            ctx.beginPath();
            z.forEach((p, i) =>
                i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]),
            );
            ctx.stroke();
            ctx.restore();
            // เส้นขอบเปลือก
            ctx.save();
            eggPath(ctx, rx, ry);
            ctx.strokeStyle = "rgba(60,40,20,.25)";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.restore();
        }

        function drawCracks(t) {
            rv.cracks.forEach((pts, i) => {
                const start = SH0 + 0.3 + i * 0.28;
                const prog = clamp((t - start) / 0.3, 0, 1);
                if (prog <= 0) return;
                const count = prog * (pts.length - 1);
                const path = () => {
                    ctx.beginPath();
                    ctx.moveTo(pts[0][0], pts[0][1]);
                    for (let k = 1; k <= Math.floor(count); k++)
                        ctx.lineTo(pts[k][0], pts[k][1]);
                    const f = count - Math.floor(count);
                    const k0 = Math.floor(count);
                    if (f > 0 && k0 + 1 < pts.length) {
                        ctx.lineTo(
                            lerp(pts[k0][0], pts[k0 + 1][0], f),
                            lerp(pts[k0][1], pts[k0 + 1][1], f),
                        );
                    }
                };
                ctx.lineJoin = "round";
                ctx.lineCap = "round";
                const g = clamp((t - SH0) / (BURST - SH0), 0, 1);
                ctx.strokeStyle = `rgba(255,215,110,${0.35 + 0.6 * g})`;
                ctx.lineWidth = 12 + 8 * g;
                path();
                ctx.stroke();
                ctx.strokeStyle = "#4a2c12";
                ctx.lineWidth = 4;
                path();
                ctx.stroke();
            });
        }

        function drawBigEgg(t) {
            const p = clamp((t - SH0) / (BURST - SH0), 0, 1);
            const reduce = REDUCED ? 0.4 : 1;
            const amp = t < SH0 ? 0 : (0.05 + 0.3 * p * p) * reduce;
            const rot = amp * Math.sin(t * (12 + 20 * p));
            const ox = t < SH0 ? 0 : Math.sin(t * 37) * 6 * p * reduce;
            const oy = t < SH0 ? 0 : -Math.abs(Math.sin(t * 7)) * 18 * p * reduce;
            const pulse = t < SH0 ? 1 + 0.02 * Math.sin(t * 8) : 1;
            ctx.save();
            ctx.translate(EC.x + ox, EC.y + oy);
            ctx.translate(0, EGG_RY * 0.7);
            ctx.rotate(rot);
            ctx.translate(0, -EGG_RY * 0.7);
            ctx.scale(pulse, pulse);
            eggPath(ctx, EGG_RX, EGG_RY);
            eggFill(ctx, EGG_RX, EGG_RY, rv.skin);
            ctx.fill();
            ctx.strokeStyle = "rgba(60,40,20,.25)";
            ctx.lineWidth = 3;
            ctx.stroke();

            ctx.save();
            eggPath(ctx, EGG_RX, EGG_RY);
            ctx.clip();
            if (t > SH0) {
                const gg = ctx.createRadialGradient(0, 0, 10, 0, 0, EGG_RY);
                gg.addColorStop(0, `rgba(255,220,120,${0.55 * p * p})`);
                gg.addColorStop(1, "rgba(255,220,120,0)");
                ctx.fillStyle = gg;
                ctx.fillRect(-EGG_RX, -EGG_RY, EGG_RX * 2, EGG_RY * 2);
            }
            drawCracks(t);
            ctx.restore();

            ctx.fillStyle = "rgba(255,255,255,.5)";
            ctx.beginPath();
            ctx.ellipse(
                -EGG_RX * 0.38,
                -EGG_RY * 0.42,
                EGG_RX * 0.17,
                EGG_RY * 0.24,
                -0.4,
                0,
                Math.PI * 2,
            );
            ctx.fill();
            ctx.restore();
        }

        // ไอคอนของรางวัล วาดรอบจุด 0,0 ขนาดประมาณ ±150
        function drawPrizeIcon(prize) {
            const c = ctx;
            const g = ctx.createRadialGradient(0, 0, 20, 0, 0, 300);
            g.addColorStop(0, "rgba(255,224,130,.6)");
            g.addColorStop(1, "rgba(255,224,130,0)");
            c.fillStyle = g;
            c.fillRect(-300, -300, 600, 600);

            if (prize.image) {
                if (!prize.imageElement) {
                    prize.imageElement = new Image();
                    prize.imageElement.src = prize.image;
                }
                if (prize.imageElement.complete && prize.imageElement.naturalWidth) {
                    c.drawImage(prize.imageElement, -150, -150, 300, 300);
                    return;
                }
            }

            if (prize.icon === "gift") {
                c.fillStyle = prize.color;
                rr(c, -120, -20, 240, 150, 12);
                c.fill();
                c.fillStyle = "#b53a31";
                rr(c, -135, -75, 270, 60, 12);
                c.fill();
                c.fillStyle = "#fff3c4";
                c.fillRect(-18, -75, 36, 205);
                c.strokeStyle = "#fff3c4";
                c.lineWidth = 14;
                c.beginPath();
                c.ellipse(-42, -102, 42, 26, -0.5, 0, Math.PI * 2);
                c.stroke();
                c.beginPath();
                c.ellipse(42, -102, 42, 26, 0.5, 0, Math.PI * 2);
                c.stroke();
                c.fillStyle = "#fff3c4";
                c.beginPath();
                c.arc(0, -84, 16, 0, Math.PI * 2);
                c.fill();
            } else if (prize.icon === "ticket") {
                c.save();
                c.rotate(-0.12);
                c.fillStyle = goldGrad(c, -95, 95);
                rr(c, -170, -95, 340, 190, 20);
                c.fill();
                c.strokeStyle = "#a86f14";
                c.lineWidth = 6;
                rr(c, -154, -79, 308, 158, 12);
                c.stroke();
                c.setLineDash([12, 12]);
                c.beginPath();
                c.moveTo(-96, -79);
                c.lineTo(-96, 79);
                c.stroke();
                c.setLineDash([]);
                c.fillStyle = "#7a4a00";
                c.beginPath();
                for (let i = 0; i < 10; i++) {
                    const a = -Math.PI / 2 + (i * Math.PI) / 5,
                        r = i % 2 ? 26 : 58;
                    c.lineTo(36 + Math.cos(a) * r, 0 + Math.sin(a) * r);
                }
                c.closePath();
                c.fill();
                c.restore();
            } else if (prize.icon === "trophy") {
                c.fillStyle = goldGrad(c, -110, 150);
                c.strokeStyle = "#e8b53c";
                c.lineWidth = 16;
                c.lineCap = "round";
                c.beginPath();
                c.arc(-92, -66, 42, Math.PI * 0.5, Math.PI * 1.5);
                c.stroke();
                c.beginPath();
                c.arc(92, -66, 42, -Math.PI * 0.5, Math.PI * 0.5);
                c.stroke();
                c.beginPath();
                c.moveTo(-96, -118);
                c.lineTo(96, -118);
                c.bezierCurveTo(96, 10, 54, 62, 0, 72);
                c.bezierCurveTo(-54, 62, -96, 10, -96, -118);
                c.closePath();
                c.fill();
                c.fillRect(-18, 68, 36, 50);
                rr(c, -72, 116, 144, 36, 8);
                c.fill();
                c.fillStyle = "#9a6a10";
                c.beginPath();
                for (let i = 0; i < 10; i++) {
                    const a = -Math.PI / 2 + (i * Math.PI) / 5,
                        r = i % 2 ? 14 : 34;
                    c.lineTo(Math.cos(a) * r, -48 + Math.sin(a) * r);
                }
                c.closePath();
                c.fill();
            } else {
                c.fillStyle = goldGrad(c, -130, 130);
                c.beginPath();
                c.arc(0, 0, 130, 0, Math.PI * 2);
                c.fill();
                c.strokeStyle = "#b67d1b";
                c.lineWidth = 8;
                c.beginPath();
                c.arc(0, 0, 106, 0, Math.PI * 2);
                c.stroke();
                text("฿", 0, 8, 150, 800, "#8a5a0c");
            }
        }

        function drawReveal() {
            const t = rv.t;
            revealBg(t);

            if (t < BURST) {
                drawBigEgg(t);
            } else {
                const u = t - BURST;
                const fade = 1 - clamp(u / 1.0, 0, 1);

                // ของรางวัลโผล่ขึ้นมา
                const sc = easeOutBack(clamp(u / 0.8, 0, 1)) * 1.1;
                ctx.save();
                ctx.translate(EC.x, EC.y + Math.sin(t * 2.2) * 8);
                ctx.scale(sc, sc);
                drawPrizeIcon(rv.prize);
                ctx.restore();

                // เปลือกไข่สองซีกกระเด็นออก
                if (fade > 0) {
                    ctx.save();
                    ctx.globalAlpha = fade;
                    ctx.translate(EC.x - 170 * u, EC.y - 380 * u + 1300 * u * u);
                    ctx.rotate(-1.8 * u);
                    drawHalf(true, rv);
                    ctx.restore();
                    ctx.save();
                    ctx.globalAlpha = fade;
                    ctx.translate(EC.x + 140 * u, EC.y + 60 * u + 700 * u * u);
                    ctx.rotate(1.4 * u);
                    drawHalf(false, rv);
                    ctx.restore();
                }

                // ข้อความแสดงผล
                const a1 = clamp((u - 0.3) / 0.5, 0, 1);
                const winnerText = `ยินดีด้วยคุณ ${formatDisplayName(rv.playerName)}! ได้รับรางวัล`;
                text(winnerText, 540, 1215, fitSize(winnerText, 900, 54, 38, 700, FONT_D), 700, "#ffd98a", {
                    family: FONT_B,
                    alpha: a1,
                });
                const a2 = clamp((u - 0.6) / 0.5, 0, 1);
                const size = fitSize(rv.prize.name, 900, 104, 48, 800, FONT_D);
                text(
                    rv.prize.name,
                    540,
                    1330 + (1 - easeOutCubic(a2)) * 40,
                    size,
                    800,
                    goldGrad(ctx, 1280, 1380),
                    { stroke: "#1a0d33", sw: 14, alpha: a2 },
                );
                if (u > 3.2 && rv.resultReady) {
                    cta("ตกลง", 1700, time);
                }
                if (u > 0.8 && rv.specialSponsor) {
                    const sponsorName = rv.specialSponsor.sponsor_name || "";
                    text("รางวัลพิเศษจาก แลกตาซอย", 540, 1440, 40, 700, "#fff3c4");
                    text(
                        sponsorName,
                        540,
                        1495,
                        fitSize(sponsorName, 900, 40, 30, 700, FONT_D),
                        700,
                        "#fff3c4",
                    );
                }
                if (u > 0.8 && rv.saveError) {
                    text("บันทึกข้อมูลบางส่วนไม่สำเร็จ", 540, 1530, 30, 700, "#ffb9a8", {
                        family: FONT_B,
                    });
                }
            }

            // confetti
            for (const p of rv.confetti) {
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.scale(1, Math.cos(p.rot * 2.3));
                ctx.globalAlpha = clamp(1 - (p.t - 4) / 2, 0, 1);
                ctx.fillStyle = p.c;
                ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                ctx.restore();
            }

            // แสงวาบตอนไข่แตก
            if (t >= BURST) {
                const f =
                    clamp(1 - (t - BURST) / 0.45, 0, 1) * (REDUCED ? 0.3 : 0.9);
                if (f > 0) {
                    ctx.fillStyle = `rgba(255,255,255,${f})`;
                    ctx.fillRect(0, 0, W, H);
                }
            }
        }

        /* ============ วนลูปวาด ============ */
        function render() {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalAlpha = 1;
            if (state === "reveal") {
                drawReveal();
                return;
            }
            if (state === "transition") {
                drawTransition();
                return;
            }
            drawPlayScene();
            if (state === "timeout") drawTimeout();
        }

        let last = performance.now();
        function frame(now) {
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            update(dt);
            render();
            requestAnimationFrame(frame);
        }

        /* ============ ควบคุม ============ */
        function press() {
            ac();
            if (state === "idle") startGame();
            else if (state === "play") {
                if (L.phase === "rest" && timeLeft > 0 && !L.caught) startScoop();
            } else if (state === "timeout") {
                if (toT > 0.8) {
                    state = "idle";
                    startGame();
                }
            } else if (state === "reveal") {
                if (rv.resultReady && rv.t > BURST + 3.2) goIdle();
            }
        }

        window.addEventListener("keydown", (e) => {
            const k = e.code;
            if (
                k === "Space" ||
                k === "ArrowLeft" ||
                k === "ArrowRight" ||
                k === "ArrowUp" ||
                k === "ArrowDown"
            )
                e.preventDefault();
            if (k === "ArrowLeft" || k === "KeyA") keys.left = true;
            if (k === "ArrowRight" || k === "KeyD") keys.right = true;
            if (k === "Space" && !e.repeat) press();
            if (k === "KeyM" && !e.repeat) muted = !muted;
        });
        window.addEventListener("keyup", (e) => {
            if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = false;
            if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = false;
        });
        window.addEventListener("blur", () => {
            keys.left = false;
            keys.right = false;
        });

        // สัมผัส / เมาส์: ลากเพื่อเลื่อนไม้ แตะเพื่อตัก
        let down = null;
        function canvasX(e) {
            const r = cv.getBoundingClientRect();
            return ((e.clientX - r.left) / r.width) * W;
        }
        cv.addEventListener("pointerdown", (e) => {
            cv.focus();
            down = { x: e.clientX, moved: false };
            try {
                cv.setPointerCapture(e.pointerId);
            } catch (err) {
                /* ignore */
            }
            if (state === "play" || state === "idle") pointerX = canvasX(e);
        });
        cv.addEventListener("pointermove", (e) => {
            if (!down) return;
            if (Math.abs(e.clientX - down.x) > 14) down.moved = true;
            if (down.moved && (state === "play" || state === "idle"))
                pointerX = canvasX(e);
        });
        function endPointer() {
            if (!down) return;
            const moved = down.moved;
            down = null;
            pointerX = null;
            if (!moved) press();
        }
        cv.addEventListener("pointerup", endPointer);
        cv.addEventListener("pointercancel", () => {
            down = null;
            pointerX = null;
        });

        /* ============ ปรับขนาดให้พอดีหน้าจอ ============ */
        const stage = document.getElementById("stage");
        function fit() {
            const w = stage.clientWidth,
                h = stage.clientHeight;
            const s = Math.min(w / W, h / H);
            if (s > 0) {
                cv.style.width = Math.floor(W * s) + "px";
                cv.style.height = Math.floor(H * s) + "px";
            }
        }
        if (window.ResizeObserver) new ResizeObserver(fit).observe(stage);
        window.addEventListener("resize", fit);
        fit();

        /* ============ เริ่มทำงาน ============ */
        try {
            if (document.fonts && document.fonts.load) {
                document.fonts.load("800 80px Kanit", "ตักไข่0123456789฿");
                document.fonts.load("700 40px Kanit", "ตักไข่");
                document.fonts.load("500 40px Kanit", "ตักไข่");
                document.fonts.load("700 40px Sarabun", "ตักไข่");
            }
        } catch (e) {
            /* ignore */
        }
        window.focus();
        goIdle();
        requestAnimationFrame(frame);
    })();
