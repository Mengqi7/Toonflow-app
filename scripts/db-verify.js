const sqlite3 = require("better-sqlite3");
const db = sqlite3("./data/db2.sqlite");
const u = db.prepare("SELECT password FROM o_user WHERE name='admin'").get();
console.log(JSON.stringify(u.password));
console.log(u.password === "admin123");
db.close();
