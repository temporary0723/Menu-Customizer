// Menu Customizer 확장 - SillyTavern Extension
// 채팅 메뉴와 확장 메뉴의 항목들을 커스텀할 수 있는 기능 제공

import {
    eventSource,
    event_types,
    saveSettingsDebounced,
} from '../../../../script.js';

import {
    getContext,
    extension_settings,
} from '../../../extensions.js';

import {
    POPUP_TYPE,
    callGenericPopup,
    POPUP_RESULT,
} from '../../../popup.js';

import {
    uuidv4,
} from '../../../utils.js';

// 확장 이름 및 상수 정의
const pluginName = 'menu-customizer';
const extensionFolderPath = `scripts/extensions/third-party/Menu-Customizer`;

// 기본 채팅 메뉴 항목 정의
const DEFAULT_CHAT_MENU_ITEMS = [
    { id: 'option_toggle_AN', name: "Author's Note", icon: 'fa-note-sticky', originalOrder: 0 },
    { id: 'option_toggle_CFG', name: 'CFG Scale', icon: 'fa-scale-balanced', originalOrder: 1 },
    { id: 'option_toggle_logprobs', name: 'Token Probabilities', icon: 'fa-pie-chart', originalOrder: 2 },
    { id: 'option_back_to_main', name: 'Back to parent chat', icon: 'fa-left-long', originalOrder: 3 },
    { id: 'option_new_bookmark', name: 'Save checkpoint', icon: 'fa-flag', originalOrder: 4 },
    { id: 'option_convert_to_group', name: 'Convert to group', icon: 'fa-people-arrows', originalOrder: 5 },
    { id: 'option_start_new_chat', name: 'Start new chat', icon: 'fa-comments', originalOrder: 6 },
    { id: 'option_close_chat', name: 'Close chat', icon: 'fa-times', originalOrder: 7 },
    { id: 'option_select_chat', name: 'Manage chat files', icon: 'fa-address-book', originalOrder: 8 },
    { id: 'option_delete_mes', name: 'Delete messages', icon: 'fa-trash-can', originalOrder: 9 },
    { id: 'option_regenerate', name: 'Regenerate', icon: 'fa-repeat', originalOrder: 10 },
    { id: 'option_impersonate', name: 'Impersonate', icon: 'fa-user-secret', originalOrder: 11 },
    { id: 'option_continue', name: 'Continue', icon: 'fa-arrow-right', originalOrder: 12 },
];

// 기본 설정
const defaultSettings = {
    chatMenu: {
        items: [],
        hiddenItems: [],
        categories: []
    },
    extensionMenu: {
        items: [],
        hiddenItems: [],
        categories: []
    }
};

// 현재 열린 모달
let currentModal = null;

// 드래그 앤 드롭 관련 변수
let draggedItem = null;
let draggedFrom = null;

/**
 * 설정 초기화
 */
function initializeSettings() {
    if (!extension_settings[pluginName]) {
        extension_settings[pluginName] = JSON.parse(JSON.stringify(defaultSettings));
        saveSettingsDebounced();
    }

    // 채팅 메뉴 항목 초기화
    if (!extension_settings[pluginName].chatMenu.items || extension_settings[pluginName].chatMenu.items.length === 0) {
        extension_settings[pluginName].chatMenu.items = DEFAULT_CHAT_MENU_ITEMS.map(item => ({
            ...item,
            hidden: false,
            categoryId: null
        }));
        saveSettingsDebounced();
    }
}

/**
 * 확장 메뉴 항목 동적 수집
 */
function collectExtensionMenuItems() {
    const items = [];
    const extensionsMenu = $('#extensionsMenu');
    
    if (extensionsMenu.length === 0) return items;

    extensionsMenu.children().each((index, element) => {
        const $el = $(element);
        const id = $el.attr('id');
        
        // ID가 없거나 빈 요소는 건너뛰기
        if (!id || $el.is('hr') || $el.css('display') === 'none') return;
        
        // 텍스트 내용 추출
        let name = $el.find('span').text().trim() || $el.text().trim() || id;
        
        // 아이콘 클래스 추출
        const iconElement = $el.find('i').first();
        let icon = '';
        if (iconElement.length > 0) {
            const classes = iconElement.attr('class') || '';
            const iconMatch = classes.match(/fa-[\w-]+/g);
            if (iconMatch) {
                icon = iconMatch.filter(c => c !== 'fa-lg' && !c.includes('extensionsMenu')).join(' ');
            }
        }

        items.push({
            id: id,
            name: name,
            icon: icon,
            originalOrder: index
        });
    });

    return items;
}

