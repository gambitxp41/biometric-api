const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const db = require("./db");
require("dotenv").config();

const app = express();

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
// ADD / UPDATE USER (FIXED)
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

        // ========================
        // INSERT
        // ========================
        if (!id) {
            await db.query(
                `INSERT INTO users 
                (username, password, role, biometric_id, subjects, course, year_level, profile_photo, approvals)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
                [
                    username,
                    password,
                    role,
                    biometric_id,
                    subjects,
                    course,
                    year_level,
                    profile_photo || null
                ]
            );

            return res.json({ success: true, message: "User added" });
        }

        // ========================
        // UPDATE (FIXED SQL)
        // ========================
        let fields = `
            username=?, 
            role=?, 
            biometric_id=?, 
            subjects=?, 
            course=?, 
            year_level=?
        `;

        let values = [
            username,
            role,
            biometric_id,
            subjects,
            course,
            year_level
        ];

        if (password) {
            fields += `, password=?`;
            values.push(password);
        }

        if (profile_photo) {
            fields += `, profile_photo=?`;
            values.push(profile_photo);
        }

        values.push(id);

        await db.query(
            `UPDATE users SET ${fields} WHERE id=?`,
            values
        );

        res.json({ success: true, message: "User updated" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});
// ========================
// GET SINGLE USER (REQUIRED FIX)
// ========================
app.get("/get-user", async (req, res) => {
    try {
        const { id } = req.query;

        if (!id) {
            return res.status(400).json({ error: "Missing id" });
        }

        const [rows] = await db.query(
            "SELECT id, username, role, profile_photo FROM users WHERE id=?",
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

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
// TOGGLE APPROVAL (FIXED)
// ========================
app.get("/toggle-approval", async (req, res) => {
    try {
        const { id } = req.query;

        const [rows] = await db.query(
            "SELECT approvals FROM users WHERE id=?",
            [id]
        );

        if (!rows.length) {
            return res.json({ success: false });
        }

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
// START SERVER
// ========================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log("🚀 Server running on port " + PORT);
});
