import fs from 'node:fs';
async function main(){
    if(fs.existsSync('.env.local'))process.loadEnvFile('.env.local');
    const {db}=await import('../src/lib/db');
    console.log('Database migrations complete:',db.prepare('PRAGMA user_version').get());
}
void main().catch(e=>{console.error(e.message);process.exitCode=1;});
