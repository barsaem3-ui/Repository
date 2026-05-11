require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const EXCEL_FILE = path.resolve(__dirname, '..', 'pasco.xlsx');
const USER_EXCEL = path.resolve(__dirname, '..', '사용자.xlsx');

async function migrate() {
    console.log('Starting migration...');

    // 1. Ensure Bucket exists
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    if (bucketError) {
        console.error('Error listing buckets:', bucketError);
        return;
    }
    if (!buckets.find(b => b.name === 'item-images')) {
        console.log('Creating bucket: item-images');
        await supabase.storage.createBucket('item-images', { public: true });
    }

    // 2. Migrate Users
    if (fs.existsSync(USER_EXCEL)) {
        try {
            console.log('Migrating users...');
            const userWorkbook = new ExcelJS.Workbook();
            await userWorkbook.xlsx.readFile(USER_EXCEL);
            const userSheet = userWorkbook.worksheets[0];
            const users = [];
            userSheet.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return;
                const username = String(row.getCell(1).value || '').trim();
                const password = String(row.getCell(2).value || '').trim();
                const division = String(row.getCell(3).value || '').trim();
                const role = String(row.getCell(4).value || '').trim();
                const endDate = String(row.getCell(6).value || '').trim();
                if (username && password) {
                    users.push({ username, password, division, role, end_date: endDate });
                }
            });
            if (users.length > 0) {
                const { error: userInsertError } = await supabase.from('users').upsert(users, { onConflict: 'username' });
                if (userInsertError) console.error('User migration error:', userInsertError);
                else console.log(`Migrated ${users.length} users.`);
            }
        } catch (e) {
            console.error('User migration failed, skipping:', e.message);
        }
    }

    // 3. Migrate Items
    console.log('Reading pasco.xlsx (this may take a while)...');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(EXCEL_FILE);
    console.log('Workbook loaded.');

    const statusFields = ['판매가능', '수리판매', '재고확인', '미확인', '수리전용', '단종'];

    for (const sheet of workbook.worksheets) {
        // Skip already migrated sheets
        const { data: existingSheetData } = await supabase
            .from('items')
            .select('id')
            .eq('sheet_name', sheet.name)
            .limit(1);
        
        if (existingSheetData && existingSheetData.length > 0) {
            console.log(`Skipping already migrated sheet: ${sheet.name}`);
            continue;
        }

        console.log(`Processing sheet: ${sheet.name}`);
        const headerMap = getHeaderMap(sheet, statusFields);
        const sheetImages = sheet.getImages() || [];
        const imageMap = {};
        
        const codeCol = headerMap['자재코드'];
        const imgCol = headerMap['이미지'];

        // Map images to rows
        sheetImages.forEach((img) => {
            const range = img.range;
            if (range && range.tl && typeof range.tl.row === 'number') {
                const rStart = range.tl.row + 1;
                const rEnd = range.br ? range.br.row + 1 : rStart;
                const cStart = range.tl.col + 1;
                const isRightSide = (cStart >= codeCol || (imgCol !== -1 && cStart >= imgCol - 1));
                if (isRightSide) {
                    for (let r = Math.floor(rStart); r <= Math.ceil(rEnd); r++) {
                        if (r < 1) continue;
                        if (!imageMap[r]) imageMap[r] = [];
                        imageMap[r].push(img);
                    }
                }
            }
        });

        const itemsToInsert = [];
        const rows = [];
        sheet.eachRow((row, rowNumber) => {
            try {
                if (headerMap['품명'] === -1) return;
                const cell = row.getCell(headerMap['품명']);
                if (!cell) return;
                const nameVal = String(cell.value || cell.text || '');
                if (!nameVal || nameVal === '품명' || (rowNumber <= 10 && nameVal.includes('품명'))) return;
                
                const firstCell = row.getCell(1);
                let isRedRow = false;
                if (firstCell && firstCell.fill && firstCell.fill.fgColor && firstCell.fill.fgColor.argb) {
                    const argb = String(firstCell.fill.fgColor.argb || '').toUpperCase();
                    if (argb === 'FFFF0000' || argb.includes('FFC00000') || argb === 'FFFFC7CE') isRedRow = true;
                }

                rows.push({ row, rowNumber, isRedRow });
            } catch (err) {
                console.error(`Error processing row ${rowNumber} in ${sheet.name}:`, err.message);
            }
        });

        // Batch processing to avoid memory issues
        for (let i = 0; i < rows.length; i++) {
            const { row, rowNumber, isRedRow } = rows[i];
            const itemImages = imageMap[rowNumber] || [];
            const uploadedImages = [];

            for (const img of itemImages) {
                const imageObj = workbook.model.media.find(m => m.index === img.imageId);
                if (imageObj) {
                    // Sanitize filename: replace non-alphanumeric with underscore
                    const safeSheetName = sheet.name.replace(/[^a-z0-9]/gi, '_');
                    const fileName = `${safeSheetName}_row${rowNumber}_${img.imageId}.${imageObj.extension}`;
                    const { data: uploadData, error: uploadError } = await supabase.storage
                        .from('item-images')
                        .upload(fileName, imageObj.buffer, {
                            contentType: `image/${imageObj.extension}`,
                            upsert: true
                        });
                    
                    if (uploadError) {
                        console.error(`Upload error for ${fileName}:`, uploadError);
                    } else {
                        const { data: publicUrlData } = supabase.storage.from('item-images').getPublicUrl(fileName);
                        uploadedImages.push({ name: fileName, url: publicUrlData.publicUrl });
                    }
                }
            }

            itemsToInsert.push({
                sheet_name: sheet.name,
                row_index: rowNumber,
                product_name: headerMap['품명'] !== -1 ? row.getCell(headerMap['품명']).text : '',
                price: headerMap['가격'] !== -1 ? row.getCell(headerMap['가격']).text : '',
                item_code: headerMap['자재코드'] !== -1 ? row.getCell(headerMap['자재코드']).text : '',
                model: headerMap['사용모델'] !== -1 ? row.getCell(headerMap['사용모델']).text : '',
                modifier: headerMap['수정자'] !== -1 ? row.getCell(headerMap['수정자']).text : '',
                is_red_row: isRedRow,
                status_sell_ok: headerMap['판매가능'] !== -1 ? (parseInt(row.getCell(headerMap['판매가능']).value) || 0) : 0,
                status_repair_sell: headerMap['수리판매'] !== -1 ? (parseInt(row.getCell(headerMap['수리판매']).value) || 0) : 0,
                status_check_stock: headerMap['재고확인'] !== -1 ? (parseInt(row.getCell(headerMap['재고확인']).value) || 0) : 0,
                status_unconfirmed: headerMap['미확인'] !== -1 ? (parseInt(row.getCell(headerMap['미확인']).value) || 0) : 0,
                status_repair_only: headerMap['수리전용'] !== -1 ? (parseInt(row.getCell(headerMap['수리전용']).value) || 0) : 0,
                status_discontinued: headerMap['단종'] !== -1 ? (parseInt(row.getCell(headerMap['단종']).value) || 0) : 0,
                images: uploadedImages
            });

            if (itemsToInsert.length >= 100) {
                const { error: insertError } = await supabase.from('items').insert(itemsToInsert);
                if (insertError) console.error('Insert error:', insertError);
                else console.log(`Inserted 100 items from ${sheet.name}`);
                itemsToInsert.length = 0;
            }
        }

        if (itemsToInsert.length > 0) {
            const { error: insertError } = await supabase.from('items').insert(itemsToInsert);
            if (insertError) console.error('Insert error:', insertError);
            else console.log(`Inserted remaining ${itemsToInsert.length} items from ${sheet.name}`);
        }
    }

    console.log('Migration complete!');
}