/**
 * 설정에 저장된 항목과 실제 DOM 항목 동기화
 */
function syncMenuItems(menuType) {
    const settings = extension_settings[pluginName][menuType];
    
    if (menuType === 'extensionMenu') {
        const currentItems = collectExtensionMenuItems();
        
        // 새로운 항목 추가
        currentItems.forEach(item => {
            const exists = settings.items.find(i => i.id === item.id);
            if (!exists) {
                settings.items.push({
                    ...item,
                    hidden: false,
                    categoryId: null
                });
            }
        });
        
        // 더 이상 존재하지 않는 항목 제거
        settings.items = settings.items.filter(item => 
            currentItems.find(ci => ci.id === item.id) || 
            settings.categories.some(cat => cat.items && cat.items.find(i => i.id === item.id))
        );
    }
    
    saveSettingsDebounced();
}

/**
 * 메뉴 커스텀 모달 생성
 */
async function createMenuCustomizerModal() {
    // 확장 메뉴 항목 동기화
    syncMenuItems('extensionMenu');
    
    const settings = extension_settings[pluginName];
    
    const modalHtml = `
        <div class="menu-customizer-modal-backdrop">
            <div class="menu-customizer-modal">
                <div class="menu-customizer-header">
                    <h3><i class="fa-solid fa-bars-staggered"></i> 메뉴 커스텀</h3>
                    <button class="menu-customizer-close" title="닫기">×</button>
                </div>
                <div class="menu-customizer-tabs">
                    <button class="menu-customizer-tab active" data-tab="chatMenu">
                        <i class="fa-solid fa-bars"></i> 채팅 메뉴
                    </button>
                    <button class="menu-customizer-tab" data-tab="extensionMenu">
                        <i class="fa-solid fa-magic-wand-sparkles"></i> 확장 메뉴
                    </button>
                </div>
                <div class="menu-customizer-body">
                    <div class="menu-customizer-content" data-content="chatMenu">
                        ${renderMenuContent('chatMenu')}
                    </div>
                    <div class="menu-customizer-content" data-content="extensionMenu" style="display: none;">
                        ${renderMenuContent('extensionMenu')}
                    </div>
                </div>
                <div class="menu-customizer-footer">
                    <button class="menu-customizer-add-category">
                        <i class="fa-solid fa-folder-plus"></i> 새 카테고리 추가
                    </button>
                    <button class="menu-customizer-reset">
                        <i class="fa-solid fa-rotate-left"></i> 초기화
                    </button>
                </div>
            </div>
        </div>
    `;

    // 기존 모달 제거
    if (currentModal) {
        currentModal.remove();
    }

    currentModal = $(modalHtml);
    $('body').append(currentModal);

    // 애니메이션 효과
    setTimeout(() => {
        currentModal.addClass('visible');
        currentModal.find('.menu-customizer-modal').addClass('visible');
    }, 10);

    // 이벤트 핸들러 바인딩
    bindModalEventHandlers();
}

/**
 * 메뉴 콘텐츠 렌더링
 */
function renderMenuContent(menuType) {
    const settings = extension_settings[pluginName][menuType];
    const categories = settings.categories || [];
    const items = settings.items || [];
    
    // 카테고리에 속하지 않은 항목들
    const uncategorizedItems = items.filter(item => !item.categoryId);
    
    let html = '<div class="menu-customizer-list" data-menu-type="' + menuType + '">';
    
    // 카테고리들 렌더링
    categories.forEach(category => {
        const categoryItems = items.filter(item => item.categoryId === category.id);
        html += renderCategory(category, categoryItems, menuType);
    });
    
    // 카테고리에 속하지 않은 항목들 렌더링
    uncategorizedItems.forEach(item => {
        html += renderMenuItem(item, menuType);
    });
    
    html += '</div>';
    
    return html;
}

/**
 * 카테고리 렌더링
 */
function renderCategory(category, items, menuType) {
    const isExpanded = category.expanded !== false;
    
    let html = `
        <div class="menu-customizer-category" data-category-id="${category.id}" data-menu-type="${menuType}">
            <div class="menu-customizer-category-header">
                <div class="menu-customizer-category-toggle ${isExpanded ? 'expanded' : ''}">
                    <i class="fa-solid fa-chevron-right"></i>
                </div>
                <span class="menu-customizer-category-name">${category.name}</span>
                <div class="menu-customizer-category-actions">
                    <button class="menu-customizer-category-add" title="항목 추가">
                        <i class="fa-solid fa-plus"></i>
                    </button>
                    <button class="menu-customizer-category-edit" title="이름 수정">
                        <i class="fa-solid fa-pencil"></i>
                    </button>
                    <button class="menu-customizer-category-delete" title="카테고리 삭제">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="menu-customizer-category-items ${isExpanded ? 'expanded' : ''}" data-category-id="${category.id}">
    `;
    
    items.forEach(item => {
        html += renderMenuItem(item, menuType, true);
    });
    
    html += `
            </div>
        </div>
    `;
    
    return html;
}

