import {pool} from '../src/config/db.js';
try{const result=await pool.query('update students set enrollment_preview=null,enrollment_preview_expires_at=null where enrollment_preview_expires_at<=now()');console.log('Expired previews deleted:',result.rowCount);}finally{await pool.end();}
