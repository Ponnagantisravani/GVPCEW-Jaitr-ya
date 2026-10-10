import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: new URL("../.env", import.meta.url) });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const client = await pool.connect();
try {
  await client.query("begin");
  await client.query(`
    update users
    set full_name = 'PONNAGANTI SRAVANI'
    where email = '324103210170.sravani@gvpcew.ac.in'
  `);
  await client.query(`
    update students
    set profile_details = jsonb_build_object(
      'course', 'B.Tech',
      'batch', '2024–2028',
      'department_code', 'CSE',
      'bloodGroup', 'B+',
      'validTill', 'May 2028',
      'address', 'Madhurawada, Visakhapatnam - 530048',
      'collegeContact', '0891-2739144, 2526639'
    )
    where roll_number = '324103210170'
  `);
  await client.query("commit");
  console.log("SUCCESS: Sravani profile details updated.");
} catch (err) {
  await client.query("rollback").catch(() => {});
  console.error("Error:", err);
} finally {
  client.release();
  await pool.end();
}