/**
 * 메뉴 항목 렌더링
 */
function renderMenuItem(item, menuType, isInCategory = false) {
    const isHidden = item.hidden === true;
    
    return `
        <div class="menu-customizer-item ${isHidden ? 'hidden-item' : ''} ${isInCategory ? 'in-category' : ''}" 
             data-item-id="${item.id}" 
             data-menu-type="${menuType}"
             draggable="true">
            <div class="menu-customizer-item-drag">
                <i class="fa-solid fa-grip-vertical"></i>
            </div>
            <div class="menu-customizer-item-icon">
                <i class="fa-solid ${item.icon || 'fa-question'}"></i>
            </div>
            <div class="menu-customizer-item-name">${item.name}</div>
            <div class="menu-customizer-item-actions">
                <label class="menu-customizer-item-visibility" title="${isHidden ? '숨김 해제' : '숨기기'}">
                    <input type="checkbox" ${!isHidden ? 'checked' : ''}>
                    <i class="fa-solid ${isHidden ? 'fa-eye-slash' : 'fa-eye'}"></i>
                </label>
            </div>
        </div>
    `;
}

/**
 * 모달 이벤트 핸들러 바인딩
 */
function bindModalEventHandlers() {
    if (!currentModal) return;

    // 닫기 버튼
    currentModal.find('.menu-customizer-close').on('click', closeModal);

    // 배경 클릭으로 닫기
    currentModal.find('.menu-customizer-modal-backdrop').on('click', function(e) {
        if (e.target === this) {
            closeModal();
        }
    });

    // 탭 전환
    currentModal.find('.menu-customizer-tab').on('click', function() {
        const tab = $(this).data('tab');
        
        currentModal.find('.menu-customizer-tab').removeClass('active');
        $(this).addClass('active');
        
        currentModal.find('.menu-customizer-content').hide();
        currentModal.find(`.menu-customizer-content[data-content="${tab}"]`).show();
    });

    // 카테고리 토글 (펼치기/접기)
    currentModal.on('click', '.menu-customizer-category-toggle', function(e) {
        e.stopPropagation();
        const category = $(this).closest('.menu-customizer-category');
        const categoryId = category.data('category-id');
        const menuType = category.data('menu-type');
        const itemsContainer = category.find('.menu-customizer-category-items');
        
        const isExpanded = $(this).hasClass('expanded');
        
        if (isExpanded) {
            $(this).removeClass('expanded');
            itemsContainer.removeClass('expanded');
        } else {
            $(this).addClass('expanded');
            itemsContainer.addClass('expanded');
        }
        
        // 설정 저장
        const settings = extension_settings[pluginName][menuType];
        const categoryData = settings.categories.find(c => c.id === categoryId);
        if (categoryData) {
            categoryData.expanded = !isExpanded;
            saveSettingsDebounced();
        }
    });

    // 카테고리 헤더 클릭으로도 토글
    currentModal.on('click', '.menu-customizer-category-header', function(e) {
        if (!$(e.target).closest('.menu-customizer-category-actions').length) {
            $(this).find('.menu-customizer-category-toggle').trigger('click');
        }
    });

    // 카테고리에 항목 추가
    currentModal.on('click', '.menu-customizer-category-add', function(e) {
        e.stopPropagation();
        const category = $(this).closest('.menu-customizer-category');
        const categoryId = category.data('category-id');
        const menuType = category.data('menu-type');
        showAddItemsToCategoryModal(menuType, categoryId);
    });

    // 카테고리 이름 수정
    currentModal.on('click', '.menu-customizer-category-edit', function(e) {
        e.stopPropagation();
        const category = $(this).closest('.menu-customizer-category');
        const categoryId = category.data('category-id');
        const menuType = category.data('menu-type');
        editCategoryName(menuType, categoryId);
    });

    // 카테고리 삭제
    currentModal.on('click', '.menu-customizer-category-delete', function(e) {
        e.stopPropagation();
        const category = $(this).closest('.menu-customizer-category');
        const categoryId = category.data('category-id');
        const menuType = category.data('menu-type');
        deleteCategory(menuType, categoryId);
    });

    // 항목 숨기기/표시
    currentModal.on('change', '.menu-customizer-item-visibility input', function() {
        const item = $(this).closest('.menu-customizer-item');
        const itemId = item.data('item-id');
        const menuType = item.data('menu-type');
        const isVisible = $(this).is(':checked');
        
        toggleItemVisibility(menuType, itemId, !isVisible);
        
        // UI 업데이트
        if (isVisible) {
            item.removeClass('hidden-item');
            item.find('.menu-customizer-item-visibility i').removeClass('fa-eye-slash').addClass('fa-eye');
        } else {
            item.addClass('hidden-item');
            item.find('.menu-customizer-item-visibility i').removeClass('fa-eye').addClass('fa-eye-slash');
        }
    });

    // 새 카테고리 추가
    currentModal.find('.menu-customizer-add-category').on('click', function() {
        const activeTab = currentModal.find('.menu-customizer-tab.active').data('tab');
        addNewCategory(activeTab);
    });

    // 초기화
    currentModal.find('.menu-customizer-reset').on('click', function() {
        const activeTab = currentModal.find('.menu-customizer-tab.active').data('tab');
        resetMenuSettings(activeTab);
    });

    // 드래그 앤 드롭 이벤트
    setupDragAndDrop();
}

