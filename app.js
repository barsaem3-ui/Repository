const API_BASE = window.location.origin;

const elements = {
    sheetSelect: document.getElementById('sheetSelect'),
    searchInput: document.getElementById('searchInput'),
    searchBtn: document.getElementById('searchBtn'),
    resultsContainer: document.getElementById('resultsContainer'),
    resultCount: document.getElementById('resultCount'),
    loadingIndicator: document.getElementById('loadingIndicator'),
    modal: document.getElementById('imageModal'),
    modalImg: document.getElementById('modalImg'),
    closeBtn: document.querySelector('.close-btn'),
    addBtn: document.getElementById('addBtn'),
    bulkDeleteBtn: document.getElementById('bulkDeleteBtn'),
    addModal: document.getElementById('addModal'),
    cancelAddBtn: document.getElementById('cancelAddBtn'),
    closeAddModal: document.querySelector('.close-add-modal'),
    clearSearchBtn: document.getElementById('clearSearchBtn'),
    loginScreen: document.getElementById('loginScreen'),
    mainApp: document.getElementById('mainApp'),
    loginId: document.getElementById('loginId'),
    loginPw: document.getElementById('loginPw'),
    loginBtn: document.getElementById('loginBtn'),
    loginMsg: document.getElementById('loginMsg'),
    displayUserId: document.getElementById('displayUserId'),
    displayUserPerm: document.getElementById('displayUserPerm'),
    logoutBtn: document.getElementById('logoutBtn'),
    userSettingsBtn: document.getElementById('userSettingsBtn'),
    userSettingsModal: document.getElementById('userSettingsModal'),
    userTableBody: document.getElementById('userTableBody'),
    saveAddBtn: document.getElementById('saveAddBtn'),
    loginClock: document.getElementById('loginClock'),
    displayUserEnd: document.getElementById('displayUserEnd'),
    displayCurrentTime: document.getElementById('displayCurrentTime')
};

let isBulkDeleteMode = false;
let currentUser = null;

// Initialize
async function init() {
    try {
        const response = await fetch(`${API_BASE}/sheets?t=${Date.now()}`);
        if (!response.ok) throw new Error('Network response was not ok');
        const sheets = await response.json();
        
        // Populate select
        sheets.forEach(sheet => {
            if (sheet === '전체') return; // already in HTML
            const option = document.createElement('option');
            option.value = sheet;
            option.textContent = sheet;
            elements.sheetSelect.appendChild(option);
        });
        performSearch();
    } catch (error) {
        console.error('Failed to load sheets:', error);
        elements.resultsContainer.innerHTML = `
            <div class="empty-state">
                <p style="color:#ff6b6b; font-weight: 600;">서버에 연결할 수 없습니다.</p>
                <p style="font-size: 0.9em; margin-top: 10px;">
                    1. 터미널(CMD)에서 <code>node server.js</code>를 실행했는지 확인해주세요.<br>
                    2. <code>pasco.xlsx</code> 또는 <code>posco.xlsx</code> 파일이 같은 폴더에 있는지 확인해주세요.
                </p>
            </div>`;
    }
}

// Search
async function performSearch() {
    const query = elements.searchInput.value.trim();
    const sheet = elements.sheetSelect.value;
    
    // UI Update
    elements.loadingIndicator.classList.remove('hidden');
    elements.resultsContainer.innerHTML = '';
    elements.resultCount.textContent = '...';

    try {
        const response = await fetch(`${API_BASE}/search?query=${encodeURIComponent(query)}&sheet=${encodeURIComponent(sheet)}`);
        const data = await response.json();
        
        renderResults(data);
    } catch (error) {
        console.error('Search failed:', error);
        elements.resultsContainer.innerHTML = `<div class="empty-state"><p style="color:#ff6b6b;">검색 중 오류가 발생했습니다.</p></div>`;
    } finally {
        elements.loadingIndicator.classList.add('hidden');
    }
}

// Format numbers
function formatPrice(price) {
    if (price === undefined || price === null || price === '') return '-';
    if (typeof price === 'number') return price.toLocaleString() + '원';
    
    // Ensure string
    const priceStr = String(price);
    const num = parseInt(priceStr.replace(/[^0-9]/g, ''));
    if (!isNaN(num)) return num.toLocaleString() + '원';
    return priceStr;
}

