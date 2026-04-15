const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const BASE = "https://pandoratest.free.nf/api";

const api = axios.create({
    headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json,text/html,*/*"
    },
    timeout: 15000
});

// ===============================
// SAFE REQUEST HELPER
// ===============================
async function safeGet(url) {
    try {
        const res = await api.get(url);

        // Detect InfinityFree block page
        if (
            typeof res.data === "string" &&
            (res.data.includes("aes.js") ||
             res.data.includes("__test") ||
             res.data.includes("slowAES"))
        ) {
            return {
                error: true,
                message: "InfinityFree blocked request",
                raw: "BLOCKED_HTML"
            };
        }

        return res.data;

    } catch (err) {
        return {
            error: true,
            message: err.message
        };
    }
}

// ===============================
// SAFE POST HELPER
// ===============================
async function safePost(url, body) {
    try {
        const res = await api.post(url, body);

        if (
            typeof res.data === "string" &&
            (res.data.includes("aes.js") ||
             res.data.includes("__test"))
        ) {
            return {
                error: true,
                message: "InfinityFree blocked request"
            };
        }

        return res.data;

    } catch (err) {
        return {
            error: true,
            message: err.message
        };
    }
}

// ===============================
// ENROLL
// ===============================
app.post("/enroll", async (req, res) => {
    const result = await safePost(`${BASE}/save_fingerprint.php`, {
        register: "1",
        username: req.body.username,
        biometric_id: req.body.biometric_id
    });

    res.json(result);
});

// ===============================
// UPDATE
// ===============================
app.post("/update", async (req, res) => {
    const result = await safePost(`${BASE}/update_biometric.php`, {
        username: req.body.username,
        biometric_id: req.body.biometric_id
    });

    res.json(result);
});

// ===============================
// GET FINGERPRINT
// ===============================
app.get("/getfingerprint", async (req, res) => {
    const result = await safeGet(`${BASE}/get_fingerprints.php`);
    res.json(result);
});

// ===============================
// LOGIN
// ===============================
app.post("/login", async (req, res) => {
    const result = await safePost(`${BASE}/login.php`, {
        id: req.body.id,
        login: "1"
    });

    res.json(result);
});

// ===============================
app.get("/", (req, res) => {
    res.json({
        status: "OK",
        message: "Biometric API running on Render"
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running"));
