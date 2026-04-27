// ============================================
// 素材兼职平台 v3.0 - 前台逻辑
// ============================================

var currentPlatform = 'all';
var currentType = '';
var allMaterials = [];
var searchTimer = null;

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

document.addEventListener('DOMContentLoaded', function() {
  checkUser();
  loadMaterials();
  loadStats();
  loadAnnouncements();
});

// --- User System ---
var pendingQrcodeFile = null;

function checkUser() {
  var userId = localStorage.getItem('userId');
  var nickname = localStorage.getItem('nickname');
  if (userId && nickname) {
    // 先展示UI，后台静默验证
    showUserUI(nickname);
    fetch('/api/user/' + userId, { headers: { 'x-user-id': userId } })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success) {
          // 同步最新昵称
          if (data.data.nickname !== nickname) {
            localStorage.setItem('nickname', data.data.nickname);
            showUserUI(data.data.nickname);
          }
        } else {
          // 用户不存在，清空但不自动弹窗，让用户主动操作
          localStorage.removeItem('userId');
          localStorage.removeItem('nickname');
          showSetupModal();
        }
      })
      .catch(function() {
        // 网络异常，保持当前UI
      });
  } else {
    showSetupModal();
  }
}

function showSetupModal() {
  var modal = document.getElementById('userSetupModal');
  modal.style.display = 'flex';
  modal.classList.add('active');
}

function showUserUI(nickname) {
  var modal = document.getElementById('userSetupModal');
  modal.classList.remove('active');
  modal.style.display = 'none';
  document.getElementById('headerUser').style.display = 'flex';
  document.getElementById('userDisplayName').textContent = '👤 ' + nickname;
}

function previewQrcode(input) {
  if (input.files && input.files[0]) {
    var file = input.files[0];
    if (file.size > 5 * 1024 * 1024) {
      showToast('收款码图片太大啦，选张小一点的~');
      input.value = '';
      return;
    }
    pendingQrcodeFile = file;
    var reader = new FileReader();
    reader.onload = function(e) {
      document.getElementById('qrcodeImg').src = e.target.result;
      document.getElementById('qrcodePreview').style.display = 'block';
      document.getElementById('qrcodePlaceholder').style.display = 'none';
    };
    reader.readAsDataURL(file);
  }
}

async function registerUser() {
  var btn = document.querySelector('#userSetupModal .btn-primary');
  var nickname = document.getElementById('userNickname').value.trim();
  var wechat = document.getElementById('userWechat').value.trim();
  if (!nickname) {
    showToast('请输入昵称哦~');
    return;
  }
  if (nickname.length > 20) {
    showToast('昵称太长啦，最多20个字~');
    return;
  }
  if (!wechat) {
    showToast('请填写微信号~');
    return;
  }
  if (!pendingQrcodeFile) {
    showToast('请上传收款码~');
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ 注册中...';

  try {
    // Step 1: Upload QR code
    var qrcodeUrl = '';
    var fd = new FormData();
    fd.append('file', pendingQrcodeFile);
    fd.append('userId', localStorage.getItem('userId') || '');
    var upRes = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!upRes.ok) {
      showToast('收款码上传失败(' + upRes.status + ')，再试试~');
      return;
    }
    var upData = await upRes.json();
    if (upData.success) {
      qrcodeUrl = upData.url;
    } else {
      showToast(upData.message || '收款码上传失败，再试试~');
      return;
    }

    // Step 2: Register with URL
    var res = await fetch('/api/user/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: nickname, wechat: wechat, qrcode: qrcodeUrl })
    });
    if (!res.ok) {
      showToast('注册失败(' + res.status + ')，再试试~');
      return;
    }
    var data = await res.json();
    if (data.success) {
      localStorage.setItem('userId', data.data.id);
      localStorage.setItem('nickname', data.data.nickname);
      pendingQrcodeFile = null;
      showUserUI(data.data.nickname);
      showToast('🌸 欢迎，' + data.data.nickname + '~');
    } else {
      showToast(data.message || '注册失败~');
    }
  } catch (e) {
    console.error('注册出错:', e);
    showToast('网络不太好，再试试~');
  } finally {
    btn.disabled = false;
    btn.textContent = '💕 开始接单';
  }
}