let currentPage = 1;
const itemsPerPage = 15; // Small chunk for performance
let allData = [];

// Render Results
function renderResults(data, append = false) {
    // Remove existing load-more button if any
    const existingBtn = document.getElementById('load-more-btn');
    if (existingBtn) existingBtn.remove();

    if (!append) {
        allData = data;
        currentPage = 1;
        elements.resultCount.textContent = data.length.toLocaleString();
        elements.resultsContainer.innerHTML = '';
    }

    if (data.length === 0 && !append) {
        elements.resultsContainer.innerHTML = `
            <div class="empty-state">
                <p>검색 결과가 없습니다.</p>
            </div>
        `;
        return;
    }

    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const pageData = data.slice(start, end);

    console.log(`[DEBUG] Rendering page ${currentPage} (${pageData.length} items)`);

    const html = pageData.map((item, index) => {
        const globalIndex = start + index;
        const meta = JSON.stringify({ id: item.id, sheetName: item.시트명 });
        let imgHtml = '<div class="no-img">이미지 없음</div>';
        
        if (item.이미지 && Array.isArray(item.이미지) && item.이미지.length > 0) {
            imgHtml = item.이미지.map((img, imgIdx) => {
                const imgSrc = img.url; // Use storage URL directly
                return `
                    <div class="img-wrapper" style="position:relative; flex:1; height:100%;">
                        <input type="checkbox" class="img-selection-checkbox" data-id="${item.id}" data-img-name="${img.name}" onclick="event.stopPropagation()">
                        <img src="${imgSrc}" alt="이미지" class="card-img" onclick="openModal('${imgSrc}')">
                        <div class="delete-x-btn" onclick="confirmDelete(event, ${item.id}, '${img.name}', ${globalIndex})">×</div>
                    </div>
                `;
            }).join('');
        }

        const isReadOnly = document.body.classList.contains('read-only-mode');
        const rd = isReadOnly;

        return `
            <div class="result-card" id="card-${globalIndex}" data-meta='${meta}'>
                <div class="card-checkbox-container">
                    <input type="checkbox" class="bulk-delete-checkbox">
                </div>
                <div class="card-img-container ${item.이미지 && item.이미지.length > 1 ? 'multi-img' : ''}">
                    <span class="sheet-badge">${item.시트명 || '-'}</span>
                    ${imgHtml}
                    <input type="file" id="file-input-${globalIndex}" style="display:none" multiple onchange="handleFileUpload(event, ${item.id})">
                </div>
                <div class="card-content">
                    <div class="card-header-row">
                        <h3 class="card-title" ${rd ? '' : 'contenteditable="true" onblur="saveField(this, \'품명\')"'}>${item.품명 || ''}</h3>
                        <div class="title-actions">
                            <button class="action-btn add" onclick="triggerUpload(${globalIndex})" title="이미지 추가">+</button>
                            <button class="action-btn del" onclick="toggleDeleteMode()" title="이미지 삭제">-</button>
                        </div>
                    </div>

                    <div class="info-row">
                        <span class="info-label">자재코드</span>
                        <span class="info-value" ${rd ? '' : 'contenteditable="true" onblur="saveField(this, \'자재코드\')"'}>${item.자재코드 || ''}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">사용모델</span>
                        <span class="info-value" ${rd ? '' : 'contenteditable="true" onblur="saveField(this, \'사용모델\')"'}>${item.사용모델 || ''}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">가격</span>
                        <span class="info-value price" ${rd ? '' : 'contenteditable="true" onblur="saveField(this, \'가격\')"'}>${formatPrice(item.가격)}</span>
                    </div>

                    <div class="memo-box" ${rd ? '' : `onclick="openMemoEditor(this, ${item.id})"`} data-memo="${(item.memo || '').replace(/"/g, '&quot;')}">
                        ${item.memo || (rd ? '' : '메모를 입력하려면 클릭하세요...')}
                    </div>

                    <div class="status-options-row">
                        <label class="status-opt" title="판매가능"><input type="radio" name="status-${globalIndex}" value="판매가능" ${rd ? 'disabled' : 'onchange="updateStatus(this)"'} ${item['판매가능'] == 1 ? 'checked' : ''}><span class="opt-icon">✅</span></label>
                        <label class="status-opt" title="수리판매"><input type="radio" name="status-${globalIndex}" value="수리판매" ${rd ? 'disabled' : 'onchange="updateStatus(this)"'} ${item['수리판매'] == 1 ? 'checked' : ''}><span class="opt-icon">🛒</span></label>
                        <label class="status-opt" title="재고확인"><input type="radio" name="status-${globalIndex}" value="재고확인" ${rd ? 'disabled' : 'onchange="updateStatus(this)"'} ${item['재고확인'] == 1 ? 'checked' : ''}><span class="opt-icon">📦</span></label>
                        <label class="status-opt" title="미확인"><input type="radio" name="status-${globalIndex}" value="미확인" ${rd ? 'disabled' : 'onchange="updateStatus(this)"'} ${item['미확인'] == 1 ? 'checked' : ''}><span class="opt-icon">❓</span></label>
                        <label class="status-opt" title="수리전용"><input type="radio" name="status-${globalIndex}" value="수리전용" ${rd ? 'disabled' : 'onchange="updateStatus(this)"'} ${item['수리전용'] == 1 ? 'checked' : ''}><span class="opt-icon">🔧</span></label>
                        <label class="status-opt" title="단종"><input type="radio" name="status-${globalIndex}" value="단종" ${rd ? 'disabled' : 'onchange="updateStatus(this)"'} ${item['단종'] == 1 ? 'checked' : ''}><span class="opt-icon">🚫</span></label>
                    </div>

                    ${item.수정자 ? `<div class="modifier-badge"><span class="modifier-icon">👤</span> <span class="modifier-label">수정자:</span> <span class="modifier-name">${item.수정자}</span></div>` : ''}
                </div>
            </div>
        `;

    }).join('');

    if (append) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        while (tempDiv.firstChild) {
            elements.resultsContainer.appendChild(tempDiv.firstChild);
        }
    } else {
        elements.resultsContainer.innerHTML = html;
    }

    // Load More Button
    if (end < data.length) {
        loadMoreBtn = document.createElement('button');
        loadMoreBtn.id = 'load-more-btn';
        loadMoreBtn.className = 'btn-load-more';
        loadMoreBtn.textContent = `더 보기 (${data.length - end}개 남음)`;
        
        const loadNextPage = () => {
            if (loadMoreBtn.disabled) return;
            loadMoreBtn.disabled = true;
            loadMoreBtn.textContent = "불러오는 중...";
            setTimeout(() => {
                currentPage++;
                renderResults(allData, true);
            }, 100);
        };
        
        loadMoreBtn.onclick = loadNextPage;
        elements.resultsContainer.after(loadMoreBtn);

        // Infinite Scroll: Trigger automatically when button enters view
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                loadNextPage();
                observer.disconnect(); // Prevent multiple triggers
            }
        }, { threshold: 0.1 });
        
        observer.observe(loadMoreBtn);
    }
}

