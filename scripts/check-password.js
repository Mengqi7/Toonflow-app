const sqlite3 = require("better-sqlite3");
const path = require("path");

const dbPath = path.resolve(__dirname, "../data/db2.sqlite");
const db = sqlite3(dbPath);

const users = db.prepare("SELECT * FROM o_user").all();
console.log(`所有用户:`);
users.forEach(u => {
  console.log(`  id=${u.id}, name=${u.name}, password=*** (${u.password})`);
});

// 改成 admin123
db.prepare("UPDATE o_user SET password = 'admin123' WHERE name = 'admin'").run();

const updated = db.prepare("SELECT * FROM o_user WHERE name = 'admin'").get();
console.log(`\n更新后: password=*** (${updated.password})`);

// 验证登录逻辑: data!.password == password && data!.name == username
const testPass = "***";
console.log(`\n密码比对: "${updated.password}" == "${testPass}" → ${updated.password === testPass}`);

db.close();
