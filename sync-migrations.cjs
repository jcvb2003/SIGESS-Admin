const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Simple dotenv fallback
if (fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      const value = valueParts.join('=').trim().replace(/^"|"$/g, '');
      process.env[key.trim()] = value;
    }
  });
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('ERRO: VITE_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não encontrados no .env');
  console.log('Certifique-se de que o .env contém:');
  console.log('VITE_SUPABASE_URL=https://your-project.supabase.co');
  console.log('SUPABASE_SERVICE_ROLE_KEY=your-service-role-key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

const migrationsDir = path.join(__dirname, 'supabase', 'migrations', 'raw');

async function sync() {
  if (!fs.existsSync(migrationsDir)) {
    console.error(`Diretório de migrations não encontrado: ${migrationsDir}`);
    return;
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql') && !f.startsWith('admin_'))
    .sort();

  console.log(`Iniciando sincronização de ${files.length} arquivos para o bucket 'migrations'...`);

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const content = fs.readFileSync(filePath); // Buffer binário

    console.log(`Fazendo upload de ${file}...`);
    
    const { error } = await supabase.storage
      .from('migrations')
      .upload(file, content, {
        contentType: 'text/plain;charset=utf-8',
        upsert: true
      });

    if (error) {
      console.error(`Erro ao enviar ${file}:`, error.message);
    } else {
      console.log(`Sucesso: ${file} enviado.`);
    }
  }
  
  console.log('Sincronização concluída.');
}

sync().catch(err => {
  console.error('Erro crítico na sincronização:', err);
  process.exit(1);
});
