/* ==========================================
   Korean Word Power - Main Application Logic
   ========================================== */

let appData = null;

// localStorage가 막혀 있어도(시크릿 모드, 쿠키 차단 등) 앱이 멈추지 않도록 보호
function loadXP() {
    try {
        return parseInt(localStorage.getItem('user_xp') || '0') || 0;
    } catch (e) {
        return 0;
    }
}
let totalXP = loadXP();

// speechSynthesis를 지원하지 않는 브라우저(일부 인앱 브라우저)에서도 화면 전환이 깨지지 않도록 보호
function stopTTS() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

// '동작 줄이기' 설정을 켠 사용자에게는 부드러운 스크롤을 쓰지 않음
function scrollBehavior() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

// 손글씨 패드 열림 상태를 버튼의 aria-expanded에 반영
function setPadExpanded(expanded) {
    const btn = document.getElementById('btn-practice');
    if (btn) btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

// 편향 없는 셔플 (Fisher-Yates)
function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
let currentLevelData = null; 
let currentItems = [];
let currentItemIdx = 0;
let currentQuizIdx = 0;

let canvas, ctx;
let isDrawing = false;

let currentFullSetItems = []; // 세트 전체 단어
let currentChunkIdx = 0;      // 현재 5개씩 묶인 그룹 번호

let currentCatIdx = null; // 현재 카테고리 인덱스 기억
let currentLvlIdx = null; // 현재 레벨 인덱스 기억

// 초기 XP UI 반영
document.addEventListener('DOMContentLoaded', () => {
    const xpEl = document.getElementById('user-xp');
    if (xpEl) xpEl.innerText = `XP: ${totalXP}`;
});

window.onload = function() {
    initCanvas();
    
    Promise.all([
        fetch('data.json').then(res => {
            if (!res.ok) throw new Error('data.json 파일을 불러올 수 없습니다.');
            return res.json();
        }),
        fetch('notices.json').then(res => {
            if (!res.ok) throw new Error('notices.json 파일을 불러올 수 없습니다.');
            return res.json();
        })
    ])
    .then(([data, notices]) => {
        appData = data;
        renderNotices(notices); // 공지 렌더링 실행
        renderHomeMenu();
        showView('view-home');
    })
    .catch(error => {
        console.error('데이터 로딩 중 에러 발생:', error);
        const list = document.getElementById('home-category-list');
        if (list) list.innerText = 'Failed to load data. Please refresh the page.';
        showView('view-home');
    });
};

// 자바스크립트 파일 내 아무 곳에나 함수 정의
function scrollToBottomIfNeeded() {
    const studyCard = document.querySelector('#view-study .study-card');
    if (studyCard) {
        studyCard.scrollIntoView({ behavior: scrollBehavior(), block: 'end' });
    }
}

/* ==========================================
   Canvas & Handwriting Pad Logic
   ========================================== */
function initCanvas() {
    canvas = document.getElementById('handwriting-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    canvas.onmousedown = (e) => { isDrawing = true; draw(e); };
    canvas.onmousemove = (e) => { if (isDrawing) draw(e); };
    canvas.onmouseup = () => { isDrawing = false; ctx.beginPath(); };
    canvas.onmouseleave = () => { isDrawing = false; ctx.beginPath(); };

    canvas.ontouchstart = (e) => { e.preventDefault(); isDrawing = true; drawTouch(e); };
    canvas.ontouchmove = (e) => { e.preventDefault(); if (isDrawing) drawTouch(e); };
    canvas.ontouchend = () => { isDrawing = false; ctx.beginPath(); };

    clearCanvas();
}

function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    // 화면에 표시되는 크기와 canvas 내부 해상도(400x200)가 다를 때를 대비해 좌표를 보정
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

function draw(e) {
    const pos = getCanvasPos(e);
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e3a8a';

    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
}

function drawTouch(e) {
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      draw({ clientX: touch.clientX, clientY: touch.clientY });
    }
}

function clearCanvas() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 1. 기존 십자 가이드라인 그리기
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(200, 0); ctx.lineTo(200, 200);
    ctx.moveTo(0, 100); ctx.lineTo(400, 100);
    ctx.stroke();
    ctx.beginPath();

    // 2. 희미한 타겟 단어 가이드 글씨 (간격 넓히기 적용)
    const targetTextEl = document.getElementById('target-text');
    if (targetTextEl) {
        const wordText = targetTextEl.innerText;
        if (wordText && wordText !== '-') {
            ctx.font = 'bold 70px sans-serif';
            ctx.fillStyle = '#e5e7eb'; // 연한 회색 (배경 가이드용)
            ctx.textBaseline = 'middle';
            
            const spacing = 25; // 📌 글자 사이의 간격 (숫자를 키우면 간격이 더 벌어집니다)
            const chars = wordText.split('');
            
            // 전체 텍스트의 총 너비 계산
            let totalWidth = 0;
            chars.forEach(char => {
                totalWidth += ctx.measureText(char).width + spacing;
            });
            totalWidth -= spacing; // 마지막 글자 뒤의 불필요한 간격 제거

            // 캔버스 중앙 정렬을 위한 시작 X 좌표 계산
            let startX = (canvas.width / 2) - (totalWidth / 2);
            const centerY = canvas.height / 2;

            // 글자별로 간격을 주어 렌더링
            chars.forEach(char => {
                ctx.fillText(char, startX, centerY);
                startX += ctx.measureText(char).width + spacing;
            });
        }
    }
}

