import dotenv from "dotenv";
import pg from "pg";
import bcrypt from "bcryptjs";

dotenv.config({ path: new URL("../.env", import.meta.url) });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL_MODE === "require" ? { rejectUnauthorized: false } : undefined
});

const client = await pool.connect();

try {
  await client.query("begin");

  const passwordHash = await bcrypt.hash("123456789", 12);

  // 1. Resolve Academic Section IDs
  const sec1Res = await client.query("select id from academic_sections where year_number = 2 and semester_number = 3 and section_name = '1'");
  const sec3Res = await client.query("select id from academic_sections where year_number = 2 and semester_number = 3 and section_name = '3'");

  if (!sec1Res.rows.length || !sec3Res.rows.length) {
    throw new Error("Could not find academic section IDs for CSE Year 2 Sem 3");
  }

  const sec1Id = sec1Res.rows[0].id;
  const sec3Id = sec3Res.rows[0].id;

  console.log(`Resolved CSE Section 1 ID: ${sec1Id}`);
  console.log(`Resolved CSE Section 3 ID: ${sec3Id}`);

  // 2. Update Student 1: 324103210182 -> 324103210182.deekshitha@gvpcew.ac.in (CSE Section 3)
  const user1 = await client.query(`
    update users
    set email = '324103210182.deekshitha@gvpcew.ac.in',
        password_hash = $1,
        active = true
    where id = (select user_id from students where roll_number = '324103210182')
    returning id, email, full_name, role, active
  `, [passwordHash]);

  const student1 = await client.query(`
    update students
    set academic_section_id = $1,
        section = '3',
        face_enrollment_status = 'completed',
        face_enrolled_at = coalesce(face_enrolled_at, now())
    where roll_number = '324103210182'
    returning id, roll_number, section, academic_section_id, face_enrollment_status
  `, [sec3Id]);

  // Ensure role in user_roles
  await client.query(`
    insert into user_roles (user_id, role)
    values ($1, 'student')
    on conflict (user_id, role) do nothing
  `, [user1.rows[0].id]);

  // 3. Update Student 2: 324103210169 -> 324103210169.thanmayee@gvpcew.ac.in (CSE Section 1)
  const user2 = await client.query(`
    update users
    set email = '324103210169.thanmayee@gvpcew.ac.in',
        password_hash = $1,
        active = true
    where id = (select user_id from students where roll_number = '324103210169')
    returning id, email, full_name, role, active
  `, [passwordHash]);

  const student2 = await client.query(`
    update students
    set academic_section_id = $1,
        section = '1',
        face_enrollment_status = 'completed',
        face_enrolled_at = coalesce(face_enrolled_at, now())
    where roll_number = '324103210169'
    returning id, roll_number, section, academic_section_id, face_enrollment_status
  `, [sec1Id]);

  // Ensure role in user_roles
  await client.query(`
    insert into user_roles (user_id, role)
    values ($1, 'student')
    on conflict (user_id, role) do nothing
  `, [user2.rows[0].id]);

  await client.query("commit");

  console.log("\n==========================================");
  console.log("CREDENTIALS SUCCESSFULLY CONFIGURED");
  console.log("==========================================");
  console.log("1. Student:", {
    roll_number: student1.rows[0]?.roll_number,
    name: user1.rows[0]?.full_name,
    email: user1.rows[0]?.email,
    section: "CSE Section 3",
    section_id: student1.rows[0]?.academic_section_id,
    face_status: student1.rows[0]?.face_enrollment_status,
    password: "•••••••••"
  });
  console.log("2. Student:", {
    roll_number: student2.rows[0]?.roll_number,
    name: user2.rows[0]?.full_name,
    email: user2.rows[0]?.email,
    section: "CSE Section 1",
    section_id: student2.rows[0]?.academic_section_id,
    face_status: student2.rows[0]?.face_enrollment_status,
    password: "•••••••••"
  });
  console.log("==========================================\n");

} catch (err) {
  await client.query("rollback").catch(() => {});
  console.error("Migration failed:", err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
