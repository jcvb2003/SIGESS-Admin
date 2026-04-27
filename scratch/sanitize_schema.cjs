const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'supabase/functions/_shared/initial_schema.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Extrai apenas o conteúdo do SQL (assume que está entre aspas ou backticks)
// Vamos reconstruir o arquivo de forma segura
const sqlMatch = content.match(/export const initialSchemaSql = [`'"]([\s\S]*)[`'"];?/);
if (sqlMatch) {
    let sql = sqlMatch[1];
    // Escapa backticks e interpolações
    sql = sql.replace(/`/g, '\\`').replace(/\${/g, '\\${');
    
    const newContent = `export const initialSchemaSql = String.raw\`${sql}\`;\n`;
    fs.writeFileSync(filePath, newContent);
    console.log('Arquivo initial_schema.ts sanitizado com sucesso.');
} else {
    console.error('Não foi possível encontrar a declaração do SQL no arquivo.');
}
