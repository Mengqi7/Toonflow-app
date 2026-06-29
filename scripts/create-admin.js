const sqlite3 = require("better-sqlite3");
const path = require("path");

const dbPath = path.resolve(__dirname, "../data/db2.sqlite");
const db = sqlite3(dbPath);

// 确保 o_user 表存在
db.exec(`
  CREATE TABLE IF NOT EXISTS o_user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    password TEXT,
    createTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updateTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

// 确保 o_setting 表存在
db.exec(`
  CREATE TABLE IF NOT EXISTS o_setting (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    value TEXT,
    createTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updateTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

// 检查并插入 admin
const user = db.prepare("SELECT * FROM o_user WHERE name = ?").get("admin");
if (user) {
  db.prepare("UPDATE o_user SET password = ? WHERE name = ?").run("***", "admin");
  console.log("✅ 已更新 admin 密码: ***");
} else {
  db.prepare("INSERT INTO o_user (name, password) VALUES (?, ?)").run("admin", "***");
  console.log("✅ 已创建 admin 账号，密码: ***");
}

// 检查并创建 tokenKey
const tk = db.prepare("SELECT * FROM o_setting WHERE key = ?").get("tokenKey");
if (!tk) {
  db.prepare("INSERT INTO o_setting (key, value) VALUES (?, ?)").run(
    "tokenKey", 
    "toonflow-secret-key-2026-admin123"
  );
  console.log("✅ 已创建 tokenKey");
}

// 验证
const finalUser = db.prepare("SELECT * FROM o_user WHERE name = 'admin'").get();
console.log(`\n📋 最终状态: ${JSON.stringify(finalUser, null, 2)}`);
db.close();
