    const firebaseConfig = {
        apiKey: "AIzaSyADzVirlflWjw7ux1i8fRNFUNSBT139-6I",
        authDomain: "slot-machine-ff297.firebaseapp.com",
        databaseURL: "https://slot-machine-ff297-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "slot-machine-ff297",
        storageBucket: "slot-machine-ff297.firebasestorage.app",
        messagingSenderId: "196859530049",
        appId: "1:196859530049:web:09ba13fa577fd5fbe1efc0"
    };

    firebase.initializeApp(firebaseConfig);
    const db = firebase.database(); // ตัวแปรนี้จะใช้คุยกับฐานข้อมูลครับ


    async function addCustomer() {
        const { value: name } = await Swal.fire({
            title: 'ลงทะเบียนลูกค้า',
                input: 'text',
                inputLabel: 'ชื่อลูกค้า (สำหรับหมุนรางวัลครั้งถัดไป)',
                inputPlaceholder: 'กรอกชื่อลูกค้า...',
                showCancelButton: true,
                confirmButtonColor: '#3498db',
                customClass: {
                    container: 'my-swal-font',
                    input: 'my-swal-input-font',
                    confirmButton: 'my-swal-font',
                    cancelButton: 'my-swal-font'
                }
        });

        if (name) {
            // ✨ บันทึกโครงสร้างแบบ Object ไปที่ Firebase 
            db.ref('customerQueue').push({
                name: name,
                status: "waiting",        
                timestamp: Date.now()      
            }).then(() => {
                Swal.fire('สำเร็จ', `คุณ ${name} เข้าคิวเรียบร้อย`, 'success');
            });
        }
    }

    // 1. ฟังก์ชันสำหรับอัปเดตหน้าจอ (ที่คุณเคยสร้างไว้)
    function update(dbQueue) {    
        const queueDiv = document.getElementById('current-queue-list');
        if (queueDiv) {
            // ดึงชื่อที่ซ้ำกันออกให้เหลือแค่ชื่อเดียว
            const uniqueQueue = [...new Set(dbQueue)];

            queueDiv.innerHTML = uniqueQueue.length > 0 ? uniqueQueue.map((n, i) => 
                `<span class="queue-badge ${i === 0 ? 'active' : ''}">${i === 0 ? '▶ ' : ''}${n}</span>`
            ).join('') : `<p style="color: #7f8c8d; font-size: 0.9rem; margin-top: 10px; font-family: 'Kanit';">คิวปัจจุบัน: ยังไม่มีลูกค้าในคิว</p>`;
        }
    }

    // 2. ฟังก์ชันดึงข้อมูลจาก Firebase แบบ Realtime
    function loadCustomerQueue() {
        const queueRef = db.ref('customerQueue');

        // ใช้ on('value') ฟังการเปลี่ยนแปลงจาก Firebase
        queueRef.on('value', (snapshot) => {
            const data = snapshot.val();
            let dbQueue = [];

            if (data) {
                for (let id in data) {
                    const entry = data[id];
                    // รองรับทั้งรูปแบบ object จากหน้า admin และ string จากข้อมูลคิวเดิม
                    if (typeof entry === 'string') {
                        dbQueue.push(entry);
                    } else if (entry && entry.name && (!entry.status || entry.status === 'waiting')) {
                        dbQueue.push(entry.name);
                    }
                }
            }

            // ส่งข้อมูลไปให้ฟังก์ชัน update ทำงานต่อ
            update(dbQueue);
        });
    }

    // 3. เรียกใช้งานเมื่อโหลดหน้าเว็บ
    window.onload = function() {
        loadCustomerQueue();
    };


    // เก็บข้อมูลลำดับรางวัล (Key: ลำดับที่ 1-100, Value: ข้อมูลของรางวัลที่เลือก)
let prizeOrders = {};
let currentRangeStart = 1;
const rangeSize = 100; // แสดงหน้าละ 20 ช่อง (รวม 5 แท็ก เป็น 100 ช่อง)
let availablePrizesList = []; // เก็บรายการของรางวัลที่เปิดใช้งานอยู่

document.addEventListener("DOMContentLoaded", function () {
    initOrderModule();
});

// เริ่มต้นโหลดระบบจัดการลำดับรางวัล
async function initOrderModule() {
    await fetchActivePrizesForOrder();
    renderRangeTabs();
    renderOrderGrid(1);
    loadSavedOrders(); // โหลดข้อมูลเก่าที่เคยบันทึกไว้ (ถ้ามี)
}

