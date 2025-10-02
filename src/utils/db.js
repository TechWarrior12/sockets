import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

let dbInstance = null;

export const getDb = async () => {
  if (!dbInstance) {
    const connection = await mysql.createConnection({
      host: "173.231.220.169",
      user:"mjfenterprises_office_dev",
      password: "office@connect",
      database: 'mjfenterprises_office',
       port: 3306,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      keepAliveInitialDelay: 1000,
      enableKeepAlive: true,
      connectTimeout: 30000,
    });
    dbInstance = drizzle(connection);
  }
  return dbInstance;
};