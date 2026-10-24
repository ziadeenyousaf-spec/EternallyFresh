const postgres = require('pg');//makes it so that server can use postgresql package to connect to server
require('dotenv').config();

async function sqlConnection(){//returns server connection
    client= new postgres.Client({
    user: process.env.sqlUser,
    password: String(process.env.sqlPassword),
    host: process.env.sqlHost,
    database: process.env.sqlDatabase,
  })
  await client.connect();
  const schemaName = process.env.DBSchema || 'hacknotts26';
  await client.query(`SET search_path TO ${schemaName}, public`);
  return client;
}


async function newCustomer(username,forename,surname,email,password,custSex,custDOB){//all parameters are values to be inserted into database
    const db = await sqlConnection(); // get a new connection
    const query = 'INSERT INTO "Customer"(username,forename,surname,email,password,sex,"dateOfBirth") VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING "custID"';
    try {
        const result = await db.query(query, [username, forename, surname, email, password, custSex, custDOB]);
        return result.rows[0].custID;
    } catch (err) {
        console.error('Error inserting customer:', err);
        throw err;
    }finally {
        await db.end(); // end connection
    }
}

async function getAllFromSingleRow(tableName,rowName){//tableName and rowName are hardcoded parameters and are never should be entered by the user
    const db = await sqlConnection(); // get a new connection
    const query = `SELECT "${rowName}" FROM "${tableName}"`;
    try {
        const result = await db.query(query);
        return result.rows;
    } catch (err) {
        console.error(`Error fetching ${rowName} in ${tableName}:\n`, err);
        throw err;
    }finally {
        await db.end(); // end connection
    }
}

async function conditionalSelect(tableName,rowName,condition){
  const db=await sqlConnection();//creates connection to server
  const query= `SELECT "${rowName}" FROM "${tableName}" WHERE ${condition}`;//query to get all of fields for the row in the table
  try{//code may give an error
    const results = await db.query(query);//executes select query
    return results.rows;
  }catch(err){//runs if there is an error with above code
    console.error(`Error fetching ${rowName} in ${tableName} with condition ${condition}:\n`,err);//add to console error message with the reason why
    throw err;//return error to call so that user can be told to retry
  }finally{//always runs
    await db.end();//ends connection to server
  }
}


async function updateRowValue(tableName, rowName, idName, idValue, newValue) {
  //updates the row in the table with the new value where the id matches the value
  const db = await sqlConnection(); // get a new connection
  try {
      const query = `UPDATE "??" SET "??" = "?" WHERE "??" = "?"`;// ? are placeholders for the paramaters
      const params = [tableName, rowName, newValue, idName, idValue];//puts respective parameters in their position as placeholders
      await db.query(query, params);
  } catch (err) {
      console.error('Error updating value:', err);
  } finally {
      await db.end(); // end connection
  }
}

async function selectAllFromTable(tableName){//tableName is hardcoded parameters and are never should be entered by the user
    const db = await sqlConnection(); // get a new connection
    const query = `SELECT * FROM "${tableName}"`;
    try {
        const result = await db.query(query);
        return result.rows;
    } catch (err) {
        console.error(`Error fetching all from ${tableName}:\n`, err);
        throw err;
    }finally {
        await db.end(); // end connection
    }
}

async function hardCodedQuery(query){//query is hardcoded and will not change no matter the user
    const db = await sqlConnection(); // get a new connection
    try{
        const result = await db.query(query);
        return result.rows;
    } catch (err) {
        console.error(`Error fetching all from ${tableName}:\n`, err);
        throw err;
    }finally {
        await db.end(); // end connection
    }
}

module.exports={newCustomer,conditionalSelect,getAllFromSingleRow,updateRowValue,selectAllFromTable,hardCodedQuery};