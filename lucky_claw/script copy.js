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
        let dbPrizeOrder = {};
        let prizes = [];
        let sponsors = [];

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
          return uniqueQueue[0] || 'รอคิว';
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

          db.ref('customerQueue').set(queueObject).catch(() => {});
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

        // แทนที่จะประกาศ const prizes = [...] แบบเดิม ให้ใช้ตัวแปร let เปล่าๆ ไว้รอรับข้อมูล
        
        // ฟังก์ชันสำหรับดึงข้อมูลรางวัลจากฐานข้อมูล
        async function loadPrizesFromDatabase() {
            try {
                const response = await fetch('/api/prizes');
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



        function getOrderedPrizeForTurn() {
          const slotKey = String((dbTotalSpins % 100) + 1);
          const orderedName = dbPrizeOrder[slotKey];
          if (!orderedName) return null;

          const orderedPrize = prizes.find(prize => prize.name === orderedName);
          if (!orderedPrize) return null;

          const stockCount = dbStock[orderedPrize.name] || 0;
          return stockCount > 0 ? orderedPrize : null;
        }

        const stage = document.getElementById("stage");
        function fitStage() {
          const scale = Math.min(
            window.innerWidth / 1080,
            window.innerHeight / 1920,
          );
          stage.style.transform = `scale(${scale})`;
        }
        window.addEventListener("resize", fitStage);
        fitStage();

        // decorative side lights
        function buildLights(el, count) {
          for (let i = 0; i < count; i++) {
            const b = document.createElement("div");
            b.className = "bulb";
            el.appendChild(b);
          }
        }
        buildLights(document.getElementById("lightsL"), 16);
        buildLights(document.getElementById("lightsR"), 16);

        // ---------------- gift box + surprise toy data ----------------
        
        const BOX_COLORS = ["black", "blue", "gold", "mint", "pink", "red", "bright_blue", "rainbow", "white"];

        const BOX_DEFS = [
          // แถวบน 
          {
            x: 15,
            y: 10,
            color: "black",
            image: "gift_box/black_gift.png",
            prizeIndex: 0,
          },
          {
            x: 50,
            y: 10,
            color: "gold",
            image: "gift_box/gold_gift.png",
            prizeIndex: 2,
          },
          {
            x: 78,
            y: 10,
            color: "pink",
            image: "gift_box/pink_gift.png",
            prizeIndex: 4,
          },
           // แถวกลาง
          {
            x: 35,
            y: 45,
            color: "blue",
            image: "gift_box/blue_gift.png",
            prizeIndex: 1,
          },
          
          {
            x: 65,
            y: 45,
            color: "mint",
            image: "gift_box/mint_gift.png",
            prizeIndex: 3,
          },
          
          {
            x: 95,
            y: 45,
            color: "red",
            image: "gift_box/red_gift.png",
            prizeIndex: 5,
          },
          // แถวล่าง
          {
            x: 78,
            y: 78,
            color: "white",
            image: "gift_box/white_gift.png",
            prizeIndex: 5,
          },
             {
            x: 50,
            y: 78,
            color: "rainbow",
            image: "gift_box/rainbow_gift.png",
            prizeIndex: 5,
          },
             {
            x: 25,
            y: 78,
            color: "bright_blue",
            image: "gift_box/bright_blue_gift.png",
            prizeIndex: 5,
          },
        ];

        
        const REVEAL_IMAGE_PATH = "/lucky_claw/Gift_open.gif";

        const soundMap = {
          play: new Audio('/lucky_claw/mp3/play.mp3'),
          keep: new Audio('/lucky_claw/mp3/keep.mp3'),
          gift: new Audio('/lucky_claw/mp3/gift.mp3'),
        };

        function playSound(key) {
          const audio = soundMap[key];
          if (!audio) return;

          if (key === 'play') {
            audio.loop = true;
            if (audio.paused) {
              audio.currentTime = 0;
              audio.play().catch(() => {});
            }
            return;
          }

          audio.currentTime = 0;
          audio.play().catch(() => {});
        }

        function createGiftImage({
          width = 100,
          height = 100, 
          src
        } = {}) {
          const img = document.createElement('img');

          img.src = src;
          img.alt = 'gift';

          img.width = width;
          img.height = height;

          img.style.width = '150%';
          img.style.height = '150%';
          img.style.objectFit = 'contain';
          img.style.display = 'block';
          img.style.pointerEvents = 'none';

          return img;
        }

        function makeBoxEl(def) {
          const el = document.createElement('div');

          el.className = 'giftbox';

          el.style.left = def.x + '%';
          el.style.top = def.y + '%';

          el.style.setProperty(
            '--s',
            (0.85 + Math.random() * 0.35).toFixed(2)
          );

          el.style.setProperty(
            '--gift-shift',
            `${(Math.random() - 0.5) * 10}px`
          );

          const img = createGiftImage({
            width: 120,
            height: 120,
            src: def.image
          });

          img.style.transform = 'translateX(var(--gift-shift))';
          img.style.transition = 'transform 0.6s ease-in-out';

          el.appendChild(img);

          return el;
        }
        let prizeElements = [];
        function resetPrizeField() {
          prizeField.innerHTML = "";
          prizeElements = [];
          BOX_DEFS.forEach((def, i) => {
            const el = makeBoxEl(def);
            prizeField.appendChild(el);
            prizeElements.push({ ...def, id: i, el });
          });
        }
        resetPrizeField();

        // ---------------- state ----------------
        const state = {
          clawXPct: 50, // 0-100 across rail
          depth: 0, // 0-100 -> maps to reach depth into field
          busy: false,
          timeLeft: 15,
          credit: 500,
          stars: 20,
          teddy: 0,
          gift: 0,
          keys: {},
          revealReady: false,
        };

        const motor = document.getElementById("motor");
        const rod = document.getElementById("rod");
        const clawEl = document.getElementById("claw");
        const heldPrizeEl = document.getElementById("heldPrize");
        const timerBadge = document.getElementById("timer-badge");
        const starVal = document.getElementById("starVal");
        const teddyVal = document.getElementById("teddyVal");
        const giftVal = document.getElementById("giftVal");
        const creditVal = document.getElementById("creditVal");
        const spaceBtn = document.getElementById("spaceBtn");
        const missMsg = document.getElementById("missMsg");
        const outMsg = document.getElementById("outMsg");

        const RAIL_MIN = 6,
          RAIL_MAX = 94; // percent
        const DEPTH_MIN = 0,
          DEPTH_MAX = 100; // percent -> motor top offset
        const ROD_REST = 30,
          ROD_MAX = 780; // px

        function renderMotor() {
          motor.style.left = state.clawXPct + "%";
          motor.style.top = 6 + state.depth * 0.1 + "%";
        }
        function updateHUD() {
          starVal.textContent = state.stars;
          teddyVal.textContent = state.teddy;
          giftVal.textContent = state.gift;
          creditVal.textContent = state.credit;
          timerBadge.textContent = state.timeLeft;
          timerBadge.classList.toggle("warn", state.timeLeft <= 5);
          spaceBtn.classList.toggle(
            "disabled",
            state.busy || state.credit <= 0,
          );
        }
        renderMotor();
        updateHUD();

       
        // ตัวแปรนับลำดับรอบ (ใส่ไว้ด้านนอกฟังก์ชัน)
          let clawDepthIndex = 0; 

          function setRandomClawDepth() {
                const rod = document.getElementById('rod');
                if (!rod) return;

                // กำหนดระดับความยาว 3 ระดับ (px): [สั้น (แถวบน), กลาง (แถวกลาง), ยาว (แถวล่าง)]
                  const levels = [550, 750, 950]; 

                // ดึงค่าตามลำดับปัจจุบัน
                const currentDepth = levels[clawDepthIndex];

                // ส่งค่าไปที่ CSS Variable --drop-depth
                rod.style.setProperty('--drop-depth', `${currentDepth}px`);

                // วนลำดับ 0 -> 1 -> 2 -> 0 -> 1 -> 2 ไปเรื่อยๆ
                clawDepthIndex = (clawDepthIndex + 1) % levels.length;
          }
        

          function findNearestGiftToClaw() {
            if (prizeElements.length === 0) return null;

            // กรองเอาเฉพาะกล่องที่ยังไม่ถูกคีบไป
            const availableBoxes = prizeElements.filter((p) => p.el && p.el.style.opacity !== "0");
            if (availableBoxes.length === 0) return null;

            // ดึงพิกัดจริงของหัวคีบ ณ จุดปัจจุบัน (จุดที่ยืดลงไปสุด)
            const clawRect = clawEl.getBoundingClientRect();
            const clawCenterX = clawRect.left + clawRect.width / 2;
            const clawCenterY = clawRect.top + clawRect.height / 2;

            let nearestBox = null;
            let minDistance = Infinity;

            // คำนวณระยะทางจากหัวคีบไปยังกล่องแต่ละใบ
            availableBoxes.forEach((p) => {
              const boxRect = p.el.getBoundingClientRect();
              const boxCenterX = boxRect.left + boxRect.width / 2;
              const boxCenterY = boxRect.top + boxRect.height / 2;

              // คำนวณระยะห่างตรงระหว่าง 2 จุด (Pythagorean distance)
              const dx = clawCenterX - boxCenterX;
              const dy = clawCenterY - boxCenterY;
              const distance = Math.sqrt(dx * dx + dy * dy);

              if (distance < minDistance) {
                minDistance = distance;
                nearestBox = p;
              }
            });

            console.log(
              "🎯 คีบสำเร็จ (กล่องที่ใกล้หัวคีบที่สุด ณ จุดลงสุด):",
              nearestBox?.color,
              "ระยะห่าง:",
              Math.round(minDistance) + "px"
            );

            return nearestBox;
          }

        // ---------------- phase state machine ----------------
        let phase = "locked";
        const hintEl = document.getElementById("hint");
        function setHint(text) {
          hintEl.textContent = text;
        }

        // ---------------- movement & joystick ----------------
        const MOVE_SPEED = 0.85;
        const activeDirs = {
          left: false,
          right: false,
          up: false,
          down: false,
        };
        const joystickKnob = document.getElementById("joystickKnob");

        // Update Joystick tilt position based on input state
        function updateJoystickVisual() {
          let moveX = 0;
          let moveY = 0;

          if (activeDirs.left) moveX -= 18;
          if (activeDirs.right) moveX += 18;

          joystickKnob.style.transform = `translate(${moveX}px, ${moveY}px)`;
        }

        function gameLoop() {
          if (phase === "selecting") {
            let moved = false;
            if (activeDirs.left) {
              state.clawXPct = Math.max(RAIL_MIN, state.clawXPct - MOVE_SPEED);
              moved = true;
            }
            if (activeDirs.right) {
              state.clawXPct = Math.min(RAIL_MAX, state.clawXPct + MOVE_SPEED);
              moved = true;
            }
            if (moved) renderMotor();
          }

          const time = performance.now() * 0.003;
          const horizontalPress = (activeDirs.left ? -1 : 0) + (activeDirs.right ? 1 : 0);
          document.querySelectorAll('.giftbox').forEach((box, index) => {
            if (box && !box.classList.contains('caught')) {
              const idleDrift = Math.sin(time * 2 + index) * 4;
              const pressDrift = horizontalPress * Math.sin(time * 8 + index) * 12;
              const drift = idleDrift + pressDrift;
              box.style.transform = `translate(-50%, -50%) scale(var(--s, 1)) translateX(${drift}px)`;
            }
          });

          updateJoystickVisual();
          requestAnimationFrame(gameLoop);
        }
        requestAnimationFrame(gameLoop);

        // Keyboard controls
        window.addEventListener("keydown", (e) => {
          const code = e.code;
          if (
            [
              "ArrowUp",
              "ArrowDown",
              "ArrowLeft",
              "ArrowRight",
              "Space",
              "Enter",
            ].includes(code)
          )
            e.preventDefault();

          if (code === "ArrowLeft") activeDirs.left = true;
          if (code === "ArrowRight") activeDirs.right = true;
          if (code === "ArrowUp") activeDirs.up = true;
          if (code === "ArrowDown") activeDirs.down = true;

          if (code === "Enter" && !e.repeat) {
            startRoundFromEnter();
          }

          if (code === "Space" && !e.repeat) {
            handleSpacePress();
          }
        });

        window.addEventListener("keyup", (e) => {
          const code = e.code;
          if (code === "ArrowLeft") activeDirs.left = false;
          if (code === "ArrowRight") activeDirs.right = false;
          if (code === "ArrowUp") activeDirs.up = false;
          if (code === "ArrowDown") activeDirs.down = false;
        });

        // On-screen D-pad / Joystick Controls
        document.querySelectorAll(".dbtn[data-dir]").forEach((btn) => {
          const dir = btn.dataset.dir;
          const start = (e) => {
            e.preventDefault();
            activeDirs[dir] = true;
            btn.classList.add("active");
          };
          const stop = () => {
            activeDirs[dir] = false;
            btn.classList.remove("active");
          };
          btn.addEventListener("pointerdown", start);
          btn.addEventListener("pointerup", stop);
          btn.addEventListener("pointerleave", stop);
          btn.addEventListener("pointercancel", stop);
        });

        spaceBtn.addEventListener("click", handleSpacePress);
        
        const startBtn = document.getElementById("startBtn");
        if (startBtn) {
          startBtn.addEventListener("click", () => {
            if (!hasActivePlayer()) return;
            startRoundFromEnter();
          });
        }
        
        document
          .getElementById("startOverlay")
          .addEventListener("click", (e) => {});

        // ---------------- timer ----------------
        let timerInt = null;
        function startTimer() {
          stopTimer();
          state.timeLeft = 15;
          updateHUD();
          timerInt = setInterval(() => {
            state.timeLeft--;
            if (state.timeLeft <= 0) {
              state.timeLeft = 0;
              stopTimer();
              updateHUD();
              triggerGrab();
              return;
            }
            updateHUD();
          }, 1000);
        }
        function stopTimer() {
          if (timerInt) clearInterval(timerInt);
          timerInt = null;
        }

        function wait(ms) {
          return new Promise((res) => setTimeout(res, ms));
        }

        function hasActivePlayer() {
          return [...new Set(dbQueue)].length > 0;
        }

        function updateStartButtonState() {
          const startBtn = document.getElementById('startBtn');
          if (!startBtn) return;
          
          if (hasActivePlayer()) {
            startBtn.classList.remove('disabled');
          } else {
            startBtn.classList.add('disabled');
          }
        }

        function handleSpacePress() {
          if (phase === "locked") {
            if (!hasActivePlayer()) {
              setHint("รอชื่อผู้เล่นเข้าคิวก่อนเริ่มเกม");
              return;
            }
            startRoundFromEnter();
          } else if (phase === "selecting") {
            playSound("play");
            triggerGrab();
          } else if (phase === "revealing" && state.revealReady) {
            closeRevealAndRestart();
          }
        }

        async function startRoundFromEnter() {
          if (!hasActivePlayer()) {
            setHint("รอชื่อผู้เล่นเข้าคิวก่อนเริ่มเกม");
            return;
          }

          if (phase !== "locked") return;

          phase = "loading";
          await prizesReady;
          if (prizes.length === 0) {
            phase = "locked";
            setHint("ไม่สามารถโหลดรางวัลได้ กรุณาตรวจสอบข้อมูลแล้วลองใหม่");
            return;
          }

          playSound("play");
          resetPrizeField();
          phase = "selecting";
          state.clawXPct = 50;
          state.depth = 0;
          state.timeLeft = 15;
          renderMotor();
          setHint("ใช้ปุ่มซ้าย-ขวาเลือกกล่อง แล้วกด SPACE เพื่อคีบ!");
          startTimer();
          updateHUD();
        }

        // ---------------- grab sequence ----------------
        async function triggerGrab() {
          if (phase !== "selecting") return;

          if (state.credit <= 0) {
            stopTimer();
            showOut();
            return;
          }
          if (prizes.length === 0) {
            stopTimer();
            showAllCaught();
            return;
          }

          phase = "busy";
          stopTimer();
          setHint("กำลังคีบกล่องของขวัญ...");

          // 🟢 โค้ดที่ปรับใหม่ (ใช้ข้อ 4)
          state.credit -= 1;
          updateHUD();

          // 1. สุ่มความยาวสายคีบใหม่สำหรับรอบนี้
          setRandomClawDepth();

          // 2. ดึงค่าความยาวที่สุ่มได้จาก CSS Variable
          const targetDepth = rod.style.getPropertyValue('--drop-depth') || (ROD_MAX + "px");

          // 3. สั่งให้สายคีบยืดลงตามความยาวที่สุ่มได้
          rod.style.height = targetDepth;

          await wait(600);

          // ==========================================
          
          // ==========================================
          // ถ้าไม่พบกล่อง
          // ==========================================

        const caught = findNearestGiftToClaw();

        if (!caught) {
          console.log("ไม่พบกล่อง");

          clawEl.classList.add("closed");

          await wait(320);

          clawEl.classList.remove("closed");

          rod.style.height = ROD_REST + "px";

          await wait(600);

          state.clawXPct = 50;
          state.depth = 0;

          renderMotor();

          updateHUD();

          phase = "selecting";

          setHint("ลองใหม่อีกครั้ง");

          return;
}
          // ==========================================
          // ⭐ กล่องที่ใกล้หัวคีบที่สุด
          // ==========================================
                  
         
          console.log(
            "🎁 คีบกล่อง:",
            caught.color,
            caught.image,           
          );

          playSound("keep");

          clawEl.classList.add("closed");

          await wait(320);

          // ==========================================
          // ซ่อนกล่องจริง
          // ==========================================

          caught.el.style.opacity = "0";
          // ==========================================
          // ⭐ แสดงรูปกล่องที่ถูกคีบ
          // ==========================================
          // ตอนที่เล็บคีบจับกล่องได้ (ในฟังก์ชัน triggerGrab)
          // ตอนที่เล็บคีบจับกล่องได้ (ในฟังก์ชัน triggerGrab)
          const miniGift = createGiftImage({ 
            width: 60, 
            height: 60, 
            src: caught.image // 🟢 ใส่ src เพื่อส่งรูปกล่อง (เช่น "gift_box/black_gift.png") ไปแสดงผล
          });
          miniGift.style.width = "60px";
          miniGift.style.height = "60px";
          miniGift.style.objectFit = "contain";

          heldPrizeEl.innerHTML = "";
          heldPrizeEl.appendChild(miniGift);
          heldPrizeEl.classList.add("show");

           // เอากล่องออกจากรายการที่สามารถคีบได้
          prizeElements = prizeElements.filter((p) => p.id !== caught.id);

          // ==========================================
          // ยกกล่องขึ้น
          // ==========================================
          rod.style.height = ROD_REST + "px";
          await wait(600);

          // ==========================================
          // เคลื่อนหัวคีบไปช่องรับรางวัล
          // ==========================================

          state.clawXPct = RAIL_MIN;
          state.depth = 55;

          renderMotor();

          await wait(900);

          // ==========================================
          // ปล่อยกล่อง
          // ==========================================

          rod.style.height = 260 + "px";
          await wait(250);          
          clawEl.classList.remove("closed");
          heldPrizeEl.classList.remove("show");
          dropIntoChute(caught);
          await wait(250);
          rod.style.height = ROD_REST + "px";
          await wait(500);

          state.clawXPct = 50;
          state.depth = 0;
          renderMotor();
          await wait(650);

          updateHUD();
          phase = "revealing";
          setHint("เปิดกล่องของขวัญ...");
          openBoxSequence(caught);
        }

        function dropIntoChute(box) {
          const chuteHole = document.getElementById("chuteHole");
          const el = document.createElement("div");
          el.className = "chute-prize";
          
          // 🟢 เติม src: box.image เข้าไปเพื่อให้ดึงรูปกล่องหล่นลงช่อง
          const giftImg = createGiftImage({ 
            width: 42, 
            height: 42, 
            src: box.image 
          }); 
          
          giftImg.style.filter = "drop-shadow(0 6px 6px rgba(0,0,0,0.3))";
          el.appendChild(giftImg);
          el.style.left = 18 + Math.random() * 34 + "%";
          el.style.top = "0%";
          chuteHole.appendChild(el);
          setTimeout(() => {
            el.remove();
          }, 1400);
        }

        async function openBoxSequence(box) {
            const overlay = document.getElementById("overlay");
            const boxClosed = document.getElementById("boxClosed");
            const revealEmoji = document.getElementById("revealEmoji");
            const popTitle = document.getElementById("popTitle");
            const popText = document.getElementById("popText");
            const closeBtn = document.getElementById("popupClose");
            const blueReveal = document.getElementById("blueReveal");

            const fallbackPrize = prizes[box.prizeIndex % prizes.length];
            let finalPrize = getOrderedPrizeForTurn() || fallbackPrize;

            state.revealReady = false;

            // 1. ตั้งค่าสถานะเริ่มต้นของ Modal
            // 1. ตั้งค่าสถานะเริ่มต้นของ Modal
            boxClosed.className = "giftbox-big";
            boxClosed.style.display = "block";
            boxClosed.style.opacity = "1";
            boxClosed.style.background = "transparent";
            boxClosed.style.marginBottom = "24px"; // <-- เพิ่มระยะห่างด้านล่างกล่อง

            boxClosed.innerHTML = "";
            boxClosed.appendChild(createGiftImage({ width: 300, height: 300, src: REVEAL_IMAGE_PATH }));

            revealEmoji.classList.remove("show", "bounce");
            revealEmoji.textContent = "";
            revealEmoji.style.marginTop = "20px"; // <-- รางวัลที่เฉลยก็ให้ห่างด้วย

            blueReveal.classList.remove("flash");
            blueReveal.style.opacity = "0";

            // จัด Title ให้ห่างจากกล่อง
            popTitle.textContent = "กำลังเปิดกล่อง...";
            popTitle.style.marginTop = "24px"; // <-- ตรงนี้เลยครับ ที่คุณขอ
            popTitle.style.marginBottom = "8px";
            popTitle.style.display = "block";

            popText.textContent = "";
            closeBtn.style.display = "none";
            overlay.classList.add("show");

            // 2. หน่วงเวลาจังหวะแรกก่อนเริ่มเล่นเอฟเฟกต์
            await wait(500);

            playSound("gift");
            blueReveal.style.opacity = "1";
            blueReveal.style.transform = "scale(0.7)";
            void blueReveal.offsetWidth;
            blueReveal.classList.add("flash");
            await wait(600);

            boxClosed.style.display = "none";
            blueReveal.style.opacity = "0";

            popTitle.textContent = "✨ กำลังเปิดรางวัล...";
            popTitle.style.marginTop = "32px"; // <-- ตอนเปิดรางวัล ให้ห่างอีกนิด จะเด่นขึ้น
            await wait(600);

            // 3. คำนวณรางวัลพิเศษตามรอบการหมุน
            let specialPrizeName = "";
            if (dbTotalSpins % 5 === 0) {
              specialPrizeName = 'แลคตาซอย';
            } else if (dbTotalSpins % 2 === 1) {
              specialPrizeName = 'ไดนาไมท์';
            } else {
              specialPrizeName = 'ดิวเบอร์รี่';
            }

            // แสดงรูปภาพรางวัลหลัก
            revealEmoji.innerHTML = `<img src="${finalPrize.image}" style="width: 400px; height: 400px; object-fit: contain;">`;
            revealEmoji.classList.add("show");
            void revealEmoji.offsetWidth;
            revealEmoji.classList.add("bounce");

            state.stars += 5;
            state.gift += 1;
            updateHUD();

            // สร้าง HTML สำหรับรางวัลพิเศษ
            let specialPrizeHTML = '';
            let specialPrizeImage = '';

            if (specialPrizeName === "แลคตาซอย") {
              specialPrizeImage = "sponsors/lactasoy.png";
            } else if (specialPrizeName === "ดิวเบอร์รี่") {
              specialPrizeImage = "sponsors/blueberry.png";
            } else {
              specialPrizeImage = "sponsors/dynamite.png";
            }

            if (specialPrizeImage) { 
              specialPrizeHTML = ` 
                  <div style="
                      margin-top:15px; 
                      background:#f9f9f9; 
                      padding:20px; 
                      border-radius:15px; 
                      border:2px solid #f1c40f;
                      font-family:'Kanit', sans-serif;
                  "> 
                      <p style="
                          margin:0 0 10px 0; 
                          color:#34495e; 
                          font-weight:700; 
                          font-size:24px;
                          font-family:'Kanit', sans-serif;
                      ">
                          ✨ รับเพิ่ม! รางวัลพิเศษ ✨
                      </p> 
                      <img 
                          src="${specialPrizeImage}" 
                          style="
                              width:300px; 
                              height:300px; 
                              object-fit:contain;
                          "
                      > 
                  </div> 
              `; 
            }

            const currentPlayer = getCurrentPlayerName() || "ผู้เล่น";

            popTitle.textContent = "🎉 ยินดีด้วย!";
            popTitle.style.fontFamily = "'Kanit', sans-serif";
            popTitle.style.fontWeight = "700";

            popText.innerHTML = `
                <div style="
                    font-family: 'Kanit', sans-serif;
                    font-weight: 700;
                    font-size: 44px;
                    color: #2c3e50;
                    margin-bottom: 8px;
                ">
                    คุณ ${formatDisplayName(currentPlayer)}!
                </div>
                <div style="
                    font-family: 'Kanit', sans-serif;
                    font-weight: 700;
                    font-size: 28px;
                    color: #e67e22;
                ">
                    ได้รับ ${finalPrize.name}! (+5 ⭐)
                </div>
                ${specialPrizeHTML}
            `;

            closeBtn.style.display = "inline-block";
            state.revealReady = true;

            // 4. สลับตำแหน่งกล่องที่เหลือบนฉากหลังทันทีที่เปิดป๊อบอัพเสร็จ
            if (typeof shuffleRemainingBoxes === "function") {
              shuffleRemainingBoxes();
            }

            // 5. ตัดสต็อกและเพิ่มจำนวนการเล่นสะสม Firebase
            db.ref('currentStock/' + finalPrize.name).transaction((current) => (current || 0) - 1);
            db.ref('totalSpins').transaction((count) => (count || 0) + 1);

            // บันทึกประวัติ
            const now = new Date();
            const timestampStr = now.toLocaleString('th-TH', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false
            });

            db.ref('history').push({
              orderNo: (dbTotalSpins || 0) + 1,
              playerName: currentPlayer,
              prize: finalPrize.name,
              specialPrize: specialPrizeName || "-",
              datetime: timestampStr,
              timestamp: firebase.database.ServerValue.TIMESTAMP
            });

            // Auto Close หลังผ่านไป 15 วินาที
            setTimeout(() => {
              if (phase === "revealing" && state.revealReady) {
                closeRevealAndRestart();
              }
            }, 15000);
          }

        document.getElementById("popupClose").addEventListener("click", () => {
          if (phase === "revealing" && state.revealReady) {
            closeRevealAndRestart();
          }
        });

        function closeRevealAndRestart() {
          stopTimer();
          document.getElementById("overlay").classList.remove("show");
          state.revealReady = false;

          removeCurrentPlayerFromQueue();
          resetPrizeField();

          phase = "locked";
          state.clawXPct = 50;
          state.depth = 0;
          state.timeLeft = 15;
          heldPrizeEl.classList.remove("show");
          heldPrizeEl.innerHTML = "";
          clawEl.classList.remove("closed");
          rod.style.height = ROD_REST + "px";
          renderMotor();
          setHint("กด Enter หรือกดปุ่ม START เพื่อเริ่มเกมสำหรับผู้เล่นถัดไป");
          updateHUD();
          updateStartButtonState();
        }

        function showOut() {
          outMsg.classList.add("show");
        }
        document.getElementById("refillBtn").addEventListener("click", () => {
          state.credit = 20;
          outMsg.classList.remove("show");
          updateHUD();
        });

        function showAllCaught() {
          document.getElementById("allCaughtMsg").classList.add("show");
        }
        document.getElementById("restockBtn").addEventListener("click", () => {
          resetPrizeField();
          document.getElementById("allCaughtMsg").classList.remove("show");
        });

        document
          .getElementById("btnSound")
          .addEventListener("click", function () {
            this.textContent = this.textContent === "🔊" ? "🔇" : "🔊";
          });

        function syncPlayerFromAdmin() {
          const queueDisplay = document.getElementById('queueDisplay');
          const uniqueQueue = [...new Set(dbQueue)];

          if (queueDisplay) {
            queueDisplay.textContent = uniqueQueue.length
              ? `คิวปัจจุบัน: ${uniqueQueue[0]}`
              : 'คิว: รอชื่อผู้เล่น';
          }

          updateCurrentPlayerBadge();
          updateStartButtonState();
          
          if (!hasActivePlayer()) {
            setHint('รอชื่อผู้เล่นเข้าคิวก่อนเริ่มเกม');
          } else if (phase === 'locked') {
            setHint('กด Enter หรือกดปุ่ม START เพื่อเริ่มเกม');
          }
        }

        db.ref().on('value', (snapshot) => {
          const data = snapshot.val() || {};
          dbQueue = normalizeQueue(data.customerQueue || {});
          dbStock = data.currentStock || {};
          dbTotalSpins = data.totalSpins || 0;
          dbPrizeOrder = data.prizeOrder || {};
          syncPlayerFromAdmin();
        });

        phase = "locked";
        document.getElementById("startOverlay").classList.add("hide");
        stopTimer();
        state.timeLeft = 15;
        state.revealReady = false;
        setHint('รอชื่อผู้เล่นเข้าคิวก่อนเริ่มเกม');
        updateCurrentPlayerBadge();
        updateHUD();
        updateStartButtonState();