/**
 * 드래그 앤 드롭 설정
 */
function setupDragAndDrop() {
    if (!currentModal) return;

    // 드래그 시작
    currentModal.on('dragstart', '.menu-customizer-item', function(e) {
        draggedItem = $(this);
        draggedFrom = $(this).parent();
        $(this).addClass('dragging');
        e.originalEvent.dataTransfer.effectAllowed = 'move';
        e.originalEvent.dataTransfer.setData('text/html', this.innerHTML);
    });

    // 드래그 중
    currentModal.on('dragover', '.menu-customizer-item, .menu-customizer-category-items, .menu-customizer-list', function(e) {
        e.preventDefault();
        e.originalEvent.dataTransfer.dropEffect = 'move';
        
        $(this).addClass('drag-over');
    });

    // 드래그 떠남
    currentModal.on('dragleave', '.menu-customizer-item, .menu-customizer-category-items, .menu-customizer-list', function() {
        $(this).removeClass('drag-over');
    });

    // 드롭
    currentModal.on('drop', '.menu-customizer-item, .menu-customizer-category-items, .menu-customizer-list', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        $(this).removeClass('drag-over');
        
        if (!draggedItem) return;
        
        const $target = $(this);
        const menuType = draggedItem.data('menu-type');
        
        // 같은 메뉴 타입인지 확인
        if ($target.data('menu-type') !== menuType && $target.closest('[data-menu-type]').data('menu-type') !== menuType) {
            return;
        }
        
        if ($target.hasClass('menu-customizer-item')) {
            // 다른 항목 앞에 드롭
            draggedItem.insertBefore($target);
        } else if ($target.hasClass('menu-customizer-category-items')) {
            // 카테고리 내부에 드롭
            $target.append(draggedItem);
            
            // 카테고리 ID 업데이트
            const newCategoryId = $target.data('category-id');
            updateItemCategory(menuType, draggedItem.data('item-id'), newCategoryId);
        } else if ($target.hasClass('menu-customizer-list')) {
            // 리스트 맨 끝에 드롭
            $target.append(draggedItem);
            
            // 카테고리에서 제거
            updateItemCategory(menuType, draggedItem.data('item-id'), null);
        }
        
        // 순서 저장
        saveItemOrder(menuType);
    });

    // 드래그 종료
    currentModal.on('dragend', '.menu-customizer-item', function() {
        $(this).removeClass('dragging');
        currentModal.find('.drag-over').removeClass('drag-over');
        draggedItem = null;
        draggedFrom = null;
    });
}

/**
 * 항목 카테고리 업데이트
 */
function updateItemCategory(menuType, itemId, newCategoryId) {
    const settings = extension_settings[pluginName][menuType];
    const item = settings.items.find(i => i.id === itemId);
    
    if (item) {
        item.categoryId = newCategoryId;
        saveSettingsDebounced();
    }
}

/**
 * 항목 순서 저장
 */