function getHeaderMap(sheet, statusFields) {
    const headerMap = { '품명': -1, '가격': -1, '자재코드': -1, '사용모델': -1, '이미지': -1, '수정자': -1 };
    statusFields.forEach(f => headerMap[f] = -1);

    for (let r = 1; r <= 10; r++) {
        const row = sheet.getRow(r);
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
            const val = String(cell.value || '').replace(/\s+/g, '');
            if (val.includes('품명') && headerMap['품명'] === -1) headerMap['품명'] = colNumber;
            if (val.includes('가격') && headerMap['가격'] === -1) headerMap['가격'] = colNumber;
            if (val.includes('자재코드') && headerMap['자재코드'] === -1) headerMap['자재코드'] = colNumber;
            if (val.includes('사용모델') && headerMap['사용모델'] === -1) headerMap['사용모델'] = colNumber;
            if (val.includes('이미지') && headerMap['이미지'] === -1) headerMap['이미지'] = colNumber;
            if (val.includes('수정자') && headerMap['수정자'] === -1) headerMap['수정자'] = colNumber;
            statusFields.forEach(f => {
                if (val.includes(f) && headerMap[f] === -1) headerMap[f] = colNumber;
            });
        });
        if (headerMap['품명'] !== -1 && headerMap['자재코드'] !== -1) break;
    }
    if (headerMap['품명'] === -1) headerMap['품명'] = 1;
    if (headerMap['자재코드'] === -1) headerMap['자재코드'] = 3;
    if (headerMap['가격'] === -1) headerMap['가격'] = 2;
    if (headerMap['이미지'] === -1) headerMap['이미지'] = 4;
    if (headerMap['사용모델'] === -1) headerMap['사용모델'] = 5;
    return headerMap;
}

migrate().catch(console.error);