// Save editable fields
window.saveField = async function saveField(el, field) {
    if (document.body.classList.contains('read-only-mode')) return;
    const card = el.closest('.result-card');
    const meta = JSON.parse(card.dataset.meta);
    let value = el.innerText.trim();
    
    if (field === '가격') {
        value = parseInt(value.replace(/[^0-9]/g, '')) || 0;
        el.innerText = formatPrice(value);
    }
    
    await fetch(`${API_BASE}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: meta.id, field, value, userId: currentUser ? currentUser.id : '' })
    });
};

// Update Status (6 Icons)
window.updateStatus = async function updateStatus(radio) {
    if (document.body.classList.contains('read-only-mode')) {
        radio.checked = !radio.checked; // Revert
        return;
    }
    const card = radio.closest('.result-card');
    const meta = JSON.parse(card.dataset.meta);
    const status = radio.value;
    
    await fetch(`${API_BASE}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: meta.id, field: status, value: 1, userId: currentUser ? currentUser.id : '' })
    });
    
    // Update modifier badge locally without flickering
    if (currentUser) {
        let badge = card.querySelector('.modifier-badge');
        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'modifier-badge';
            card.querySelector('.card-content').appendChild(badge);
        }
        badge.innerHTML = `<span class="modifier-icon">👤</span> <span class="modifier-label">수정자:</span> <span class="modifier-name">${currentUser.id}</span>`;
    }
};

// Image Management
window.triggerUpload = function(index) {
    document.getElementById(`file-input-${index}`).click();
};