function saveItemOrder(menuType) {
    const settings = extension_settings[pluginName][menuType];
    const $list = currentModal.find(`.menu-customizer-list[data-menu-type="${menuType}"]`);
    
    // 새로운 순서 배열 생성
    const newOrder = [];
    let orderIndex = 0;
    
    // 카테고리와 항목들의 순서를 수집
    $list.children().each(function() {
        const $el = $(this);
        
        if ($el.hasClass('menu-customizer-category')) {
            // 카테고리 내의 항목들
            const categoryId = $el.data('category-id');
            $el.find('.menu-customizer-item').each(function() {
                const itemId = $(this).data('item-id');
                newOrder.push({ id: itemId, order: orderIndex++, categoryId: categoryId });
            });
        } else if ($el.hasClass('menu-customizer-item')) {
            // 카테고리에 속하지 않은 항목
            const itemId = $el.data('item-id');
            newOrder.push({ id: itemId, order: orderIndex++, categoryId: null });
        }
    });
    
    // 설정 업데이트
    newOrder.forEach(orderItem => {
        const item = settings.items.find(i => i.id === orderItem.id);
        if (item) {
            item.order = orderItem.order;
            item.categoryId = orderItem.categoryId;
        }
    });
    
    // 순서대로 정렬
    settings.items.sort((a, b) => (a.order || 0) - (b.order || 0));
    
    saveSettingsDebounced();
    
    // 실제 메뉴에 적용
    applyMenuCustomizations(menuType);
}

/**
 * 항목 표시/숨기기 토글
 */
function toggleItemVisibility(menuType, itemId, hidden) {
    const settings = extension_settings[pluginName][menuType];
    const item = settings.items.find(i => i.id === itemId);
    
    if (item) {
        item.hidden = hidden;
        saveSettingsDebounced();
        applyMenuCustomizations(menuType);
    }
}

/**
 * 새 카테고리 추가
 */
async function addNewCategory(menuType) {
    const result = await callGenericPopup(
        '새 카테고리 이름을 입력하세요',
        POPUP_TYPE.INPUT,
        ''
    );
    
    if (result && result.trim()) {
        const settings = extension_settings[pluginName][menuType];
        
        if (!settings.categories) {
            settings.categories = [];
        }
        
        const newCategory = {
            id: uuidv4(),
            name: result.trim(),
            expanded: true,
            order: settings.categories.length
        };
        
        settings.categories.push(newCategory);
        saveSettingsDebounced();
        
        // UI 새로고침
        refreshModalContent(menuType);
        
        // 실제 메뉴에 적용
        applyMenuCustomizations(menuType);
        
        toastr.success(`카테고리 "${newCategory.name}"가 추가되었습니다.`);
    }
}

/**
 * 카테고리 이름 수정
 */
async function editCategoryName(menuType, categoryId) {
    const settings = extension_settings[pluginName][menuType];
    const category = settings.categories.find(c => c.id === categoryId);
    
    if (!category) return;
    
    const result = await callGenericPopup(
        '카테고리 이름 수정',
        POPUP_TYPE.INPUT,
        category.name
    );
    
    if (result && result.trim()) {
        category.name = result.trim();
        saveSettingsDebounced();
        
        // UI 업데이트
        currentModal.find(`.menu-customizer-category[data-category-id="${categoryId}"] .menu-customizer-category-name`).text(category.name);
        
        // 실제 메뉴에 적용
        applyMenuCustomizations(menuType);
        
        toastr.success('카테고리 이름이 수정되었습니다.');
    }
}

/**
 * 카테고리 삭제
 */
async function deleteCategory(menuType, categoryId) {
    const settings = extension_settings[pluginName][menuType];
    const category = settings.categories.find(c => c.id === categoryId);
    
    if (!category) return;
    
    const result = await callGenericPopup(
        `카테고리 "${category.name}"을(를) 삭제하시겠습니까?\n\n카테고리에 속한 항목들은 삭제되지 않고 카테고리 밖으로 이동됩니다.`,
        POPUP_TYPE.CONFIRM
    );
    
    if (result === POPUP_RESULT.AFFIRMATIVE) {
        // 카테고리에 속한 항목들을 카테고리 밖으로 이동
        settings.items.forEach(item => {
            if (item.categoryId === categoryId) {
                item.categoryId = null;
            }
        });
        
        // 카테고리 삭제
        settings.categories = settings.categories.filter(c => c.id !== categoryId);
        
        saveSettingsDebounced();
        
        // UI 새로고침
        refreshModalContent(menuType);
        
        // 실제 메뉴에 적용
        applyMenuCustomizations(menuType);
        
        toastr.success('카테고리가 삭제되었습니다.');
    }
}

/**
 * 카테고리에 항목 추가 모달
 */
