require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fix() {
    console.log('Attempting to fix database schema cache...');
    
    // 1. Try to add columns again just in case
    try {
        const { error } = await supabase.rpc('exec_sql', { 
            sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS start_date TEXT; ALTER TABLE users ADD COLUMN IF NOT EXISTS end_date TEXT;" 
        });
        if (error) console.error('RPC Error (expected if exec_sql is disabled):', error.message);
        else console.log('Columns added via RPC.');
    } catch (e) {
        console.log('RPC failed, expected.');
    }

    // 2. Test if we can update without start_date
    console.log('Testing update without start_date...');
    const { error: testError } = await supabase
        .from('users')
        .update({ division: '테스트' })
        .eq('username', '1111');
    
    if (testError) {
        console.error('Update test failed:', testError.message);
    } else {
        console.log('Update test success! The issue is definitely the new columns.');
    }
}

fix();
