const Database = require('better-sqlite3');
const { Pool } = require('pg');
const path = require('path');

// ------------------------------------------------------------
// OLD SQLITE DATABASE
// ------------------------------------------------------------
const sqlite = new Database(path.join(__dirname, 'gdl.db'), {
  readonly: true
});

// ------------------------------------------------------------
// SUPABASE POSTGRES DATABASE
// ------------------------------------------------------------
if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Tables must be imported in this order because
// service_features depends on services.
const tables = [
  'users',
  'settings',
  'services',
  'service_features',
  'slides',
  'stats',
  'industries',
  'case_studies',
  'team_members',
  'founders',
  'partners',
  'products',
  'requests'
];

function getSQLiteColumns(table) {
  return sqlite
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map(column => column.name);
}

function getSQLiteRows(table) {
  return sqlite.prepare(`SELECT * FROM ${table}`).all();
}

async function getPostgresColumns(client, table) {
  const result = await client.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position
    `,
    [table]
  );

  return result.rows.map(row => row.column_name);
}

async function migrateTable(client, table) {
  console.log(`\nMigrating ${table}...`);

  const sqliteColumns = getSQLiteColumns(table);
  const postgresColumns = await getPostgresColumns(client, table);

  // Only migrate columns that exist in BOTH databases.
  const columns = sqliteColumns.filter(column =>
    postgresColumns.includes(column)
  );

  if (columns.length === 0) {
    throw new Error(`No matching columns found for table ${table}`);
  }

  const rows = getSQLiteRows(table);

  console.log(`SQLite rows found: ${rows.length}`);

  if (rows.length === 0) {
    console.log(`No records to migrate from ${table}.`);
    return;
  }

  // Safety check:
  // We expect Supabase tables to still be empty.
  const existing = await client.query(
    `SELECT COUNT(*)::int AS count FROM public.${table}`
  );

  if (existing.rows[0].count > 0) {
    throw new Error(
      `Supabase table "${table}" already contains ${existing.rows[0].count} rows. ` +
      `Migration stopped to prevent duplicates.`
    );
  }

  const columnSQL = columns.map(c => `"${c}"`).join(', ');

  for (const row of rows) {
    const values = columns.map(column => row[column]);

    const placeholders = values
      .map((_, index) => `$${index + 1}`)
      .join(', ');

    const sql = `
      INSERT INTO public.${table}
      (${columnSQL})
      VALUES (${placeholders})
    `;

    await client.query(sql, values);
  }

  const after = await client.query(
    `SELECT COUNT(*)::int AS count FROM public.${table}`
  );

  if (after.rows[0].count !== rows.length) {
    throw new Error(
      `Verification FAILED for ${table}: SQLite=${rows.length}, PostgreSQL=${after.rows[0].count}`
    );
  }

  console.log(
    `✓ ${table}: ${rows.length} rows successfully migrated and verified`
  );
}

async function resetIdentity(client, table) {
  const result = await client.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = 'id'
    `,
    [table]
  );

  if (result.rowCount === 0) {
    return;
  }

  const maxResult = await client.query(
    `SELECT MAX(id) AS max_id FROM public.${table}`
  );

  const maxId = maxResult.rows[0].max_id;

  if (maxId === null) {
    return;
  }

  // Reset identity sequence so future inserts don't reuse migrated IDs.
  await client.query(
    `
      SELECT setval(
        pg_get_serial_sequence($1, 'id'),
        $2,
        true
      )
    `,
    [`public.${table}`, Number(maxId)]
  );

  console.log(`✓ Reset ID sequence for ${table} to ${maxId}`);
}

async function verifyEverything(client) {
  console.log('\n========================================');
  console.log('FINAL VERIFICATION');
  console.log('========================================');

  for (const table of tables) {
    const sqliteCount = sqlite
      .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
      .get().count;

    const postgresResult = await client.query(
      `SELECT COUNT(*)::int AS count FROM public.${table}`
    );

    const postgresCount = postgresResult.rows[0].count;

    const status =
      sqliteCount === postgresCount ? '✓' : '✗';

    console.log(
      `${status} ${table}: SQLite=${sqliteCount} | Supabase=${postgresCount}`
    );

    if (sqliteCount !== postgresCount) {
      throw new Error(`Count mismatch detected for ${table}`);
    }
  }
}

async function main() {
  const client = await pool.connect();

  try {
    console.log('========================================');
    console.log('GDL SQLITE → SUPABASE MIGRATION');
    console.log('========================================');

    await client.query('BEGIN');

    for (const table of tables) {
      await migrateTable(client, table);
    }

    // Reset generated ID sequences after explicit ID imports.
    for (const table of tables) {
      await resetIdentity(client, table);
    }

    await verifyEverything(client);

    await client.query('COMMIT');

    console.log('\n========================================');
    console.log('MIGRATION SUCCESSFUL');
    console.log('No SQLite data was deleted.');
    console.log('========================================');

  } catch (error) {
    await client.query('ROLLBACK');

    console.error('\n========================================');
    console.error('MIGRATION FAILED');
    console.error('All PostgreSQL changes were rolled back.');
    console.error('Your gdl.db was NOT modified.');
    console.error('========================================');

    console.error(error);

    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
    sqlite.close();
  }
}

main();