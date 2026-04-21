const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");
const db = require("./db");
require("dotenv").config();

// ========================
// APP INIT (FIXED)
// ========================
const app = express();

// ========================
// MIDDLEWARE
// ========================
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ========================
// HEALTH CHECK
// ========================
app.get("/", (req, res) => {
    res.json({ status: "Biometric API Running 🚀" });
});
// ========================
// COUNT RESERVATIONS
// ========================
app.get("/stats/reservations", async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT COUNT(*) AS total
            FROM reservations
        `);

        res.json({ total: rows[0].total });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ========================
//update user
// ========================
app.post("/update-user", async (req, res) => {
    try {
        const { username, password, role, biometric_id, subjects, course, year_level } = req.body;

        await db.query(
            "INSERT INTO users (username, password, role, biometric_id, subjects, course, year_level) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [username, password, role, biometric_id, subjects, course, year_level]
        );

        res.json({ success: true, message: "User added" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ========================
// delete user
// ========================
app.get("/delete-user", async (req, res) => {
    try {
        const { id } = req.query;

        await db.query("DELETE FROM users WHERE id=?", [id]);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ========================
// GET USER
// ========================
app.get("/get-user", async (req, res) => {
    try {
        const { id } = req.query;

        if (!id) {
            return res.json({ success: false, message: "Missing id" });
        }

        const [rows] = await db.query(
            "SELECT id, username, role, profile_photo FROM users WHERE id=?",
            [id]
        );

        res.json(rows[0] || null);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});


// ========================
// UPDATE BIOMETRIC
// ========================
app.post("/update-biometric", async (req, res) => {
    try {
        const { username, biometric_id } = req.body;

        if (!username || !biometric_id) {
            return res.json({
                success: false,
                message: "Missing username or biometric_id"
            });
        }

        const [result] = await db.query(
            "UPDATE users SET biometric_id=? WHERE username=?",
            [biometric_id, username]
        );

        if (result.affectedRows === 0) {
            return res.json({ success: false, message: "User not found" });
        }

        res.json({
            success: true,
            message: "Biometric updated successfully"
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// ========================
// GET RECENT TRANSACTIONS
// ========================
app.get("/transactions", async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT 
                t.id,
                i.name AS item_name,
                u.username,
                t.procedure,
                t.quantity,
                t.status,
                t.borrow_time,
                t.return_time
            FROM transactions t
            LEFT JOIN inventory i ON t.item_id = i.id
            LEFT JOIN users u ON t.user_id = u.id
            ORDER BY t.borrow_time DESC
            LIMIT 10
        `);

        res.json(rows);
    } catch (err) {
        console.log(err);
        res.json([]);
    }
});
// ========================
// GET RECENT RESERVATIONS
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
        console.log(err);
        res.json([]);
    }
});
// ========================
// COUNT BORROWED ITEMS
// ========================
app.get("/stats/borrowed", async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT COUNT(*) AS total 
            FROM transactions 
            WHERE status = 'borrowed'
        `);

        res.json({ total: rows[0].total });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ========================
// COUNT RETURNED ITEMS
// ========================
app.get("/stats/returned", async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT COUNT(*) AS total 
            FROM transactions 
            WHERE status = 'returned'
        `);

        res.json({ total: rows[0].total });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================
// GET BIOMETRIC
// ========================
app.get("/get-biometric", async (req, res) => {
    try {
        const { id } = req.query;

        if (!id) {
            return res.json({ success: false, message: "Missing id" });
        }

        const [rows] = await db.query(
            "SELECT id, username, biometric_id FROM users WHERE id=?",
            [id]
        );

        if (rows.length === 0) {
            return res.json({ success: false, message: "User not found" });
        }

        res.json({ success: true, user: rows[0] });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ========================
// LOGIN
// ========================
app.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.json({ success: false, message: "Missing username or password" });
        }

        const [rows] = await db.query(
            "SELECT * FROM users WHERE username = ?",
            [username]
        );

        if (rows.length === 0) {
            return res.json({ success: false, message: "Username not found" });
        }

        const user = rows[0];

        if (user.password !== password) {
            return res.json({ success: false, message: "Invalid password" });
        }

        res.json({
            success: true,
            message: "Login successful",
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                biometric_id: user.biometric_id
            }
        });

    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ========================
// BIOMETRIC LOGIN
// ========================
app.post("/login-biometric", async (req, res) => {
    try {
        const { finger_id } = req.body;

        if (!finger_id) {
            return res.json({ success: false, message: "Missing finger_id" });
        }

        const [rows] = await db.query(
            "SELECT id, username, role, biometric_id FROM users WHERE biometric_id=? OR id=?",
            [finger_id, finger_id]
        );

        if (rows.length === 0) {
            return res.json({ success: false, message: "Fingerprint not found" });
        }

        res.json({
            success: true,
            message: "Login successful",
            user: rows[0]
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ========================
// SIGNUP
// ========================
app.post("/signup", async (req, res) => {
    try {
        const { username, password, role } = req.body;

        if (!username || !password) {
            return res.json({ success: false, message: "Missing username or password" });
        }

        const [existing] = await db.query(
            "SELECT * FROM users WHERE username=?",
            [username]
        );

        if (existing.length > 0) {
            return res.json({ success: false, message: "Username already exists" });
        }

        await db.query(
            "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
            [username, password, role || "student"]
        );

        res.json({ success: true, message: "Account created" });

    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ========================
// STATS
// ========================
app.get("/stats/users", async (req, res) => {
    try {
        const [rows] = await db.query("SELECT COUNT(*) AS total FROM users");
        res.json({ total: rows[0].total });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/stats/inventory", async (req, res) => {
    try {
        const [rows] = await db.query("SELECT COUNT(*) AS total FROM inventory");
        res.json({ total: rows[0].total });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================
// toggle approval
// ========================
app.get("/toggle-approval", async (req, res) => {
    try {
        const { id } = req.query;

        await db.query(`
            UPDATE users 
            SET approvals = IF(approvals='approved','pending','approved')
            WHERE id=?
        `, [id]);

        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================
// GLOBAL ERROR HANDLER
// ========================
process.on("unhandledRejection", (err) => {
    console.log("Unhandled Error:", err);
});

// ========================
// START SERVER
// ========================
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
    console.log("🚀 Server running on port " + PORT);
});