async function showAddItemsToCategoryModal(menuType, categoryId) {
    const settings = extension_settings[pluginName][menuType];
    const category = settings.categories.find(c => c.id === categoryId);
    
    if (!category) return;
    
    // 카테고리에 속하지 않은 항목들만 표시
    const availableItems = settings.items.filter(item => item.categoryId !== categoryId);
    
    if (availableItems.length === 0) {
        toastr.info('추가할 수 있는 항목이 없습니다.');
        return;
    }
    
    const itemsHtml = availableItems.map(item => `
        <label class="menu-customizer-add-item-option">
            <input type="checkbox" value="${item.id}" data-item-id="${item.id}">
            <i class="fa-solid ${item.icon || 'fa-question'}"></i>
            <span>${item.name}</span>
        </label>
    `).join('');
    
    // 기존 추가 모달 제거
    $('.menu-customizer-add-modal-backdrop').remove();
    
    const addModalHtml = `
        <div class="menu-customizer-add-modal-backdrop">
            <div class="menu-customizer-add-modal">
                <div class="menu-customizer-add-modal-header">
                    <h4>"${category.name}" 카테고리에 추가할 항목 선택</h4>
                    <button class="menu-customizer-add-modal-close">×</button>
                </div>
                <div class="menu-customizer-add-modal-body">
                    <div class="menu-customizer-add-items-list">
                        ${itemsHtml}
                    </div>
                </div>
                <div class="menu-customizer-add-modal-footer">
                    <button class="menu-customizer-add-modal-cancel">취소</button>
                    <button class="menu-customizer-add-modal-confirm">추가</button>
                </div>
            </div>
        </div>
    `;
    
    const $addModal = $(addModalHtml);
    $('body').append($addModal);
    
    // 애니메이션
    setTimeout(() => {
        $addModal.addClass('visible');
        $addModal.find('.menu-customizer-add-modal').addClass('visible');
    }, 10);
    
    // 닫기 함수
    const closeAddModal = () => {
        $addModal.removeClass('visible');
        $addModal.find('.menu-customizer-add-modal').removeClass('visible');
        setTimeout(() => {
            $addModal.remove();
        }, 300);
    };
    
    // 이벤트 핸들러
    $addModal.find('.menu-customizer-add-modal-close, .menu-customizer-add-modal-cancel').on('click', closeAddModal);
    
    $addModal.find('.menu-customizer-add-modal-backdrop').on('click', function(e) {
        if (e.target === this) {
            closeAddModal();
        }
    });
    
    // 확인 버튼
    $addModal.find('.menu-customizer-add-modal-confirm').on('click', function() {
        const selectedItems = [];
        $addModal.find('.menu-customizer-add-item-option input:checked').each(function() {
            selectedItems.push($(this).data('item-id'));
        });
        
        if (selectedItems.length > 0) {
            selectedItems.forEach(itemId => {
                const item = settings.items.find(i => i.id === itemId);
                if (item) {
                    item.categoryId = categoryId;
                }
            });
            
            saveSettingsDebounced();
            refreshModalContent(menuType);
            applyMenuCustomizations(menuType);
            
            toastr.success(`${selectedItems.length}개 항목이 카테고리에 추가되었습니다.`);
        } else {
            toastr.info('선택된 항목이 없습니다.');
        }
        
        closeAddModal();
    });
}

/**
 * 메뉴 설정 초기화
 */
async function resetMenuSettings(menuType) {
    const result = await callGenericPopup(
        `${menuType === 'chatMenu' ? '채팅 메뉴' : '확장 메뉴'} 설정을 초기화하시겠습니까?\n\n모든 커스텀 설정(숨김, 순서, 카테고리)이 제거됩니다.`,
        POPUP_TYPE.CONFIRM
    );
    
    if (result === POPUP_RESULT.AFFIRMATIVE) {
        if (menuType === 'chatMenu') {
            extension_settings[pluginName].chatMenu = {
                items: DEFAULT_CHAT_MENU_ITEMS.map(item => ({
                    ...item,
                    hidden: false,
                    categoryId: null
                })),
                hiddenItems: [],
                categories: []
            };
        } else {
            const currentItems = collectExtensionMenuItems();
            extension_settings[pluginName].extensionMenu = {
                items: currentItems.map(item => ({
                    ...item,
                    hidden: false,
                    categoryId: null
                })),
                hiddenItems: [],
                categories: []
            };
        }
        
        saveSettingsDebounced();
        refreshModalContent(menuType);
        applyMenuCustomizations(menuType);
        
        toastr.success('설정이 초기화되었습니다.');
    }
}

/**
 * 모달 콘텐츠 새로고침
 */
function refreshModalContent(menuType) {
    if (!currentModal) return;
    
    const $content = currentModal.find(`.menu-customizer-content[data-content="${menuType}"]`);
    $content.html(renderMenuContent(menuType));
}

/**
 * 모달 닫기
 */
function closeModal() {
    if (!currentModal) return;
    
    currentModal.removeClass('visible');
    currentModal.find('.menu-customizer-modal').removeClass('visible');
    
    setTimeout(() => {
        currentModal.remove();
        currentModal = null;
    }, 300);
}