// --- Login by Wechat ---
function showLoginModal() {
  document.getElementById('userSetupModal').style.display = 'none';
  document.getElementById('loginModal').style.display = 'flex';
}

function showRegisterFromLogin() {
  document.getElementById('loginModal').style.display = 'none';
  document.getElementById('userSetupModal').style.display = 'flex';
}

async function loginByWechat() {
  var wechat = document.getElementById('loginWechat').value.trim();
  if (!wechat) {
    showToast('请输入微信号~');
    return;
  }
  var btn = document.querySelector('#loginModal .btn-primary');
  btn.disabled = true;
  btn.textContent = '⏳ 登录中...';
  try {
    var res = await fetch('/api/user/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wechat: wechat })
    });
    var data = await res.json();
    if (data.success) {
      localStorage.setItem('userId', data.data.id);
      localStorage.setItem('nickname', data.data.nickname);
      document.getElementById('loginModal').style.display = 'none';
      showUserUI(data.data.nickname);
      showToast('🌸 欢迎回来，' + data.data.nickname + '~');
    } else {
      showToast(data.message || '登录失败~');
    }
  } catch (e) {
    showToast('网络不太好，再试试~');
  } finally {
    btn.disabled = false;
    btn.textContent = '🔓 登录';
  }
}

// --- Load Materials ---
async function loadMaterials() {
  try {
    var res = await fetch('/api/materials');
    var data = await res.json();
    if (data.success) {
      allMaterials = data.data;
      renderMaterials();
    }
  } catch (e) {
    document.getElementById('materialList').innerHTML =
      '<div class="empty-state"><div class="empty-emoji">😵</div><p>加载失败，刷新试试~</p></div>';
  }
}

// --- Search ---
function debounceSearch() {
  clearTimeout(searchTimer);
  var kw = document.getElementById('searchInput').value.trim();
  document.getElementById('btnSearchClear').style.display = kw ? 'flex' : 'none';
  searchTimer = setTimeout(function() {
    if (kw) {
      searchMaterials(kw);
    } else {
      loadMaterials();
    }
  }, 300);
}

async function searchMaterials(keyword) {
  try {
    var res = await fetch('/api/materials?keyword=' + encodeURIComponent(keyword));
    var data = await res.json();
    if (data.success) {
      allMaterials = data.data;
      renderMaterials();
    }
  } catch (e) {}
}

function clearSearch() {
  document.getElementById('searchInput').value = '';
  document.getElementById('btnSearchClear').style.display = 'none';
  loadMaterials();
}

// --- Filter & Render ---
function getFilteredMaterials() {
  return allMaterials.filter(function(m) {
    if (currentPlatform !== 'all' && m.platform !== currentPlatform) return false;
    if (currentType && m.type !== currentType) return false;
    return true;
  });
}