function toggleHandwritingPad() {
    const pad = document.getElementById('handwriting-container');
    if (!pad) return;

    if (pad.style.display === 'none' || pad.style.display === '') {
      pad.style.display = 'block';
      setPadExpanded(true);
      clearCanvas();
      
      setTimeout(() => {
        const nextButton = document.getElementById('btn-next-item');
        if (nextButton) {
          nextButton.scrollIntoView({ behavior: scrollBehavior(), block: 'end' });
        } else {
          pad.scrollIntoView({ behavior: scrollBehavior(), block: 'end' });
        }
      }, 50);
    } else {
      pad.style.display = 'none';
      setPadExpanded(false);
    }
}

/* ==========================================
   TTS (Speech Synthesis) Logic
   ========================================== */
function playTTS() {
    const item = currentItems[currentItemIdx];
    if (!item || !item.target) return;

    if (!('speechSynthesis' in window)) return;

    const btn = document.getElementById('btn-tts');
    stopTTS();

    const uttr = new SpeechSynthesisUtterance(item.target);
    uttr.lang = 'ko-KR';
    uttr.rate = 0.9;

    uttr.onstart = () => { if (btn) btn.innerText = "🔊 Playing..."; };
    uttr.onend = () => { if (btn) btn.innerText = "🔊 Audio"; };
    uttr.onerror = () => { if (btn) btn.innerText = "🔊 Audio"; };

    window.speechSynthesis.speak(uttr);
}

/* ==========================================
   UI Rendering & Navigation Logic
   ========================================== */

// 공지사항 데이터 동적 렌더링 함수

function renderNotices(notices) {
    const centerEl = document.getElementById('center-notice-text');
    const sideEl = document.getElementById('side-notice-text');

    if (centerEl && notices.center) {
        centerEl.innerText = notices.center;
    }
    if (sideEl && notices.side) {
        sideEl.innerText = notices.side;
    }
}

function renderHomeMenu() {
    const container = document.getElementById('home-category-list');
    if (!container) return;
    container.innerHTML = '';

    if (!appData.categories) return;

    appData.categories.forEach((cat, catIdx) => {
      const btn = document.createElement('button');
      btn.style.width = '100%';
      btn.style.padding = '14px';
      btn.style.margin = '8px 0';
      btn.style.borderRadius = '8px';
      btn.style.border = '1px solid #ccc';
      btn.style.cursor = 'pointer';
      btn.style.background = '#f9fafb';
      btn.style.fontWeight = 'bold';

      if (cat.status === 'active') {
        btn.innerText = cat.title;
        btn.onclick = () => openLevelSheet(catIdx);
      } else {
        btn.disabled = true;
        btn.innerText = `${cat.title} (🔒 Coming Soon)`;
      }
      container.appendChild(btn);
    });
}

