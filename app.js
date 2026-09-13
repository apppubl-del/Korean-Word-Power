/* ==========================================
   Korean Word Power - Main Application Logic
   ========================================== */

let appData = null;
let totalXP = parseInt(localStorage.getItem('user_xp') || '0');
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
    });
};

// 자바스크립트 파일 내 아무 곳에나 함수 정의
function scrollToBottomIfNeeded() {
    const studyCard = document.querySelector('#view-study .study-card');
    if (studyCard) {
        studyCard.scrollIntoView({ behavior: 'smooth', block: 'end' });
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
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
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

// 📌 손글씨 패드에 희미한 가이드 텍스트(타겟 단어)를 그려주는 함수
function drawHandwritingGuide(wordText) {
    const canvas = document.getElementById('handwriting-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // 1. 기존에 그려진 내용 초기화
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 2. 희미한 가이드 텍스트 스타일 설정
    ctx.font = 'bold 70px sans-serif';
    ctx.fillStyle = '#e5e7eb'; // 아주 연한 회색 (배경처럼 보이도록)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // 3. 캔버스 중앙에 타겟 단어 출력
    ctx.fillText(wordText, canvas.width / 2, canvas.height / 2);
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
      clearCanvas();
      
      setTimeout(() => {
        const nextButton = document.getElementById('btn-next-item');
        if (nextButton) {
          nextButton.scrollIntoView({ behavior: 'smooth', block: 'end' });
        } else {
          pad.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
      }, 50);
    } else {
      pad.style.display = 'none';
    }
}

/* ==========================================
   TTS (Speech Synthesis) Logic
   ========================================== */
function playTTS() {
    const item = currentItems[currentItemIdx];
    if (!item || !item.target) return;

    const btn = document.getElementById('btn-tts');
    window.speechSynthesis.cancel();

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
      html += `<p style="padding:15px; color:#999; text-align:center;">No levels available yet.</p>`;
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
    document.getElementById('overlay').style.display = 'block';
    document.getElementById('bottom-sheet').style.display = 'block';
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
      html += `<p style="padding:15px; color:#999; text-align:center;">No sets available yet.</p>`;
    } else {
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
    document.getElementById('overlay').style.display = 'block';
    document.getElementById('bottom-sheet').style.display = 'block';
}

function closeSheet() {
    const overlay = document.getElementById('overlay');
    const sheet = document.getElementById('bottom-sheet');
    if (overlay) overlay.style.display = 'none';
    if (sheet) sheet.style.display = 'none';
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
      imgContainer.style.display = 'block';
      emojiContainer.style.display = 'none';
    } else if (item.emoji && item.emoji.trim() !== "") {
      emojiEl.innerText = item.emoji;
      emojiContainer.style.display = 'block';
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
    clearCanvas();
}

function nextItem() {
    window.speechSynthesis.cancel();
    if (currentItemIdx < currentItems.length - 1) {
      currentItemIdx++;
      renderStudyCard();
    } else {
      startQuiz();
    }
    scrollToBottomIfNeeded();
}

function prevItem() {
    window.speechSynthesis.cancel();
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
    currentItems = [...currentItems].sort(() => Math.random() - 0.5);
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
      imgContainer.style.display = 'block';
      emojiContainer.style.display = 'none';
    } else if (item.emoji && item.emoji.trim() !== "") {
      emojiEl.innerText = item.emoji;
      emojiContainer.style.display = 'block';
      imgContainer.style.display = 'none';
    } else {
      imgContainer.style.display = 'none';
      emojiContainer.style.display = 'none';
    }

    document.getElementById('quiz-target').innerText = item.target;
    document.getElementById('quiz-hint').innerText = "";

    const options = [item.meaning, ...item.distractors].sort(() => Math.random() - 0.5);

    const optionsContainer = document.getElementById('quiz-options');
    optionsContainer.innerHTML = options.map(opt => `
      <button style="width:100%; padding:12px; margin:6px 0; border-radius:6px; border:1px solid #ddd; cursor:pointer; text-align:center;" onclick="checkQuizAnswer('${opt.replace(/'/g, "\\'")}', this)">${opt}</button>
    `).join('');
}

function checkQuizAnswer(selected, btn) {
    const correct = currentItems[currentQuizIdx].meaning;
    if (selected === correct) {
      btn.style.background = '#dcfce7';
      btn.style.color = '#15803d';
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
      btn.style.color = '#ef4444';
      btn.disabled = true;
      document.getElementById('quiz-hint').innerText = "Incorrect. Please try again!";
    }
}

function finishLesson() {
    totalXP += 50;
    localStorage.setItem('user_xp', totalXP);
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
        <button onclick="nextChunkStudy()" style="padding:14px; background:#3b82f6; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">▶ Continue Next 5 Words</button>
        <button onclick="openSetSelection()" style="padding:12px; background:#f3f4f6; border:1px solid #ddd; border-radius:8px; cursor:pointer; font-weight:bold;">🚀 Choose Another Set</button>
        <button onclick="goHome()" style="padding:10px; background:transparent; border:none; color:#666; cursor:pointer;">🏠 Back to Main Lobby</button>
      `;
    } else {
      titleEl.innerText = "🎉 Set Completed!";
      actionsEl.innerHTML = `
        <button onclick="openSetSelection()" style="padding:14px; background:#3b82f6; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">🚀 Choose Another Set</button>
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

function showView(viewId) {
    window.speechSynthesis.cancel();
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const targetView = document.getElementById(viewId);
    if (targetView) targetView.classList.add('active');
    closeSheet();
}

function goHome() { 
    showView('view-home'); 
}


// 사이드바 학습 팁 로드 및 모달 연동 로직
console.log("1. 스크립트 파일 자체는 읽히고 있습니다.");

document.addEventListener("DOMContentLoaded", () => {
  console.log("2. DOMContentLoaded 이벤트 실행됨!");

  const tipsContainer = document.getElementById("tips-container");
  const modal = document.getElementById("tip-modal");
  const modalTitle = document.getElementById("modal-title");
  const modalBody = document.getElementById("modal-body");
  const modalClose = document.getElementById("modal-close");

  console.log("3. tips-container 요소 상태:", tipsContainer);

  if (tipsContainer) {
    console.log("4. tips-container가 존재하므로 fetch를 시작합니다.");
    
    fetch("tips.json")
      .then(response => {
        console.log("5. tips.json 응답 도착:", response);
        return response.json();
      })
      .then(tips => {
        console.log("6. 파싱된 팁 데이터:", tips);
        
        tips.forEach((tip, index) => {
          console.log(`7. ${index}번째 팁 생성 중:`, tip.title);
          
          const tipCard = document.createElement("div");
          tipCard.className = "tip-card";
          tipCard.innerHTML = `<h4 title="${tip.title}">${tip.title}</h4>`;

          tipCard.addEventListener("click", () => {
            modalTitle.textContent = tip.title;
            modalBody.textContent = tip.content;
            modal.classList.add('open');
          });

          tipsContainer.appendChild(tipCard);
        });
      })
      .catch(error => console.error("❌ Fetch 또는 데이터 처리 중 에러 발생:", error));
  } else {
    console.error("❌ 'tips-container' 요소를 HTML에서 찾지 못했습니다! ID를 확인해주세요.");
  }

  if (modalClose) {
    modalClose.addEventListener("click", () => {
      modal.classList.remove('open');
    });
  }

  window.addEventListener("click", (event) => {
    if (event.target === modal) {
      modal.classList.remove('open');
    }
  });
});