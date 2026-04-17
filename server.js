const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const db = require("./db");
require("dotenv").config();

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
// GET USER (InfinityFree dashboard)
// ========================
app.get("/get-user", async (req, res) => {
    try {
        const { id } = req.query;

        const [rows] = await db.query(
            "SELECT id, username, role, profile_photo FROM users WHERE id=?",
            [id]
        );

        res.json(rows[0] || null);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================
// STATS
// ========================
app.get("/stats/users", async (req, res) => {
    const [rows] = await db.query("SELECT COUNT(*) AS total FROM users");
    res.json(rows[0].total);
});

app.get("/stats/inventory", async (req, res) => {
    const [rows] = await db.query("SELECT COUNT(*) AS total FROM inventory");
    res.json(rows[0].total);
});

app.get("/stats/borrowed", async (req, res) => {
    const [rows] = await db.query(
        "SELECT COUNT(*) AS total FROM transactions WHERE status='borrowed'"
    );
    res.json(rows[0].total);
});

app.get("/stats/returned", async (req, res) => {
    const [rows] = await db.query(
        "SELECT COUNT(*) AS total FROM transactions WHERE status='returned'"
    );
    res.json(rows[0].total);
});

// ========================
// RECENT TRANSACTIONS
// ========================
app.get("/transactions/recent", async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT t.*, i.name AS item_name, u.username
            FROM transactions t
            JOIN inventory i ON t.item_id = i.id
            JOIN users u ON t.user_id = u.id
            ORDER BY t.borrow_time DESC
            LIMIT 10
        `);

        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================
// RECENT RESERVATIONS
// ========================
app.get("/reservations/recent", async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT r.*, i.name AS item_name, u.username
            FROM reservations r
            JOIN inventory i ON r.item_id = i.id
            JOIN users u ON r.user_id = u.id
            ORDER BY r.start_time DESC
            LIMIT 10
        `);

        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================
// ENROLL BIOMETRIC (C# REGISTER)
// ========================
app.post("/enroll-fingerprint", async (req, res) => {
    try {
        const { username, biometric_id } = req.body;

        if (!username || !biometric_id) {
            return res.json({ success: false, message: "Missing data" });
        }

        await db.query(
            "UPDATE users SET biometric_id=? WHERE username=?",
            [biometric_id, username]
        );

        res.json({
            success: true,
            message: "Fingerprint enrolled successfully"
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================
// LOGIN BIOMETRIC (C# SCANNER)
// ========================
app.post("/login-biometric", async (req, res) => {
    try {
        const { finger_id } = req.body;

        if (!finger_id) {
            return res.json({ success: false, message: "No fingerprint ID" });
        }

        const [rows] = await db.query(
            "SELECT * FROM users WHERE id=?",
            [finger_id]
        );

        if (rows.length > 0) {
            const user = rows[0];

            return res.json({
                success: true,
                message: "Login successful",
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role
                }
            });
        } else {
            return res.json({
                success: false,
                message: "User not found"
            });
        }

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================
// UPDATE USER (OPTIONAL)
// ========================
app.post("/update-user", async (req, res) => {
    try {
        const { id, username } = req.body;

        await db.query(
            "UPDATE users SET username=? WHERE id=?",
            [username, id]
        );

        res.json({ success: true, message: "User updated" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================
// START SERVER
// ========================
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
