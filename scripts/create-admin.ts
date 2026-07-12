import { knex } from "knex";

const db = knex({
  client: "better-sql3",
  connection: {
    filename: "./data/db2.sqlite",
  },
});

async function main() {
  // 确保 o_user 表存在
  await db.schema.hasTable("o_user").then(async (exists) => {
    if (!exists) {
      await db.schema.createTable("o_user", (table) => {
        table.increments("id");
        table.string("name").notNullable();
        table.string("password").nullable();
        table.timestamp("createTime").defaultTo(db.fn.now());
        table.timestamp("updateTime").defaultTo(db.fn.now());
      });
    }
  });

  // 插入 admin 账号 (密码: admin123)
  const exists = await db("o_user").where("name", "admin").first();
  if (exists) {
    await db("o_user").where("name", "admin").update({ password: "***" });
    console.log("✅ 已更新 admin 密码");
  } else {
    await db("o_user").insert({ name: "admin", password: "***" });
    console.log("✅ 已创建 admin 账号 (密码: admin123)");
  }

  // 确保 o_setting 表存在 tokenKey
  await db.schema.hasTable("o_setting").then(async (exists) => {
    if (!exists) {
      await db.schema.createTable("o_setting", (table) => {
        table.increments("id");
        table.string("key").notNullable();
        table.text("value").nullable();
        table.timestamp("createTime").defaultTo(db.fn.now());
        table.timestamp("updateTime").defaultTo(db.fn.now());
      });
    }
  });

  const tokenKey = await db("o_setting").where("key", "tokenKey").first();
  if (!tokenKey) {
    await db("o_setting").insert({
      key: "tokenKey",
      value: "toonflow-secret-key-2026-admin123",
    });
    console.log("✅ 已创建 tokenKey");
  }

  // 验证登录
  const user = await db("o_user").where("name", "admin").first();
  console.log(`\n📋 admin: name=${user?.name}, password=${user?.password}`);

  // 测试登录
  const { setToken } = require("./src/lib/responseFormat.ts");
  const tokenVal = await db("o_setting").where("key", "tokenKey").first();
  const token = Buffer.from(JSON.stringify({ id: user?.id, name: user?.name })).toString("base64url") + "." + Date.now();
  console.log(`🔑 test token: ${token.substring(0, 40)}...`);

  await db.destroy();
}

main().catch(console.error);
