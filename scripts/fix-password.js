const sqlite3 = require("better-sqlite3");
const path = require("path");

const dbPath = path.resolve(__dirname, "../data/db2.sqlite");
const db = sqlite3(dbPath);

// 显示当前密码（十六进制）
const user = db.prepare("SELECT name, password, typeof(password), length(password) FROM o_user WHERE name='admin'").get();
console.log(`当前 admin 用户:`);
console.log(`  name: ${user.name}`);
console.log(`  password: "${user.password}"`);
console.log(`  typeof: ${user["typeof(password)"]}`);
console.log(`  length: ${user["length(password)"]} chars`);
console.log(`  hex: ${Buffer.from(user.password).toString("hex")}`);

// 改成 admin123
db.prepare("UPDATE o_user SET password = 'admin123' WHERE name = 'admin'").run();

const updated = db.prepare("SELECT * FROM o_user WHERE name = 'admin'").get();
console.log(`\n更新后: password="${updated.password}"`);

// 验证匹配
console.log(`"\${updated.password}" == "admin123" → ${updated.password === "admin123"}`);

db.close();
