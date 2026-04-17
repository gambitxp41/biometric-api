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
// GET BIOMETRIC DATA
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

        res.json({
            success: true,
            user: rows[0]
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
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
// LOGIN BIOMETRIC (MAIN FIXED)
// ========================
app.post("/login-biometric", async (req, res) => {
    try {
        const { biometric_id } = req.body;

        if (!biometric_id) {
            return res.json({ success: false, message: "Missing finger_id" });
        }

        const [rows] = await db.query(
            "SELECT id, username, role, biometric_id FROM users WHERE biometric_id=? OR id=?",
            [biometric_id, biometric_id]
        );

        if (rows.length === 0) {
            return res.json({
                success: false,
                message: "Fingerprint not found"
            });
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
// ENROLL BIOMETRIC
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
            message: "Fingerprint saved"
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================
// GLOBAL ERROR SAFETY
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
