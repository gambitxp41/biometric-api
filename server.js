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
// BIOMETRIC LOGIN
// ========================
app.post("/login-biometric", async (req, res) => {
    const { finger_id } = req.body;

    const [rows] = await db.query(
        "SELECT * FROM users WHERE biometric_id=? OR id=?",
        [finger_id, finger_id]
    );

    if (!rows.length) {
        return res.json({ success: false, message: "Fingerprint not found" });
    }

    res.json({ success: true, user: rows[0] });
});

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
// TRANSACTIONS (RESTORED)
// ========================
app.get("/transactions", async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT 
                t.id,
                i.name AS item_name,
                u.username,
                t.procedure,
                t.status,
                t.borrow_time
            FROM transactions t
            LEFT JOIN inventory i ON t.item_id = i.id
            LEFT JOIN users u ON t.user_id = u.id
            ORDER BY t.borrow_time DESC
            LIMIT 10
        `);

        res.json(rows);
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
