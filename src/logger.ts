import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(__dirname, '../bot.log');

// Helper to write to both console and file
export function neuralLog(module: string, message: string, data?: any) {
    const timestamp = new Date().toISOString();
    const cleanMsg = `[${timestamp}] [${module}] ${message}`;
    
    // 1. Terminal Output
    console.log(cleanMsg);
    if (data) console.dir(data, { depth: null });

    // 2. File Persistence (For remote inspection)
    const fileMsg = data ? `${cleanMsg} ${JSON.stringify(data)}\n` : `${cleanMsg}\n`;
    fs.appendFileSync(LOG_FILE, fileMsg);
}

// Ensure log file is fresh on startup
export function clearBotLog() {
    if (fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE);
    fs.writeFileSync(LOG_FILE, `--- NEURAL LOG STREAM INITIALIZED ---\n`);
}
