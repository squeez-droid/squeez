import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const schema = process.env.DATABASE_SCHEMA;
const metadata = process.argv.includes("--metadata");
const checkpoint = process.argv.includes("--checkpoint");
const tables = process.argv.includes("--tables");
const meta = process.argv.includes("--meta");
const schemas = process.argv.includes("--schemas");
const { rows } = schemas
  ? await pool.query(
      `select s.schema_name,
              count(distinct t.table_name)::int as table_count,
              max(case when t.table_name = 'token' then 1 else 0 end)::int as has_token_table
       from information_schema.schemata s
       left join information_schema.tables t on t.table_schema = s.schema_name
       where s.schema_name = 'testnet' or s.schema_name like 'testnet\\_%' escape '\\'
       group by s.schema_name
       order by s.schema_name`,
    )
  : meta
  ? await pool.query(`select * from "${schema}"._ponder_meta`)
  : tables
  ? await pool.query(`select table_name from information_schema.tables where table_schema=$1 order by table_name`, [schema])
  : checkpoint
  ? await pool.query(`select chain_name, chain_id, safe_checkpoint, latest_checkpoint, finalized_checkpoint
      from "${schema}"._ponder_checkpoint`)
  : metadata
  ? await pool.query(
      `select table_schema, table_name, column_name from information_schema.columns
       where table_schema like 'ponder%' or (table_schema=$1 and table_name like '\_%') or table_name like '%status%'
       order by table_schema, table_name, ordinal_position`,
      [schema],
    )
  : await pool.query(
      `select table_name, column_name from information_schema.columns
       where table_schema=$1 and table_name in ('token','trade','creator_fee','protocol_fee')
       order by table_name, ordinal_position`, [schema],
    );
console.log(JSON.stringify(rows, null, 2));
await pool.end();
