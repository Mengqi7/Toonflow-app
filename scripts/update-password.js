const sqlite3 = require("better-sqlite3");
const path = require("path");

const dbPath = path.resolve(__dirname, "../data/db2.sqlite");
const db = sqlite3(dbPath);

// 更新密码为 admin123
db.prepare("UPDATE o_user SET password = 'admin123' WHERE name = 'admin'").run();

const user = db.prepare("SELECT * FROM o_user WHERE name = 'admin'").get();
console.log(`✅ admin 密码已更新: ***`);
db.close();