function renderMaterials() {
  var list = document.getElementById('materialList');
  var filtered = getFilteredMaterials();

  if (filtered.length === 0) {
    list.innerHTML =
      '<div class="empty-state"><div class="empty-emoji">🌸</div>' +
      '<p>暂时没有合适的素材~<br>过来看看吧</p></div>';
    return;
  }

  list.innerHTML = filtered.map(function(m) {
    var platformLabel = m.platform === 'xiaohongshu' ? '📕 小红书' : '🎵 抖音';
    var typeLabel = { image: '📷 图文', video: '🎬 视频', comment: '💬 评论' }[m.type];
    var slotsLeft = m.slotsLeft !== undefined ? m.slotsLeft : Math.max(0, (m.maxOrders || 0) - (m.currentOrders || 0));
    var isFull = slotsLeft <= 0;
    var pct = (m.maxOrders || 0) > 0 ? ((m.currentOrders || 0) / m.maxOrders * 100) : 0;

    var thumbHtml = m.images.slice(0, 3).map(function(img) {
      return '<img src="' + escapeHtml(img) + '" alt="">';
    }).join('');

    return '<div class="material-card" onclick="location.href=\'/material/' + m.id + '\'">' +
      '<div class="card-header">' +
        '<div class="card-tags">' +
          '<span class="tag tag-platform ' + m.platform + '">' + platformLabel + '</span>' +
          '<span class="tag tag-type">' + typeLabel + '</span>' +
          '<span class="tag ' + (isFull ? 'tag-full' : 'tag-slots') + '">' + (isFull ? '已满~' : '剩' + slotsLeft + '单') + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="card-title">' + escapeHtml(m.title) + '</div>' +
      (thumbHtml ? '<div class="card-images">' + thumbHtml + '</div>' : '') +
      '<div class="card-progress"><div class="card-progress-fill" style="width:' + Math.min(pct, 100) + '%"></div></div>' +
      '<div class="card-footer">' +
        '<div class="card-reward">¥' + (m.reward || 0) + ' <span>/单</span></div>' +
        '<button class="btn-accept-card ' + (isFull ? 'disabled' : '') + '" ' +
          'onclick="event.stopPropagation(); ' + (isFull ? '' : 'quickAccept(\'' + m.id + '\')') + '">' +
          (isFull ? '已满' : '接单') +
        '</button>' +
      '</div></div>';
  }).join('');
}

// --- Quick Accept ---
async function quickAccept(id) {
  var userId = localStorage.getItem('userId');
  if (!userId) {
    showToast('先设置昵称才能接单哦~');
    showSetupModal();
    return;
  }
  // 防止重复点击
  var btn = event.target;
  if (btn.disabled) return;
  btn.disabled = true;
  btn.textContent = '⏳ 接单中...';
  try {
    var res = await fetch('/api/materials/' + id + '/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: userId })
    });
    var data = await res.json();
    if (data.success) {
      showToast('🎉 接单成功~ 去上传截图吧');
      loadMaterials();
    } else {
      showToast(data.message || '接单失败~');
    }
  } catch (e) {
    showToast('网络不太好~');
  } finally {
    btn.disabled = false;
    btn.textContent = '接单';
  }
}

// --- Tab Switch ---
function switchPlatform(platform, el) {
  currentPlatform = platform;
  document.querySelectorAll('.tab-pill').forEach(function(t) { t.classList.remove('active'); });
  el.classList.add('active');
  renderMaterials();
}

function switchType(type, el) {
  currentType = type;
  document.querySelectorAll('.sub-pill').forEach(function(t) { t.classList.remove('active'); });
  el.classList.add('active');
  renderMaterials();
}

// --- Stats ---
async function loadStats() {
  try {
    var res = await fetch('/api/stats');
    var data = await res.json();
    if (data.success) {
      document.getElementById('statTotal').textContent = data.data.totalMaterials;
      document.getElementById('statXhs').textContent = data.data.xiaohongshu;
      document.getElementById('statDy').textContent = data.data.douyin;
      document.getElementById('statReward').textContent = '¥' + data.data.totalReward;
    }
  } catch (e) {}
}

// --- Announcements ---
async function loadAnnouncements() {
  try {
    var res = await fetch('/api/announcements');
    var data = await res.json();
    if (data.success && data.data.length > 0) {
      var bar = document.getElementById('announcementBar');
      var text = data.data.map(function(a) { return (a.pinned ? '📌 ' : '') + a.title; }).join('　｜　');
      document.getElementById('announcementText').textContent = text;
      bar.style.display = 'flex';
    }
  } catch (e) {}
}

// --- Toast ---
function showToast(msg) {
  var toast = document.getElementById('toast');
  if (!toast) { toast = document.createElement('div'); toast.className = 'toast'; document.body.appendChild(toast); }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(function() { toast.classList.remove('show'); }, 2500);
}