function openLevelSheet(catIdx) {
    const category = appData.categories[catIdx];
    const content = document.getElementById('sheet-content');
    let html = `<h3>${category.title}</h3><p style="color:#666; font-size:0.85rem; margin-bottom:10px;">Select a level to proceed.</p>`;

    if (!category.levels || category.levels.length === 0) {
      html += `<p style="padding:15px; color:#6b7280; text-align:center;">No levels available yet.</p>`;
    } else {
      category.levels.forEach((lvl, lvlIdx) => {
        if (lvl.status === 'active') {
          html += `<button style="width:100%; padding:12px; margin:6px 0; border-radius:6px; border:1px solid #ddd; cursor:pointer;" onclick='openSetSheet(${catIdx}, ${lvlIdx})'>${lvl.title} ▶</button>`;
        } else {
          html += `<button style="width:100%; padding:12px; margin:6px 0; border-radius:6px; border:1px solid #ddd;" disabled>${lvl.title} (🔒 Locked)</button>`;
        }
      });
    }

    content.innerHTML = html;
    showSheet();
}

function openSetSheet(catIdx, lvlIdx) {
    currentCatIdx = catIdx;
    currentLvlIdx = lvlIdx;

    const level = appData.categories[catIdx].levels[lvlIdx];
    currentLevelData = level;
    
    const content = document.getElementById('sheet-content');
    let html = `
      <div style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
        <h4 style="margin:0;">${level.title}</h4>
        <button onclick="closeSheet()" style="width:auto; padding:4px 8px; font-size:0.8rem;">Close</button>
      </div>
    `;

    if (!level.sets || level.sets.length === 0) {
      html += `<p style="padding:15px; color:#6b7280; text-align:center;">No sets available yet.</p>`;
    } else {
      // 💡 핵심 수정: 자바스크립트에서 ID나 타이틀의 숫자를 추출하여 1, 2, 3... 10순으로 완벽하게 정렬
      level.sets.sort((a, b) => {
        const numA = parseInt(String(a.id).replace(/[^0-9]/g, '')) || 0;
        const numB = parseInt(String(b.id).replace(/[^0-9]/g, '')) || 0;
        return numA - numB;
      });
      
     
      
      // 💡 setIdx를 함께 받아와서 인덱스로 세트를 지정합니다.
      level.sets.forEach((set, setIdx) => {
        if (set.status === 'active') {
          html += `<button style="width:100%; padding:12px; margin:6px 0; border-radius:6px; border:1px solid #ddd; cursor:pointer;" onclick='startStudy(${catIdx}, ${lvlIdx}, ${setIdx})'>${set.title} (${set.items.length} items) ▶</button>`;
        } else {
          html += `<button style="width:100%; padding:12px; margin:6px 0; border-radius:6px; border:1px solid #ddd;" disabled>${set.title} (🔒 Locked)</button>`;
        }
      });
    }

    content.innerHTML = html;
    showSheet();
}

let sheetOpener = null; // 시트를 열기 직전에 포커스가 있던 요소 (닫을 때 복귀용)

function showSheet() {
    const overlay = document.getElementById('overlay');
    const sheet = document.getElementById('bottom-sheet');
    if (!overlay || !sheet) return;

    const wasOpen = sheet.style.display === 'block';
    if (!wasOpen) sheetOpener = document.activeElement;

    overlay.style.display = 'block';
    sheet.style.display = 'block';

    const first = sheet.querySelector('button:not([disabled])');
    if (first) first.focus({ preventScroll: true });
}

function closeSheet(restoreFocus = true) {
    const overlay = document.getElementById('overlay');
    const sheet = document.getElementById('bottom-sheet');
    const wasOpen = sheet && sheet.style.display === 'block';

    if (overlay) overlay.style.display = 'none';
    if (sheet) sheet.style.display = 'none';

    if (wasOpen && restoreFocus && sheetOpener && document.contains(sheetOpener)) {
      sheetOpener.focus({ preventScroll: true });
    }
    sheetOpener = null;
}

