/**
 * Import script to load data from Lovable Cloud export to new Supabase
 * 
 * Run with: npx ts-node scripts/import-data.ts
 * 
 * Prerequisites:
 * 1. Have the lovable-export-2025-12-27.json in project root
 * 2. Be logged into the NEW Supabase with your user account
 * 3. Set NEW_USER_ID environment variable or update below
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// NEW Supabase credentials
const SUPABASE_URL = 'https://issddemuomsuqkkrzqzn.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
    console.log('Get it from: https://supabase.com/dashboard/project/issddemuomsuqkkrzqzn/settings/api');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Map old user ID to new user ID
const OLD_USER_ID = 'c7498548-9f65-4540-96ab-0068afb6d5fc';
const NEW_USER_ID = process.env.NEW_USER_ID || ''; // Will be set after first login

interface ExportData {
    exported_at: string;
    user_id: string;
    tables: {
        receipts: any[];
        product_mappings: any[];
        global_product_mappings: any[];
        store_patterns: any[];
        user_global_overrides: any[];
        category_suggestion_feedback: any[];
    };
}

async function importData() {
    // Load export file
    const exportPath = path.join(__dirname, '..', 'lovable-export-full-2025-12-27.json');
    console.log(`📂 Loading export from: ${exportPath}`);

    const exportData: ExportData = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));
    console.log(`✅ Loaded export from ${exportData.exported_at}`);
    console.log(`   Old user ID: ${exportData.user_id}`);

    if (!NEW_USER_ID) {
        console.error('❌ NEW_USER_ID not set. First, login to the new Supabase app and run:');
        console.log('   In browser console: supabase.auth.getUser().then(u => console.log(u.data.user.id))');
        process.exit(1);
    }

    console.log(`   New user ID: ${NEW_USER_ID}`);
    console.log('');

    // 1. Import global_product_mappings first (no user_id)
    console.log('📦 Importing global_product_mappings...');
    const globalMappings = exportData.tables.global_product_mappings;

    if (globalMappings.length > 0) {
        const { error: globalError } = await supabase
            .from('global_product_mappings')
            .upsert(globalMappings, { onConflict: 'id' });

        if (globalError) {
            console.error('   ❌ Error:', globalError.message);
        } else {
            console.log(`   ✅ Imported ${globalMappings.length} global mappings`);
        }
    }

    // 2. Import store_patterns (no user_id)
    console.log('📦 Importing store_patterns...');
    const storePatterns = exportData.tables.store_patterns;

    if (storePatterns.length > 0) {
        const { error: storeError } = await supabase
            .from('store_patterns')
            .upsert(storePatterns, { onConflict: 'id' });

        if (storeError) {
            console.error('   ❌ Error:', storeError.message);
        } else {
            console.log(`   ✅ Imported ${storePatterns.length} store patterns`);
        }
    }

    // 3. Import receipts (with user_id mapping)
    console.log('📦 Importing receipts...');
    const receipts = exportData.tables.receipts.map(r => ({
        ...r,
        user_id: NEW_USER_ID,
        // Keep image_url and image_urls pointing to old Supabase for now
    }));

    // Import in batches of 50
    const batchSize = 50;
    for (let i = 0; i < receipts.length; i += batchSize) {
        const batch = receipts.slice(i, i + batchSize);
        const { error: receiptError } = await supabase
            .from('receipts')
            .insert(batch);

        if (receiptError) {
            console.error(`   ❌ Error batch ${i / batchSize + 1}:`, receiptError.message);
        } else {
            console.log(`   ✅ Batch ${i / batchSize + 1}/${Math.ceil(receipts.length / batchSize)}`);
        }
    }
    console.log(`   ✅ Imported ${receipts.length} receipts`);

    // 4. Import product_mappings (with user_id mapping)
    console.log('📦 Importing product_mappings...');
    const productMappings = exportData.tables.product_mappings.map(m => ({
        ...m,
        user_id: NEW_USER_ID,
    }));

    for (let i = 0; i < productMappings.length; i += batchSize) {
        const batch = productMappings.slice(i, i + batchSize);
        const { error: mappingError } = await supabase
            .from('product_mappings')
            .insert(batch);

        if (mappingError) {
            console.error(`   ❌ Error batch ${i / batchSize + 1}:`, mappingError.message);
        } else {
            console.log(`   ✅ Batch ${i / batchSize + 1}/${Math.ceil(productMappings.length / batchSize)}`);
        }
    }
    console.log(`   ✅ Imported ${productMappings.length} product mappings`);

    // 5. Import user_global_overrides (with user_id mapping)
    console.log('📦 Importing user_global_overrides...');
    const overrides = exportData.tables.user_global_overrides.map(o => ({
        ...o,
        user_id: NEW_USER_ID,
    }));

    if (overrides.length > 0) {
        const { error: overrideError } = await supabase
            .from('user_global_overrides')
            .insert(overrides);

        if (overrideError) {
            console.error('   ❌ Error:', overrideError.message);
        } else {
            console.log(`   ✅ Imported ${overrides.length} user overrides`);
        }
    }

    console.log('');
    console.log('🎉 Import complete!');
    console.log('');
    console.log('Note: Receipt images still point to old Supabase URLs.');
    console.log('They will continue to work as long as the old bucket exists.');
}

importData().catch(console.error);