/**
 * 메뉴 커스텀 적용
 */
function applyMenuCustomizations(menuType) {
    const settings = extension_settings[pluginName][menuType];
    
    if (menuType === 'chatMenu') {
        applyChatMenuCustomizations(settings);
    } else {
        applyExtensionMenuCustomizations(settings);
    }
}

/**
 * 채팅 메뉴 커스텀 적용
 */
function applyChatMenuCustomizations(settings) {
    const $optionsContent = $('#options .options-content');
    if ($optionsContent.length === 0) return;
    
    // 숨김 처리
    settings.items.forEach(item => {
        const $menuItem = $(`#${item.id}`);
        if ($menuItem.length > 0) {
            if (item.hidden) {
                $menuItem.addClass('menu-customizer-hidden');
            } else {
                $menuItem.removeClass('menu-customizer-hidden');
            }
        }
    });
    
    // 카테고리 처리
    // 기존 커스텀 카테고리 제거
    $optionsContent.find('.menu-customizer-category-wrapper').remove();
    
    // 카테고리 생성
    settings.categories.forEach(category => {
        const categoryItems = settings.items.filter(item => item.categoryId === category.id && !item.hidden);
        
        if (categoryItems.length === 0) return;
        
        const isExpanded = category.expanded !== false;
        
        const categoryHtml = `
            <div class="menu-customizer-category-wrapper" data-category-id="${category.id}">
                <a class="menu-customizer-category-toggle-btn ${isExpanded ? 'expanded' : ''}">
                    <i class="fa-lg fa-solid fa-folder${isExpanded ? '-open' : ''}"></i>
                    <span>${category.name}</span>
                    <i class="fa-solid fa-chevron-${isExpanded ? 'down' : 'right'} toggle-icon"></i>
                </a>
                <div class="menu-customizer-category-content ${isExpanded ? 'expanded' : ''}"></div>
            </div>
        `;
        
        const $categoryWrapper = $(categoryHtml);
        
        // 카테고리에 속한 항목들을 카테고리 내부로 이동
        categoryItems.forEach(item => {
            const $menuItem = $(`#${item.id}`);
            if ($menuItem.length > 0) {
                $categoryWrapper.find('.menu-customizer-category-content').append($menuItem.clone().removeClass('menu-customizer-hidden'));
                $menuItem.addClass('menu-customizer-hidden');
            }
        });
        
        // 카테고리 토글 이벤트
        $categoryWrapper.find('.menu-customizer-category-toggle-btn').on('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const $wrapper = $(this).closest('.menu-customizer-category-wrapper');
            const $content = $wrapper.find('.menu-customizer-category-content');
            const categoryId = $wrapper.data('category-id');
            const isCurrentlyExpanded = $(this).hasClass('expanded');
            
            if (isCurrentlyExpanded) {
                $(this).removeClass('expanded');
                $content.removeClass('expanded');
                $(this).find('.fa-folder-open').removeClass('fa-folder-open').addClass('fa-folder');
                $(this).find('.toggle-icon').removeClass('fa-chevron-down').addClass('fa-chevron-right');
            } else {
                $(this).addClass('expanded');
                $content.addClass('expanded');
                $(this).find('.fa-folder').removeClass('fa-folder').addClass('fa-folder-open');
                $(this).find('.toggle-icon').removeClass('fa-chevron-right').addClass('fa-chevron-down');
            }
            
            // 설정 저장
            const categoryData = settings.categories.find(c => c.id === categoryId);
            if (categoryData) {
                categoryData.expanded = !isCurrentlyExpanded;
                saveSettingsDebounced();
            }
        });
        
        $optionsContent.prepend($categoryWrapper);
    });
    
    // 순서 재정렬 (카테고리에 속하지 않은 항목들)
    const uncategorizedItems = settings.items.filter(item => !item.categoryId && !item.hidden);
    uncategorizedItems.forEach((item, index) => {
        const $menuItem = $(`#${item.id}`);
        if ($menuItem.length > 0 && !$menuItem.closest('.menu-customizer-category-wrapper').length) {
            $optionsContent.append($menuItem);
        }
    });
}

/**
 * 확장 메뉴 커스텀 적용
 */