// 💡 객체 대신 카테고리, 레벨, 세트의 인덱스 번호를 받아 데이터(items)를 꺼내옵니다.
function startStudy(catIdx, lvlIdx, setIdx) {
    const targetSet = appData.categories[catIdx].levels[lvlIdx].sets[setIdx];
    currentFullSetItems = targetSet.items; 
    currentChunkIdx = 0;         
    loadChunk();
}

function loadChunk() {
    const start = currentChunkIdx * 5;
    const end = start + 5;
    currentItems = currentFullSetItems.slice(start, end); 
    currentItemIdx = 0;
    renderStudyCard();
    showView('view-study');

    scrollToBottomIfNeeded();
}

function renderStudyCard() {
    const item = currentItems[currentItemIdx];
    if (!item) return;

    const imgContainer = document.getElementById('target-image-container');
    const imgEl = document.getElementById('target-image');
    const emojiContainer = document.getElementById('target-emoji-container');
    const emojiEl = document.getElementById('target-emoji');

    if (item.image && item.image.trim() !== "") {
      imgEl.src = item.image;
      imgEl.alt = item.meaning || 'Word illustration';
      imgContainer.style.display = 'flex';
      emojiContainer.style.display = 'none';
    } else if (item.emoji && item.emoji.trim() !== "") {
      emojiEl.innerText = item.emoji;
      emojiContainer.style.display = 'flex';
      imgContainer.style.display = 'none';
    } else {
      imgContainer.style.display = 'none';
      emojiContainer.style.display = 'none';
    }

    document.getElementById('target-text').innerText = item.target;
    document.getElementById('target-roman').innerText = item.roman;
    document.getElementById('target-meaning').innerText = item.meaning;
    
    document.getElementById('target-example').innerText = item.example || "";
    document.getElementById('target-example-trans').innerText = item.example_translation || "";

    document.getElementById('study-progress').innerText = `${currentItemIdx + 1} / ${currentItems.length}`;

    const prevBtn = document.getElementById('btn-prev-item');
    const nextBtn = document.getElementById('btn-next-item');

    if (prevBtn) prevBtn.style.visibility = currentItemIdx === 0 ? 'hidden' : 'visible';
    if (nextBtn) nextBtn.innerText = currentItemIdx === currentItems.length - 1 ? "🎯 Start Quiz" : "Next";

    const handwritingContainer = document.getElementById('handwriting-container');
    if (handwritingContainer) handwritingContainer.style.display = 'none';
    setPadExpanded(false);
    clearCanvas();
}

function nextItem() {
    stopTTS();
    if (currentItemIdx < currentItems.length - 1) {
      currentItemIdx++;
      renderStudyCard();
    } else {
      startQuiz();
    }
    scrollToBottomIfNeeded();
}

function prevItem() {
    stopTTS();
    if (currentItemIdx > 0) {
      currentItemIdx--;
      renderStudyCard();
    }
    scrollToBottomIfNeeded();
}

/* ==========================================
   Quiz Logic
   ========================================== */
function startQuiz() {
    currentQuizIdx = 0;
    currentItems = shuffle(currentItems);
    renderQuizQuestion();
    showView('view-quiz');
}

function renderQuizQuestion() {
    const item = currentItems[currentQuizIdx];
    if (!item) return;

    const imgContainer = document.getElementById('quiz-image-container');
    const imgEl = document.getElementById('quiz-image');
    const emojiContainer = document.getElementById('quiz-emoji-container');
    const emojiEl = document.getElementById('quiz-emoji');

    if (item.image && item.image.trim() !== "") {
      imgEl.src = item.image;
      imgContainer.style.display = 'flex';
      emojiContainer.style.display = 'none';
    } else if (item.emoji && item.emoji.trim() !== "") {
      emojiEl.innerText = item.emoji;
      emojiContainer.style.display = 'flex';
      imgContainer.style.display = 'none';
    } else {
      imgContainer.style.display = 'none';
      emojiContainer.style.display = 'none';
    }

    document.getElementById('quiz-target').innerText = item.target;
    const quizHint = document.getElementById('quiz-hint');
    quizHint.innerText = "";
    quizHint.classList.remove('correct', 'wrong');

    const options = shuffle([item.meaning, ...(item.distractors || [])]);

    const optionsContainer = document.getElementById('quiz-options');
    optionsContainer.innerHTML = '';
    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.style.cssText = 'width:100%; padding:12px; margin:6px 0; border-radius:6px; border:1px solid #ddd; cursor:pointer; text-align:center;';
      btn.textContent = opt;
      btn.addEventListener('click', () => checkQuizAnswer(opt, btn));
      optionsContainer.appendChild(btn);
    });
}