// 1. ดึงรายการของรางวัลที่เปิดใช้งานอยู่จาก Server
async function fetchActivePrizesForOrder() {
    try {
        const response = await fetch('/api/prizes');
        const result = await response.json();
        if (result.success) {
            // กรองเฉพาะอันที่ status === 'on' (ถ้ามี) หรือใช้ทั้งหมด
            availablePrizesList = result.data.filter(item => item.status === 'on');
        }
    } catch (error) {
        console.error('Error fetching prizes:', error);
    }
}

// 2. สร้างปุ่มแท็กช่วงลำดับ (1-20, 21-40, 41-60, 61-80, 81-100)
function renderRangeTabs() {
    const tabsContainer = document.getElementById('order-range-tabs');
    if (!tabsContainer) return;
    tabsContainer.innerHTML = '';

    for (let i = 1; i <= 100; i += rangeSize) {
        const end = Math.min(i + rangeSize - 1, 100);
        const isActive = i === currentRangeStart ? 'active' : '';
        
        const btn = document.createElement('button');
        btn.className = `btn btn-sm btn-outline-success me-2 mb-2 px-3 py-2 rounded-3 ${isActive}`;
        btn.style.fontFamily = "'Kanit', sans-serif;";
        btn.innerText = `ลำดับที่ ${i} - ${end}`;
        btn.onclick = () => {
            currentRangeStart = i;
            renderRangeTabs();
            renderOrderGrid(i);
        };
        tabsContainer.appendChild(btn);
    }
}

// 3. สร้างตารางช่องเลือกรางวัล (Grid 20 ช่องต่อหน้า)
function renderOrderGrid(startNum) {
    const gridContainer = document.getElementById('order-grid');
    if (!gridContainer) return;
    gridContainer.innerHTML = '';
    
    // กำหนด Grid style เบื้องต้นให้เรียงสวยงาม
    gridContainer.className = "row g-3";

    const endNum = Math.min(startNum + rangeSize - 1, 100);

    for (let i = startNum; i <= endNum; i++) {
        const prize = prizeOrders[i]; // ของรางวัลที่เลือกไว้ในลำดับนี้

        const col = document.createElement('div');
        col.className = 'col-6 col-md-4 col-lg-1';

        col.innerHTML = `
            <div class="card h-100 border-0 shadow-sm rounded-4 p-2 text-center position-relative hover-shadow transition-all" 
                 style="cursor: pointer; background-color: ${prize ? '#f8fff9' : '#fff'}; border: 2px dashed ${prize ? '#198754' : '#dee2e6'} !important;"
                 onclick="openPrizeSelector(${i})">
                
                <span class="position-absolute badge rounded-pill bg-success" style="top: 6px; left: 6px; font-size: 11px; z-index: 5; padding: 2px 6px;">
                    #${i}
                </span>

                <div class="card-body d-flex flex-column align-items-center justify-content-center p-2 pt-3">
                    ${prize ? `
                        <img src="${prize.image_path}" class="rounded-3 mb-2 shadow-sm" style="width: 60px; height: 60px; object-fit: cover;">
                        <h6 class="text-dark fw-bold text-truncate w-100 mb-0" style="font-size: 12px; font-family: 'Google Sans', sans-serif;">${prize.product_name}</h6>
                        <small class="text-muted" style="font-size: 10px;">${prize.product_code}</small>
                    ` : `
                        <div class="py-3 text-muted">
                            <i class="bi bi-plus-circle fs-3 text-success"></i>
                            <p class="mb-0 mt-1" style="font-size: 12px; font-family: 'Kanit', sans-serif;">คลิกเลือกรางวัล</p>
                        </div>
                    `}
                </div>
            </div>
        `;
        gridContainer.appendChild(col);
    }
}

