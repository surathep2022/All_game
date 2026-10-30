const express = require('express');
const path = require('path');
const mysql = require('mysql2');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = 3000;

// 1. ตั้งค่าการเชื่อมต่อ MySQL Workbench
const db = mysql.createPool({
    host: 'localhost',
    user: 'root',         // ใส่ Username ของ MySQL คุณ
    password: 'admin1234', // ใส่ Password ของ MySQL คุณ
    database: 'game_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// ตรวจสอบโฟลเดอร์ admin/img ถ้ายังไม่มีให้สร้างขึ้นมาอัตโนมัติ
const imgDir = path.join(__dirname, 'admin', 'img');
if (!fs.existsSync(imgDir)) {
    fs.mkdirSync(imgDir, { recursive: true });
}

const sponsorUploadsDir = path.join(__dirname, 'admin', 'img_sponsors');
if (!fs.existsSync(sponsorUploadsDir)) {
    fs.mkdirSync(sponsorUploadsDir, { recursive: true });
}

// 2. ตั้งค่า Multer สำหรับ Save ภาพลงโฟลเดอร์ admin/img
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, imgDir); // ตำแหน่งเซฟรูป
    },
    filename: function (req, file, cb) {
        const productCode = String(req.body.productCode || '').trim();
        if (!/^[A-Za-z0-9_-]{1,10}$/.test(productCode)) {
            return cb(new Error('กรุณาระบุรหัสสินค้าให้ถูกต้องก่อนอัปโหลดรูปภาพ'));
        }

        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `prize-${productCode}${ext}`);
    }
});

const upload = multer({ storage: storage });
const sponsorUpload = multer({
    storage: multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, sponsorUploadsDir);
        },
        filename: function (req, file, cb) {
            const sponsorCode = String(req.body.sponsor_code || '').trim();
            if (!/^[A-Za-z0-9_-]{1,10}$/.test(sponsorCode)) {
                return cb(new Error('กรุณาระบุรหัสผู้สนับสนุนให้ถูกต้องก่อนอัปโหลดรูปภาพ'));
            }

            const ext = path.extname(file.originalname).toLowerCase();
            cb(null, `sponsor-${sponsorCode}${ext}`);
        }
    }),
    fileFilter: function (req, file, cb) {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('กรุณาเลือกไฟล์รูปภาพ'));
        }
        cb(null, true);
    }
});

// View Engine & Static Files
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'admin'));
app.use(express.static(path.join(__dirname, 'admin')));
app.use('/lucky_claw', express.static(path.join(__dirname, 'lucky_claw')));
app.use('/img_sponsors', express.static(sponsorUploadsDir));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Route หน้าหลัก
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'admin.html'));
});

app.get('/gift_item', (req, res) =>{
    res.sendFile(path.join(__dirname, 'admin', 'gift_item.html'));
});

app.get('/sponsors', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'sponsors.html'));
})

app.get('/setup_sponsors', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'setup_sponsors.html'));
})

app.get('/game_history', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'game_history.html'));
})

app.get('/all_game', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'all_game.html'));
})


// Route lucky_claw
app.get('/lucky_claw', (req, res) => {
    // ปรับ Path ให้ถอด 'admin' ออก และชี้ไปที่โฟลเดอร์ lucky_claw โดยตรง
    res.sendFile(path.join(__dirname, 'lucky_claw', 'lucky_claw.html'));
});