function checkQuizAnswer(selected, btn) {
    if (btn.disabled) return;
    const correct = currentItems[currentQuizIdx].meaning;
    if (selected === correct) {
      btn.style.background = '#dcfce7';
      btn.style.color = '#15803d';
      const hintEl = document.getElementById('quiz-hint');
      hintEl.innerText = 'Correct!';
      hintEl.classList.remove('wrong');
      hintEl.classList.add('correct');   // 정답 메시지는 파란색으로 표시
      // 정답 처리 중 다른 버튼을 연속으로 눌러 문제가 두 번 넘어가는 것을 방지
      document.querySelectorAll('#quiz-options button').forEach(b => { b.disabled = true; });
      setTimeout(() => {
        currentQuizIdx++;
        if (currentQuizIdx < currentItems.length) {
          renderQuizQuestion();
        } else {
          finishLesson();
        }
      }, 400);
    } else {
      btn.style.background = '#fee2e2';
      btn.style.color = '#b91c1c';
      btn.disabled = true;
      const wrongHint = document.getElementById('quiz-hint');
      wrongHint.classList.remove('correct');
      wrongHint.classList.add('wrong');   // 오답 메시지는 빨간색으로 표시
      wrongHint.innerText = "Incorrect. Please try again!";
    }
}

function finishLesson() {
    totalXP += 50;
    try {
      localStorage.setItem('user_xp', totalXP);
    } catch (e) {
      console.warn('XP를 저장할 수 없습니다:', e);
    }
    const xpEl = document.getElementById('user-xp');
    if (xpEl) xpEl.innerText = `XP: ${totalXP}`;
    handleQuizComplete(); 
}

function handleQuizComplete() {
    const nextStart = (currentChunkIdx + 1) * 5;
    const titleEl = document.getElementById('result-title');
    const actionsEl = document.getElementById('result-actions');

    if (nextStart < currentFullSetItems.length) {
      titleEl.innerText = "✨ Good job on this chunk!";
      actionsEl.innerHTML = `
        <button onclick="nextChunkStudy()" style="padding:14px; background:#2563eb; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">▶ Continue Next 5 Words</button>
        <button onclick="openSetSelection()" style="padding:12px; background:#f3f4f6; border:1px solid #ddd; border-radius:8px; cursor:pointer; font-weight:bold;">🚀 Choose Another Set</button>
        <button onclick="goHome()" style="padding:10px; background:transparent; border:none; color:#666; cursor:pointer;">🏠 Back to Main Lobby</button>
      `;
    } else {
      titleEl.innerText = "🎉 Set Completed!";
      actionsEl.innerHTML = `
        <button onclick="openSetSelection()" style="padding:14px; background:#2563eb; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">🚀 Choose Another Set</button>
        <button onclick="goHome()" style="padding:10px; background:transparent; border:none; color:#666; cursor:pointer;">🏠 Back to Main Lobby</button>
      `;
    }

    showView('view-result');
}

function openSetSelection() {
    showView('view-home');
    if (currentCatIdx !== null && currentLvlIdx !== null) {
      openSetSheet(currentCatIdx, currentLvlIdx);
    }
}

function nextChunkStudy() {
    currentChunkIdx++;
    loadChunk();
}

let initialViewShown = false;

