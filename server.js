const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const db = require("./db");
require("dotenv").config();

// ========================
// CLOUDINARY
// ========================
const cloudinary = require("cloudinary").v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// ========================
//app post
// ========================

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));


// ========================
// HEALTH
// ========================
app.get("/", (req, res) => {
    res.json({ status: "Biometric API Running 🚀" });
});
// ========================
// open
// ========================
app.get("/open-pandora", (req, res) => {
    res.redirect("https://ncf-pandora.free.nf/admin/dashboard.php");
});

// ========================
//return reservations
// ========================
app.post("/return-reservation", async (req, res) => {
    try {
        console.log("API RECEIVED:", req.body);

        const { reservation_id } = req.body;

        if (!reservation_id) {
            return res.json({
                success: false,
                message: "Missing reservation_id"
            });
        }

        // 1. Get reservation details
        const [rows] = await db.query(
            "SELECT * FROM reservations WHERE id=?",
            [reservation_id]
        );

        if (!rows.length) {
            return res.json({
                success: false,
                message: "Reservation not found"
            });
        }

        const reservation = rows[0];

        // 2. Update reservation status
        await db.query(
            `UPDATE reservations 
             SET status='returned', returned_date = NOW() 
             WHERE id=?`,
            [reservation_id]
        );

        // 3. RETURN STOCK TO INVENTORY (IMPORTANT FIX)
        await db.query(
            `UPDATE inventory 
             SET quantity = quantity + ? 
             WHERE id = ?`,
            [reservation.quantity, reservation.item_id]
        );

        res.json({
            success: true,
            message: "Reservation returned and stock restored!"
        });

    } catch (err) {
        console.error(err);
        res.json({
            success: false,
            message: "Server error"
        });
    }
});
// ===============================
// TOTAL USERS
// ===============================
app.get("/stats/users", async (req, res) => {
    try {
        const [rows] = await db.query("SELECT COUNT(*) AS total FROM users");
        res.json({ total: rows[0].total });
    } catch (err) {
        console.error(err);
        res.json({ total: 0 });
    }
});
// ===============================
// TOTAL INVENTORY ITEMS
// ===============================
app.get("/stats/inventory", async (req, res) => {
    try {
        const [rows] = await db.query("SELECT COUNT(*) AS total FROM inventory");
        res.json({ total: rows[0].total });
    } catch (err) {
        console.error(err);
        res.json({ total: 0 });
    }
});
// ========================
//reserve items
// ========================
app.post("/reserve-item", async (req, res) => {
    try {
        const { user_id, item_id, quantity, start_time, end_time } = req.body;

        if (!user_id || !item_id || !quantity || !start_time || !end_time) {
            return res.json({ success: false, message: "Missing fields" });
        }

        // OPTIONAL: check available stock (for warning only)
        const [item] = await db.query(
            "SELECT quantity FROM inventory WHERE id = ?",
            [item_id]
        );

        if (!item.length) {
            return res.json({ success: false, message: "Item not found" });
        }

        // ❌ DO NOT deduct stock here

        await db.query(
            `INSERT INTO reservations
            (user_id, item_id, quantity, start_time, end_time, status)
            VALUES (?, ?, ?, ?, ?, 'pending')`,
            [user_id, item_id, quantity, start_time, end_time]
        );

        return res.json({
            success: true,
            message: "Reservation submitted!"
        });

    } catch (err) {
        console.error(err);
        res.json({ success: false, message: "Server error" });
    }
});
// ==========================
// GET ALL RESERVATIONS
// ==========================
app.get("/get-reservations", async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT 
                r.id,
                r.user_id,
                r.item_id,
                r.start_time,
                r.end_time,
                r.status,

                u.username,

                COALESCE(i.name, 'UNKNOWN ITEM') AS item_name,
                i.photo AS item_photo,

                i.quantity AS item_quantity   -- ✅ ADD THIS

            FROM reservations r
            LEFT JOIN users u ON r.user_id = u.id
            LEFT JOIN inventory i ON r.item_id = i.id
            ORDER BY r.start_time DESC
        `);

        console.log("RESERVATIONS ROWS:", rows);

        res.json({
            success: true,
            data: rows
        });

    } catch (err) {
        console.error("ERROR:", err);
        res.json({
            success: false,
            message: err.message
        });
    }
});

// ==========================
// APPROVE RESERVATION
// ==========================
app.post("/approve-reservation", async (req, res) => {
    try {
        const { id } = req.body;

        // 1. Get reservation
        const [reservation] = await db.query(
            "SELECT * FROM reservations WHERE id = ?",
            [id]
        );

        if (!reservation.length) {
            return res.json({ success: false, message: "Not found" });
        }

        const r = reservation[0];

        // 2. Get item stock
        const [item] = await db.query(
            "SELECT quantity FROM inventory WHERE id = ?",
            [r.item_id]
        );

        if (!item.length) {
            return res.json({ success: false, message: "Item not found" });
        }

        const currentStock = item[0].quantity;

        // 3. Check if enough stock
        if (currentStock < r.quantity) {
            return res.json({
                success: false,
                message: "Not enough stock to approve"
            });
        }

        // 4. Deduct stock ONLY NOW (approve time)
        await db.query(
            "UPDATE inventory SET quantity = quantity - ? WHERE id = ?",
            [r.quantity, r.item_id]
        );

        // 5. Update reservation status
        await db.query(
            "UPDATE reservations SET status = 'approved' WHERE id = ?",
            [id]
        );

        return res.json({
            success: true,
            message: "Reservation approved and stock deducted"
        });

    } catch (err) {
        console.error(err);
        res.json({ success: false, message: "Server error" });
    }
});
// ==========================
// DENY RESERVATION
// ==========================
app.post("/deny-reservation", async (req, res) => {
    try {
        const { id } = req.body;

        if (!id) {
            return res.json({
                success: false,
                message: "Missing reservation_id"
            });
        }

        await db.query(
            "UPDATE reservations SET status = 'denied' WHERE id = ?",
            [id]
        );

        res.json({
            success: true,
            message: "Reservation denied"
        });

    } catch (err) {
        console.error(err);
        res.json({ success: false, message: "Server error" });
    }
});
// ========================
// BORROW ITEM (PENDING)
// ========================
app.post("/borrow-item", async (req, res) => {
    try {
        let { user_id, item_id, quantity } = req.body;

        console.log("BODY:", req.body);

        quantity = parseInt(quantity);

        if (!user_id || !item_id || isNaN(quantity) || quantity <= 0) {
            return res.json({
                success: false,
                message: "Missing or invalid fields",
                debug: { user_id, item_id, quantity }
            });
        }

        // check item exists
        const [inv] = await db.query(
            "SELECT quantity FROM inventory WHERE id = ?",
            [item_id]
        );

        if (!inv.length) {
            return res.json({ success: false, message: "Item not found" });
        }

        // IMPORTANT: DO NOT deduct stock yet

        await db.query(
            `INSERT INTO transactions (user_id, item_id, quantity, status)
             VALUES (?, ?, ?, 'pending')`,
            [user_id, item_id, quantity]
        );

        res.json({
            success: true,
            message: "Borrow request sent for approval"
        });

    } catch (err) {
        console.error("BORROW ERROR:", err);
        res.json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
});
// ========================
//APPROVED TRANSACTIONS
// ========================
// ========================
// APPROVE TRANSACTION
// ========================
app.post("/approve-transaction", async (req, res) => {
    try {
        const { transaction_id } = req.body;

        const [trx] = await db.query(
            "SELECT * FROM transactions WHERE id = ?",
            [transaction_id]
        );

        if (!trx.length) {
            return res.json({ success: false, message: "Transaction not found" });
        }

        const t = trx[0];

        if (t.status !== "pending") {
            return res.json({ success: false, message: "Already processed" });
        }

        // check stock again
        const [inv] = await db.query(
            "SELECT quantity FROM inventory WHERE id = ?",
            [t.item_id]
        );

        if (!inv.length || inv[0].quantity < t.quantity) {
            return res.json({ success: false, message: "Not enough stock" });
        }

await db.query(
    "UPDATE transactions SET status = 'approved' WHERE id = ?",
    [transaction_id]
);

        res.json({
            success: true,
            message: "Transaction approved"
        });

    } catch (err) {
        console.error(err);
        res.json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
});
// ========================
//DENIED TRANSACTIONS
// ========================
app.post("/deny-transaction", async (req, res) => {
    try {
        const { transaction_id } = req.body;

        await db.query(
            "UPDATE transactions SET status = 'denied' WHERE id = ?",
            [transaction_id]
        );

        res.json({
            success: true,
            message: "Transaction denied"
        });

    } catch (err) {
        res.json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
});
// ========================
//RElease Items
// ========================
app.post("/release-item", async (req, res) => {
    try {

        const { transaction_id } = req.body;

        const [trx] = await db.query(
            "SELECT * FROM transactions WHERE id=?",
            [transaction_id]
        );

        if (!trx.length) {
            return res.json({
                success:false,
                message:"Transaction not found"
            });
        }

        const t = trx[0];

        if (t.status !== "approved") {
            return res.json({
                success:false,
                message:"Transaction not approved"
            });
        }

        await db.query(
            "UPDATE inventory SET quantity = quantity - ? WHERE id=?",
            [t.quantity, t.item_id]
        );

        await db.query(
            "UPDATE transactions SET status='inuse' WHERE id=?",
            [transaction_id]
        );

        res.json({
            success:true,
            message:"Item released"
        });

    } catch(err) {

        res.json({
            success:false,
            message:err.message
        });

    }
});
// ========================
//RETURN ITEMS
// ========================
app.post("/return-item", async (req, res) => {
    try {
        const { transaction_id } = req.body;

        // 1. Get transaction
        const [rows] = await db.query(
            "SELECT * FROM transactions WHERE id=?",
            [transaction_id]
        );

        if (!rows.length) {
            return res.json({ success: false, message: "Transaction not found" });
        }

        const t = rows[0];

        if (t.status === "returned") {
            return res.json({ success: false, message: "Already returned" });
        }

        // 2. Update transaction
        await db.query(
            "UPDATE transactions SET status='returned', return_time=NOW() WHERE id=?",
            [transaction_id]
        );

        // 3. Return stock
        await db.query(
            "UPDATE inventory SET quantity = quantity + ? WHERE id=?",
            [t.quantity, t.item_id]
        );

        res.json({
            success: true,
            message: "Item returned successfully!"
        });

    } catch (err) {
        console.error(err);
        res.json({
            success: false,
            message: "Server error"
        });
    }
});
// ========================
//app post
// ========================
app.post("/get-user-by-id", async (req, res) => {
    const { id } = req.body;

    try {
        const [rows] = await db.query(
            "SELECT * FROM users WHERE id=?",
            [id]
        );

        if (!rows.length) {
            return res.json({
                success: false,
                message: "User not found"
            });
        }

        res.json({
            success: true,
            user: rows[0]
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});
// ========================
//api login
// ========================
app.post("/api-login", async (req, res) => {
    const { username, password, id } = req.body;

    // ALLOW ID LOGIN (BIOMETRIC)
    if (id) {
        const [rows] = await db.query("SELECT * FROM users WHERE id=?", [id]);

        if (!rows.length) {
            return res.json({ success: false, message: "User not found" });
        }

        const user = rows[0];

        if (user.approvals !== "approved") {
            return res.json({ success: false, message: "Account not approved" });
        }

        return res.json({ success: true, user });
    }

    // REQUIRE username + password kung manual login
    if (!username || !password) {
        return res.json({ success: false, message: "Missing fields" });
    }

    const [rows2] = await db.query(
        "SELECT * FROM users WHERE username=? AND password=?",
        [username, password]
    );

    if (!rows2.length) {
        return res.json({ success: false, message: "Invalid credentials" });
    }

    return res.json({ success: true, user: rows2[0] });
});
// ========================
// CLOUDINARY UPLOAD
// ========================
async function uploadToCloudinary(base64Image) {
    if (!base64Image) return null;

    const result = await cloudinary.uploader.upload(
        `data:image/jpeg;base64,${base64Image}`,
        { folder: "biometric_users" }
    );

    return result.secure_url;
}
// =========================
// GET FILTER OPTIONS
// =========================
app.get("/inventory-filters", async (req, res) => {
    try {
        const [years] = await db.query(`
            SELECT DISTINCT year FROM inventory
            WHERE year IS NOT NULL AND year != ''
        `);

        const [procedures] = await db.query(`
            SELECT DISTINCT \`procedure\` FROM inventory
            WHERE \`procedure\` IS NOT NULL AND \`procedure\` != ''
        `);

        const [semesters] = await db.query(`
            SELECT DISTINCT semester FROM inventory
            WHERE semester IS NOT NULL AND semester != ''
        `);

        const [types] = await db.query(`
            SELECT DISTINCT \`theory_rle\` FROM inventory
            WHERE \`theory_rle\` IS NOT NULL AND \`theory_rle\` != ''
        `);

        res.json({
            years: years.map(r => r.year),
            procedures: procedures.map(r => r.procedure),
            semesters: semesters.map(r => r.semester),
            types: types.map(r => r["theory_rle"])
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// ========================
// GET INVENTORY LIST
// ========================
app.get("/inventory2", async (req, res) => {
    try {
        const { user_id, search = "" } = req.query;

        // Get user subjects
        const [users] = await db.query(
            "SELECT subjects FROM users WHERE id = ?",
            [user_id]
        );

        if (users.length === 0) {
            return res.json({ success: false, message: "User not found" });
        }

        const subjects = users[0].subjects.split(",");

        // Build SQL
        let sql = `
            SELECT * FROM inventory
            WHERE (subject IN (?) OR subject='All')
        `;
        let params = [subjects];

        if (search) {
            sql += " AND (name LIKE ? OR subject LIKE ?)";
            params.push(`%${search}%`, `%${search}%`);
        }

        sql += " ORDER BY id DESC";

        const [items] = await db.query(sql, params);

        return res.json({ success: true, items });

    } catch (err) {
        console.error(err);
        res.json({ success: false, message: "Server error" });
    }
});
// =========================
// TRANSACTIONS (WITH FILTERS)
// =========================
app.get("/transactions", async (req, res) => {
    try {
        const { user_id, date, month, year } = req.query;

        let sql = `
            SELECT t.*, i.name AS item_name
            FROM transactions t
            JOIN inventory i ON t.item_id = i.id
            WHERE t.status != 'returned'
        `;

        let params = [];

        // ========================
        // USER FILTER
        // ========================
        if (user_id) {
            sql += " AND t.user_id=?";
            params.push(user_id);
        }

        // ========================
        // EXACT DATE FILTER
        // ========================
        if (date) {
            sql += " AND DATE(t.borrow_time)=?";
            params.push(date);
        }

        // ========================
        // MONTH + YEAR FILTER
        // ========================
        if (month && year) {
            sql += " AND MONTH(t.borrow_time)=? AND YEAR(t.borrow_time)=?";
            params.push(month, year);
        }

        // ========================
        // YEAR ONLY FILTER
        // ========================
        if (year && !month) {
            sql += " AND YEAR(t.borrow_time)=?";
            params.push(year);
        }

        sql += " ORDER BY t.borrow_time DESC";

        const [rows] = await db.query(sql, params);

        res.json(rows);

    } catch (err) {
        console.log(err);
        res.json([]);
    }
});

// =========================
// GET INVENTORY (SEARCH + FILTER)
// =========================
app.get("/inventory", async (req, res) => {
    try {
        const { search, year, procedure, semester, type } = req.query;

        let sql = "SELECT * FROM inventory WHERE 1=1";
        let params = [];

        // SEARCH
        if (search) {
            sql += " AND (name LIKE ? OR subject LIKE ?)";
            params.push(`%${search}%`, `%${search}%`);
        }

        // FILTERS
        if (year) {
            sql += " AND year=?";
            params.push(year);
        }

        if (procedure) {
            sql += " AND `procedure`=?";
            params.push(procedure);
        }

        if (semester) {
            sql += " AND semester=?";
            params.push(semester);
        }

        if (type) {
            sql += " AND `theory_rle`=?";
            params.push(type);
        }

        sql += " ORDER BY id DESC";

        const [rows] = await db.query(sql, params);

        res.json(rows);

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


// =========================
// ADD ITEM
// =========================
app.post("/inventory/add", async (req, res) => {
    try {
        const {
            name,
            classification,
            quantity,
            procedure,
            subject,
            semester,
            year,
            theory_rle,
        } = req.body;

        await db.query(`
            INSERT INTO inventory
            (name, classification, quantity, \`procedure\`, subject, semester, year, theory_rle)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            name,
            classification,
            quantity,
            procedure,
            subject,
            semester,
            year,
            theory_rle
        ]);

        res.json({ success: true, message: "Item added" });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


// =========================
// UPDATE ITEM
// =========================
app.put("/inventory/update/:id", async (req, res) => {
    try {
        const id = req.params.id;
        const {
            name,
            classification,
            quantity,
            procedure,
            subject,
            semester,
            year,
            theory_rle
        } = req.body;

        await db.query(`
            UPDATE inventory SET
            name=?,
            classification=?,
            quantity=?,
            \`procedure\`=?,
            subject=?,
            semester=?,
            year=?,
            \`theory_rle\`=?
            WHERE id=?
        `, [
            name,
            classification,
            quantity,
            procedure,
            subject,
            semester,
            year,
            theory_rle,
            id
        ]);

        res.json({ success: true, message: "Updated successfully" });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


// =========================
// DELETE ITEM
// =========================
app.delete("/inventory/delete/:id", async (req, res) => {
    try {
        const id = req.params.id;

        await db.query("DELETE FROM inventory WHERE id=?", [id]);

        res.json({ success: true, message: "Deleted successfully" });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


// =========================
// UPDATE PHOTO (BASE64 IN DB)
// =========================
app.put("/inventory/photo/:id", async (req, res) => {
    try {
        const id = req.params.id;
        const { photo } = req.body;

        if (!photo) {
            return res.status(400).json({ success: false, message: "No photo" });
        }

        const result = await cloudinary.uploader.upload(
            `data:image/jpeg;base64,${photo}`,
            { folder: "inventory_items" }
        );

        await db.query(
            "UPDATE inventory SET photo=? WHERE id=?",
            [result.secure_url, id]
        );

        res.json({ success: true, url: result.secure_url });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// ========================
// REPORT TRANSACTIONS (WITH FILTERS)
// ========================
app.get("/report-transactions", async (req, res) => {
    try {
        const { search, date, month, year } = req.query;

        let sql = `
            SELECT 
                t.*,
                i.name AS item_name,
                i.classification AS classification,
                u.username
            FROM transactions t
            JOIN inventory i ON t.item_id = i.id
            JOIN users u ON t.user_id = u.id
            WHERE 1=1
        `;

        let params = [];

        // ========================
        // SEARCH (username, item, id)
        // ========================
        if (search) {
            sql += `
                AND (
                    u.username LIKE ?
                    OR i.name LIKE ?
                    OR t.id LIKE ?
                )
            `;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        // ========================
        // EXACT DATE
        // ========================
        if (date) {
            sql += " AND DATE(t.borrow_time)=?";
            params.push(date);
        }

        // ========================
        // MONTH
        // format: YYYY-MM (important)
        // ========================
        if (month) {
            sql += " AND DATE_FORMAT(t.borrow_time, '%Y-%m')=?";
            params.push(month);
        }

        // ========================
        // YEAR
        // ========================
        if (year) {
            sql += " AND YEAR(t.borrow_time)=?";
            params.push(year);
        }

        sql += " ORDER BY t.borrow_time DESC";

        const [rows] = await db.query(sql, params);

        res.json(rows);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================
// REPORT RESERVATIONS (WITH FILTERS)
// ========================

app.get("/report-reservations", async (req, res) => {
    try {
        let { search, month, year, date } = req.query;

        // ========================
        // FIX MONTH FORMAT (YYYY-MM → year + month)
        // ========================
        if (month && month.includes("-")) {
            const p = month.split("-");
            year = p[0];
            month = p[1];
        }

        let sql = `
            SELECT 
                r.*,
                i.name AS item_name,
                u.username
            FROM reservations r
            JOIN inventory i ON r.item_id = i.id
            JOIN users u ON r.user_id = u.id
            WHERE 1=1
        `;

        let params = [];

        // ========================
        // SEARCH (item or username)
        // ========================
        if (search) {
            sql += ` AND (i.name LIKE ? OR u.username LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`);
        }

        // ========================
        // FILTER YEAR
        // ========================
        if (year) {
            sql += ` AND YEAR(r.start_time) = ?`;
            params.push(year);
        }

        // ========================
        // FILTER MONTH (01–12)
        // ========================
        if (month) {
            sql += ` AND MONTH(r.start_time) = ?`;
            params.push(month);
        }

        // ========================
        // FILTER EXACT DATE
        // ========================
        if (date) {
            sql += ` AND DATE(r.start_time) = ?`;
            params.push(date);
        }

        sql += ` ORDER BY r.start_time DESC`;

        const [rows] = await db.query(sql, params);
        res.json(rows);

    } catch (err) {
        console.error("Error:", err);
        res.status(500).json({ error: err.message });
    }
});
// ========================
// GET USERS
// ========================
app.get("/users", async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM users");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================
// LOGIN
// ========================
app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    const [rows] = await db.query(
        "SELECT * FROM users WHERE username=?",
        [username]
    );

    if (!rows.length) {
        return res.json({ success: false, message: "User not found" });
    }

    const user = rows[0];

    if (user.password !== password) {
        return res.json({ success: false, message: "Invalid password" });
    }

    res.json({ success: true, user });
});
// ========================
// get fingerprint
// ========================
app.get("/fingerprints", async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT id, biometric_id 
            FROM users 
            WHERE biometric_id IS NOT NULL
        `);

        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================
// BIOMETRIC LOGIN
// ========================
// ========================
// BIOMETRIC LOGIN
// ========================
app.post("/login-biometric", async (req, res) => {

    // ACCEPT BOTH FIELDS
    const finger_id = req.body.finger_id || req.body.id;

    if (!finger_id) {
        return res.json({
            success: false,
            message: "Missing field: finger_id or id"
        });
    }

    try {
        const [rows] = await db.query(
            "SELECT * FROM users WHERE id=?",
            [finger_id]
        );

        if (!rows.length) {
            return res.json({
                success: false,
                message: "User not found"
            });
        }

        return res.json({
            success: true,
            user: rows[0]
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            error: err.message
        });
    }
});
// ========================
// update bio
// ========================
app.post("/update-bio", async (req, res) => {
    try {
        const { id, biometric_id, password } = req.body;

        console.log("DEBUG BODY:", req.body);

        // ========================
        // VALIDATION
        // ========================
        if (!id || !biometric_id || !password) {
            return res.status(400).json({
                success: false,
                message: "Missing id, biometric_id, or password"
            });
        }

        // ========================
        // CHECK USER PASSWORD
        // ========================
        const [users] = await db.query(
            "SELECT password FROM users WHERE id=?",
            [id]
        );

        if (!users.length) {
            return res.json({
                success: false,
                message: "User not found"
            });
        }

        const dbPassword = users[0].password;

        if (dbPassword !== password) {
            return res.json({
                success: false,
                message: "Incorrect password"
            });
        }

        // ========================
        // UPDATE BIOMETRIC
        // ========================
        const [result] = await db.query(
            "UPDATE users SET biometric_id=? WHERE id=?",
            [biometric_id, id]
        );

        console.log("UPDATE RESULT:", result);

        res.json({
            success: true,
            message: "Biometric saved successfully",
            affectedRows: result.affectedRows
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});
// ========================
// SIGNUP
// ========================
app.post("/signup", async (req, res) => {
    try {
        const {
            username,
            password,
            role,
            biometric_id,
            subjects,
            course,
            year_level,
            profile_photo
        } = req.body;

        const [existing] = await db.query(
            "SELECT * FROM users WHERE username=?",
            [username]
        );

        if (existing.length > 0) {
            return res.json({ success: false, message: "Username exists" });
        }

        let imageUrl = profile_photo
            ? await uploadToCloudinary(profile_photo)
            : null;

        await db.query(
            `INSERT INTO users 
            (username, password, role, biometric_id, subjects, course, year_level, profile_photo, approvals)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                username,
                password,
                role || "student",
                biometric_id || null,
                subjects || null,
                course || null,
                year_level || null,
                imageUrl,
                "pending"   // 👈 THIS IS THE VALUE
            ]
        );

        res.json({ success: true });

    } catch (err) {
        console.log(err);
        res.json({ success: false, message: err.message });
    }
});
// ========================
// UPDATE USER (CLOUDINARY)
// ========================
app.post("/update-user", async (req, res) => {
    try {
        const {
            id,
            username,
            password,
            role,
            biometric_id,
            subjects,
            course,
            year_level,
            profile_photo
        } = req.body;

        let imageUrl = profile_photo
            ? await uploadToCloudinary(profile_photo)
            : null;

        let sql = "";
        let params = [];

        if (!id) {
            sql = `
                INSERT INTO users 
                (username, password, role, biometric_id, subjects, course, year_level, profile_photo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;
            params = [username, password, role, biometric_id, subjects, course, year_level, imageUrl];
        } else {
            sql = `
                UPDATE users SET
                username=?,
                password=?,
                role=?,
                biometric_id=?,
                subjects=?,
                course=?,
                year_level=?,
                profile_photo=?
                WHERE id=?
            `;
            params = [username, password, role, biometric_id, subjects, course, year_level, imageUrl, id];
        }

        await db.query(sql, params);

        res.json({ success: true });

    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ========================
// GET SINGLE USER
// ========================
app.get("/get-user", async (req, res) => {
    try {
        const { id } = req.query;

        if (!id) return res.status(400).json({ error: "Missing id" });

        const [rows] = await db.query(
            "SELECT id, username, role, profile_photo FROM users WHERE id=?",
            [id]
        );

        if (!rows.length) return res.status(404).json({ error: "User not found" });

        res.json(rows[0]);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================
// DELETE USER
// ========================
app.get("/delete-user", async (req, res) => {
    try {
        await db.query("DELETE FROM users WHERE id=?", [req.query.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================
// TOGGLE APPROVAL
// ========================
app.get("/toggle-approval", async (req, res) => {
    try {
        const { id } = req.query;

        const [rows] = await db.query(
            "SELECT approvals FROM users WHERE id=?",
            [id]
        );

        if (!rows.length) return res.json({ success: false });

        let current = rows[0].approvals;

        let next =
            current === "pending" ? "approved" :
            current === "approved" ? "disapproved" :
            "approved";

        await db.query(
            "UPDATE users SET approvals=? WHERE id=?",
            [next, id]
        );

        res.json({ success: true, status: next });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



// ========================
// RESERVATIONS (RESTORED)
// ========================
app.get("/reservations", async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT 
                r.id,
                i.name AS item_name,
                u.username,
                r.start_time,
                r.end_time,
                r.status
            FROM reservations r
            LEFT JOIN inventory i ON r.item_id = i.id
            LEFT JOIN users u ON r.user_id = u.id
            ORDER BY r.start_time DESC
            LIMIT 10
        `);

        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================
// START SERVER
// ========================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log("🚀 Server running on port " + PORT);
});