function applyExtensionMenuCustomizations(settings) {
    const $extensionsMenu = $('#extensionsMenu');
    if ($extensionsMenu.length === 0) return;
    
    // 숨김 처리
    settings.items.forEach(item => {
        const $menuItem = $(`#${item.id}`);
        if ($menuItem.length > 0) {
            if (item.hidden) {
                $menuItem.addClass('menu-customizer-hidden');
            } else {
                $menuItem.removeClass('menu-customizer-hidden');
            }
        }
    });
    
    // 카테고리 처리
    // 기존 커스텀 카테고리 제거
    $extensionsMenu.find('.menu-customizer-category-wrapper').remove();
    
    // 카테고리 생성
    settings.categories.forEach(category => {
        const categoryItems = settings.items.filter(item => item.categoryId === category.id && !item.hidden);
        
        if (categoryItems.length === 0) return;
        
        const isExpanded = category.expanded !== false;
        
        const categoryHtml = `
            <div class="menu-customizer-category-wrapper extension_container" data-category-id="${category.id}">
                <div class="menu-customizer-category-toggle-btn list-group-item flex-container flexGap5 interactable ${isExpanded ? 'expanded' : ''}">
                    <i class="fa-lg fa-solid fa-folder${isExpanded ? '-open' : ''} extensionsMenuExtensionButton"></i>
                    <span>${category.name}</span>
                    <i class="fa-solid fa-chevron-${isExpanded ? 'down' : 'right'} toggle-icon" style="margin-left: auto;"></i>
                </div>
                <div class="menu-customizer-category-content ${isExpanded ? 'expanded' : ''}"></div>
            </div>
        `;
        
        const $categoryWrapper = $(categoryHtml);
        
        // 카테고리에 속한 항목들을 카테고리 내부로 이동
        categoryItems.forEach(item => {
            const $menuItem = $(`#${item.id}`);
            if ($menuItem.length > 0) {
                $categoryWrapper.find('.menu-customizer-category-content').append($menuItem.clone().removeClass('menu-customizer-hidden'));
                $menuItem.addClass('menu-customizer-hidden');
            }
        });
        
        // 카테고리 토글 이벤트
        $categoryWrapper.find('.menu-customizer-category-toggle-btn').on('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const $wrapper = $(this).closest('.menu-customizer-category-wrapper');
            const $content = $wrapper.find('.menu-customizer-category-content');
            const categoryId = $wrapper.data('category-id');
            const isCurrentlyExpanded = $(this).hasClass('expanded');
            
            if (isCurrentlyExpanded) {
                $(this).removeClass('expanded');
                $content.removeClass('expanded');
                $(this).find('.fa-folder-open').removeClass('fa-folder-open').addClass('fa-folder');
                $(this).find('.toggle-icon').removeClass('fa-chevron-down').addClass('fa-chevron-right');
            } else {
                $(this).addClass('expanded');
                $content.addClass('expanded');
                $(this).find('.fa-folder').removeClass('fa-folder').addClass('fa-folder-open');
                $(this).find('.toggle-icon').removeClass('fa-chevron-right').addClass('fa-chevron-down');
            }
            
            // 설정 저장
            const categoryData = settings.categories.find(c => c.id === categoryId);
            if (categoryData) {
                categoryData.expanded = !isCurrentlyExpanded;
                saveSettingsDebounced();
            }
        });
        
        $extensionsMenu.prepend($categoryWrapper);
    });
}

/**
 * 요술봉 메뉴에 버튼 추가
 */
async function addToWandMenu() {
    try {
        const buttonHtml = await $.get(`${extensionFolderPath}/button.html`);
        
        const extensionsMenu = $("#extensionsMenu");
        if (extensionsMenu.length > 0) {
            extensionsMenu.append(buttonHtml);
            $("#menu_customizer_button").on("click", createMenuCustomizerModal);
        } else {
            setTimeout(addToWandMenu, 1000);
        }
    } catch (error) {
        console.error('[Menu Customizer] 요술봉 메뉴 버튼 추가 실패:', error);
    }
}

/**
 * 확장 초기화
 */
function initializeMenuCustomizer() {
    console.log('[Menu Customizer] 초기화 시작');
    
    // 설정 초기화
    initializeSettings();
    
    // 요술봉 메뉴에 버튼 추가
    setTimeout(addToWandMenu, 1000);
    
    // 메뉴 커스텀 적용 (지연 실행)
    setTimeout(() => {
        applyMenuCustomizations('chatMenu');
        applyMenuCustomizations('extensionMenu');
    }, 2000);
    
    // 이벤트 리스너 설정
    eventSource.on(event_types.CHAT_CHANGED, () => {
        setTimeout(() => {
            applyMenuCustomizations('chatMenu');
            applyMenuCustomizations('extensionMenu');
        }, 500);
    });
    
    console.log('[Menu Customizer] 초기화 완료');
}

// jQuery 준비 완료 시 초기화
jQuery(() => {
    initializeMenuCustomizer();
});

