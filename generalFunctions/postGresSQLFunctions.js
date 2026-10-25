const { Pool } = require('pg'); 
require('dotenv').config();

// Create ONE pool instance for the entire app life cycle
const pool = new Pool({
  user: process.env.sqlUser,
  password: String(process.env.sqlPassword),
  host: process.env.sqlHost,
  database: process.env.sqlDatabase,
  max: 20, // Allows up to 20 concurrent queries safely
  idleTimeoutMillis: 30000,
});

// Automatically applies your schema to every connection picked up from the pool
pool.on('connect', async (client) => {
  const schemaName = process.env.DBSchema || 'hacknotts26';
  await client.query(`SET search_path TO ${schemaName}, public`);
});

async function newCustomer(username, forename, surname, email, password, custSex, custDOB) {
    const query = 'INSERT INTO "Customer"(username,forename,surname,email,password,sex,"dateOfBirth") VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING "custID"';
    try {
        const result = await pool.query(query, [username, forename, surname, email, password, custSex, custDOB]);
        return result.rows[0].custID;
    } catch (err) {
        console.error('Error inserting customer:', err);
        throw err;
    } // No 'finally' block needed! The pool handles connection returns automatically.
}

async function getAllFromSingleRow(tableName, rowName) {
    const query = `SELECT "${rowName}" FROM "${tableName}"`;
    try {
        const result = await pool.query(query);
        return result.rows;
    } catch (err) {
        console.error(`Error fetching ${rowName} in ${tableName}:\n`, err);
        throw err;
    }
}

async function conditionalSelect(tableName, rowName, condition) {
  const query = `SELECT "${rowName}" FROM "${tableName}" WHERE ${condition}`;
  try {
    const results = await pool.query(query);
    return results.rows;
  } catch (err) {
    console.error(`Error fetching ${rowName} in ${tableName} with condition ${condition}:\n`, err);
    throw err;
  }
}

async function updateRowValue(tableName, rowName, idName, idValue, newValue) {
  try {
      // NOTE: PostgreSQL pg driver does not support '??' style placeholders out of the box for table/column names. 
      // You should string-interpolate structural identifiers, and parameterise data values ($1).
      const query = `UPDATE "${tableName}" SET "${rowName}" = $1 WHERE "${idName}" = $2`;
      await pool.query(query, [newValue, idValue]);
  } catch (err) {
      console.error('Error updating value:', err);
  }
}

async function selectAllFromTable(tableName) {
    const query = `SELECT * FROM "${tableName}"`;
    try {
        const result = await pool.query(query);
        return result.rows;
    } catch (err) {
        console.error(`Error fetching all from ${tableName}:\n`, err);
        throw err;
    }
}

async function hardCodedQuery(query) {
    try {
        const result = await pool.query(query);
        return result.rows;
    } catch (err) {
        console.error(`Error fetching from the query:\n ${query}`, err);
        throw err;
    }
}

module.exports = { newCustomer, conditionalSelect, getAllFromSingleRow, updateRowValue, selectAllFromTable, hardCodedQuery };
