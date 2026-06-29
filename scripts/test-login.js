const sqlite3 = require("better-sqlite3");
const db = sqlite3("./data/db2.sqlite");

// 模拟 login.ts 的逻辑
const username = "admin";
const password = "admin123";

const data = db.prepare("SELECT * FROM o_user WHERE name = ?").get(username);
console.log("数据库中的用户:", JSON.stringify(data));

if (!data) {
  console.log("\n❌ 登录失败: 登录失败");
} else if (data.password == password && data.name == username) {
  console.log("\n✅ 登录成功!");
} else {
  console.log("\n❌ 用户名或密码错误");
  console.log(`  data.password="${data.password}"`);
  console.log(`  password="${password}"`);
  console.log(`  data.password == password → ${data.password == password}`);
  console.log(`  data.name === username → ${data.name === username}`);
}

db.close();