// 4. เปิด Modal เลือกของรางวัลสำหรับช่องนั้นๆ (ใช้ SweetAlert2)
async function openPrizeSelector(slotIndex) {
    if (availablePrizesList.length === 0) {
        Swal.fire('แจ้งเตือน', 'ยังไม่มีของรางวัลที่เปิดใช้งาน กรุณาเพิ่มของรางวัลในหน้าจัดการก่อน', 'warning');
        return;
    }

    // สร้าง HTML รายการของรางวัลให้เลือกใน SweetAlert
    let optionsHtml = `<div class="row g-2 text-start" style="max-height: 350px; overflow-y: auto;">`;
    // ปรับฟังก์ชันเปิด Modal ให้ส่ง product_code เข้าไปแทน id
    availablePrizesList.forEach(p => {
        optionsHtml += `
            <div class="col-3">
                <div class="p-2 border rounded-3 d-flex align-items-center prize-option-card shadow-sm" 
                    style="cursor: pointer; transition: 0.2s;" 
                    onclick="selectPrizeForSlot(${slotIndex}, '${p.product_code}')">
                    <img src="${p.image_path}" class="rounded-2 me-2" style="width: 45px; height: 45px; object-fit: cover;">
                    <div class="text-truncate">
                        <div class="fw-bold text-dark text-truncate" style="font-size: 12px;">${p.product_name}</div>
                        <div class="text-muted" style="font-size: 10px;">รหัส: ${p.product_code}</div>
                    </div>
                </div>
            </div>
        `;
    });
    optionsHtml += `</div>`;

    Swal.fire({
        title: `ลำดับที่ #${slotIndex}`,
        html: optionsHtml,
        showConfirmButton: false,
        showCloseButton: true,
        width: '600px'
    });
}

// 5. เมื่อผู้ใช้คลิกเลือกของรางวัลใส่ช่อง
function selectPrizeForSlot(slotIndex, productCode) {
    const selectedPrize = availablePrizesList.find(p => p.product_code === productCode);
    if (selectedPrize) {
        prizeOrders[slotIndex] = selectedPrize;
        Swal.close();
        renderOrderGrid(currentRangeStart); // อัปเดตตารางแสดงผล
    }
}

// 6. บันทึกลำดับรางวัลทั้งหมดลงฐานข้อมูล
async function savePrizeOrder() {
    try {
        const response = await fetch('/api/prize-orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(prizeOrders)
        });

        const result = await response.json();

        if (response.ok && result.success) {
            Swal.fire({
                icon: 'success',
                title: 'บันทึกสำเร็จ!',
                text: 'บันทึกลำดับของรางวัลลงฐานข้อมูลเรียบร้อยแล้ว',
                timer: 1500,
                showConfirmButton: true,
                confirmButtonText: 'ตกลง',
                confirmButtonColor: '#198754'
            });
        } else {
            Swal.fire('ผิดพลาด!', result.message || 'ไม่สามารถบันทึกได้', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        Swal.fire('ผิดพลาด!', 'ไม่สามารถเชื่อมต่อกับ Server ได้', 'error');
    }
}

// 2. โหลดข้อมูลลำดับรางวัลจาก MySQL ตอนเปิดหน้าเว็บ
async function loadSavedOrders() {
    try {
        const response = await fetch('/api/prize-orders');
        const result = await response.json();

        if (result.success && result.data) {
            prizeOrders = result.data; // นำข้อมูล Object ที่ดึงมาใส่ตัวแปรหลัก
            renderOrderGrid(currentRangeStart);
        }
    } catch (error) {
        console.error('Error loading saved orders:', error);
    }
}

// 7. ลบลำดับทั้งหมด (ลบเฉพาะในตาราง prize_orders)
function clearAllOrders() {
    Swal.fire({
        title: 'คุณต้องการล้างลำดับ?',
        text: 'ข้อมูลลำดับของรางวัลทั้งหมดจะถูกลบ',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'ใช่, ล้างเลย',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#dc3545'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                // ส่งคำสั่ง DELETE ไปยัง Backend เพื่อเคลียร์ข้อมูลในตาราง prize_orders
                const response = await fetch('/api/prize-orders', {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                const resData = await response.json();

                if (response.ok && resData.success) {
                    // เคลียร์ข้อมูลในตัวแปรฝั่งหน้าจอ
                    prizeOrders = {};
                    localStorage.removeItem('saved_prize_orders');
                    
                    // เรนเดอร์ตารางใหม่ให้ทุกช่องว่างเปล่าพร้อมเลือกใหม่
                    renderOrderGrid(currentRangeStart);

                    Swal.fire({ 
                        icon: 'success', 
                        title: 'ล้างข้อมูลสำเร็จ', 
                        text: 'ลบลำดับในตาราง เรียบร้อยแล้ว',
                        timer: 1200, 
                        showConfirmButton: false 
                    });
                } else {
                    Swal.fire('ผิดพลาด!', resData.message || 'ไม่สามารถล้างข้อมูลได้', 'error');
                }
            } catch (error) {
                console.error('Error clearing orders:', error);
                Swal.fire('ผิดพลาด!', 'ไม่สามารถเชื่อมต่อกับ Server ได้', 'error');
            }
        }
    });
}