function showView(viewId) {
    stopTTS();
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const targetView = document.getElementById(viewId);
    if (targetView) targetView.classList.add('active');
    closeSheet(false);

    // 첫 화면 이후의 화면 전환에서는 새 화면의 제목으로 포커스를 옮겨 화면 변화를 알림
    if (targetView && initialViewShown) {
      const heading = targetView.querySelector('h1, h2, h3');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
    }
    initialViewShown = true;
}

function goHome() { 
    showView('view-home'); 
}


// 사이드바 학습 팁 로드 및 모달 연동 로직
let tipModalTrigger = null; // 모달을 열기 직전에 포커스가 있던 요소 (닫을 때 복귀용)

function openTipModal(tip, trigger) {
  const modal = document.getElementById("tip-modal");
  if (!modal) return;

  document.getElementById("modal-title").textContent = tip.title;
  document.getElementById("modal-body").textContent = tip.content;
  tipModalTrigger = trigger || null;
  modal.classList.add('open');

  const closeBtn = document.getElementById("modal-close");
  if (closeBtn) closeBtn.focus();
}

function closeTipModal() {
  const modal = document.getElementById("tip-modal");
  if (!modal || !modal.classList.contains('open')) return;

  modal.classList.remove('open');
  if (tipModalTrigger && document.contains(tipModalTrigger)) tipModalTrigger.focus();
  tipModalTrigger = null;
}

document.addEventListener("DOMContentLoaded", () => {
  const tipsContainer = document.getElementById("tips-container");
  const modal = document.getElementById("tip-modal");
  const modalClose = document.getElementById("modal-close");

  if (tipsContainer) {
    fetch("tips.json")
      .then(response => response.json())
      .then(tips => {
        tips.forEach(tip => {
          const tipCard = document.createElement("div");
          tipCard.className = "tip-card";
          // 키보드와 스크린리더에서도 버튼처럼 동작하도록 설정
          tipCard.setAttribute("role", "button");
          tipCard.setAttribute("aria-haspopup", "dialog");
          tipCard.tabIndex = 0;

          const tipTitle = document.createElement("h4");
          tipTitle.title = tip.title;
          tipTitle.textContent = tip.title;
          tipCard.appendChild(tipTitle);

          tipCard.addEventListener("click", () => openTipModal(tip, tipCard));
          tipCard.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              openTipModal(tip, tipCard);
            } else if (e.key === " ") {
              e.preventDefault(); // 스페이스는 키를 뗄 때 열어 닫기 버튼으로 이어지는 중복 클릭 방지
            }
          });
          tipCard.addEventListener("keyup", (e) => {
            if (e.key === " ") openTipModal(tip, tipCard);
          });

          tipsContainer.appendChild(tipCard);
        });
      })
      .catch(error => console.error("❌ Fetch 또는 데이터 처리 중 에러 발생:", error));
  } else {
    console.error("❌ 'tips-container' 요소를 HTML에서 찾지 못했습니다! ID를 확인해주세요.");
  }

  if (modalClose) {
    modalClose.addEventListener("click", closeTipModal);
  }

  window.addEventListener("click", (event) => {
    if (event.target === modal) closeTipModal();
  });
});

/* ==========================================
   Keyboard: Esc로 닫기 + 열린 대화상자 안에서 Tab 포커스 순환
   ========================================== */
function getFocusable(container) {
  return [...container.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]
    .filter(el => el.getClientRects().length > 0);
}

document.addEventListener("keydown", (e) => {
  const modal = document.getElementById("tip-modal");
  const sheet = document.getElementById("bottom-sheet");
  const modalOpen = modal && modal.classList.contains('open');
  const sheetOpen = sheet && sheet.style.display === 'block';
  if (!modalOpen && !sheetOpen) return;

  if (e.key === "Escape") {
    if (modalOpen) closeTipModal();
    else closeSheet();
    return;
  }

  if (e.key !== "Tab") return;

  const dialog = modalOpen ? modal.querySelector('.modal-content') : sheet;
  const focusable = getFocusable(dialog);
  if (focusable.length === 0) {
    e.preventDefault();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!dialog.contains(document.activeElement)) {
    e.preventDefault();
    first.focus();
  } else if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});
