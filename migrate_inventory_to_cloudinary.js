const db = require("./db");
const cloudinary = require("cloudinary").v2;
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// ========================
// CLOUDINARY CONFIG
// ========================
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// ========================
// UPLOAD FUNCTION
// ========================
async function uploadToCloudinary(filePath) {
    try {
        const result = await cloudinary.uploader.upload(filePath, {
            folder: "inventory_items"
        });

        return result.secure_url;
    } catch (err) {
        console.log("Upload failed:", filePath, err.message);
        return null;
    }
}

// ========================
// MAIN MIGRATION
// ========================
async function migrate() {
    try {
        console.log("🚀 Starting inventory migration...");

        const [items] = await db.query("SELECT id, photo FROM inventory");

        for (const item of items) {
            let photo = item.photo;

            // Skip if already Cloudinary URL
            if (!photo || photo.startsWith("http")) {
                console.log(`⏩ Skipping ID ${item.id} (already migrated or empty)`);
                continue;
            }

            // Try common local paths
            let possiblePaths = [
                path.join(__dirname, "uploads", photo),
                path.join(__dirname, "uploads/items", photo),
                path.join(__dirname, "../uploads", photo),
                path.join(__dirname, "../uploads/items", photo)
            ];

            let filePath = possiblePaths.find(p => fs.existsSync(p));

            if (!filePath) {
                console.log(`❌ File not found for ID ${item.id}: ${photo}`);
                continue;
            }

            console.log(`⬆ Uploading ID ${item.id}: ${filePath}`);

            const url = await uploadToCloudinary(filePath);

            if (url) {
                await db.query(
                    "UPDATE inventory SET photo=? WHERE id=?",
                    [url, item.id]
                );

                console.log(`✅ Updated ID ${item.id}`);
            }
        }

        console.log("🎉 Migration completed!");
        process.exit(0);

    } catch (err) {
        console.error("❌ Migration error:", err.message);
        process.exit(1);
    }
}

migrate();