window.handleFileUpload = async function(event, itemId) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    console.log(`Upload started for item: ${itemId}, ${files.length} files`);
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
        formData.append('images', files[i]);
    }
    formData.append('itemId', itemId);
    if (currentUser) formData.append('userId', currentUser.id);

    fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            performSearch(); // Refresh results
        }
    })
    .catch(err => {
        console.error('Upload Error:', err);
    });
};

window.toggleDeleteMode = async function() {
    const isDeleteMode = document.body.classList.contains('delete-mode');
    
    if (isDeleteMode) {
        // Exiting mode: Check if there are selections to delete
        const selections = document.querySelectorAll('.img-selection-checkbox:checked');
        if (selections.length > 0) {
            // Group by itemId
            const grouped = {};
            selections.forEach(cb => {
                const id = cb.dataset.id;
                if (!grouped[id]) grouped[id] = [];
                grouped[id].push(cb.dataset.imgName);
            });
            
            for (const itemId in grouped) {
                await fetch(`${API_BASE}/delete-images-bulk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ itemId, imageNames: grouped[itemId], userId: currentUser ? currentUser.id : '' })
                });
            }
            performSearch(); 
        }
        document.body.classList.remove('delete-mode');
    } else {
        // Entering mode
        document.body.classList.add('delete-mode');
    }
    
    // Update button style
    const btns = document.querySelectorAll('.action-btn.del');
    const newDeleteMode = document.body.classList.contains('delete-mode');
    btns.forEach(btn => {
        if (newDeleteMode) {
            btn.style.background = '#ff4757';
            btn.style.color = 'white';
        } else {
            btn.style.background = '';
            btn.style.color = '';
        }
    });
};

window.confirmDelete = async function(event, itemId, imgName, index) {
    event.stopPropagation();
    // In multi-delete mode, we just check the checkbox
    const card = document.getElementById(`card-${index}`);
    const cb = card.querySelector(`.img-selection-checkbox[data-img-name="${imgName}"]`);
    if (cb) cb.checked = !cb.checked;
};


// Memo Editor
window.openMemoEditor = function openMemoEditor(el, itemId) {
    if (document.body.classList.contains('read-only-mode')) return;
    
    const existing = document.getElementById('floating-memo-editor');
    if (existing) existing.remove();
    
    const currentMemo = el.getAttribute('data-memo') || '';
    const rect = el.getBoundingClientRect();
    const editor = document.createElement('div');
    editor.id = 'floating-memo-editor';
    editor.className = 'memo-editor-popup';
    editor.style.left = `${rect.left + window.scrollX}px`;
    editor.style.top = `${rect.top + window.scrollY - 180}px`;
    
    editor.innerHTML = `
        <textarea id="memo-textarea" placeholder="메모 내용을 입력하세요...">${currentMemo}</textarea>
        <div class="memo-editor-btns">
            <button class="memo-save-btn">저장</button>
            <button class="memo-cancel-btn">취소</button>
        </div>
    `;
    document.body.appendChild(editor);
    
    const textarea = editor.querySelector('#memo-textarea');
    textarea.focus();
    // Place cursor at the end
    const len = textarea.value.length;
    textarea.setSelectionRange(len, len);
    
    editor.querySelector('.memo-save-btn').onclick = async () => {
        const newMemo = textarea.value;
        await fetch(`${API_BASE}/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: itemId, field: 'memo', value: newMemo, userId: currentUser ? currentUser.id : '' })
        });
        el.setAttribute('data-memo', newMemo);
        el.innerHTML = newMemo || '메모를 입력하려면 클릭하세요...';
        editor.remove();
    };
    
    editor.querySelector('.memo-cancel-btn').onclick = () => editor.remove();
};

// Modal handling
window.openModal = function(src) {
    elements.modalImg.src = src;
    elements.modal.classList.add('show');
}

elements.closeBtn.onclick = function() {
    elements.modal.classList.remove('show');
}

window.onclick = function(event) {
    if (event.target === elements.modal) {
        elements.modal.classList.remove('show');
    }
}

// Add Modal Logic
window.openAddModal = () => {
    document.getElementById('add-품명').value = '';
    document.getElementById('add-자재코드').value = '';
    document.getElementById('add-사용모델').value = '';
    document.getElementById('add-가격').value = '';
    document.getElementById('add-memo').value = '';
    document.querySelector('input[name="add-status"][value="판매가능"]').checked = true;
    elements.addModal.classList.add('show');
};

