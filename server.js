require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// Disable caching for static files to ensure app.js is always fresh
app.use(express.static(__dirname, {
  setHeaders: (res, path) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const upload = multer({ dest: 'uploads/' });

// Cache for sheet names
let cachedSheetNames = null;

app.get('/sheets', async (req, res) => {
    try {
        console.log('[SHEETS] Fetching ALL sheets via pagination...');
        let allItems = [];
        let from = 0;
        const step = 1000;
        
        while (true) {
            const { data, error } = await supabase
                .from('items')
                .select('sheet_name')
                .range(from, from + step - 1);
            
            if (error) throw error;
            if (!data || data.length === 0) break;
            
            allItems = allItems.concat(data);
            if (data.length < step) break; // Last page
            from += step;
        }
        
        const uniqueNames = [...new Set(allItems.map(item => item.sheet_name))].sort();
        console.log(`[SHEETS] Success! Found ${uniqueNames.length} sheets.`);
        res.json(['전체', ...uniqueNames]);
    } catch (e) { 
        console.error('Error fetching sheets:', e);
        res.status(500).json(['전체']); 
    }
});

app.get('/search', async (req, res) => {
    const { query, sheet } = req.query;
    try {
        let dbQuery = supabase.from('items').select('*');
        
        if (sheet && sheet !== '전체') {
            dbQuery = dbQuery.eq('sheet_name', sheet);
        }
        
        if (query) {
            dbQuery = dbQuery.or(`product_name.ilike.%${query}%,item_code.ilike.%${query}%,model.ilike.%${query}%`);
        }
        
        const { data, error } = await dbQuery.order('row_index', { ascending: true });
        
        if (error) throw error;
        
        const results = data.map(item => ({
            id: item.id,
            시트명: item.sheet_name,
            rowIndex: item.row_index,
            품명: item.product_name,
            가격: item.price,
            자재코드: item.item_code,
            사용모델: item.model,
            memo: item.modifier, // Mapping modifier to memo if that's what was intended
            수정자: item.modifier,
            이미지: item.images || [],
            '판매가능': item.status_sell_ok,
            '수리판매': item.status_repair_sell,
            '재고확인': item.status_check_stock,
            '미확인': item.status_unconfirmed,
            '수리전용': item.status_repair_only,
            '단종': item.status_discontinued,
            isRedRow: item.is_red_row
        }));
        
        res.json(results);
    } catch (e) { 
        console.error('Search error:', e);
        res.status(500).json([]); 
    }
});

app.post('/upload', upload.single('image'), async (req, res) => {
    const { itemId, userId } = req.body;
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    
    try {
        const fileContent = fs.readFileSync(req.file.path);
        const fileName = `upload_${Date.now()}_${req.file.originalname.replace(/[^a-z0-9.]/gi, '_')}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('item-images')
            .upload(fileName, fileContent, {
                contentType: req.file.mimetype,
                upsert: true
            });
            
        if (uploadError) throw uploadError;
        
        const { data: publicUrlData } = supabase.storage.from('item-images').getPublicUrl(fileName);
        const newImage = { name: fileName, url: publicUrlData.publicUrl };
        
        // Update item in DB
        const { data: itemData, error: itemFetchError } = await supabase
            .from('items')
            .select('images')
            .eq('id', itemId)
            .single();
            
        if (itemFetchError) throw itemFetchError;
        
        const currentImages = itemData.images || [];
        const updatedImages = [...currentImages, newImage];
        
        const { error: updateError } = await supabase
            .from('items')
            .update({ 
                images: updatedImages,
                modifier: userId
            })
            .eq('id', itemId);
            
        if (updateError) throw updateError;
        
        try { fs.unlinkSync(req.file.path); } catch(e) {}
        res.json({ success: true, image: newImage });
    } catch (e) {
        console.error('Upload error:', e);
        if (req.file) try { fs.unlinkSync(req.file.path); } catch(err) {}
        res.status(500).json({ success: false, message: e.message });
    }
});

app.post('/update', async (req, res) => {
    const { id, field, value, userId } = req.body;
    try {
        const updateData = { modifier: userId };
        
        // Map frontend fields to DB columns
        const fieldMap = {
            '품명': 'product_name',
            '가격': 'price',
            '자재코드': 'item_code',
            '사용모델': 'model',
            '판매가능': 'status_sell_ok',
            '수리판매': 'status_repair_sell',
            '재고확인': 'status_check_stock',
            '미확인': 'status_unconfirmed',
            '수리전용': 'status_repair_only',
            '단종': 'status_discontinued'
        };
        
        const dbField = fieldMap[field];
        if (dbField) {
            updateData[dbField] = value;
        } else {
            return res.status(400).json({ success: false, message: 'Invalid field' });
        }
        
        const { error } = await supabase
            .from('items')
            .update(updateData)
            .eq('id', id);
            
        if (error) throw error;
        res.json({ success: true });
    } catch (e) {
        console.error('Update error:', e);
        res.status(500).json({ success: false });
    }
});

app.post('/add-item', async (req, res) => {
    const { sheetName, item, userId } = req.body;
    try {
        const newItem = {
            sheet_name: sheetName,
            product_name: item.품명,
            price: item.가격,
            item_code: item.자재코드,
            model: item.사용모델,
            modifier: userId,
            row_index: 9999, // Placeholder for new items
            status_sell_ok: item.status === '판매가능' ? 1 : 0,
            status_repair_sell: item.status === '수리판매' ? 1 : 0,
            status_check_stock: item.status === '재고확인' ? 1 : 0,
            status_unconfirmed: item.status === '미확인' ? 1 : 0,
            status_repair_only: item.status === '수리전용' ? 1 : 0,
            status_discontinued: item.status === '단종' ? 1 : 0
        };
        
        const { data, error } = await supabase
            .from('items')
            .insert(newItem)
            .select();
            
        if (error) throw error;
        cachedSheetNames = null; // Clear cache
        res.json({ success: true, item: data[0] });
    } catch (e) {
        console.error('Add-item error:', e);
        res.status(500).json({ success: false, message: e.message });
    }
});

app.post('/delete-items', async (req, res) => {
    try {
        const { ids } = req.body;
        console.log('[DELETE] Request Body:', req.body);
        if (!ids || !Array.isArray(ids)) {
            console.error('[DELETE] IDs missing or not an array');
            return res.status(400).json({ success: false, message: '삭제할 항목 ID가 전달되지 않았습니다.' });
        }
        console.log(`[DELETE] Attempting to delete ${ids.length} items:`, ids);
        const { error } = await supabase
            .from('items')
            .delete()
            .in('id', ids);
            
        if (error) {
            console.error('[DELETE] Supabase error:', error);
            throw error;
        }
        console.log('[DELETE] Successfully deleted items.');
        res.json({ success: true });
    } catch (e) {
        console.error('Delete-items error:', e);
        res.status(500).json({ success: false, message: e.message });
    }
});

app.post('/delete-images-bulk', async (req, res) => {
    const { itemId, imageNames, userId } = req.body;
    try {
        const { data: itemData, error: itemFetchError } = await supabase
            .from('items')
            .select('images')
            .eq('id', itemId)
            .single();
            
        if (itemFetchError) throw itemFetchError;
        
        const currentImages = itemData.images || [];
        const updatedImages = currentImages.filter(img => !imageNames.includes(img.name));
        
        const { error: updateError } = await supabase
            .from('items')
            .update({ 
                images: updatedImages,
                modifier: userId
            })
            .eq('id', itemId);
            
        if (updateError) throw updateError;
        
        // Also delete from storage
        const { error: storageError } = await supabase.storage
            .from('item-images')
            .remove(imageNames);
            
        if (storageError) console.error('Storage deletion error:', storageError);
        
        res.json({ success: true });
    } catch (e) {
        console.error('Delete-images error:', e);
        res.status(500).json({ success: false });
    }
});

app.get('/users', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .order('username');
            
        if (error) throw error;
        
        const users = data.map(u => {
            let permissions = u.role || '';
            let startDate = u.start_date || '';
            let endDate = u.end_date || '';
            
            // Try to parse JSON from role if dates are missing in columns (fallback)
            if (permissions.startsWith('{')) {
                try {
                    const json = JSON.parse(permissions);
                    permissions = json.p || '';
                    startDate = json.s || '';
                    endDate = json.e || '';
                } catch(e) {}
            }
            
            return {
                name: u.username,
                password: u.password,
                division: u.division,
                permissions: permissions,
                startDate: startDate,
                endDate: endDate,
                expectedDays: 0
            };
        });
        res.json(users);
    } catch (e) {
        console.error('Error fetching users:', e);
        res.status(500).json([]);
    }
});

app.post('/update-users', async (req, res) => {
    const { users } = req.body;
    try {
        const dbUsers = users.map(u => {
            // Encode dates into role to bypass schema cache issues entirely
            const roleJson = JSON.stringify({ p: u.permissions, s: u.startDate, e: u.endDate });
            return {
                username: u.name,
                password: u.password,
                division: u.division,
                role: roleJson // ONLY save to working columns
            };
        });
        
        const { error } = await supabase
            .from('users')
            .upsert(dbUsers, { onConflict: 'username' });
            
        if (error) throw error;
        res.json({ success: true });
    } catch (e) {
        console.error('Error updating users:', e);
        let msg = e.message;
        if (msg.includes('schema cache')) {
            msg = '데이터베이스 구조 변경이 아직 반영되지 않았습니다. Supabase SQL Editor에서 NOTIFY pgrst, \'reload schema\'; 를 실행해 주세요.';
        }
        res.status(500).json({ success: false, message: msg });
    }
});

app.post('/login', async (req, res) => {
    const { id, password } = req.body;
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', id)
            .eq('password', password)
            .single();
            
        if (error || !data) {
            return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 일치하지 않습니다.' });
        }
        
        let permissions = data.role || '';
        let startDate = data.start_date || '';
        let endDate = data.end_date || '';
        
        if (permissions.startsWith('{')) {
            try {
                const json = JSON.parse(permissions);
                permissions = json.p || '';
                startDate = json.s || '';
                endDate = json.e || '';
            } catch(e) {}
        }
        
        // Check if account is expired (Using Korea Time)
        const todayKST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
        if (endDate && endDate < todayKST) {
            console.log(`[LOGIN] Blocked expired user: ${id} (End Date: ${endDate}, Today KST: ${todayKST})`);
            return res.status(403).json({ success: false, message: `사용 기간이 만료되었습니다. (만료일: ${endDate})` });
        }
        
        console.log(`[LOGIN] Success: ${data.username}, Today KST: ${todayKST}`);
        
        res.json({ 
            success: true, 
            user: {
                id: data.username,
                name: data.username,
                division: data.division,
                permissions: permissions,
                startDate: startDate,
                endDate: endDate
            }
        });
    } catch (e) {
        console.error('Login error:', e);
        res.status(500).json({ success: false, message: '로그인 처리 중 오류 발생' });
    }
});

app.listen(3000, () => { console.log('Server running on http://localhost:3000'); });