// 3. API สำหรับรับข้อมูลจากฟอร์ม Modal มาบันทึกลง MySQL
app.post('/api/add-prize', upload.single('productImage'), (req, res) => {
    try {
        const { productCode, productName } = req.body;
        const file = req.file;

        if (!productCode || !productName || !file) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลและอัปโหลดรูปภาพให้ครบถ้วน' });
        }

        // พาธที่จะเก็บบันทึกลง MySQL (เช่น /img/prize-123456.jpg)
        const imagePath = `/img/${file.filename}`;

        // บันทึกลงตาราง prizes ใน MySQL
        const sql = 'INSERT INTO prizes (product_code, product_name, image_path) VALUES (?, ?, ?)';
        db.query(sql, [productCode, productName, imagePath], (err, result) => {
            if (err) {
                console.error('MySQL Error:', err);
                return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการบันทึกลงฐานข้อมูล' });
            }

            res.json({
                success: true,
                message: 'บันทึกข้อมูลของรางวัลเรียบร้อยแล้ว!',
                data: {
                    id: result.insertId,
                    productCode,
                    productName,
                    imagePath
                }
            });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// 4. API สำหรับดึงรายการของรางวัลทั้งหมดจาก MySQL
app.get('/api/prizes', (req, res) => {
    const sql = "SELECT * FROM prizes ORDER BY id DESC";
    db.query(sql, (err, results) => {
        if (err) {
            console.error('MySQL Error:', err);
            return res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลได้' });
        }
        res.json({ success: true, data: results });
    });
});

// 5. API สำหรับอัปเดตสถานะของรางวัล (on / off)
app.put('/api/prizes/status', (req, res) => {
    const { id, status } = req.body;

    if (!id || !status) {
        return res.status(400).json({ success: false, message: 'ข้อมูลไม่ครบถ้วน' });
    }

    const sql = 'UPDATE prizes SET status = ? WHERE id = ?';
    db.query(sql, [status, id], (err, result) => {
        if (err) {
            console.error('MySQL Error:', err);
            return res.status(500).json({ success: false, message: 'ไม่สามารถอัปเดตสถานะได้' });
        }

        res.json({ success: true, message: 'อัปเดตสถานะสำเร็จ' });
    });
});

// 6. API สำหรับลบของรางวัลตาม ID
app.delete('/api/prizes/:id', (req, res) => {
    const prizeId = req.params.id;

    const sql = 'DELETE FROM prizes WHERE id = ?';
    db.query(sql, [prizeId], (err, result) => {
        if (err) {
            console.error('MySQL Error:', err);
            return res.status(500).json({ success: false, message: 'ไม่สามารถลบข้อมูลได้' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลของรางวัลที่ต้องการลบ' });
        }

        res.json({ success: true, message: 'ลบข้อมูลสำเร็จ' });
    });
});



// ================= SPONSORS API ENDPOINTS =================

// 1. API: ดึงข้อมูล Sponsors ทั้งหมด
app.get('/api/sponsors', (req, res) => {
    const sql = 'SELECT * FROM sponsors ORDER BY id DESC';
    db.query(sql, (err, results) => {
        if (err) {
            console.error('MySQL Error:', err);
            return res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลผู้สนับสนุนได้' });
        }
        res.json({ success: true, data: results });
    });
});

// 2. API: เพิ่ม Sponsor ใหม่ (รองรับการอัปโหลดไฟล์รูปภาพ)
app.post('/api/sponsors', (req, res, next) => {
    sponsorUpload.single('image')(req, res, (err) => {
        if (err) {
            return res.status(400).json({ success: false, message: err.message });
        }
        next();
    });
}, (req, res) => {
    const sponsorCode = String(req.body.sponsor_code || '').trim();
    const sponsorName = String(req.body.sponsor_name || '').trim();

    if (!/^[A-Za-z0-9_-]{1,10}$/.test(sponsorCode) || !sponsorName) {
        if (req.file) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('Unable to remove invalid sponsor image:', err);
            });
        }
        return res.status(400).json({ success: false, message: 'กรุณาระบุรหัสและชื่อผู้สนับสนุนให้ถูกต้อง' });
    }

    if (!req.file) {
        return res.status(400).json({ success: false, message: 'กรุณาอัปโหลดรูปภาพโลโก้' });
    }

    const imagePath = `/img_sponsors/${req.file.filename}`;
    const status = 'on'; // ค่าเริ่มต้น

    const sql = 'INSERT INTO sponsors (sponsor_code, sponsor_name, image_path, status) VALUES (?, ?, ?, ?)';
    db.query(sql, [sponsorCode, sponsorName, imagePath, status], (err, result) => {
        if (err) {
            console.error('MySQL Error:', err);
            fs.unlink(req.file.path, (unlinkErr) => {
                if (unlinkErr) console.error('Unable to remove sponsor image after database error:', unlinkErr);
            });
            return res.status(500).json({ success: false, message: 'รหัสผู้สนับสนุนอาจซ้ำ หรือเกิดข้อผิดพลาดในการบันทึก' });
        }

        res.json({
            success: true,
            message: 'บันทึกผู้สนับสนุนสำเร็จ',
            data: {
                id: result.insertId,
                sponsor_code: sponsorCode,
                sponsor_name: sponsorName,
                image_path: imagePath,
                status
            }
        });
    });
});

// 3. API: อัปเดตสถานะ Sponsor (on / off)
app.put('/api/sponsors/status', (req, res) => {
    const { id, status } = req.body;

    if (!Number.isInteger(Number(id)) || Number(id) < 1 || !['on', 'off'].includes(status)) {
        return res.status(400).json({ success: false, message: 'ข้อมูลไม่ครบถ้วน' });
    }

    const sql = 'UPDATE sponsors SET status = ? WHERE id = ?';
    db.query(sql, [status, id], (err, result) => {
        if (err) {
            console.error('MySQL Error:', err);
            return res.status(500).json({ success: false, message: 'ไม่สามารถอัปเดตสถานะได้' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลผู้สนับสนุนที่ต้องการแก้ไข' });
        }

        res.json({ success: true, message: 'อัปเดตสถานะสำเร็จ' });
    });
});

// 4. API: ลบ Sponsor ตาม ID (พร้อมลบไฟล์รูปภาพออกจาก Server)
app.delete('/api/sponsors/:id', (req, res) => {
    const sponsorId = Number(req.params.id);
    if (!Number.isInteger(sponsorId) || sponsorId < 1) {
        return res.status(400).json({ success: false, message: 'รหัสผู้สนับสนุนไม่ถูกต้อง' });
    }

    // ค้นหา path รูปภาพก่อนลบข้อมูลจากตาราง
    const selectSql = 'SELECT image_path FROM sponsors WHERE id = ?';
    db.query(selectSql, [sponsorId], (err, results) => {
        if (err) {
            console.error('MySQL Error:', err);
            return res.status(500).json({ success: false, message: 'ไม่สามารถค้นหาข้อมูลผู้สนับสนุนได้' });
        }
        if (results.length === 0) {
            return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลผู้สนับสนุนที่ต้องการลบ' });
        }

        const imagePath = results[0].image_path;

        // สั่งลบข้อมูลออกจาก MySQL
        const deleteSql = 'DELETE FROM sponsors WHERE id = ?';
        db.query(deleteSql, [sponsorId], (deleteErr, deleteResult) => {
            if (deleteErr) {
                console.error('MySQL Error:', deleteErr);
                return res.status(500).json({ success: false, message: 'ไม่สามารถลบข้อมูลได้' });
            }

            // ลบไฟล์รูปภาพจริงออกจากโฟลเดอร์ (ถ้ามีไฟล์อยู่)
            if (imagePath && imagePath.startsWith('/img_sponsors/')) {
                const fullPath = path.join(sponsorUploadsDir, path.basename(imagePath));
                fs.unlink(fullPath, (unlinkErr) => {
                    if (unlinkErr && unlinkErr.code !== 'ENOENT') {
                        console.error('Unable to remove sponsor image:', unlinkErr);
                    }
                });
            }

            res.json({ success: true, message: 'ลบข้อมูลสำเร็จ' });
        });
    });
});


// ==================== PRIZE ORDERS APIS ====================

// API สำหรับบันทึกลำดับของรางวัล (อ้างอิงด้วย product_code)
app.post('/api/prize-orders', (req, res) => {
    const orders = req.body; // รับค่า Object เช่น { "1": { product_code: "P001", ... } }

    if (!orders || typeof orders !== 'object') {
        return res.status(400).json({ success: false, message: 'ข้อมูลลำดับไม่ถูกต้อง' });
    }

    const entries = Object.entries(orders);

    if (entries.length === 0) {
        db.query('DELETE FROM prize_orders', (err) => {
            if (err) return res.status(500).json({ success: false, message: 'ไม่สามารถเคลียร์ข้อมูลได้' });
            return res.json({ success: true, message: 'ล้างลำดับทั้งหมดเรียบร้อยแล้ว' });
        });
        return;
    }

    // ล้างข้อมูลเก่าก่อนบันทึกชุดใหม่
    db.query('DELETE FROM prize_orders', (delErr) => {
        if (delErr) {
            console.error('MySQL Error:', delErr);
            return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการเคลียร์ข้อมูลเก่า' });
        }

        // นำ product_code มาบันทึก
        const values = entries.map(([slotIndex, prize]) => [parseInt(slotIndex), prize.product_code]);
        const insertSql = 'INSERT INTO prize_orders (slot_index, prize_code) VALUES ?';

        db.query(insertSql, [values], (err, result) => {
            if (err) {
                console.error('MySQL Error:', err);
                return res.status(500).json({ success: false, message: 'ไม่สามารถบันทึกลำดับลงฐานข้อมูลได้' });
            }

            res.json({ success: true, message: 'บันทึกลำดับรางวัลลงฐานข้อมูลสำเร็จ!' });
        });
    });
});

// API สำหรับดึงข้อมูลลำดับรางวัล (Join ด้วย product_code)
app.get('/api/prize-orders', (req, res) => {
    const sql = `
        SELECT po.slot_index, p.* 
        FROM prize_orders po
        JOIN prizes p ON po.prize_code = p.product_code
    `;
    db.query(sql, (err, results) => {
        if (err) {
            console.error('MySQL Error:', err);
            return res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลลำดับได้' });
        }

        const ordersMap = {};
        results.forEach(row => {
            const slot = row.slot_index;
            ordersMap[slot] = {
                id: row.id,
                product_code: row.product_code,
                product_name: row.product_name,
                image_path: row.image_path,
                status: row.status
            };
        });

        res.json({ success: true, data: ordersMap });
    });
});

// API สำหรับลบข้อมูลลำดับรางวัลทั้งหมดในตาราง prize_orders
app.delete('/api/prize-orders', (req, res) => {
    const sql = 'DELETE FROM prize_orders';
    db.query(sql, (err, result) => {
        if (err) {
            console.error('MySQL Error:', err);
            return res.status(500).json({ success: false, message: 'ไม่สามารถล้างข้อมูลลำดับรางวัลได้' });
        }
        res.json({ success: true, message: 'ลบข้อมูลใน prize_orders สำเร็จเรียบร้อยแล้ว' });
    });
});


// API สำหรับดึงข้อมูล sponsors ที่ status = 'no'
app.get('/api/sponsors/inactive', (req, res) => {
    // ใช้ LEFT JOIN เพื่อดึงข้อมูล sponsors และ quantity จาก sponsors_stock มาด้วย
    const sql = `
        SELECT s.*, st.quantity 
        FROM game_db.sponsors s
        LEFT JOIN game_db.sponsors_stock st ON s.id = st.sponsor_id
        WHERE s.status = 'on'
    `;
    
    db.query(sql, (err, results) => {
        if (err) {
            console.error('MySQL Error:', err);
            return res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลผู้สนับสนุนได้' });
        }
        res.json({ success: true, data: results });
    });
});

// API สำหรับบันทึกสัดส่วนลงตาราง sponsors_stock
// API สำหรับบันทึกสัดส่วน (แบบเรียบง่าย: ลบของเก่าทั้งหมด แล้วเพิ่มใหม่)
app.post('/api/sponsor-ratios', (req, res) => {
    const { ratios } = req.body; // รับค่ามาเป็น [{ sponsor_code: 'SP001', ratio_count: 60 }, ...]

    if (!ratios || !Array.isArray(ratios) || ratios.length === 0) {
        return res.status(400).json({ success: false, message: 'ข้อมูลสัดส่วนไม่ถูกต้อง' });
    }

    // 1. ลบข้อมูลเก่าในตาราง sponsors_stock ทั้งหมดก่อน
    db.query('DELETE FROM sponsors_stock', (err) => {
        if (err) {
            console.error('Delete Error:', err);
            return res.status(500).json({ success: false, message: 'ไม่สามารถเคลียร์ข้อมูลเก่าได้' });
        }

        let completedQueries = 0;
        let hasError = false;

        // 2. วนลูปบันทึกข้อมูลชุดใหม่เข้าไปทีละรายการ
        ratios.forEach(item => {
            // ใช้ Subquery หา id จาก sponsor_code แล้วบันทึกลง sponsors_stock
            const sql = `
                INSERT INTO sponsors_stock (sponsor_id, quantity) 
                VALUES ((SELECT id FROM sponsors WHERE sponsor_code = ?), ?)
            `;
            
            db.query(sql, [item.sponsor_code, item.ratio_count], (err, result) => {
                if (err) {
                    console.error('MySQL Error:', err);
                    hasError = true;
                }

                completedQueries++;

                // เช็คว่าทำครบทุกตัวหรือยัง
                if (completedQueries === ratios.length) {
                    if (hasError) {
                        return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการบันทึกบางรายการ' });
                    }
                    res.json({ success: true, message: 'บันทึกสัดส่วนสำเร็จเรียบร้อยแล้ว' });
                }
            });
        });
    });
});

// API สำหรับดึงข้อมูลสัดส่วนปัจจุบัน
app.get('/api/sponsor-ratios', (req, res) => {
    const sql = `
        SELECT s.sponsor_code, st.quantity 
        FROM sponsors_stock st
        JOIN sponsors s ON st.sponsor_id = s.id
    `;
    
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error fetching ratios:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        res.json({ success: true, data: results });
    });
});

// API สำหรับบันทึกประวัติการเล่นเกมลง MySQL
app.post('/api/game-history', (req, res) => {
    const { orderNo, playerName, prize, specialPrize, datetime } = req.body;

    const sql = `
        INSERT INTO game_history (order_no, player_name, prize_name, special_prize, datetime) 
        VALUES (?, ?, ?, ?, ?)
    `;

    db.query(sql, [orderNo, playerName, prize, specialPrize || '-', datetime], (err, result) => {
        if (err) {
            console.error('Error saving history to MySQL:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        res.json({ success: true, message: 'บันทึกประวัติสำเร็จ' });
    });
});

// API สำหรับดึงข้อมูลประวัติการเล่นเกมทั้งหมด (เพื่อเช็คลำดับล่าสุด หรือนำไปแสดงในตาราง Admin)
app.get('/api/game-history/count', (req, res) => {
    const sql = `SELECT COUNT(*) AS total FROM game_history`;
    
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error counting history:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        
        res.json({ success: true, total: results[0].total });
    });
});

app.get('/api/game-history/data', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 10; // แสดงหน้าละ 10 รายการ
    const offset = (page - 1) * limit;

    // 1. นับจำนวนรายการทั้งหมดในตาราง
    const countSql = `SELECT COUNT(*) AS total FROM game_history`;
    db.query(countSql, (err, countResult) => {
        if (err) {
            console.error('Error counting history:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        const totalItems = countResult[0].total;
        const totalPages = Math.ceil(totalItems / limit) || 1;

        // 2. ดึงข้อมูลเฉพาะ 10 รายการตามหน้าที่เลือก
        const sql = `SELECT * FROM game_history ORDER BY id DESC LIMIT ? OFFSET ?`;
        
        // ใช้ array ส่งค่าตัวเลขเข้าไปใน query เพื่อความปลอดภัย (SQL Injection Prevention)
        db.query(sql, [limit, offset], (err, results) => {
            if (err) {
                console.error('Error fetching history:', err);
                return res.status(500).json({ success: false, message: 'Database error' });
            }

            res.json({
                success: true,
                data: results,
                pagination: {
                    currentPage: page,
                    totalPages: totalPages,
                    totalItems: totalItems
                }
            });
        });
    });
});

app.get('/api/game-history/export', (req, res) => {
    const sql = `
        SELECT id, player_name, prize_name, special_prize, datetime
        FROM game_history
        ORDER BY id DESC
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error exporting game history:', err);
            return res.status(500).json({ success: false, message: 'ไม่สามารถส่งออกประวัติการเล่นได้' });
        }

        res.json({ success: true, data: results });
    });
});

app.delete('/api/game-history/clear', (req, res) => {
    // ใช้ TRUNCATE เพื่อลบข้อมูลทั้งหมดและรีเซ็ตค่า Auto Increment ID (หรือใช้ DELETE FROM game_history ได้เช่นกัน)
    const sql = `TRUNCATE TABLE game_history`;
    
    db.query(sql, (err, result) => {
        if (err) {
            console.error('MySQL Error:', err);
            return res.status(500).json({ 
                success: false, 
                message: 'ไม่สามารถลบข้อมูลในฐานข้อมูลได้' 
            });
        }
        
        res.json({ 
            success: true, 
            message: 'ลบประวัติทั้งหมดเรียบร้อยแล้ว' 
        });
    });
});


app.use((err, req, res, next) => {
    console.error('Request Error:', err);
    if (req.path.startsWith('/api/')) {
        return res.status(err.status || 500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการประมวลผลคำขอ'
        });
    }
    next(err);
});



app.listen(PORT, () => {
    console.log(`
    =================================
         🎮 GAME SERVER
    =================================`);
    console.log(`Server is running at http://localhost:${PORT}`);
});