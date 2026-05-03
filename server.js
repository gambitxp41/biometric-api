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
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
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
// BORROW ITEM
// ========================
app.post("/borrow-item", async (req, res) => {
    try {
        let { user_id, item_id, quantity, procedure } = req.body;

        console.log("BODY:", req.body); // 🔥 DEBUG

        quantity = parseInt(quantity);

        if (!user_id || !item_id || !quantity || !procedure) {
            return res.json({
                success: false,
                message: "Missing fields",
                debug: { user_id, item_id, quantity, procedure }
            });
        }

        const [inv] = await db.query(
            "SELECT quantity FROM inventory WHERE id = ?",
            [item_id]
        );

        if (!inv.length) {
            return res.json({ success: false, message: "Item not found" });
        }

        if (inv[0].quantity < quantity) {
            return res.json({ success: false, message: "Not enough stock" });
        }

        await db.query(
            "UPDATE inventory SET quantity = quantity - ? WHERE id = ?",
            [quantity, item_id]
        );

        await db.query(
            `INSERT INTO transactions (user_id, item_id, \`procedure\`, quantity, status)
             VALUES (?, ?, ?, ?, 'inuse')`,
            [user_id, item_id, procedure, quantity]
        );

        res.json({ success: true, message: "Item borrowed successfully!" });

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
//return reservations
// ========================
app.post("/return-reservation", async (req, res) => {
    try {
        const { reservation_id } = req.body;

        if (!reservation_id) {
            return res.json({
                success: false,
                message: "Missing reservation_id"
            });
        }

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

        await db.query(
            "UPDATE reservations SET status='returned' WHERE id=?",
            [reservation_id]
        );

        res.json({
            success: true,
            message: "Reservation returned successfully!"
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
//reserve items
// ========================
app.post("/reserve-item", async (req, res) => {
    try {
        const { user_id, item_id, start_time, end_time } = req.body;

        // =========================
        // VALIDATION
        // =========================
        if (!user_id || !item_id || !start_time || !end_time) {
            return res.json({
                success: false,
                message: "Missing fields"
            });
        }

        // FIX: proper comparison (string-safe ISO)
        if (start_time >= end_time) {
            return res.json({
                success: false,
                message: "End time must be after start time"
            });
        }

        // =========================
        // FIX: PROPER CONFLICT CHECK
        // =========================
        const [conflict] = await db.query(
            `SELECT * FROM reservations
             WHERE item_id = ?
             AND status IN ('pending','approved')
             AND (
                (start_time <= ? AND end_time >= ?)
                OR (start_time <= ? AND end_time >= ?)
                OR (start_time >= ? AND end_time <= ?)
             )`,
            [item_id, start_time, start_time, end_time, end_time, start_time, end_time]
        );

        if (conflict.length > 0) {
            return res.json({
                success: false,
                message: "Item already reserved in this time slot"
            });
        }

        // =========================
        // INSERT
        // =========================
        await db.query(
            `INSERT INTO reservations
            (user_id, item_id, start_time, end_time, status)
            VALUES (?, ?, ?, ?, 'pending')`,
            [user_id, item_id, start_time, end_time]
        );

        return res.json({
            success: true,
            message: "Reservation submitted successfully!"
        });

    } catch (err) {
        console.error("RESERVATION ERROR:", err);
        res.json({
            success: false,
            message: "Server error"
        });
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
                i.photo AS item_photo
            FROM reservations r
            LEFT JOIN users u ON r.user_id = u.id
            LEFT JOIN inventory i ON r.item_id = i.id
            ORDER BY r.start_time DESC
        `);

        console.log("RESERVATIONS ROWS:", rows); // 🔥 DEBUG

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
        const { reservation_id } = req.body;

        if (!reservation_id) {
            return res.json({
                success: false,
                message: "Missing reservation_id"
            });
        }

        await db.query(
            "UPDATE reservations SET status = 'approved' WHERE id = ?",
            [reservation_id]
        );

        res.json({
            success: true,
            message: "Reservation approved"
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
        const { reservation_id } = req.body;

        if (!reservation_id) {
            return res.json({
                success: false,
                message: "Missing reservation_id"
            });
        }

        await db.query(
            "UPDATE reservations SET status = 'denied' WHERE id = ?",
            [reservation_id]
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
    const { id } = req.body;

    try {
        const [rows] = await db.query("SELECT * FROM users WHERE id=?", [id]);

        if (!rows.length) {
            return res.json({ success: false });
        }

        return res.json({
            success: true,
            user: rows[0]
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
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
// TRANSACTIONS
// =========================
app.get("/transactions", async (req, res) => {
    try {
        const { user_id } = req.query;

        let sql = `
            SELECT t.*, i.name AS item_name
            FROM transactions t
            JOIN inventory i ON t.item_id = i.id
            WHERE t.status != 'returned'
        `;

        let params = [];

        if (user_id) {
            sql += " AND t.user_id=?";
            params.push(user_id);
        }

        sql += " ORDER BY t.borrow_time DESC";

        const [rows] = await db.query(sql, params);

        res.json(rows);

    } catch (err) {
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
            photo // base64 string
        } = req.body;

        await db.query(`
            INSERT INTO inventory
            (name, classification, quantity, \`procedure\`, subject, semester, year, photo, \`theory_rle\`)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            name,
            classification,
            quantity,
            procedure,
            subject,
            semester,
            year,
            photo || null,
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
//report transactions
// ========================
app.get("/report-transactions", async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT 
                t.*,
                i.name AS item_name,
                i.classification AS classification,
                u.username
            FROM transactions t
            JOIN inventory i ON t.item_id = i.id
            JOIN users u ON t.user_id = u.id
            ORDER BY t.borrow_time DESC
        `);

        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ========================
// reports reservations
// ========================
app.get("/report-reservations", async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT 
                r.*,
                i.name AS item_name,
                u.username
            FROM reservations r
            JOIN inventory i ON r.item_id = i.id
            JOIN users u ON r.user_id = u.id
            ORDER BY r.start_time DESC
        `);

        res.json(rows);
    } catch (err) {
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
app.post("/login-biometric", async (req, res) => {
    const { finger_id } = req.body;

    try {
        const [rows] = await db.query(
            "SELECT * FROM users WHERE id=?",
            [finger_id]
        );

        if (!rows.length) {
            return res.json({ success: false, message: "User not found" });
        }

        res.json({ success: true, user: rows[0] });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// ========================
// update bio
// ========================
app.post("/update-bio", async (req, res) => {
    try {
        const { id, biometric_id } = req.body;

        console.log("DEBUG BODY:", req.body);

        if (!id || !biometric_id) {
            return res.status(400).json({
                success: false,
                message: "Missing id or biometric_id"
            });
        }

        const [result] = await db.query(
            "UPDATE users SET biometric_id=? WHERE id=?",
            [biometric_id, id]
        );

        console.log("UPDATE RESULT:", result);

        res.json({
            success: true,
            message: "Biometric saved",
            affectedRows: result.affectedRows
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});;
// ========================
// SIGNUP
// ========================
app.post("/signup", async (req, res) => {
    const { username, password, role } = req.body;

    const [existing] = await db.query(
        "SELECT * FROM users WHERE username=?",
        [username]
    );

    if (existing.length > 0) {
        return res.json({ success: false, message: "Username exists" });
    }

    await db.query(
        "INSERT INTO users (username,password,role,approvals) VALUES (?,?,?, 'pending')",
        [username, password, role || "student"]
    );

    res.json({ success: true });
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