window.closeAddModal = () => {
    elements.addModal.classList.remove('show');
};

window.saveNewItem = async () => {
    const sheetName = elements.sheetSelect.value;
    if (sheetName === '전체') {
        alert('항목을 추가할 시트를 먼저 선택해 주세요.');
        return;
    }

    const item = {
        품명: document.getElementById('add-품명').value.trim(),
        자재코드: document.getElementById('add-자재코드').value.trim(),
        사용모델: document.getElementById('add-사용모델').value.trim(),
        가격: document.getElementById('add-가격').value.trim(),
        memo: document.getElementById('add-memo').value.trim(),
        status: document.querySelector('input[name="add-status"]:checked').value
    };

    if (!item.품명) {
        alert('품명은 필수 입력 항목입니다.');
        return;
    }

    const btn = elements.saveAddBtn;
    const originalText = btn.textContent;
    
    try {
        if (btn.disabled) return;
        btn.textContent = '저장 중 (대용량 파일은 1분 이상 소요될 수 있습니다)...';
        btn.disabled = true;
        
        // Add a secondary message if it takes too long
        const slowTimer = setTimeout(() => {
            if (btn.disabled) {
                btn.textContent = '아직 저장 중입니다... 잠시만 더 기다려 주세요.';
            }
        }, 30000);

        const res = await fetch(`${API_BASE}/add-item`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sheetName, item, userId: currentUser ? currentUser.id : '' })
        });
        
        clearTimeout(slowTimer);
        
        if (!res.ok) throw new Error(`서버 응답 오류: ${res.status}`);
        
        const data = await res.json();
        if (data.success) {
            closeAddModal();
            performSearch();
            alert('성공적으로 저장되었습니다.');
        } else {
            alert('저장 실패: ' + (data.message || '알 수 없는 오류'));
        }
    } catch (e) {
        console.error('Save error:', e);
        alert('오류가 발생했습니다. 파일이 너무 크거나 서버가 응답하지 않습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
};

// Bulk Delete Logic
window.toggleBulkDeleteMode = () => {
    if (isBulkDeleteMode) {
        const checked = document.querySelectorAll('.bulk-delete-checkbox:checked');
        if (checked.length === 0) {
            document.body.classList.remove('bulk-delete-active');
            isBulkDeleteMode = false;
            return;
        }

        if (confirm(`${checked.length}개의 항목을 정말로 삭제하시겠습니까? 데이터베이스에서 완전히 삭제됩니다.`)) {
            const ids = Array.from(checked).map(cb => {
                const card = cb.closest('.result-card');
                return JSON.parse(card.dataset.meta).id;
            });
            finalizeBulkDelete(ids);
        } else {
            document.body.classList.remove('bulk-delete-active');
            isBulkDeleteMode = false;
        }
    } else {
        document.body.classList.add('bulk-delete-active');
        isBulkDeleteMode = true;
        alert('삭제할 항목을 선택한 후 [삭제] 버튼을 다시 눌러주세요.');
    }
};

async function finalizeBulkDelete(items) {
    try {
        const res = await fetch(`${API_BASE}/delete-items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: items })
        });
        const data = await res.json();
        if (data.success) {
            alert('선택한 항목이 삭제되었습니다.');
            document.body.classList.remove('bulk-delete-active');
            isBulkDeleteMode = false;
            performSearch();
        } else {
            alert('삭제 실패: ' + data.message);
        }
    } catch (e) {
        alert('서버 오류: ' + e.message);
    }
}

// Login Logic
async function handleLogin() {
    const id = elements.loginId.value.trim();
    const password = elements.loginPw.value.trim();
    
    if (!id || !password) {
        showLoginError('아이디와 비밀번호를 입력해주세요.');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, password })
        });
        
        const data = await response.json();
        if (data.success) {
            currentUser = data.user;
            setupUserSession();
        } else {
            showLoginError(data.message);
        }
    } catch (e) {
        showLoginError('서버 연결 오류가 발생했습니다.');
    }
}

function showLoginError(msg) {
    elements.loginMsg.textContent = msg;
    elements.loginMsg.classList.remove('hidden');
}

function setupUserSession() {
    elements.displayUserId.textContent = currentUser.id;
    elements.displayUserPerm.textContent = currentUser.permissions;
    
    // Format endDate
    if (currentUser.endDate) {
        const d = new Date(currentUser.endDate);
        if (!isNaN(d.getTime())) {
            elements.displayUserEnd.textContent = d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
        } else {
            elements.displayUserEnd.textContent = '-';
        }
    } else {
        elements.displayUserEnd.textContent = '-';
    }
    
    elements.loginScreen.style.display = 'none';
    elements.mainApp.classList.remove('hidden');
    
    const perm = String(currentUser.permissions || '').trim();
    const div = String(currentUser.division || '').trim();
    
    console.log(`[DEBUG] Login User: ${currentUser.id}, Division: ${div}, Permissions: ${perm}`);
    
    if (perm.includes('관리') || div.includes('관리')) {
        document.body.classList.remove('read-only-mode');
        elements.userSettingsBtn.classList.remove('hidden');
    } else {
        document.body.classList.add('read-only-mode');
        elements.userSettingsBtn.classList.add('hidden');
    }
    
    init(); // Initialize sheets after login
}

function logout() {
    currentUser = null;
    elements.loginId.value = '';
    elements.loginPw.value = '';
    elements.loginMsg.classList.add('hidden');
    
    elements.mainApp.classList.add('hidden');
    elements.loginScreen.style.display = 'flex';
    
    document.body.classList.remove('read-only-mode');
    
    // Clear results
    elements.resultsContainer.innerHTML = `
        <div class="empty-state">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="empty-icon">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            <p>검색어를 입력하고 검색 버튼을 눌러주세요.</p>
        </div>
    `;
    elements.resultCount.textContent = '0';
}

// Event Listeners
elements.loginBtn.addEventListener('click', handleLogin);
elements.loginPw.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
});

elements.logoutBtn.addEventListener('click', logout);

elements.searchBtn.addEventListener('click', performSearch);
elements.searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
});

elements.addBtn.addEventListener('click', openAddModal);
elements.bulkDeleteBtn.addEventListener('click', toggleBulkDeleteMode);
elements.saveAddBtn.addEventListener('click', saveNewItem);
elements.cancelAddBtn.addEventListener('click', closeAddModal);
elements.closeAddModal.addEventListener('click', closeAddModal);

elements.sheetSelect.addEventListener('change', () => {
    elements.searchInput.value = '';
    performSearch();
});

function startClock() {
    const updateClock = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const date = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        const day = days[now.getDay()];
        
        if (elements.loginClock) {
            elements.loginClock.textContent = `${year}-${month}-${date} (${day}) ${hours}:${minutes}:${seconds}`;
        }
        if (elements.displayCurrentTime) {
            elements.displayCurrentTime.textContent = `${year}-${month}-${date} (${day}) ${hours}:${minutes}:${seconds}`;
        }
    };
    updateClock();
    setInterval(updateClock, 1000);
}

// Start clock immediately
startClock();

elements.userSettingsBtn.addEventListener('click', openUserSettingsModal);

// User Management Logic
const HOLIDAYS = [
    '2024-01-01', '2024-02-09', '2024-02-10', '2024-02-11', '2024-02-12', '2024-03-01', '2024-04-10', '2024-05-05', '2024-05-06', '2024-05-15', '2024-06-06', '2024-08-15', '2024-09-16', '2024-09-17', '2024-09-18', '2024-10-03', '2024-10-09', '2024-12-25',
    '2025-01-01', '2025-01-28', '2025-01-29', '2025-01-30', '2025-03-01', '2025-03-03', '2025-05-05', '2025-05-06', '2025-06-06', '2025-08-15', '2025-10-03', '2025-10-05', '2025-10-06', '2025-10-07', '2025-10-09', '2025-12-25'
];

async function openUserSettingsModal() {
    try {
        const res = await fetch(`${API_BASE}/users`);
        const users = await res.json();
        renderUserTable(users);
        elements.userSettingsModal.classList.add('show');
        document.body.style.overflow = 'hidden'; // Disable background scroll
    } catch (e) {
        alert('사용자 정보를 불러오는 데 실패했습니다.');
    }
}

window.closeUserModal = () => {
    elements.userSettingsModal.classList.remove('show');
    document.body.style.overflow = ''; // Re-enable background scroll
};

function renderUserTable(users) {
    elements.userTableBody.innerHTML = '';
    users.forEach((user, index) => {
        addUserRow(user);
    });
}

function addUserRow(user = {}) {
    const tr = document.createElement('tr');
    const startVal = formatDateForInput(user.startDate);
    const endVal = formatDateForInput(user.endDate);
    
    tr.innerHTML = `
        <td><input type="text" class="u-name" value="${user.name || ''}" placeholder="이름"></td>
        <td><input type="text" class="u-pw" value="${user.password || ''}" placeholder="비밀번호"></td>
        <td><input type="text" class="u-div" value="${user.division || ''}" placeholder="구분"></td>
        <td><input type="text" class="u-perm" value="${user.permissions || ''}" placeholder="권한"></td>
        <td>
            <div class="date-input-wrapper ${startVal ? 'has-value' : ''}" title="시작일" onclick="triggerDatePicker(this)">
                <input type="text" class="u-start-display" value="${startVal}" readonly placeholder="">
                <input type="date" class="u-start-hidden" value="${startVal}" onchange="handleDateChange(this)">
            </div>
        </td>
        <td>
            <div class="date-input-wrapper ${endVal ? 'has-value' : ''}" title="종료일" onclick="triggerDatePicker(this)">
                <input type="text" class="u-end-display" value="${endVal}" readonly placeholder="">
                <input type="date" class="u-end-hidden" value="${endVal}" onchange="handleDateChange(this)">
            </div>
        </td>
        <td class="expected-days">${user.expectedDays || 0}</td>
        <td><button class="btn-remove-user" onclick="this.closest('tr').remove()">&times;</button></td>
    `;
    elements.userTableBody.appendChild(tr);
}

window.triggerDatePicker = (wrapper) => {
    const dateInput = wrapper.querySelector('input[type="date"]');
    if (dateInput.showPicker) {
        dateInput.showPicker();
    } else {
        dateInput.focus();
    }
};

window.handleDateChange = (input) => {
    const wrapper = input.closest('.date-input-wrapper');
    const displayInput = wrapper.querySelector('input[type="text"]');
    displayInput.value = input.value;
    
    if (input.value) {
        wrapper.classList.add('has-value');
    } else {
        wrapper.classList.remove('has-value');
    }
    
    updateExpectedDays(input);
};

window.addNewUserRow = () => {
    addUserRow();
};

function formatDateForInput(date) {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
}

window.updateExpectedDays = (input) => {
    const row = input.closest('tr');
    const startVal = row.querySelector('.u-start-hidden').value;
    const endVal = row.querySelector('.u-end-hidden').value;
    const display = row.querySelector('.expected-days');
    
    if (startVal && endVal) {
        const days = calculateWorkingDays(startVal, endVal);
        display.textContent = days;
    } else {
        display.textContent = '0';
    }
};

function calculateWorkingDays(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start > end) return 0;
    
    let count = 0;
    let cur = new Date(start);
    
    while (cur <= end) {
        const day = cur.getDay(); // 0: Sun, 6: Sat
        const dateStr = cur.toISOString().split('T')[0];
        
        const isWeekend = (day === 0 || day === 6);
        const isHoliday = HOLIDAYS.includes(dateStr);
        
        if (!isWeekend && !isHoliday) {
            count++;
        }
        
        cur.setDate(cur.getDate() + 1);
    }
    return count;
}

window.saveUsers = async () => {
    const rows = elements.userTableBody.querySelectorAll('tr');
    const users = Array.from(rows).map(row => ({
        name: row.querySelector('.u-name').value.trim(),
        password: row.querySelector('.u-pw').value.trim(),
        division: row.querySelector('.u-div').value.trim(),
        permissions: row.querySelector('.u-perm').value.trim(),
        startDate: row.querySelector('.u-start-hidden').value,
        endDate: row.querySelector('.u-end-hidden').value,
        expectedDays: parseInt(row.querySelector('.expected-days').textContent)
    }));

    // Validation
    if (users.some(u => !u.name)) {
        alert('모든 사용자의 이름은 필수입니다.');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/update-users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ users })
        });
        const data = await res.json();
        if (data.success) {
            alert('사용자 정보가 성공적으로 저장되었습니다.');
            closeUserModal();
        } else {
            alert('저장 실패: ' + data.message);
        }
    } catch (e) {
        alert('서버 오류가 발생했습니다.');
    }
};


